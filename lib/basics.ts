export type RepeatableSubfield = { key: string; label: string; type?: "tel" | "email" | "date"; select?: string[] };
export type BasicsField = {
  key: string;
  label: string;
  placeholder?: string;
  select?: string[];
  type?: "tel" | "email" | "date";
  /** Renders as an open-ended add-another-one list (contacts, extra dates) instead of a single input. */
  repeatableFields?: RepeatableSubfield[];
  addLabel?: string;
  /** Renders as a fixed Yes/No/not-set row per item, e.g. a delegated authority checklist. */
  checklist?: string[];
};
export type BasicsSection = { title: string; fields: BasicsField[] };

export const LEGAL_STATUS_OPTIONS = [
  "Section 20 (voluntary)",
  "Interim Care Order (ICO)",
  "Full Care Order",
  "Emergency Protection Order (EPO)",
  "Police Protection",
  "Placement Order",
  "Other",
];

export const DELEGATED_AUTHORITY_ITEMS = [
  "Routine medical/dental treatment",
  "Non-invasive medical examinations (school nurse, optician, etc.)",
  "Routine immunisations",
  "School trips (day trips)",
  "Residential/overnight school trips",
  "Sleepovers at a friend's house",
  "Haircuts",
  "Sign school forms/reports on the child's behalf",
  "Choice of extracurricular clubs/activities",
  "Passport application / travel abroad",
  "Part-time or Saturday job (older children)",
  "Driving lessons / provisional licence (older children)",
  "Piercings/tattoos (older children)",
];

export const BASICS_SECTIONS: BasicsSection[] = [
  {
    title: "Placement",
    fields: [
      { key: "status", label: "Legal status", select: LEGAL_STATUS_OPTIONS },
      { key: "start", label: "Placement started" },
      // "Placement type" (long-term/short-term/respite/emergency) used to be
      // a second, separate field here -- exactly duplicating what the
      // child's own category dropdown (About us) already says, more
      // precisely, and with nothing keeping the two in step. Removed rather
      // than added-to-and-synced: one field that's always right beats two
      // that can quietly disagree.
      { key: "la", label: "Placing authority" },
    ],
  },
  {
    title: "Social work team",
    fields: [
      {
        key: "diary_frequency",
        label: "Diary due",
        select: ["Daily", "Weekly", "Fortnightly", "Monthly", "Termly"],
      },
      { key: "csw", label: "Child's social worker" },
      { key: "csw_phone", label: "CSW phone", type: "tel" },
      { key: "csw_email", label: "CSW email", type: "email" },
      { key: "cswm", label: "CSW's manager" },
      { key: "cswm_phone", label: "CSW's manager phone", type: "tel" },
      { key: "cswm_email", label: "CSW's manager email", type: "email" },
      { key: "iro", label: "IRO (Independent Reviewing Officer)" },
      { key: "iro_phone", label: "IRO phone", type: "tel" },
      { key: "iro_email", label: "IRO email", type: "email" },
      { key: "duty", label: "Team duty line" },
      // For a child who visits (sleepover/daycare) and lives with a
      // different carer day-to-day -- that carer's own SSW, not this
      // household's, so it's reachable quickly while the child is here
      // without digging through notes to find who to call.
      { key: "carer_name", label: "Their own carer's name (if not you)" },
      { key: "carer_ssw", label: "Their carer's SSW" },
      { key: "carer_ssw_phone", label: "Their carer's SSW phone", type: "tel" },
      { key: "carer_ssw_email", label: "Their carer's SSW email", type: "email" },
    ],
  },
  {
    title: "Health",
    fields: [
      { key: "gp", label: "GP practice" },
      { key: "nhs", label: "NHS number", placeholder: "where it is kept, or the number if you're happy to hold it here" },
      { key: "allergies", label: "Allergies & medication", placeholder: 'say "none" if none' },
      { key: "dentist", label: "Dentist / optician", placeholder: "practice name" },
      { key: "laceh", label: "CLA health assessment", placeholder: "last · next due" },
      {
        key: "recurring_checks",
        label: "Recurring health checks",
        addLabel: "add another check",
        repeatableFields: [
          { key: "what", label: "What (e.g. Dentist, Eye test, Hearing test)" },
          { key: "last", label: "Last done", type: "date" },
          { key: "next", label: "Next due", type: "date" },
        ],
      },
    ],
  },
  {
    title: "Food",
    fields: [
      { key: "food_preference", label: "Dietary preference", placeholder: "vegetarian, vegan, halal, kosher, etc — leave blank if none" },
      { key: "food_likes", label: "Likes", placeholder: "favourite meals, snacks" },
      { key: "food_dislikes", label: "Dislikes", placeholder: "won't eat, texture issues, etc" },
      {
        key: "food_allergies",
        label: "Allergies & intolerances",
        addLabel: "add another",
        repeatableFields: [
          { key: "item", label: "What (e.g. peanuts, dairy)" },
          { key: "severity", label: "Type", select: ["Intolerance", "Allergy", "Severe allergy"] },
        ],
      },
    ],
  },
  {
    title: "Education",
    fields: [
      { key: "school", label: "School & year", placeholder: "name · phone · year · class" },
      {
        key: "teacher",
        label: "Key contacts at school",
        addLabel: "add another contact",
        repeatableFields: [
          { key: "name", label: "Name / role (e.g. class teacher, SENCO)" },
          { key: "phone", label: "Phone", type: "tel" },
          { key: "email", label: "Email", type: "email" },
        ],
      },
      { key: "pep", label: "PEP", placeholder: "last · next due" },
      { key: "send", label: "SEND / EHCP" },
    ],
  },
  {
    title: "Family & contact",
    fields: [
      { key: "child_phone", label: "Their own mobile number", type: "tel" },
      { key: "contact", label: "Contact arrangements", placeholder: "who · how often · supervised? · where" },
      { key: "nocontact", label: "Must NOT have contact" },
      { key: "family", label: "Family / important people" },
      { key: "cc_contact", label: "Contact centre person" },
      { key: "cc_phone", label: "Contact centre phone", type: "tel" },
    ],
  },
  {
    title: "Key dates",
    fields: [
      { key: "review_last", label: "CLA review — last", type: "date" },
      { key: "review_next", label: "CLA review — next", type: "date" },
      { key: "visit_last", label: "SW statutory visit — last", type: "date" },
      { key: "visit_next", label: "SW statutory visit — next", type: "date" },
      {
        key: "other",
        label: "Other dates",
        addLabel: "add another date",
        repeatableFields: [
          { key: "label", label: "What (court, therapy, assessment...)" },
          { key: "date", label: "Date", type: "date" },
        ],
      },
    ],
  },
  {
    title: "Authority",
    fields: [
      { key: "delegated", label: "Delegated authority — what you can consent to", checklist: DELEGATED_AUTHORITY_ITEMS },
      { key: "photos", label: "Photo / social media consent" },
      { key: "notes", label: "Anything else at a glance" },
    ],
  },
];
