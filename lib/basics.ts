export type BasicsField = { key: string; label: string; placeholder?: string; select?: string[] };
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

export const BASICS_SECTIONS: BasicsSection[] = [
  {
    title: "Placement",
    fields: [
      { key: "status", label: "Legal status", select: LEGAL_STATUS_OPTIONS },
      { key: "start", label: "Placement started" },
      { key: "type", label: "Placement type", placeholder: "long-term / short-term / respite / emergency" },
      { key: "la", label: "Placing authority" },
    ],
  },
  {
    title: "Social work team",
    fields: [
      { key: "csw", label: "Child's social worker" },
      { key: "cswm", label: "CSW's manager" },
      { key: "iro", label: "IRO (Independent Reviewing Officer)" },
      { key: "duty", label: "Team duty line" },
    ],
  },
  {
    title: "Health",
    fields: [
      { key: "gp", label: "GP practice" },
      { key: "nhs", label: "NHS number", placeholder: "where it is kept, or the number if you're happy to hold it here" },
      { key: "allergies", label: "Allergies & medication", placeholder: 'say "none" if none' },
      { key: "dentist", label: "Dentist / optician", placeholder: "name · last visit" },
      { key: "laceh", label: "CLA health assessment", placeholder: "last · next due" },
    ],
  },
  {
    title: "Education",
    fields: [
      { key: "school", label: "School & year", placeholder: "name · phone · year · class" },
      { key: "teacher", label: "Key contact at school", placeholder: "teacher / TA / designated teacher" },
      { key: "pep", label: "PEP", placeholder: "last · next due" },
      { key: "send", label: "SEND / EHCP" },
    ],
  },
  {
    title: "Family & contact",
    fields: [
      { key: "contact", label: "Contact arrangements", placeholder: "who · how often · supervised? · where" },
      { key: "nocontact", label: "Must NOT have contact" },
      { key: "family", label: "Family / important people" },
    ],
  },
  {
    title: "Key dates",
    fields: [
      { key: "review", label: "CLA review", placeholder: "last · next" },
      { key: "visit", label: "SW statutory visit", placeholder: "last · next (6-weekly)" },
      { key: "other", label: "Other dates", placeholder: "court, therapy, assessments" },
    ],
  },
  {
    title: "Authority",
    fields: [
      { key: "delegated", label: "Delegated authority", placeholder: "what you can consent to" },
      { key: "photos", label: "Photo / social media consent" },
      { key: "notes", label: "Anything else at a glance" },
    ],
  },
];
