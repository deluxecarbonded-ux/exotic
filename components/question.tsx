"use client";

import { useState } from "react";
import type { AIQuestion } from "@/lib/game";
import { cn } from "@/lib/utils";
import { BrainCircuit, Check, Hash, CaseSensitive, Sparkles } from "lucide-react";
import { sfx } from "@/lib/sound";
import { localeDigits, useI18n, titleCaseEveryWord } from "./providers";
import { Pill } from "./ui";
import {
  LettersKeyboard,
  NumbersKeyboard,
  AnswerSlots,
} from "./keyboard";

/* Level question card — the answer is typed on the letters or numbers
   keyboard and verified SERVER-side via the check callback (the real
   answer never lives in this component). Wrong tries shake and clear;
   unlimited attempts — only the clock can fail you. */
export function QuestionCard({
  q,
  answerLen,
  locked,
  onCheck,
  onSolved,
}: {
  q: AIQuestion;
  answerLen: number;
  locked?: boolean;
  onCheck: (value: string) => Promise<boolean>;
  onSolved?: (firstTry: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [value, setValue] = useState("");
  const [tries, setTries] = useState(0);
  const [solved, setSolved] = useState(false);
  const [shake, setShake] = useState(false);
  const [cool, setCool] = useState(false);
  const [busy, setBusy] = useState(false);
  const maxLen = q.kind === "number" ? Math.max(answerLen, 1) : 16;

  const submit = async () => {
    if (locked || solved || cool || busy) return;
    if (value.trim().length < 1) return;
    setBusy(true);
    let ok = false;
    try {
      ok = await onCheck(value);
    } catch {
      ok = false;
    }
    setBusy(false);
    if (ok) {
      sfx.correct();
      setSolved(true);
      setTimeout(() => onSolved?.(tries === 0), 950);
    } else {
      sfx.wrong();
      setTries((n) => n + 1);
      setShake(true);
      setCool(true);
      setTimeout(() => {
        setShake(false);
        setCool(false);
        setValue("");
      }, 750);
    }
  };

  return (
    <div className="rounded-[2rem] bg-soft p-6 shadow-soft md:p-7">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill solid>
          <BrainCircuit size={13} />
          {t(`game.q.${q.category}`) !== `game.q.${q.category}`
            ? t(`game.q.${q.category}`)
            : q.category}
        </Pill>
        <Pill className="text-mute">
          {q.kind === "number" ? (
            <>
              <Hash size={12} /> {t("game.q.number")}
            </>
          ) : (
            <>
              <CaseSensitive size={13} /> {t("game.q.word")}
            </>
          )}
        </Pill>
        {q.ai && (
          <Pill className="text-mute" >
            <Sparkles size={12} className="exo-badge-spark" aria-hidden /> Exo
          </Pill>
        )}
      </div>

      <p className="display mb-5 text-lg leading-snug md:text-xl">
        {localeDigits(titleCaseEveryWord(q.question, locale), locale)}
      </p>

      <div className="mx-auto max-w-sm max-md:sticky max-md:bottom-[calc(0.5rem+env(safe-area-inset-bottom))] max-md:rounded-3xl max-md:bg-bg/95 max-md:px-2 max-md:py-3 max-md:shadow-soft max-md:backdrop-blur-xl">
        <AnswerSlots
          value={value}
          length={q.kind === "number" ? maxLen : undefined}
          rtl={q.kind === "word" && locale === "ar"}
          shake={shake}
          good={solved}
          digitLocale={q.kind === "number" ? locale : undefined}
        />

        {solved ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-fg px-4 py-3 text-sm font-black text-bg animate-pop">
            <Check size={16} /> {t("game.q.correct")}
          </div>
        ) : q.kind === "number" ? (
          <NumbersKeyboard
            disabled={locked || cool || busy}
            enterEnabled={value.length > 0}
            onDigit={(d) =>
              setValue((v) => (v.length < maxLen ? v + String(d) : v))
            }
            onBackspace={() => setValue((v) => v.slice(0, -1))}
            onEnter={submit}
          />
        ) : (
          <LettersKeyboard
            disabled={locked || cool || busy}
            enterEnabled={value.trim().length >= 2}
            maxLength={16}
            onChar={(c) => setValue((v) => (v.length < 16 ? v + c : v))}
            onBackspace={() => setValue((v) => v.slice(0, -1))}
            onEnter={submit}
          />
        )}
      </div>

      {q.fun_fact && solved && (
        <p className="mt-4 animate-fade-up text-xs font-semibold text-mute">
          ✦ {localeDigits(titleCaseEveryWord(q.fun_fact, locale), locale)}
        </p>
      )}
    </div>
  );
}
