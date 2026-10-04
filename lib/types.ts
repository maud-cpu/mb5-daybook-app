export type Bucket = "diary" | "supervision" | "expenses" | "meds" | "sw" | "incident" | "scratch";

export const BUCKETS: Record<Bucket, string> = {
  diary: "Diary",
  supervision: "Supervision",
  expenses: "Expenses",
  meds: "Medication",
  sw: "Social worker log",
  incident: "Incident",
  scratch: "Just record",
};

export type FlagKey =
  | "sexualised"
  | "disclosure"
  | "injury"
  | "allegation"
  | "missing"
  | "contact"
  | "health"
  | "school"
  | "reminder"
  | "training";

export const FLAGS: Record<FlagKey, { label: string; urgent: boolean; guidance: string }> = {
  sexualised: {
    label: "Sexualised behaviour",
    urgent: true,
    guidance:
      "Record the exact words/actions, the time, place and who was present — don't ask leading questions. Tell your SSW and both children's social workers today. Whether and how it's investigated is their judgement, not yours.",
  },
  disclosure: {
    label: "Possible disclosure",
    urgent: true,
    guidance:
      "Stop. Record the child's exact words. No follow-up questions, no examination. Phone your SSW today — and the child's own social worker too if that's someone else.",
  },
  injury: {
    label: "Unexplained injury or mark",
    urgent: true,
    guidance:
      "Photograph it if you haven't already. Note what explanation was given, by whom, and when. Tell your SSW today.",
  },
  allegation: {
    label: "Allegation against an adult",
    urgent: true,
    guidance:
      "Don't investigate it or put it to the adult concerned. Record the exact words. Contact your SSW today — this may need LADO involvement.",
  },
  missing: {
    label: "Child missing or ran off",
    urgent: true,
    guidance:
      "Follow your safer-care plan. If not already resolved, this needs your SSW and the police informed without delay.",
  },
  contact: {
    label: "Contact cancelled or missed",
    urgent: false,
    guidance:
      "Check with the social worker whether it will be rearranged, and let the child know what's happening. Note how they reacted.",
  },
  health: {
    label: "New or worsening health issue",
    urgent: false,
    guidance: "Consider whether this needs a GP appointment, and whether the SSW should be told.",
  },
  school: {
    label: "School incident or exclusion risk",
    urgent: false,
    guidance: "Tell your SSW. Consider whether a PEP review is needed.",
  },
  reminder: { label: "Reminder", urgent: false, guidance: "" },
  training: { label: "Training suggestion", urgent: false, guidance: "" },
};

export const EXPENSE_KINDS = ["purchase", "mileage", "daycare"] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export const DAYCARE_REASONS = [
  "Carer respite",
  "Carer appointment",
  "Carer training",
  "Carer work",
  "Sibling contact",
  "Emergency",
  "Other",
] as const;

export const BANDS = ["0-4", "5-10", "11-13", "14-18"] as const;
export type Band = (typeof BANDS)[number];

export type Rates = {
  label: string;
  mileage: number;
  daily_deduct: number;
  hour_first: number;
  hour_add: number;
  day_first: Record<Band, number>;
  day_add: Record<Band, number>;
  overnight: Record<Band, number>;
};

export type Child = {
  id: string;
  name: string;
  born: string | null;
  family: string;
  category: string;
  lives_here: boolean | null;
  mockingbird: string;
  hub_carer_name: string;
  hub_carer_phone: string;
  hub_carer_email: string;
  surrey_contact: string;
  gender: string;
  placement_end_date: string | null;
  /** A visiting child's actual link to an adult in household_visitors -- an
   * unambiguous id, not a name match against the free-text family field
   * above (which stays as a fallback grouping for when no adult's on
   * file yet). Absent on children/queries that never select it. */
  linked_visitor_id?: string | null;
  /** Set when soft-deleted (see 0086_recycle_bin.sql) -- present only on a
   * ?bin=1 fetch; absent/null everywhere else, since the normal GET already
   * filters these out. */
  deleted_at?: string | null;
  /** A VISITING child's own underlying placement type (one of LIVES_CATS),
   * independent of "category" -- which, for a visiting child, instead holds
   * WHY they visit (one of VISITS_CATS: sleepover/daycare/etc). Why someone
   * visits and what their actual placement is are two separate facts (a
   * visiting child can be kinship-and-daycare, foster-and-daycare, etc) --
   * this is what the carer's Mockingbird-number and expense-claim rules
   * (MB_COUNTED_CATEGORIES/EXPENSE_EXCLUDED_CATEGORIES) actually key off
   * for a visiting child, not "category". Always "" for a household child
   * (lives_here true), where "category" already holds this directly. */
  placement_category: string;
};

