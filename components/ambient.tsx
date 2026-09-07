"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/providers";

/* Ambient background — blurred, faint glyphs and particles drifting
   upward behind everything. The glyphs speak the player's language:
   Latin, Cyrillic, Arabic, Devanagari, Kana, Hangul or Hanzi, each
   with its own numerals. Pure CSS animation, hydration-safe (the
   "random" values are derived deterministically from the index). */

type Bank = { glyphs: string; numerals: string };

const BANKS: Record<string, Bank> = {
  latin: {
    glyphs: "EXOTICVWXYZABCDEFGHIJKLMNOPQRSTUV",
    numerals: "0123456789",
  },
  ru: {
    glyphs: "ЭКЗОТИКАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЭЮЯ",
    numerals: "0123456789",
  },
  ar: {
    glyphs: "إكسوتيكابتثجحخدذرزسشصضطظعغفقكلمنهوي",
    numerals: "٠١٢٣٤٥٦٧٨٩",
  },
  hi: {
    /* only standalone-renderable chars — no matras/conjuncts that
       would show dotted-circle artifacts when split per glyph */
    glyphs: "अआइईउऊएऐओऔकखगघचछजझटठडढणतथदधनपफबभमयरलवळशषसहल",
    numerals: "०१२३४५६७८९",
  },
  ja: {
    glyphs: "エキゾチックアイウエオカキクケコサシスセソタチツテトナニヌネノ",
    numerals: "０１２３４５６７８９",
  },
  ko: {
    glyphs: "엑조틱가나다라마바사아자차카타파하",
    numerals: "0123456789",
  },
  zh: {
    glyphs: "天玄地黄宇宙洪荒日月星辰",
    numerals: "零一二三四五六七八九十",
  },
};

function bankFor(locale: string): Bank {
  if (locale in BANKS) return BANKS[locale];
  return BANKS.latin;
}

/* deterministic pseudo-random — same output on server and client */
function rnd(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const charAt = (s: string, i: number) => Array.from(s)[Math.floor(i) % Array.from(s).length];

const GLYPH_COUNT = 26;
const DOT_COUNT = 14;
const GHOST_COUNT = 5;

export function Ambient() {
  const { locale } = useI18n();
  const bank = bankFor(locale);

  const glyphs = useMemo(
    () =>
      Array.from({ length: GLYPH_COUNT }, (_, i) => {
        const isNumeral = rnd(i, 1) < 0.42;
        const src = isNumeral ? bank.numerals : bank.glyphs;
        return {
          ch: charAt(src, Math.floor(rnd(i, 2) * 997)),
          left: lerp(-2, 102, rnd(i, 3)),
          size: lerp(13, 42, rnd(i, 4)),
          opacity: lerp(0.05, 0.15, rnd(i, 5)),
          blur: lerp(1, 3.2, rnd(i, 6)),
          rise: lerp(24, 52, rnd(i, 7)),
          delay: -lerp(0, 50, rnd(i, 8)),
          swayDur: lerp(4, 9, rnd(i, 9)),
          sway: lerp(7, 26, rnd(i, 10)),
          tilt: lerp(6, 26, rnd(i, 11)) * (rnd(i, 12) < 0.5 ? -1 : 1),
          weight: rnd(i, 13) < 0.5 ? 900 : 700,
          lg: i >= 16, /* fewer particles on small screens */
        };
      }),
    [bank],
  );

  const dots = useMemo(
    () =>
      Array.from({ length: DOT_COUNT }, (_, i) => {
        const j = i + 60;
        return {
          left: lerp(0, 100, rnd(j, 3)),
          size: lerp(2, 5, rnd(j, 4)),
          opacity: lerp(0.08, 0.22, rnd(j, 5)),
          blur: lerp(0.5, 1.5, rnd(j, 6)),
          rise: lerp(30, 60, rnd(j, 7)),
          delay: -lerp(0, 60, rnd(j, 8)),
          dx: lerp(-40, 40, rnd(j, 9)),
          lg: i >= 9,
        };
      }),
    [],
  );

  /* a few huge, deeply blurred glyphs for depth */
  const ghosts = useMemo(
    () =>
      Array.from({ length: GHOST_COUNT }, (_, i) => {
        const j = i + 90;
        const src = rnd(j, 1) < 0.5 ? bank.numerals : bank.glyphs;
        return {
          ch: charAt(src, Math.floor(rnd(j, 2) * 997)),
          left: lerp(5, 90, rnd(j, 3)),
          size: lerp(90, 170, rnd(j, 4)),
          opacity: lerp(0.025, 0.05, rnd(j, 5)),
          rise: lerp(50, 80, rnd(j, 7)),
          delay: -lerp(0, 80, rnd(j, 8)),
          tilt: lerp(8, 20, rnd(j, 11)) * (rnd(j, 12) < 0.5 ? -1 : 1),
        };
      }),
    [bank],
  );

  return (
    <div aria-hidden className="ambient-layer pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {ghosts.map((g, i) => (
        <span
          key={`g${i}`}
          className="ambient-rise absolute bottom-[-20vh] font-black text-fg select-none"
          style={{
            left: `${g.left}%`,
            fontSize: `${g.size}px`,
            opacity: g.opacity,
            filter: `blur(5px)`,
            animationDuration: `${g.rise}s`,
            animationDelay: `${g.delay}s`,
          }}
        >
          <span
            className="ambient-sway inline-block"
            style={
              {
                "--sway": "0px",
                "--tilt": `${g.tilt}deg`,
                animationDuration: "14s",
              } as React.CSSProperties
            }
          >
            {g.ch}
          </span>
        </span>
      ))}

      {glyphs.map((p, i) => (
        <span
          key={`c${i}`}
          className={`ambient-rise absolute bottom-[-20vh] font-black text-fg select-none${p.lg ? " ambient-lg" : ""}`}
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            opacity: p.opacity,
            filter: `blur(${p.blur}px)`,
            fontWeight: p.weight,
            animationDuration: `${p.rise}s`,
            animationDelay: `${p.delay}s`,
          }}
        >
          <span
            className="ambient-sway inline-block"
            style={
              {
                "--sway": `${p.sway}px`,
                "--tilt": `${p.tilt}deg`,
                animationDuration: `${p.swayDur}s`,
              } as React.CSSProperties
            }
          >
            {p.ch}
          </span>
        </span>
      ))}

      {dots.map((d, i) => (
        <span
          key={`d${i}`}
          className={`ambient-drift absolute bottom-[-4vh] rounded-full bg-fg${d.lg ? " ambient-lg" : ""}`}
          style={
            {
              left: `${d.left}%`,
              width: `${d.size}px`,
              height: `${d.size}px`,
              "--o": d.opacity,
              "--dx": `${d.dx}px`,
              filter: `blur(${d.blur}px)`,
              animationDuration: `${d.rise}s`,
              animationDelay: `${d.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
