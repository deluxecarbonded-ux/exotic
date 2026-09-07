"use client";

import { motion, useReducedMotion } from "framer-motion";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LOCALES, LOCALE_META } from "@/locales";
import { safeGet, safeSet } from "@/lib/safe-store";
import { warmSfx } from "@/lib/sound";

/* ────────────────────────── Theme ────────────────────────── */

type Theme = "dark" | "light";
const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "dark",
  setTheme: () => {},
});
export const useTheme = () => useContext(ThemeCtx);

/* ─────────────────────────── i18n ────────────────────────── */

type I18nCtx = {
  t: (key: string, vars?: Record<string, string | number>, fallback?: string) => string;
  locale: string;
  setLocale: (l: string) => void;
  locales: typeof LOCALE_META;
  num: (n: number) => string; // locale-aware numerals (٠١٢ / ०१२ / 012)
  /* AI-generated questions (Solo only — Multiplayer is always on) */
  aiQuestions: boolean;
  setAiQuestions: (v: boolean) => void;
};
const I18nContext = createContext<I18nCtx>({
  t: (k) => k,
  locale: "en",
  setLocale: () => {},
  locales: LOCALE_META,
  num: (n) => String(n),
  aiQuestions: true,
  setAiQuestions: () => {},
});

/* numerals per locale: Arabic-Indic for ar, Devanagari for hi */
const NUM_LOCALE: Record<string, string> = {
  ar: "ar-EG",
  hi: "hi-IN-u-nu-deva",
};

/* Map Latin digits in any string to the locale's numerals (ar/hi).
   Idempotent — already-native digits pass through untouched. */
export function localeDigits(s: string, locale: string): string {
  if (locale !== "ar" && locale !== "hi") return s;
  const to =
    locale === "ar" ? "٠١٢٣٤٥٦٧٨٩" : "०१२३४५६७८९";
  return s.replace(/[0-9]/g, (d) => to[Number(d)]);
}
function digitsFor(locale: string) {
  try {
    return new Intl.NumberFormat(NUM_LOCALE[locale] ?? locale);
  } catch {
    return new Intl.NumberFormat("en");
  }
}
export const useI18n = () => useContext(I18nContext);

