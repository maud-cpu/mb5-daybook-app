import { FlagKey } from "@/lib/types";

const ROLEPLAY_RE = /mums? and dads?|mommies and daddies|doctors? and nurses?|being (the )?mummy and daddy/i;
const UNDRESS_RE =
  /(pulled|took off|removed|pulling|taking off)[^.!?]{0,40}(trousers|pants|underwear|knickers|clothes|pyjamas|clothing)|lay(?:ing)? on top of|climbed on top of/i;

const KEYWORD_FLAGS: { flag: FlagKey; test: (s: string) => boolean }[] = [
  {
    flag: "sexualised",
    test: (s) =>
      /sexuali[sz](?:ed|ing)|sexual(?:i[sz]ed|ly)?\s*(behaviour|behavior|play|touch(?:ing)?|comment|language|content|contact)|sexually inappropriate/i.test(
        s,
      ),
  },
  { flag: "sexualised", test: (s) => ROLEPLAY_RE.test(s) && UNDRESS_RE.test(s) },
];

const KEYWORD_TRAINING: { test: RegExp; note: string }[] = [
  {
    test: /\b(hit|hurt|kick(?:ed|ing)?|threw|throw(?:ing)?|squeez(?:ed|ing)|strangl(?:ed|ing)|hurting|cruel|cruelty|choked|stamped on|stepped on|threatened|threatening|unkind|mean|nasty|rough) *(?:to|towards|with)?\b[^.?!]{0,40}\b(dog|cat|pet|animal|rabbit|hamster|guinea pig|puppy|kitten)s?\b|\b(dog|cat|pet|animal|rabbit|hamster|guinea pig|puppy|kitten)s?\b[^.?!]{0,40}\b(hit|hurt|kick(?:ed|ing)?|threw|throw(?:ing)?|squeez(?:ed|ing)|strangl(?:ed|ing)|cruel|cruelty|choked)\b/i,
    note: "Understanding behaviour of children & young people — cruelty or aggression toward animals is a recognised sign worth exploring, not just correcting in the moment.",
  },
  {
    test: /\b(fighting|hitting|kicking|biting|scratch(?:ing)?|swearing|screaming|nasty|aggressive|violent)\b[^.?!]{0,60}\b(each other|one another|sibling|brother|sister)\b|\b(each other|one another|sibling|brother|sister)\b[^.?!]{0,60}\b(fighting|hitting|kicking|biting|scratch(?:ing)?|swearing|screaming|nasty|aggressive|violent)\b/i,
    note: "Understanding behaviour of children & young people — ongoing conflict or aggression between children in placement is worth exploring through this course and raising at supervision. De-escalation and PACE (in the Next steps list) may help too.",
  },
];

export const FLAG_TRAINING: Partial<Record<FlagKey, { course: string; why: string }>> = {
  sexualised: { course: "Intro to harmful sexual behaviour (6 hrs)", why: "covers understanding and responding to this specifically." },
  disclosure: { course: "Working Together to Safeguard Children", why: "covers responding to and recording a disclosure correctly." },
  allegation: { course: "Managing allegations against adults (SCSA)", why: "covers what happens next when an allegation is made." },
  injury: { course: "Risk Management & Safer Caring", why: "covers safer care planning around unexplained injuries." },
  missing: { course: "Risk Management & Safer Caring", why: "covers safer care planning for a child going missing." },
  contact: { course: "Working with birth parents", why: "may help with the contact side of this." },
};

/** Safety net: catches obvious safeguarding language even if the AI call fails or misses it. */
export function backstopFlag(text: string): { flag: string; flagNote: string } {
  const kf = KEYWORD_FLAGS.find((k) => k.test(text));
  if (kf) return { flag: kf.flag, flagNote: "" };
  const kt = KEYWORD_TRAINING.find((k) => k.test.test(text));
  if (kt) return { flag: "training", flagNote: kt.note };
  return { flag: "", flagNote: "" };
}

export function namesInText(names: string[], text: string): string[] {
  if (!text) return [];
  return names.filter((n) => new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(text));
}
