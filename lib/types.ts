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
};

export const LIVES_CATS = [
  ["la_long", "Looked after (long term)"],
  ["la_short", "Looked after (short term)"],
  ["short_break", "Short break / respite"],
  ["parent_and_child", "Parent and child placement"],
  ["remand", "Remand (youth justice)"],
  ["uasc", "Unaccompanied asylum-seeking child (UASC)"],
  ["private_fostering", "Private fostering"],
  ["staying_put", "Staying Put (18+)"],
  ["supported_lodgings", "Supported lodgings"],
  ["fosters", "Child who fosters"],
  ["sgo", "SGO"],
  ["adopted", "Adopted"],
  ["kinship", "Kinship"],
] as const;

export const VISITS_CATS = [
  ["sleepover", "Sleepover"],
  ["daycare", "Daycare"],
  ["short_break", "Short break"],
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
  created_at: string;
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

export type Diary = {
  id: string;
  child_names: string[];
  date_from: string | null;
  date_to: string | null;
  sw_name: string;
} & Record<DiarySectionKey, string>;

export type Reminder = {
  id: string;
  text: string;
  date: string;
  done: boolean;
  done_at: string | null;
  category: string;
  /** @deprecated superseded by people -- still a real column, but no longer written to */
  child: string;
  people: string[];
  amount: number | null;
  series_id: string | null;
  source_text: string;
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
      {
        name: "AI Chatbots and Teens",
        note: "YourKids — what's worth knowing about teenagers using AI chatbots. (Title/description inferred from the article's URL, not read in full — check it covers what you need before relying on it.)",
        url: "https://yourkids.com/articles/ai-chatbots-and-teens",
      },
    ],
  },
  {
    key: "yourkids",
    label: "Child development & family life (YourKids)",
    items: [
      {
        name: "Looksmaxxing: What Parents of Boys Should Know",
        note: "the online \"looksmaxxing\" appearance trend aimed at boys and teenage boys. (Title/description inferred from the article's URL, not read in full.)",
        url: "https://yourkids.com/articles/looksmaxxing-what-parents-of-boys-should-know",
      },
      {
        name: "Newborn SMA Screening in England",
        note: "newborn screening for spinal muscular atrophy (SMA), now offered in England — relevant if you're caring for a baby. (Title/description inferred from the article's URL, not read in full.)",
        url: "https://yourkids.com/articles/newborn-sma-screening-england",
      },
      {
        name: "Picky Eating Starts Before Birth",
        note: "what shapes picky eating in young children, including factors from before birth. (Title/description inferred from the article's URL, not read in full.)",
        url: "https://yourkids.com/articles/picky-eating-starts-before-birth",
      },
      {
        name: "Teens and Loneliness: How Parents Can Help",
        note: "recognising loneliness in teenagers and ways to support them. (Title/description inferred from the article's URL, not read in full.)",
        url: "https://yourkids.com/articles/teens-and-loneliness-how-parents-can-help",
      },
      {
        name: "Toddler Tantrums: Why They Happen and How to Respond",
        note: "why toddlers have tantrums and practical ways to respond. (Title/description inferred from the article's URL, not read in full.)",
        url: "https://yourkids.com/articles/toddler-tantrums-why-they-happen-how-to-respond",
      },
      {
        name: "Circle Time Games for Groups",
        note: "group games for circle time — useful for sibling or family group activities. (Title/description inferred from the article's URL, not read in full.)",
        url: "https://yourkids.com/articles/circle-time-games-for-groups",
      },
      {
        name: "Cooperative Games for Mixed Ages",
        note: "non-competitive games that work across a mixed-age group of children. (Title/description inferred from the article's URL, not read in full.)",
        url: "https://yourkids.com/articles/cooperative-games-for-mixed-ages",
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
  /** When flag is "reminder": the date it should actually appear on the calendar/Today. */
  reminder_date?: string | null;
};
