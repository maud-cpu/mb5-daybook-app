export const PROFILE_FIELDS = [
  ["about", "About them & what works", "one-to-one attention, favourite activities, how to connect"],
  ["routine", "Daily routine", "wake time, breakfast before dressing, bedtime, story, who stays until asleep"],
  ["food", "Food", "favourites, dislikes, portions, snacks, no drinks after…"],
  ["school", "School / nursery", "drop-off time & exact spot, who collects, clubs, pick-up times"],
  ["toilet", "Toileting / night", "nappies, reminders, bedwetting plan"],
  ["sleep", "Sleep", "where they sleep, comfort items, night-time fears, what to do if they wake"],
  ["health", "Health & medication", 'GP, allergies (say "none" if none), meds & when, inhalers, known issues'],
  ["emotions", "Behaviour & emotional support", "triggers, warning signs, what helps, what makes it worse, time alone vs company"],
  ["contact", "Family time & contact during the stay", "who they may/may not see or phone, arrangements, how they are afterwards"],
  ["screens", "Screens, phones & money", "devices, time limits, apps, pocket money"],
  ["told", "What the child has been told", "why they are staying, for how long, when you'll be back"],
  ["nogo", "Things not to do / safeguarding", "anyone who must not have contact, places to avoid, photos on social media"],
  ["pack", "Packing list", "uniform, meds, comfort toy, chargers, swim kit"],
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number][0];

export const HOUSEHOLD_FIELDS = [
  ["ssw_name", "Supervising social worker", "name, email, phone"],
  ["csw", "Children's social worker(s)", "name, email, phone — per child if different"],
  ["edt", "Out of hours / EDT", "emergency duty team number"],
  ["gp", "GP practice", "name & phone"],
  ["hub", "Mockingbird hub carer", "name & phone"],
  ["school_contact", "School office", "phone; who has been told about the stay"],
  ["delegated", "Delegated authority & consents", "what the receiving carer may consent to (medical treatment, haircuts, trips), and where the signed forms are"],
  ["carseat", "Transport", "car seats needed, who insured to drive them, walking limits"],
] as const;