// Used so generated documents (Handover, diary drafts) can use the right
// pronoun instead of guessing one from a name -- a name alone isn't a
// reliable signal, and guessing wrong got a child misgendered.
export const GENDER_OPTIONS = [
  ["male", "Male"],
  ["female", "Female"],
  ["non_binary", "Non-binary"],
  ["prefer_not_to_say", "Prefer not to say"],
] as const;

export function pronounsFor(gender: string): { subject: string; object: string; possessive: string } | null {
  if (gender === "male") return { subject: "he", object: "him", possessive: "his" };
  if (gender === "female") return { subject: "she", object: "her", possessive: "her" };
  if (gender === "non_binary") return { subject: "they", object: "them", possessive: "their" };
  return null;
}

// "sgo" and "adopted" were briefly merged into blank/"fosters" (a wording
// fix gone too far) before it turned out they're not interchangeable with a
// plain birth/kinship child at all: SGO and Adopted both carry real rules
// the carer tracks by them -- neither counts toward her Mockingbird numbers,
// and she can't claim daycare/expenses for either. "Child who fosters" (a
// family member who happens to themselves foster) stays folded into blank,
// since that was never a legal/placement status, just a role description
// with no financial or statistical consequence of its own.
export const LIVES_CATS = [
  ["la_long", "Long term fostering"],
  ["la_short", "Short term fostering"],
  ["short_break", "Short break / respite"],
  ["parent_and_child", "Parent and child placement"],
  ["remand", "Remand (youth justice)"],
  ["uasc", "Unaccompanied asylum-seeking child (UASC)"],
  ["private_fostering", "Private fostering"],
  ["staying_put", "Staying Put (18+)"],
  ["supported_lodgings", "Supported lodgings"],
  ["kinship", "Kinship"],
  ["sgo", "SGO (Special Guardianship)"],
  ["adopted", "Adopted"],
] as const;

// Categories that count toward the carer's Mockingbird numbers -- SGO and
// Adopted explicitly do not (they're permanent legal statuses with no
// ongoing LA/Mockingbird involvement), everything else active or kinship
// does. Visiting/day care children count too, but by THEIR OWN underlying
// placement type (see children.visit_category), not by this list directly.
export const MB_COUNTED_CATEGORIES = [
  "la_long",
  "la_short",
  "short_break",
  "parent_and_child",
  "remand",
  "uasc",
  "private_fostering",
  "staying_put",
  "supported_lodgings",
  "kinship",
] as const;

// Same two categories are also not claimable for daycare/expenses -- an SGO
// or Adopted child is, financially, the carer's own family from that point
// on, the same as a birth child.
export const EXPENSE_EXCLUDED_CATEGORIES = ["sgo", "adopted"] as const;

// Blank (a plain birth child), Kinship, SGO and Adopted are never an active
// placement -- used wherever the UI needs to tell "permanent family" apart
// from "currently a looked-after/active placement" (colour-coding, hiding
// placement-end-date, showing Surrey contact).
export const NON_PLACEMENT_CATEGORIES = ["", "kinship", "sgo", "adopted"] as const;

export const VISITS_CATS = [
  ["sleepover", "Sleepover"],
  ["daycare", "Daycare"],
  ["short_break", "Short break"],
  ["regular_contact", "Regular contact / day visits"],
  ["emergency", "Emergency / one-off cover"],
  ["varies", "Varies (daycare, sleepovers, etc)"],
] as const;

export const MB_OPTIONS = [
  ["mb5", "Your Mockingbird (MB5)"],
  ["another", "Another Mockingbird"],
  ["no", "No Mockingbird"],
  ["other", "Other"],
] as const;

