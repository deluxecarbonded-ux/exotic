// Exotic · Edge Function: `ai`
// Cloud-side Ollama proxy (the Next.js /api/ai route is the primary path;
// use this when Ollama is hosted somewhere reachable from Supabase).
// Falls back to the same deterministic generator as /api/ai, so it never
// hard-fails while Ollama is offline.
//
// Deploy:  supabase functions deploy ai
// Config:  supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
//          supabase secrets set OPENROUTER_MODEL=google/gemma-4-31b-it:free

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/* ── localized fallback strings (all 16 game languages) ── */
const L10N: Record<string, Record<string, string>> = {
  "en": {
    "local": "Generated locally.",
    "seq": "Number sequence.",
    "tables": "Times tables.",
    "quick": "Quick arithmetic.",
    "oracle": "The code whispers in sums and silhouettes — weigh every clue before you key a digit."
  },
  "es": {
    "local": "Generado localmente.",
    "seq": "Serie numérica.",
    "tables": "Tablas de multiplicar.",
    "quick": "Cálculo rápido.",
    "oracle": "El código susurra en sumas y siluetas — pesa cada pista antes de marcar un dígito."
  },
  "fr": {
    "local": "Généré localement.",
    "seq": "Suite logique.",
    "tables": "Tables de multiplication.",
    "quick": "Calcul rapide.",
    "oracle": "Le code murmure en sommes et silhouettes — pesez chaque indice avant de composer un chiffre."
  },
  "de": {
    "local": "Lokal generiert.",
    "seq": "Zahlenfolge.",
    "tables": "Einmaleins.",
    "quick": "Schnelles Rechnen.",
    "oracle": "Der Code flüstert in Summen und Silhouetten — wäge jeden Hinweis ab, bevor du eine Ziffer tippst."
  },
  "it": {
    "local": "Generato localmente.",
    "seq": "Serie numerica.",
    "tables": "Tabelline.",
    "quick": "Calcolo veloce.",
    "oracle": "Il codice sussurra in somme e silhouette — valuta ogni indizio prima di digitare."
  },
  "pt": {
    "local": "Gerado localmente.",
    "seq": "Sequência numérica.",
    "tables": "Tabuada.",
    "quick": "Cálculo rápido.",
    "oracle": "O código sussurra em somas e silhuetas — pondere cada pista antes de digitar."
  },
  "nl": {
    "local": "Lokaal gegenereerd.",
    "seq": "Getallenreeks.",
    "tables": "Tafels.",
    "quick": "Snel rekenen.",
    "oracle": "De code fluistert in sommen en silhouetten — weeg elke aanwijzing af voordat je een cijfer intypt."
  },
  "sv": {
    "local": "Genererat lokalt.",
    "seq": "Talföljd.",
    "tables": "Gångertabeller.",
    "quick": "Snabb huvudräkning.",
    "oracle": "Koden viskar i summor och silhuetter — väg varje ledtråd innan du knappar in en siffra."
  },
  "tr": {
    "local": "Yerel olarak üretildi.",
    "seq": "Sayı dizisi.",
    "tables": "Çarpım tablosu.",
    "quick": "Hızlı aritmetik.",
    "oracle": "Kod toplamlar ve siluetlerde fısıldar — bir rakam girmeden önce her ipucunu tart."
  },
  "ja": {
    "local": "ローカル生成。",
    "seq": "数列です。",
    "tables": "九九です。",
    "quick": "速算です。",
    "oracle": "コードは和と影にささやく — 桁を入力する前にすべてのヒントを吟味せよ。"
  },
  "ko": {
    "local": "로컬 생성.",
    "seq": "숫자 나열입니다.",
    "tables": "구구단입니다.",
    "quick": "빠른 계산입니다.",
    "oracle": "코드는 합과 그림자 속에 속삭입니다 — 숫자를 입력하기 전 모든 단서를 저울질하세요."
  },
  "zh": {
    "local": "本地生成。",
    "seq": "数列题。",
    "tables": "乘法口诀。",
    "quick": "快速运算。",
    "oracle": "代码在和与影中低语 — 输入数字前先权衡每条线索。"
  },
  "ru": {
    "local": "Сгенерировано локально.",
    "seq": "Числовая последовательность.",
    "tables": "Таблица умножения.",
    "quick": "Быстрый счёт.",
    "oracle": "Код шепчет в суммах и силуэтах — взвесь каждую подсказку, прежде чем ввести цифру."
  },
  "ar": {
    "local": "توليد محلي — أولاما غير متصل.",
    "seq": "متتالية أرقام.",
    "tables": "جدول الضرب.",
    "quick": "حساب سريع.",
    "oracle": "الرمز يهمس في المجاميع والظلال — وازن كل تلميح قبل إدخال رقم."
  },
  "hi": {
    "local": "स्थानीय रूप से जनरेट.",
    "seq": "संख्या श्रृंखला।",
    "tables": "पहाड़े।",
    "quick": "तेज़ गणना।",
    "oracle": "कोड योग और छाया में फुसफुसाता है — अंक दर्ज करने से पहले हर सुराग पर विचार करें।"
  },
  "pl": {
    "local": "Wygenerowano lokalnie.",
    "seq": "Ciąg liczbowy.",
    "tables": "Tabliczka mnożenia.",
    "quick": "Szybkie liczenie.",
    "oracle": "Kod szepcze w sumach i sylwetkach — rozważ każdą wskazówkę, zanim wpiszesz cyfrę."
  }
};
function fact(lang: string, k: string): string {
  return L10N[lang]?.[k] ?? L10N.en[k];
}

