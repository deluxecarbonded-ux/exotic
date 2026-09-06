"use client";

import { useCallback } from "react";
import { EraseIcon, SubmitIcon } from "./kb-icons";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound";
import { useI18n } from "./providers";

/* ══════════════════════════════════════════════════════════════
   Exotic on-screen keyboards — typed answers replace choices.
   • LettersKeyboard  → word answers (layout adapts to locale)
   • NumbersKeyboard  → digit answers (numerals localized)
   ══════════════════════════════════════════════════════════════ */

type KB = {
  rows: string[];      // each string = one row of letters
  extras?: string;     // diacritic keys appended to row 2
  rtl?: boolean;
};

const LAYOUTS: Record<string, KB> = {
  latin: {
    rows: ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
    extras: "",
  },
  ru: {
    rows: ["йцукенгшщзхъ", "фывапролджэ", "ячсмитьбюё"],
  },
  ar: {
    rows: ["ضصثقفغعهخحجش", "سيبلاتنمكط", "ئءؤرلاىةوزظ"],
    rtl: true,
  },
  hi: {
    rows: ["अआइईउऊएऐओऔ", "कखगघचछजझटठ", "डढतथदधनपफ", "बभमयरलवशषसह"],
  },
};

/* per-locale diacritics for latin-script languages */
const EXTRAS: Record<string, string> = {
  de: "äöüß",
  es: "ñáéíóú",
  fr: "àâçéèêôù",
  it: "àèéìòù",
  pt: "ãõçáé",
  tr: "ğüşıöç",
  sv: "åäö",
  pl: "ąćęłóśżź",
};

function layoutFor(locale: string): KB {
  if (locale === "ru") return LAYOUTS.ru;
  if (locale === "ar") return LAYOUTS.ar;
  if (locale === "hi") return LAYOUTS.hi;
  return { ...LAYOUTS.latin, extras: EXTRAS[locale] || "" };
}

/* localized digit glyphs (underlying value stays ASCII) */
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const HI_DIGITS = "०१२३४५६७८९";
export function localDigit(d: number, locale: string): string {
  if (locale === "ar") return AR_DIGITS[d];
  if (locale === "hi") return HI_DIGITS[d];
  return String(d);
}

/* ── shared key button ── */
function KeyBtn({
  children,
  onClick,
  disabled,
  wide,
  className,
  label,
  snd,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  wide?: boolean;
  className?: string;
  label?: string;
  snd?: "key" | "back" | "enter";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        if (snd === "back") sfx.keyBack();
        else if (snd === "enter") sfx.enter();
        else sfx.type();
        onClick();
      }}
      className={cn(
        "press grid h-12 flex-1 place-items-center rounded-xl bg-soft2 px-2 text-base font-bold text-fg disabled:opacity-35 md:text-sm",
        wide && "flex-[1.9] bg-soft",
        className
      )}
    >
      {children}
    </button>
  );
}

/* ── typed-answer slots ── */
export function AnswerSlots({
  value,
  length,
  rtl,
  shake,
  good,
  digitLocale,
}: {
  value: string;
  length?: number; // fixed length (numbers); undefined = grows (words)
  rtl?: boolean;
  shake?: boolean;
  good?: boolean;
  digitLocale?: string;
}) {
  const chars = (value || "").split("");
  const boxes =
    length != null
      ? Array.from({ length })
      : Array.from({ length: Math.max(chars.length, 1) });
  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className={cn(
        "mb-4 flex flex-wrap justify-center gap-1.5",
        shake && "animate-shake"
      )}
    >
      {boxes.map((_, i) => {
        const ch = chars[i] ?? "";
        const show =
          ch && digitLocale && /^[0-9]$/.test(ch)
            ? localDigit(Number(ch), digitLocale)
            : ch;
        return (
          <span
            key={i}
            className={cn(
              "grid h-11 w-9 place-items-center rounded-xl text-lg font-black uppercase",
              ch ? "bg-fg text-bg" : "bg-soft2 text-mute",
              good && ch && "bg-btn text-btnfg"
            )}
          >
            {show || "·"}
          </span>
        );
      })}
    </div>
  );
}

/* ── LETTERS KEYBOARD (word answers) ── */
export function LettersKeyboard({
  onChar,
  onBackspace,
  onEnter,
  maxLength = 16,
  disabled,
  enterEnabled,
}: {
  onChar: (c: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  maxLength?: number;
  disabled?: boolean;
  enterEnabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const kb = layoutFor(locale);
  const rows = [...kb.rows];
  if (kb.extras) rows[1] = rows[1] + kb.extras;
  return (
    <div
      dir={kb.rtl ? "rtl" : "ltr"}
      className="flex flex-col gap-1.5"
      aria-label={t("kb.letters")}
    >
      {rows.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1.5">
          {row.split("").map((c) => (
            <KeyBtn
              key={c}
              disabled={disabled}
              label={c}
              onClick={() => onChar(c)}
            >
              {c}
            </KeyBtn>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-1.5">
        <KeyBtn
          wide
          disabled={disabled}
          label={t("a11y.delete")}
          snd="back"
          onClick={onBackspace}
        >
          <EraseIcon size={17} />
        </KeyBtn>
        <KeyBtn
          wide
          disabled={disabled || !enterEnabled}
          label={t("kb.enter")}
          snd="enter"
          onClick={onEnter}
          className="bg-btn text-btnfg"
        >
          <SubmitIcon size={16} />
        </KeyBtn>
      </div>
    </div>
  );
}

/* ── NUMBERS KEYBOARD (digit answers) ── */
export function NumbersKeyboard({
  onDigit,
  onBackspace,
  onEnter,
  disabled,
  enterEnabled,
}: {
  onDigit: (d: number) => void;
  onBackspace: () => void;
  onEnter: () => void;
  disabled?: boolean;
  enterEnabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const press = useCallback((d: number) => () => onDigit(d), [onDigit]);
  return (
    <div className="flex flex-col gap-1.5" aria-label={t("kb.numbers")}>
      <div className="flex justify-center gap-1.5">
        {keys.slice(0, 3).map((d) => (
          <KeyBtn key={d} disabled={disabled} onClick={press(d)}>
            {localDigit(d, locale)}
          </KeyBtn>
        ))}
      </div>
      <div className="flex justify-center gap-1.5">
        {keys.slice(3, 6).map((d) => (
          <KeyBtn key={d} disabled={disabled} onClick={press(d)}>
            {localDigit(d, locale)}
          </KeyBtn>
        ))}
      </div>
      <div className="flex justify-center gap-1.5">
        {keys.slice(6, 9).map((d) => (
          <KeyBtn key={d} disabled={disabled} onClick={press(d)}>
            {localDigit(d, locale)}
          </KeyBtn>
        ))}
      </div>
      <div className="flex justify-center gap-1.5">
        <KeyBtn
          wide
          disabled={disabled}
          label={t("a11y.delete")}
          onClick={onBackspace}
        >
          <EraseIcon size={17} />
        </KeyBtn>
        <KeyBtn disabled={disabled} onClick={press(0)}>
          {localDigit(0, locale)}
        </KeyBtn>
        <KeyBtn
          wide
          disabled={disabled || !enterEnabled}
          label={t("kb.enter")}
          onClick={onEnter}
          className="bg-btn text-btnfg"
        >
          <SubmitIcon size={16} />
        </KeyBtn>
      </div>
    </div>
  );
}