function resolve(obj: any, path: string): string | undefined {
  let cur = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/* ─────────────────────────── Toast ───────────────────────── */

type Toast = { id: number; msg: string; kind: "ok" | "err" };
const ToastCtx = createContext<{
  toast: (msg: string, kind?: "ok" | "err") => void;
}>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

/* ───────────────────────── Providers ─────────────────────── */


/* ── Title-case every word for languages with capital/lowercase letters ──.
   Languages without case (ar, hi, ja, ko, zh) are left untouched.
   First letter of EVERY word is uppercased (rest of the word is preserved,
   so acronyms like XP or AI stay intact). Apostrophes don't start a new
   word ("don't" → "Don't"), but hyphens/slashes/brackets do
   ("four-digit" → "Four-Digit"). {placeholders} are skipped. */
const CASE_LOCALES = new Set([
  "en", "es", "fr", "de", "it", "pt", "nl", "sv", "tr", "pl", "ru",
]);
const WORD_STARTERS = new Set(["(", "[", "«", "\u201C", "¿", "¡", "-", "/", '"']);

export function titleCaseEveryWord(s: string, locale: string): string {
  if (!CASE_LOCALES.has(locale)) return s;
  const loc = locale === "tr" ? "tr-TR" : locale;
  let out = "";
  let capNext = true;
  let inVar = false;
  for (const ch of s) {
    if (ch === "{") inVar = true;
    if (inVar) {
      out += ch;
      if (ch === "}") inVar = false;
      continue;
    }
    if (/\s/.test(ch) || WORD_STARTERS.has(ch)) {
      out += ch;
      capNext = true;
      continue;
    }
    if (capNext && /\p{L}/u.test(ch)) {
      out += ch.toLocaleUpperCase(loc);
      capNext = false;
    } else {
      out += ch;
      if (/\p{L}|\p{N}/u.test(ch)) capNext = false;
    }
  }
  return out;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [locale, setLocaleState] = useState("en");
  const [aiQuestions, setAiQuestionsState] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    setMounted(true);
    /* build marker — shows in the console + on <html data-build> so a
       stale tab running old JavaScript is instantly identifiable */
    try {
      document.documentElement.dataset.build = process.env.EXOTIC_BUILD || "?";
      console.info(`[Exotic] build ${process.env.EXOTIC_BUILD || "?"}`);
    } catch {}
    const savedTheme = safeGet("exotic-theme") as Theme | null;
    const savedLocale = safeGet("exotic-locale");
    if (savedTheme === "light" || savedTheme === "dark") setThemeState(savedTheme);
    if (savedLocale && LOCALES[savedLocale]) setLocaleState(savedLocale);
    if (safeGet("exotic-ai") === "false") setAiQuestionsState(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>, fallback?: string) => {
      let str =
        resolve(LOCALES[locale], key) ?? resolve(LOCALES.en, key) ?? fallback ?? key;
      str = titleCaseEveryWord(str, locale);
      if (vars) {
        const nf = digitsFor(locale);
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(
            `{${k}}`,
            typeof v === "number" ? nf.format(v) : String(v)
          );
        }
      }
      return str;
    },
    [locale]
  );

  useEffect(() => {
    warmSfx();
    const warm = () => warmSfx();
    window.addEventListener("pointerdown", warm, { once: true });
    return () => window.removeEventListener("pointerdown", warm);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    /* Next's metadata manager re-applies the static <title>/<meta> after
       hydration, overwriting manual writes — re-apply until it sticks. */
    const title = t("app.titleTag");
    const desc = t("app.desc");
    const apply = () => {
      document.title = title;
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", desc);
    };
    apply();
    const ids = [300, 1200].map((ms) => setTimeout(apply, ms));
    return () => ids.forEach(clearTimeout);
  }, [locale, t]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      safeSet("exotic-theme", t);
    } catch {}
  }, []);

  const setLocale = useCallback((l: string) => {
    if (!LOCALES[l]) return;
    setLocaleState(l);
    try {
      safeSet("exotic-locale", l);
    } catch {}
  }, []);

  const setAiQuestions = useCallback((v: boolean) => {
    setAiQuestionsState(v);
    try {
      safeSet("exotic-ai", v ? "true" : "false");
    } catch {}
  }, []);

  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = ++idRef.current;
    setToasts((ts) => [...ts.slice(-3), { id, msg, kind }]);
    setTimeout(() => {
      setToasts((ts) => ts.filter((x) => x.id !== id));
    }, 2800);
  }, []);

  const num = useCallback(
    (n: number) => digitsFor(locale).format(n),
    [locale]
  );

  const i18n = useMemo(
    () => ({ t, locale, setLocale, locales: LOCALE_META, num, aiQuestions, setAiQuestions }),
    [t, locale, setLocale, num, aiQuestions, setAiQuestions]
  );

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      <I18nContext.Provider value={i18n}>
        <ToastCtx.Provider value={{ toast }}>
          {mounted ? (
            children
          ) : (
            <div className="fixed inset-0 grid place-items-center bg-bg">
              <div className="flex items-center gap-3 animate-pulse-soft">
                <LogoMark size={34} />
                <span className="display text-2xl">{t("app.brand")}</span>
              </div>
            </div>
          )}
          <div className="pointer-events-none fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] md:bottom-8 left-1/2 z-[90] -translate-x-1/2 flex flex-col items-center gap-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="animate-slideup rounded-full bg-fg px-5 py-2.5 text-sm font-bold text-bg shadow-pop"
              >
                {t.msg}
              </div>
            ))}
          </div>
        </ToastCtx.Provider>
      </I18nContext.Provider>
    </ThemeCtx.Provider>
  );
}

/* ── Animated logo mark (visualizer) ─────────────────────────────
   Same four bars, same geometry — each bar now pulses like an audio
   equalizer, staggered into a wave. Static for reduced-motion users. */
const LOGO_BARS = [
  { x: 4, y: 26, w: 12, h: 14, o: 1, dur: 1.05, delay: 0 },
  { x: 20, y: 18, w: 12, h: 24, o: 0.8, dur: 0.85, delay: 0.12 },
  { x: 36, y: 23, w: 12, h: 18, o: 0.6, dur: 1.2, delay: 0.24 },
  { x: 52, y: 28, w: 8, h: 12, o: 0.4, dur: 0.95, delay: 0.36 },
] as const;

export function LogoMark({ size = 26 }: { size?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {LOGO_BARS.map((b, i) => (
        <motion.rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={4}
          fill="currentColor"
          opacity={b.o}
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
          animate={
            reduceMotion
              ? undefined
              : { scaleY: [1, 1.3, 0.8, 1.16, 1] }
          }
          transition={{
            duration: b.dur,
            delay: b.delay,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.28, 0.55, 0.8, 1],
          }}
        />
      ))}
    </svg>
  );
}