/* ── typed-answer generators (mirrors app/api/ai/route.ts v2) ── */
const rnd = (n: number) => Math.floor(Math.random() * n);

const WORDS: Record<string, [string, string][]> = {
  en: [["Which planet is closest to the Sun?","mercury"],["What is the largest ocean on Earth?","pacific"],["Which planet is called the Red Planet?","mars"],["What precious metal has the symbol Au?","gold"],["Which gas do plants absorb from the air?","carbon"],["Which gas makes up most of Earth's air?","nitrogen"]],
  es: [["¿Qué planeta está más cerca del Sol?","mercurio"],["¿Cuál es el océano más grande?","pacifico"],["¿Qué planeta es el planeta rojo?","marte"],["¿Qué metal precioso tiene el símbolo Au?","oro"],["¿Qué gas absorben las plantas?","carbono"],["¿Qué gas forma la mayor parte del aire?","nitrogeno"]],
  fr: [["Quelle planète est la plus proche du Soleil ?","mercure"],["Quel est le plus grand océan ?","pacifique"],["Quelle planète est la planète rouge ?","mars"],["Quel métal précieux a le symbole Au ?","or"],["Quel gaz les plantes absorbent-elles ?","carbone"],["Quel gaz compose la majorité de l'air ?","azote"]],
  de: [["Welcher Planet ist der Sonne am nächsten?","merkur"],["Was ist der größte Ozean der Erde?","pazifik"],["Welcher Planet wird roter Planet genannt?","mars"],["Welches Edelmetall hat das Symbol Au?","gold"],["Welches Gas nehmen Pflanzen auf?","kohlenstoff"],["Welches Gas macht den Großteil der Luft aus?","stickstoff"]],
  it: [["Quale pianeta è più vicino al Sole?","mercurio"],["Qual è l'oceano più grande?","pacifico"],["Quale pianeta è il pianeta rosso?","marte"],["Quale metallo prezioso ha il simbolo Au?","oro"],["Quale gas assorbono le piante?","carbonio"],["Quale gas compone la maggior parte dell'aria?","azoto"]],
  pt: [["Qual planeta está mais perto do Sol?","mercurio"],["Qual é o maior oceano da Terra?","pacifico"],["Qual planeta é o planeta vermelho?","marte"],["Qual metal precioso tem o símbolo Au?","ouro"],["Qual gás as plantas absorvem?","carbono"],["Qual gás forma a maior parte do ar?","nitrogenio"]],
  nl: [["Welke planeet staat het dichtst bij de zon?","mercurius"],["Wat is de grootste oceaan op aarde?","pacifisch"],["Welke planeet heet de rode planeet?","mars"],["Welk edelmetaal heeft symbool Au?","goud"],["Welk gas nemen planten op?","koolstof"],["Welk gas vormt het grootste deel van de lucht?","stikstof"]],
  sv: [["Vilken planet ligger närmast solen?","merkurius"],["Vilken är jordens största hav?","stilla"],["Vilken planet kallas den röda planeten?","mars"],["Vilken ädelmetall har symbolen Au?","guld"],["Vilken gas tar växter upp?","kol"],["Vilken gas utgör större delen av luften?","kvave"]],
  tr: [["Güneş'e en yakın gezegen hangisidir?","merkur"],["Dünyanın en büyük okyanusu hangisidir?","pasifik"],["Kızıl gezegen hangisidir?","mars"],["Au sembolü hangi değerli metale aittir?","altin"],["Bitkiler havadan hangi gazı alır?","karbon"],["Havanın çoğu hangi gazdan oluşur?","azot"]],
  pl: [["Która planeta jest najbliżej Słońca?","merkury"],["Jaki jest największy ocean na Ziemi?","pacyfik"],["Która planeta to czerwona planeta?","mars"],["Jaki metal szlachetny ma symbol Au?","zloto"],["Jakiego gazu rośliny absorbują?","wegiel"],["Jakiego gazu jest najwięcej w powietrzu?","azot"]],
  ru: [["Какая планета ближе всех к Солнцу?","меркурий"],["Какой океан самый большой на Земле?","тихий"],["Какую планету называют красной?","марс"],["Какой драгметалл обозначается Au?","золото"],["Какой газ поглощают растения?","углерод"],["Какого газа больше всего в воздухе?","азот"]],
  ar: [["أي كوكب أقرب إلى الشمس؟","عطارد"],["ما هو أكبر محيط على الأرض؟","الهادي"],["أي كوكب يسمى الكوكب الأحمر؟","المريخ"],["أي معدن ثمين رمزه Au؟","ذهب"],["أي غاز تمتصه النباتات؟","كربون"],["أي غاز يشكل معظم الهواء؟","نيتروجين"]],
  hi: [["सूर्य के सबसे निकट कौन सा ग्रह है?","बुध"],["पृथ्वी का सबसे बड़ा महासागर कौन सा है?","प्रशांत"],["किस ग्रह को लाल ग्रह कहते हैं?","मंगल"],["Au चिह्न किस बहुमूल्य धातु का है?","सोना"],["पौधे हवा से कौन सी गैस लेते हैं?","कार्बन"],["हवा का सबसे बड़ा हिस्सा कौन सी गैस है?","नाइट्रोजन"]],
};