export function livesHereOf(c: Pick<Child, "lives_here" | "category">): boolean | undefined {
  if (c.lives_here !== null && c.lives_here !== undefined) return c.lives_here;
  if (VISITS_CATS.some(([k]) => k === c.category)) return false;
  if (c.category) return true;
  return undefined;
}

export type EntryRecord = {
  id: string;
  user_id: string;
  bucket: Bucket;
  child: string;
  kids: string[];
  also_in: string[];
  text: string;
  date: string;
  done: boolean;
  flag: string;
  flag_note: string;
  flag_done: boolean;
  flag_done_at: string | null;
  flag_dismissed: boolean;
  flag_cleared: boolean;
  training_note: string;
  reported: string | null;
  kind: ExpenseKind | null;
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
  given_by: string;
  photos: string[];
  shared_with_admin: boolean;
  claimed: boolean;
  claimed_at: string | null;
  paid: boolean;
  paid_at: string | null;
  edited: string | null;
  edited_by: string | null;
  created_at: string;
  /** Set when soft-deleted (see 0086_recycle_bin.sql) -- present only on a
   * ?bin=1 fetch; absent/null everywhere else, since the normal GET already
   * filters these out. */
  deleted_at?: string | null;
};

export const TONE_OPTIONS = [
  "Warm and friendly",
  "Professional and formal",
  "Brief and factual",
  "Firm and assertive",
  "Warm but concerned",
] as const;

export type Contact = { id: string; label: string; name: string; phone: string; email: string };

export const DIARY_SECTIONS = [
  ["comments", "Comments on the week/month", "can include details of activities undertaken, routines, wellbeing of the child etc"],
  ["achievements", "Achievements", "developmental, educational, any achievement, big or small"],
  ["good", "Good things this week/month", "emotional, behavioural, educational / specific positives"],
  ["worries", "Worries or challenges", "incidents/health/education/missing episodes/child sexual exploitation"],
  ["views", "Views of the child", "they can add comments here if they wish, or carer can comment on how they are feeling/what they enjoy"],
  ["appointments", "Appointments", "social worker / supervising social worker / other professionals"],
  ["family", "Time with family", "positive / missed / concerns"],
  ["health", "Health including medication", "list medical appointments / medication / bumps / bruises etc here"],
] as const;

export type DiarySectionKey = (typeof DIARY_SECTIONS)[number][0];

export const ANNUAL_REVIEW_SECTIONS = [
  ["achievements", "Achievements & progress this year", "yours and the children's — training completed, skills developed, positive outcomes"],
  ["challenges", "Challenges or support needed", "anything that's been difficult, and what support would help going forward"],
  ["changes", "Changes to your household/circumstances", "health, relationships, work, home — anything the agency should know about"],
  ["training_plan", "Training planned for next year", "courses or development you want to do before the next review"],
  ["other", "Anything else", ""],
] as const;

export type AnnualReviewSectionKey = (typeof ANNUAL_REVIEW_SECTIONS)[number][0];

export type Diary = {
  id: string;
  child_names: string[];
  date_from: string | null;
  date_to: string | null;
  /** When this diary was actually sent to the SW -- separate from
   * date_from/date_to (the period it covers), which can genuinely differ
   * from when it went out. Used for the "diary overdue" nudge. */
  sent_at: string | null;
  sw_name: string;
  user_id?: string;
  edited_by?: string | null;
} & Record<DiarySectionKey, string>;

