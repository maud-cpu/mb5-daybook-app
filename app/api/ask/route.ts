import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { BASICS_SECTIONS } from "@/lib/basics";
import { PROFILE_FIELDS } from "@/lib/handover";
import { BUCKETS, FLAGS, FlagKey } from "@/lib/types";
import { aiErrorMessage } from "@/lib/aiErrors";
import { readChildDocument } from "@/lib/documentContent";
import { lazyMigrateRows } from "@/lib/encryptedTable";

const PROFILE_ENC_FIELDS = [
  "about",
  "routine",
  "food",
  "school",
  "toilet",
  "sleep",
  "health",
  "emotions",
  "contact",
  "screens",
  "told",
  "nogo",
  "pack",
];

// A big household history (a year or more of diary entries) takes the model
// longer to read through and reason over than a normal request -- give it
// the same headroom /api/sort gets for the same reason.
export const maxDuration = 60;

// Every basics field, in the same labels/order About Us uses -- repeatable
// fields (allergies, teacher contacts, extra dates) are stored as a JSON
// string, so they're parsed back into readable "label: value" lines rather
// than dumped as raw JSON the model would have to puzzle out.
function formatBasics(basics: Record<string, string> | null | undefined): string {
  if (!basics) return "";
  const lines: string[] = [];
  for (const section of BASICS_SECTIONS) {
    for (const field of section.fields) {
      const raw = basics[field.key];
      if (!raw || !raw.trim()) continue;
      if (field.checklist) continue;
      if (field.repeatableFields) {
        try {
          const items = JSON.parse(raw);
          if (Array.isArray(items) && items.length) {
            const rendered = items
              .map((item: Record<string, string>) =>
                field.repeatableFields!
                  .map((sf) => item[sf.key])
                  .filter(Boolean)
                  .join(" — "),
              )
              .filter(Boolean)
              .join("; ");
            if (rendered) lines.push(`${field.label}: ${rendered}`);
          }
        } catch {
          // Not valid JSON -- skip rather than dump garbage into the prompt.
        }
        continue;
      }
      lines.push(`${field.label}: ${raw.trim()}`);
    }
  }
  return lines.join("\n");
}

type RawRecord = {
  date: string;
  bucket: string;
  kind: string | null;
  text: string;
  kids: string[];
  flag: string;
  amount: number | null;
  miles: number | null;
  hours: number | null;
  time_from: string | null;
  time_to: string | null;
  overnight: boolean;
  reason: string;
  med_name: string;
  dose: string;
  given: string | null;
};