const CJK = ["ja", "ko", "zh"];

const CAT_LABEL: Record<string, string> = {
  math: "mathematics and arithmetic",
  science: "science (physics, chemistry, biology, astronomy)",
  trivia: "general knowledge and trivia",
  riddle: "riddles and lateral thinking",
  logic: "logic and number sequences",
  mixed: "mixed topics (math, science, trivia, riddles, logic)",
};

function fallbackQuestion(difficulty: string, lang: string, level = 1): any {
  const L = Math.min(30, Math.max(1, level || 1));
  const wordBank = WORDS[lang];
  if (wordBank && rnd(100) < 45) {
    const [q, a] = wordBank[rnd(wordBank.length)];
    return {
      question: q,
      answer: a,
      kind: "word",
      category: "trivia",
      fun_fact: fact(lang, "local"),
    };
  }
  const variant = rnd(3);
  if (variant === 0) {
    const a = rnd(8 + L * 4) + 3 + L;
    const b = rnd(6 + L * 3) + 3;
    const ans = a + b;
    return {
      question: `${a} + ${b} = ?`,
      answer: String(ans),
      kind: "number",
      category: "math",
      fun_fact: fact(lang, "local"),
    };
  }
  if (variant === 1) {
    const start = rnd(6 + L) + 2;
    const step = rnd(3 + Math.floor(L / 2)) + 2;
    const ans = start + step * 4;
    return {
      question: `${start}, ${start + step}, ${start + step * 2}, ${start + step * 3}, … ?`,
      answer: String(ans),
      kind: "number",
      category: "logic",
      fun_fact: fact(lang, "seq"),
    };
  }
  const a = rnd(6 + L) + 2;
  const b = rnd(6 + Math.floor(L / 2)) + 2;
  return {
    question: `${a} × ${b} = ?`,
    answer: String(a * b),
    kind: "number",
    category: "math",
    fun_fact: fact(lang, "tables"),
  };
}

/* normalize + validate a typed answer from the model — mirrors the shared
   client/server normalization (ال/ة/ه/ى/أ…, diacritics, ß/ss…) so accepted
   variants always match what the player types */