export type Reminder = {
  id: string;
  text: string;
  date: string;
  /** A specific start/end time, when the text actually gave one (e.g. "be
   * at school at 8:45", "10:30 until 12:30") -- null for a plain day
   * marker with no time of its own. HH:MM, same convention as
   * records.time_from/time_to. */
  time_from: string | null;
  time_to: string | null;
  done: boolean;
  done_at: string | null;
  category: string;
  /** @deprecated superseded by people -- still a real column, but no longer written to */
  child: string;
  people: string[];
  amount: number | null;
  series_id: string | null;
  source_text: string;
  /** The records row this reminder was generated from, when there is one
   * (e.g. a daycare entry that also flagged a calendar reminder) -- lets an
   * edit here reach the same row Entries/Expenses read, instead of only
   * ever changing this reminder's own text/date copy. Absent for a plain
   * appointment with no backing record. */
  record_id?: string | null;
  /** Every priced record this reminder was generated from, when there's
   * more than one (e.g. two daycare sessions for the same child, same day,
   * merged into one reminder) -- record_id itself falls back to null once
   * there's more than one, so this is what the delete cascade in
   * app/api/records/route.ts uses to still find and remove a merged
   * reminder. Empty for the common single-record or no-record case. */
  record_ids?: string[];
  /** Set when this came from News & Events' "To-do" action rather than
   * "Calendar" -- belongs in Up next only, never on the calendar. */
  todo_only?: boolean;
  /** Who created/last amended this -- absent on the synthetic club/face-
   * to-face rows synthesised client-side, which aren't real database rows. */
  user_id?: string;
  edited_by?: string | null;
  /** A link given in the source text for where to actually act on this
   * (RSVP, log in, pay, book) -- e.g. "Log in to Online Guide Manager" in a
   * pasted email. Null when none was found/given. */
  url?: string | null;
  /** Set when this was pushed from the hub lead's Hub calendar (see
   * 0083_hub_calendar.sql) rather than created by this household itself --
   * kept in sync with the shared_hub_events row it came from. */
  hub_event_id?: string | null;
  /** Set when soft-deleted (see 0086_recycle_bin.sql) -- present only on a
   * ?bin=1 fetch; absent/null everywhere else, since the normal GET already
   * filters these out. */
  deleted_at?: string | null;
};

export const REPEAT_OPTIONS = [
  ["none", "Does not repeat"],
  ["weekly", "Weekly"],
  ["fortnightly", "Fortnightly"],
  ["monthly", "Monthly"],
] as const;

export const REMINDER_CATEGORIES = [
  ["school", "🏫 School"],
  ["club", "🧩 Club"],
  ["training", "🎓 Training"],
  ["surrey", "🏛️ Surrey / agency"],
  ["medical", "🏥 Medical / appointment"],
  ["family", "👪 Family contact"],
  ["household", "🏠 Household"],
  ["personal", "📌 Personal"],
] as const;

export function reminderCategoryLabel(cat: string): string {
  return REMINDER_CATEGORIES.find(([k]) => k === cat)?.[1] ?? "📌 Other";
}

// Shared between HubLogTab (the manual log form) and /api/sort (which offers
// a capture note about hub contact/news as a one-click save into the same
// log) -- kept in one place so the two never drift out of sync with each
// other or with hub_support_log's own check constraint.
export const HUB_SUPPORT_TYPES = [
  ["daytime_satellite", "Daytime support — for a satellite carer"],
  ["daytime_child", "Daytime support — for children/young people"],
  ["social_activity", "Social activity"],
  ["constellation_meeting", "Constellation meeting"],
  ["sleepover_planned", "Planned sleepover overnight"],
  ["sleepover_emergency", "Emergency sleepover overnight"],
  ["training_session", "Training session"],
  ["other", "Other / general check-in"],
] as const;

// A separate literal tuple (rather than deriving it from HUB_SUPPORT_TYPES
// via .map()) purely so z.enum() in /api/sort gets a proper fixed-length
// tuple of string literals to work from, same shape as FLAG_KEYS there --
// kept in sync with HUB_SUPPORT_TYPES by eye since it's just the 8 keys.
export const HUB_SUPPORT_TYPE_KEYS = [
  "daytime_satellite",
  "daytime_child",
  "social_activity",
  "constellation_meeting",
  "sleepover_planned",
  "sleepover_emergency",
  "training_session",
  "other",
] as const;

// Split out of the combined "🎓 Training" label so a day's list of items can
// show one consistent icon + text hierarchy per row instead of repeating the
// emoji inline with the label text.
export function reminderCategoryIcon(cat: string): string {
  return reminderCategoryLabel(cat).split(" ")[0];
}

export function reminderCategoryText(cat: string): string {
  return reminderCategoryLabel(cat).split(" ").slice(1).join(" ");
}

export type FormRefItem = { name: string; note: string; url?: string };
export type FormRefCategory = { key: string; label: string; items: FormRefItem[] };

