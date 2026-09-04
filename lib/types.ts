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
};

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
};

export type PendingItem = Partial<EntryRecord> & {
  bucket: Bucket;
  text: string;
  kids: string[];
};