function normLenient(v: string): string {
  let a = (v || "").trim().toLowerCase();
  a = a.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  a = a.replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/œ/g, "oe")
       .replace(/ø/g, "o").replace(/đ/g, "d").replace(/ł/g, "l").replace(/þ/g, "th");
  a = a.replace(/[\u200B-\u200D\uFEFF\u0621\u0640\u064B-\u065F\u0670]/g, "");
  a = a.replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
       .replace(/ؤ/g, "و").replace(/ئ/g, "ي");
  a = a.replace(/^ال/, "").replace(/\s+/g, "");
  a = a.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
       .replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
  return a;
}
function coerceAnswer(raw: any, lang: string): { answer: string; kind: "word" | "number" } | null {
  const a = normLenient(String(raw ?? ""));
  if (/^[0-9]{1,6}$/.test(a)) {
    return { answer: a, kind: "number" };
  }
  if (a.length < 2 || a.length > 16) return null;
  if (CJK.includes(lang)) return null; // CJK locales answer with numbers
  return { answer: a, kind: "word" };
}


const fallbackOracle = (lang: string) => fact(lang, "oracle");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  const kind = body.kind === "oracle" ? "oracle" : "question";
  const category = String(body.category || "mixed");
  const difficulty = String(body.difficulty || "medium");
  const lang = String(body.lang || "en");
  const level = Math.min(30, Math.max(1, Number(body.level) || 1));
  /* OpenRouter powers every AI feature; falls through to the Next.js
     route's Exo Core banks if no key is configured */
  const orKey = Deno.env.get("OPENROUTER_API_KEY") || "";
  const model = Deno.env.get("OPENROUTER_MODEL") || "google/gemma-4-31b-it:free";

  let prompt: string;
  const IDENTITY = "You are Exo, Exotic's own AI — if asked what model or company powers you, the only answer is Exo; never mention OpenRouter or any underlying model or provider. ";
  if (kind === "oracle") {
    prompt = `${IDENTITY}You are the Oracle of Exotic, a mystical guardian of a secret 4-digit code. A player is hunting the code. Here is everything the player knows so far.
CLUES: ${JSON.stringify(body.clues || [])}
GUESSES (exact = right digit right place, partial = right digit wrong place): ${JSON.stringify(body.guesses || [])}
Give ONE short mystical hint (max 22 words) that nudges their strategy WITHOUT revealing any specific digit or position. Never invent facts that contradict the clues. Respond with JSON only: {"text": string}.`;
  } else {
    prompt = `${IDENTITY}Create exactly ONE quiz question about ${CAT_LABEL[category] || CAT_LABEL.mixed}.
Difficulty: ${difficulty}, campaign level ${level} of 30 (higher level = harder: obscurer facts, bigger numbers, trickier logic).
Write the question in language "${lang}".
The answer must be a SINGLE WORD (no spaces, max 14 letters, no punctuation) or a NUMBER (max 6 digits).
${CJK.includes(lang) ? "IMPORTANT: the answer MUST be a NUMBER.\n" : ""}No options, no lists — the player types the answer.
Respond with JSON ONLY, no markdown: {"question": string, "answer": string, "answer_kind": "word" or "number", "category": "${category}", "fun_fact": string max 18 words}`;
  }

  try {
    if (!orKey) throw new Error("no-openrouter-key");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${orKey}`,
        "HTTP-Referer": Deno.env.get("OPENROUTER_REFERER") || "http://localhost:3000",
        "X-Title": "Exotic",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: kind === "oracle" ? 1.0 : 0.9,
        private: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`openrouter ${res.status}`);
    const j = await res.json();
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "null");
    if (!parsed) throw new Error("bad-shape");

    if (kind === "oracle") {
      if (typeof parsed.text !== "string") throw new Error("bad-shape");
      return json({ text: parsed.text, ai: true });
    }

    if (typeof parsed.question !== "string" || parsed.question.length < 5)
      throw new Error("bad-shape");
    const ans = coerceAnswer(parsed.answer, lang);
    if (!ans) throw new Error("bad-shape");

    return json({
      question: parsed.question,
      answer: ans.answer,
      kind: ans.kind,
      category: parsed.category || category,
      fun_fact: parsed.fun_fact || "",
      ai: true,
    });
  } catch {
    // graceful degradation — same contract as the /api/ai route
    if (kind === "oracle") return json({ text: fallbackOracle(lang), ai: false });
    return json({ ...fallbackQuestion(difficulty, lang, level), ai: false });
  }
});