// The single list of "forms and documents a foster carer might need" --
// shown on Things To Do and on Training & Resources, so both stay in sync
// rather than drifting apart as items get added.
export const FORMS_REFERENCE: FormRefCategory[] = [
  {
    key: "placement",
    label: "For a placement",
    items: [
      {
        name: "Placement Plan / Placement Agreement",
        note: "the day-to-day arrangements for that child, agreed with the CSW; where the delegated authority for that placement actually lives.",
        url: "https://surreycs.trixonline.co.uk/chapter/placements-in-foster-care",
      },
      {
        name: "Delegated Authority Decision Support Record",
        note: "what you can consent to yourself (school trips, haircuts, sleepovers, routine medical/dental) versus what needs the CSW or a parent's sign-off.",
        url: "https://surreycs.trixonline.co.uk/chapter/delegation-of-authority-to-foster-carers-and-residential-workers",
      },
      {
        name: "Health/medical consent record",
        note: "who can consent to what for that child's routine and non-routine healthcare, set out alongside the Placement Plan.",
      },
      {
        name: "Personal Education Plan (PEP)",
        note: "the school-held plan covering a looked-after child's education and how the pupil premium plus is spent, reviewed at least termly.",
        url: "https://surreycs.trixonline.co.uk/chapter/supporting-the-education-and-promoting-the-achievement-of-children-with-a-social-worker-looked-after-and-previously-looked-after-children",
      },
      {
        name: "Immunisation, dental & optician consent",
        note: "kept alongside the health consent record — check who can sign for routine appointments versus one-offs.",
      },
      {
        name: "Short breaks / respite placements",
        note: "different arrangements apply when a child is with you for a planned short break rather than a full placement — worth knowing before agreeing to one.",
        url: "https://surreycs.trixonline.co.uk/chapter/short-breaks",
      },
    ],
  },
  {
    key: "safeguarding",
    label: "Safeguarding",
    items: [
      {
        name: "Missing from care/home protocol",
        note: "what to do and who to call first if a child goes missing.",
        url: "https://assets.publishing.service.gov.uk/media/5a7c0f7aed915d74c83620d7/Statutory_guidance_on_children_who_run_away_or_go_missing_from_home_or_care_consultation_-_final.pdf",
      },
      {
        name: "Allegations & complaints procedure",
        note: "what happens if an allegation is made against you, and your right to independent support separate from your own agency.",
        url: "https://fosterline.info/already-fostering/facing-an-allegation/reducing-the-risk-of-allegations/",
      },
      {
        name: "Your household's Safer Caring policy",
        note: "your own written plan, reviewed with your SSW.",
        url: "https://surreycs.trixonline.co.uk/chapter/supervision-and-support-of-foster-carers",
      },
      {
        name: "Behaviour management / positive handling policy",
        note: "what de-escalation and physical intervention (if any) is agreed for that child, and what must be logged and reported afterwards.",
        url: "https://surreycs.trixonline.co.uk/chapter/restrictive-physical-intervention-and-restraint",
      },
      {
        name: "Online safety & device use agreement",
        note: "what's agreed for that child's phone, gaming and social media use, and any monitoring in place.",
      },
    ],
  },
  {
    key: "approval",
    label: "Your own approval",
    items: [
      {
        name: "Fostering Services: National Minimum Standards",
        note: "the DfE standards every fostering service is inspected against -- worth knowing what you're entitled to expect from your agency, not just what's expected of you.",
        url: "https://minimumstandards.org/contents/fostering-services-contents",
      },
      {
        name: "Foster Carer Agreement & annual review paperwork",
        note: "the terms of your approval, reviewed yearly by the fostering panel.",
      },
      {
        name: "DBS renewal",
        note: "for you and every adult in the household, usually every 3 years.",
        url: "https://www.gov.uk/dbs-update-service",
      },
      {
        name: "Household risk assessment (fire safety, pets, etc.)",
        note: "reviewed with your SSW, typically annually.",
        url: "https://surreycs.trixonline.co.uk/chapter/risk-assessment-and-planning",
      },
      {
        name: "Training & Development Standards (TDS) portfolio",
        note: "the evidence you build up, usually in your first year, showing you meet the national standards; your SSW signs it off.",
        url: "https://www.surreycc.gov.uk/children/professionals/academy/foster-carers",
      },
      {
        name: "Supervision agreement",
        note: "how often your SSW visits and supervises you, agreed and reviewed alongside your approval.",
        url: "https://surreycs.trixonline.co.uk/chapter/supervision-and-support-of-foster-carers",
      },
    ],
  },
  {
    key: "money",
    label: "Money & the child's own records",
    items: [
      {
        name: "Expenses & allowances claim form",
        note: "see the Rates tab for what's claimable.",
      },
      {
        name: "Birthday, festival & holiday grants",
        note: "one-off payments on top of the weekly allowance — ask your SSW what your agency pays and how to claim it.",
      },
      {
        name: "Clothing & equipment allowance",
        note: "for school uniform, initial setting-up costs, and larger one-off items.",
      },
      {
        name: "Passport/travel consent",
        note: "extra written consent is needed before taking a looked-after child abroad; ask your CSW early, it isn't quick to arrange.",
        url: "https://assets.publishing.service.gov.uk/media/5a7b4f6ded915d3ed90638df/looked-after-children-passports.pdf",
      },
      {
        name: "Life story work / memory box materials",
        note: "an ongoing record for the child to keep, separate from your day-to-day diary entries here.",
      },
    ],
  },
  {
    key: "reviews",
    label: "Reviews & meetings",
    items: [
      {
        name: "LAC Review invitation & minutes",
        note: "the formal review of the child's Care Plan, held regularly (usually every 6 months once settled); you'll be asked for a written report beforehand.",
        url: "https://surreycs.trixonline.co.uk/chapter/appointment-and-role-of-independent-reviewing-officers",
      },
      {
        name: "Care Plan",
        note: "the social worker's overall plan for the child; the Placement Plan should match it.",
      },
      {
        name: "Statutory visit record",
        note: "the note the child's social worker makes each time they visit, which you can ask to see.",
      },
      {
        name: "Pathway Plan (16+)",
        note: "replaces some of the above for young people preparing to leave care.",
        url: "https://surreycs.trixonline.co.uk/chapter/leaving-care-and-transition",
      },
      {
        name: "Staying Put agreement (18+)",
        note: "the arrangement for a young person remaining with you past 18.",
        url: "https://surreycs.trixonline.co.uk/chapter/staying-put",
      },
    ],
  },
  {
    key: "child-safety",
    label: "Keeping children safe — NSPCC & online safety",
    items: [
      {
        name: "NSPCC Speak out. Stay safe. — Introduction for Parents/Carers",
        note: "the school programme (ages 5–11) that teaches children to recognise abuse and speak out to a safe adult or Childline — watch the intro film shared by school before it's delivered.",
        url: "https://www.nspcc.org.uk/keeping-children-safe/support-for-parents/speak-out-stay-safe-schools-service/",
      },
      {
        name: "NSPCC — support and advice for parents/carers",
        note: "articles and guidance on a wide range of keeping-children-safe topics.",
        url: "https://www.nspcc.org.uk/parents",
      },
      {
        name: "NSPCC Speak out. Stay safe. — activities for families",
        note: "games and activities to do at home that reinforce the same speaking-out message as the school programme.",
        url: "https://www.nspcc.org.uk/speakout",
      },
      {
        name: "NSPCC — activities to extend learning at home",
        note: "more games and activities to help children learn about staying safe.",
        url: "https://www.nspcc.org.uk/activities",
      },
      {
        name: "NSPCC Online Safety Hub",
        note: "gaming, social media, sharing images, parental controls and other online-safety topics.",
        url: "https://www.nspcc.org.uk/onlinesafety",
      },
      {
        name: "Childline for younger children (5–7)",
        note: "Buddy's accessible Childline site — advice, games and activities, with adjustable text size and read-aloud.",
        url: "https://www.childline.org.uk/buddy",
      },
      {
        name: "Childline for children (7–11)",
        note: "the same accessible Childline support aimed at slightly older children.",
        url: "https://www.childline.org.uk/kids",
      },
      {
        name: "Talk PANTS",
        note: "NSPCC's simple, free conversation and resources to help keep children safe from sexual abuse.",
        url: "https://www.nspcc.org.uk/pants",
      },
    ],
  },
  {
    key: "ending",
    label: "Ending or moving on from a placement",
    items: [
      {
        name: "Placement ending / disruption meeting record",
        note: "held when a placement ends in a planned or unplanned way, to capture what was learned.",
      },
      {
        name: "Return of belongings & records checklist",
        note: "make sure life story materials, medical records and identity documents move with the child.",
      },
      {
        name: "Final handover summary",
        note: "your own closing note for whoever cares for the child next — the Handover tab in Paperwork can help build this.",
      },
    ],
  },
];