function formatRecord(r: RawRecord): string {
  const bucket = BUCKETS[r.bucket as keyof typeof BUCKETS] || r.bucket;
  const who = r.kids?.length ? r.kids.join(" & ") : "";
  const bits: string[] = [];
  if (r.kind === "mileage" && r.miles) bits.push(`${r.miles} miles`);
  if (r.kind === "daycare") {
    if (r.overnight) bits.push("overnight");
    else if (r.time_from && r.time_to) bits.push(`${r.time_from}–${r.time_to}`);
    else if (r.hours) bits.push(`${r.hours} hrs`);
    if (r.reason) bits.push(r.reason);
  }
  if (r.amount != null && r.bucket === "expenses" && r.kind !== "daycare" && r.kind !== "mileage") bits.push(`£${r.amount}`);
  if (r.med_name) bits.push(`${r.med_name}${r.dose ? " " + r.dose : ""}${r.given ? " at " + r.given : ""}`);
  if (r.text) bits.push(r.text);
  if (r.flag) bits.push(`[flag: ${FLAGS[r.flag as FlagKey]?.label || r.flag}]`);
  const head = [r.date, bucket, who].filter(Boolean).join(" · ");
  return `${head} — ${bits.filter(Boolean).join(" — ") || "(no detail)"}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { question } = await req.json();
  if (!question || typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "No question given" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI answering isn't set up yet (no ANTHROPIC_API_KEY)." }, { status: 400 });

  const [
    { data: children },
    { data: householdChildren },
    { data: adults },
    { data: visitors },
    { data: household },
    { data: profilesRaw },
    { data: records },
    { data: reminders },
    { data: hubLog },
  ] = await Promise.all([
    supabase
      .from("children")
      .select("id, name, born, family, category, lives_here, gender, basics, hub_carer_name, hub_carer_phone, hub_carer_email"),
    supabase.from("household_children").select("id, name, born, category, gender, basics"),
    supabase.from("household_adults").select("name, phone, email, role"),
    supabase.from("household_visitors").select("name, phone, email, role"),
    supabase.from("household").select("*").maybeSingle(),
    supabase
      .from("handover_child_profiles")
      .select(
        "id, child_id, about, about_enc, routine, routine_enc, food, food_enc, school, school_enc, toilet, toilet_enc, sleep, sleep_enc, health, health_enc, emotions, emotions_enc, contact, contact_enc, screens, screens_enc, told, told_enc, nogo, nogo_enc, pack, pack_enc",
      ),
    // A generous cap, not a real one for normal use at this app's scale --
    // same reasoning as the search panel's own cap on the same table.
    supabase
      .from("records")
      .select("date, bucket, kind, text, kids, flag, amount, miles, hours, time_from, time_to, overnight, reason, med_name, dose, given")
      .order("date", { ascending: false })
      .limit(1200),
    supabase.from("reminders").select("date, text, people, done").order("date", { ascending: false }).limit(500),
    supabase.from("hub_support_log").select("date, carer_names, support_type, notes").order("date", { ascending: false }).limit(300),
  ]);
  const profiles = await lazyMigrateRows(supabase, "handover_child_profiles", "id", profilesRaw ?? [], PROFILE_ENC_FIELDS);

  const { data: documents } = await supabase
    .from("child_documents")
    .select("child_id, title, category, file_path, file_name")
    .order("uploaded_at", { ascending: false });

  type ChildRow = { id: string; name: string; basics: Record<string, string> | null };
  const allChildren: ChildRow[] = [...((children ?? []) as ChildRow[]), ...((householdChildren ?? []) as ChildRow[])];
  const nameById = new Map(allChildren.map((c) => [c.id, c.name]));

  // Actual uploaded files (a handover doc, old diaries, an assessment) --
  // not just the structured basics/handover forms above. Capped generously
  // rather than really limited, same reasoning as the records cap: a real
  // household's document library is small, this just stops one runaway
  // request if it ever isn't.
  type DocRow = { child_id: string; title: string; category: string; file_path: string; file_name: string };
  const docRows = ((documents ?? []) as DocRow[]).slice(0, 12);
  const docTextBlocks: string[] = [];
  const docContentBlocks: Anthropic.ContentBlockParam[] = [];
  const docListingLines: string[] = [];
  await Promise.all(
    docRows.map(async (d) => {
      const childName = nameById.get(d.child_id) || "Unknown child";
      const label = `${childName} — ${d.title || d.file_name}${d.category ? " (" + d.category + ")" : ""}`;
      const result = await readChildDocument(supabase, d.file_path);
      if (result.kind === "text") {
        // Caps one huge document from crowding out everything else in the prompt.
        const text = result.text.length > 8000 ? result.text.slice(0, 8000) + "…" : result.text;
        docTextBlocks.push(`### ${label}\n${text}`);
        docListingLines.push(`${label} — included below`);
      } else if (result.kind === "block") {
        docContentBlocks.push({ type: "text", text: `Document: ${label}` }, result.block);
        docListingLines.push(`${label} — attached`);
      } else {
        docListingLines.push(`${label} — couldn't be read automatically`);
      }
    }),
  );

  const childrenBlock =
    allChildren.map((c) => `### ${c.name}\n${formatBasics(c.basics) || "(no profile details filled in)"}`).join("\n\n") || "(none)";

  const profilesBlock = ((profiles ?? []) as (Record<string, string> & { child_id: string })[])
    .map((p) => {
      const name = nameById.get(p.child_id) || "Unknown child";
      const lines = PROFILE_FIELDS.map(([key, label]) => {
        const val = (p[key] || "").trim();
        return val ? `${label}: ${val}` : null;
      }).filter((x): x is string => !!x);
      return lines.length ? `### ${name} (handover profile)\n${lines.join("\n")}` : null;
    })
    .filter((x): x is string => !!x)
    .join("\n\n");

  type Contact = { name: string; phone: string; email: string; role: string };
  const contactLine = (c: Contact) => `${c.name} — ${c.role}${c.phone ? ", " + c.phone : ""}${c.email ? ", " + c.email : ""}`;
  const adultsBlock = ((adults ?? []) as Contact[]).map(contactLine).join("\n") || "(none)";
  const visitorsBlock = ((visitors ?? []) as Contact[]).map(contactLine).join("\n") || "(none)";

  const h = household as Record<string, string | boolean | null> | null;
  const householdBlock =
    [
      h?.ssw_name ? `SSW: ${h.ssw_name}${h.ssw_phone ? ", " + h.ssw_phone : ""}${h.ssw_email ? ", " + h.ssw_email : ""}` : "",
      h?.edt ? `Emergency Duty Team: ${h.edt}` : "",
      h?.hub_leader_name ? `Hub leader: ${h.hub_leader_name}${h.hub_leader_phone ? ", " + h.hub_leader_phone : ""}` : "",
    ]
      .filter(Boolean)
      .join("\n") || "(none set)";

  const recordsBlock = ((records ?? []) as RawRecord[]).map(formatRecord).join("\n") || "(none)";

  const remindersBlock =
    ((reminders ?? []) as { date: string; text: string; people: string[]; done: boolean }[])
      .map((r) => `${r.date} — ${r.text}${r.people?.length ? " (" + r.people.join(", ") + ")" : ""}${r.done ? " [done]" : ""}`)
      .join("\n") || "(none)";

  const hubLogBlock =
    ((hubLog ?? []) as { date: string; carer_names: string; support_type: string; notes: string }[])
      .map((e) => `${e.date} — ${e.support_type}${e.carer_names ? " — " + e.carer_names : ""}${e.notes ? " — " + e.notes : ""}`)
      .join("\n") || "(none)";

  const context = [
    "## Children",
    childrenBlock,
    profilesBlock ? "\n## Handover profiles (extra detail some children have on file)\n" + profilesBlock : "",
    "\n## Household adults",
    adultsBlock,
    "\n## Regular visitors",
    visitorsBlock,
    "\n## Household info",
    householdBlock,
    "\n## Diary / log entries, most recent first",
    recordsBlock,
    "\n## Calendar reminders",
    remindersBlock,
    "\n## Mockingbird hub log",
    hubLogBlock,
    "\n## Attached documents (uploaded files, e.g. an old handover, meeting notes, an assessment)",
    docListingLines.join("\n") || "(none uploaded)",
    docTextBlocks.length ? "\n" + docTextBlocks.join("\n\n") : "",
  ].join("\n");

  const sys = `You answer a UK foster carer's question using ONLY the household data given below (including any attached documents, some of which are provided as actual files rather than text). This concerns real children in foster care, so accuracy matters -- never guess, invent, or infer a specific fact (a time, date, name, allergy or number) that isn't actually present in the data. If the answer genuinely isn't in the data, say so plainly rather than guessing, and briefly suggest where it might be recorded instead (e.g. "not on file -- worth adding to their About Us profile"). Keep answers short and direct, a sentence or two, not a report. Give the specific detail asked for (the actual date, time or name) rather than just "it's recorded" when the data has it. If a document listed couldn't be read automatically, don't claim to know what's in it. Always write dates the UK way -- "26 September 2026" or 26/09/2026, day before month -- never the American month/day format.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const messageContent: Anthropic.ContentBlockParam[] = [
      { type: "text", text: `${context}\n\n## Question\n${question.trim()}` },
      ...docContentBlocks,
    ];
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: sys,
      messages: [{ role: "user", content: messageContent }],
    });
    if (msg.stop_reason === "refusal") throw new Error("Couldn't work out an answer to that.");
    const textBlock = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const answer = textBlock?.text?.trim();
    if (!answer) throw new Error("Couldn't work out an answer to that.");
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json(
      { error: `Couldn't answer that: ${aiErrorMessage(e, "That needed too much information to answer in one go.")}` },
      { status: 500 },
    );
  }
}
