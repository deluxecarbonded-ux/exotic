export type Category = "math" | "science" | "trivia" | "riddle" | "logic";
export const CATEGORIES: Category[] = [
  "math",
  "science",
  "trivia",
  "riddle",
  "logic",
];

export type AIQuestion = {
  question: string;
  answer: string;          // typed answer (single word or digits)
  kind: "word" | "number"; // which keyboard is used
  category: string;
  fun_fact?: string;
  ai?: boolean;
};

/* ── 30-level campaign per difficulty ── */
export const MAX_LEVEL = 30;

/* Normalize a typed answer the same way the server does. */
export function normalizeAnswer(v: string, kind: "word" | "number") {
  let out = (v || "").trim().toLowerCase();
  out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  /* latin extras — mirror server unaccent() (ß/ss, æ/ae, ø/o, đ/d, ł/l, þ/th) */
  out = out
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/ł/g, "l")
    .replace(/þ/g, "th");
  /* zero-width joiners + Arabic tashkeel (vowel marks) + tatweel + standalone hamza ء */
  out = out.replace(/[\u200B-\u200D\uFEFF\u0621\u0640\u064B-\u065F\u0670]/g, "");
  /* Arabic letter equivalences — any variant counts as correct */
  out = out
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
  /* strip the definite article ال — "المريخ" === "مريخ" */
  out = out.replace(/^ال/, "");
  if (kind === "number") {
    /* fold Eastern digits (٠-٩, ०-९) to ASCII so ١٢٣ === 123 */
    out = out
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)))
      .replace(/[^0-9]/g, "");
  } else {
    out = out.replace(/\s+/g, "");
  }
  return out;
}

export type Clue = {
  /* answer-character hints (Digit Lens / Deep Lens) */
  kind: "letter" | "digit";
  payload: Record<string, number | string>;
};

/* Render a server clue into UI text using the i18n translator. */
export function clueText(clue: Clue, t: (k: string, vars?: Record<string, string | number>) => string) {
  const p = clue.payload as any;
  switch (clue.kind) {
    case "letter":
      return t("game.clue.letter", { p: p.p, ch: p.ch });
    case "digit":
      return t("game.clue.digit", { p: p.p, ch: p.ch });
    default:
      return "";
  }
}

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFF_CONFIG: Record<
  Difficulty,
  { attempts: number; clues: number; time: number; reward: number }
> = {
  easy: { attempts: 6, clues: 8, time: 240, reward: 40 },
  medium: { attempts: 5, clues: 6, time: 180, reward: 70 },
  hard: { attempts: 4, clues: 4, time: 150, reward: 120 },
};

/* Deterministic per-level category: every block of 5 levels contains all
   5 categories in a seeded shuffled order, and a category never repeats
   on two consecutive levels (bag seams rotate away matches). */
export function categoryForLevel(level: number): Category {
  const lvl = Math.min(30, Math.max(1, Math.floor(level) || 1));
  const bag = Math.floor((lvl - 1) / CATEGORIES.length);
  let seed = (bag * 7919 + 17) % 2147483647;
  const arr = [...CATEGORIES];
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 48271) % 2147483647;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (bag > 0 && arr[0] === categoryForLevel(bag * CATEGORIES.length)) {
    arr.push(arr.shift()!); /* rotate so first ≠ previous level's category */
  }
  return arr[(lvl - 1) % arr.length];
}