// Things To Do surfaces a document only when a flagged note actually calls
// for one -- not the whole reference list on every visit. Only flags with an
// unambiguous, directly-relevant document are mapped; anything looser is
// left for the full list on Training & Resources instead.
const FLAG_RELATED_FORM: Partial<Record<FlagKey, string>> = {
  missing: "Missing from care/home protocol",
  allegation: "Allegations & complaints procedure",
};

export function relatedFormFor(flag: string): FormRefItem | undefined {
  const wanted = FLAG_RELATED_FORM[flag as FlagKey];
  if (!wanted) return undefined;
  for (const cat of FORMS_REFERENCE) {
    const item = cat.items.find((i) => i.name === wanted);
    if (item?.url) return item;
  }
  return undefined;
}

export type PendingItem = Partial<EntryRecord> & {
  bucket: Bucket;
  text: string;
  kids: string[];
  /** Names the carer said that don't match anyone registered yet — prompts a quick "add child". */
  unmatched?: string[];
  /** Kids whose Mockingbird hub carer should be emailed once this item is saved. */
  send_hub?: string[];
  /** Whether the carer's own hub leader (household-wide, not per-child) should be emailed once this item is saved. */
  send_own_hub?: boolean;
  /** When flag is "reminder": the date it should actually appear on the calendar/Today. */
  reminder_date?: string | null;
  /** When flag is "reminder": which REMINDER_CATEGORIES this is, e.g. "medical" for a GP/dentist appointment. */
  reminder_category?: string;
  /** When flag is "reminder" and the text gave a specific time (a start time, or a start-end range), HH:MM. Null/empty if the text gave no time of its own. */
  reminder_time_from?: string | null;
  reminder_time_to?: string | null;
  /** A school contact (e.g. class teacher) the AI spotted in the text, offered as a one-click save to the tagged child's School admin. */
  school_contact?: { name: string; contact: string } | null;
  /** A recurring club/activity the AI spotted in the text, offered as a one-click save to the tagged child's Clubs list. */
  club?: {
    name: string;
    weekday: string;
    timeFrom: string;
    timeTo: string;
    provider: string;
    contactInfo: string;
    cost: string;
    website: string;
    notes: string;
  } | null;
  /** A food like/dislike the AI spotted in the text, offered as a one-click save to the tagged child's Food box. */
  food_note?: { likes: string; dislikes: string } | null;
  /** Training/CPD the carer said they themselves attended or completed, saved to their training record even when it isn't in the shared catalogue. */
  completed_training?: { title: string; date: string } | null;
  /** A short summary of practical school-admin info (lunch payment app, homework portal, PTA, etc) the AI spotted in the text, offered as a one-click save to the tagged child's School admin notes. */
  school_admin_note?: string;
  /** Set when the note is about contact with, or news via, the carer's Mockingbird hub network -- offered as a one-click save to the Hub log. */
  hub_update?: { carer_names: string; support_type: string } | null;
  /** When flag is "reminder": a link in the text for where to actually act on it (RSVP, log in, pay, book). Empty string if none found. */
  reminder_url?: string;
  /** Set when kind is "daycare", overnight is true, and the text gave a known end/return date later than this item's own `date` (the stay's start) -- e.g. "staying with us from 27 September until 14 October". Shown as one summary row rather than one per night; saving it (see CaptureScreen's saveMultiNightStay) backfills one expense row per elapsed night and a calendar entry for every day of the stay, including days still to come. Null/undefined for a single-night day care item. */
  stay_end_date?: string | null;
};
