"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n, useTheme, LogoMark, localeDigits } from "@/components/providers";
import { LanguageMenu } from "@/components/language-menu";
import { MobileTabs } from "@/components/mobile-tabs";
import { Button } from "@/components/ui";
import {
  Gamepad2,
  Swords,
  BrainCircuit,
  Radio,
  Coins,
  Languages,
  Moon,
  Sun,
  KeyRound,
  Lightbulb,
  Hash,
  Timer,
} from "lucide-react";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/utils";

function DigitTiles() {
  const { locale } = useI18n();
  const [digits, setDigits] = useState(["7", "2", "9", "4"]);
  useEffect(() => {
    const id = setInterval(() => {
      setDigits((d) =>
        d.map((x, i) =>
          Math.random() > 0.55 ? String(Math.floor(Math.random() * 10)) : x
        )
      );
    }, 420);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex justify-center gap-2 min-[400px]:gap-3 md:gap-4">
      {digits.map((d, i) => (
        <div
          key={i}
          className="grid h-16 w-16 place-items-center rounded-[1.3rem] bg-soft shadow-pop min-[400px]:h-20 min-[400px]:w-20 min-[400px]:rounded-[1.6rem] md:h-28 md:w-28"
          style={{ animation: `float 4.5s ease-in-out ${i * 0.35}s infinite` }}
        >
          <span key={d + i} className="display animate-flip text-3xl min-[400px]:text-4xl md:text-6xl">
            {localeDigits(d, locale)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { t, num, locale } = useI18n();
  const { theme, setTheme } = useTheme();

  const features = [
    { icon: BrainCircuit, title: t("landing.f1t"), sub: t("landing.f1s") },
    { icon: Radio, title: t("landing.f2t"), sub: t("landing.f2s") },
    { icon: Coins, title: t("landing.f3t"), sub: t("landing.f3s") },
    { icon: Languages, title: t("landing.f4t"), sub: t("landing.f4s") },
  ];

  const steps = [
    { icon: Hash, text: t("landing.s1") },
    { icon: Lightbulb, text: t("landing.s2") },
    { icon: KeyRound, text: t("landing.s3") },
    { icon: Timer, text: t("landing.s4") },
  ];

  return (
    <main className="min-h-screen bg-bg text-fg">
      {/* top bar */}
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="display text-lg">{t("app.brand")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="press rounded-full bg-soft px-4 py-2 text-xs font-bold text-fg"
          >
            {t("nav.settings")}
          </Link>
          <LanguageMenu />
          <button
            aria-label={t("a11y.theme")}
            onClick={() => {
              sfx.pop();
              setTheme(theme === "dark" ? "light" : "dark");
            }}
            className="press grid h-9 w-9 place-items-center rounded-full bg-soft text-fg"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <MobileTabs />

      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 text-center md:px-6 md:pt-20">
        <p className="mb-6 inline-flex animate-fade-up items-center gap-2 rounded-full bg-soft px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-mute">
          ✦ {t("app.tagline")}
        </p>
        <h1 className="display animate-fade-up text-[clamp(2.6rem,11vw,3.4rem)] leading-[0.95] md:text-8xl" style={{ animationDelay: ".06s" }}>
          {t("landing.hero1")}
          <br />
          {t("landing.hero2")}
        </h1>
        <div className="my-10 animate-fade-up md:my-14" style={{ animationDelay: ".12s" }}>
          <DigitTiles />
        </div>
        <p className="mx-auto mb-10 max-w-xl animate-fade-up text-sm font-medium text-mute md:text-base" style={{ animationDelay: ".18s" }}>
          {t("landing.sub")}
        </p>

        <div className="mx-auto grid max-w-3xl animate-fade-up gap-4 md:grid-cols-2" style={{ animationDelay: ".24s" }}>
          <Link href="/auth/sp" onClick={() => sfx.vault()} className="press group rounded-[2rem] bg-btn p-8 text-start text-btnfg shadow-pop">
            <Gamepad2 size={26} className="mb-4" />
            <div className="display text-2xl">{t("landing.solo")}</div>
            <p className="mt-2 text-sm font-semibold opacity-70">{t("landing.soloSub")}</p>
            <div className="mt-5 text-xs font-black uppercase tracking-[0.25em] rtl:rotate-180">→</div>
          </Link>
          <Link href="/auth/mp" onClick={() => sfx.phaserup()} className="press rounded-[2rem] bg-soft p-8 text-start text-fg shadow-soft">
            <Swords size={26} className="mb-4" />
            <div className="display text-2xl">{t("landing.multi")}</div>
            <p className="mt-2 text-sm font-semibold text-mute">{t("landing.multiSub")}</p>
            <div className="mt-5 text-xs font-black uppercase tracking-[0.25em] rtl:rotate-180">→</div>
          </Link>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="animate-fade-up rounded-3xl bg-soft p-6 shadow-soft"
              style={{ animationDelay: `${0.06 * i}s` }}
            >
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-soft2">
                <f.icon size={19} />
              </div>
              <div className="display text-base">{f.title}</div>
              <p className="mt-1.5 text-sm font-medium text-mute">{f.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how to play */}
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <h2 className="display mb-8 text-center text-3xl md:text-4xl">{t("landing.how")}</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <div key={i} className="rounded-3xl bg-soft p-6 text-center shadow-soft">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-fg text-bg">
                <s.icon size={19} />
              </div>
              <div className="mb-2 text-xs font-black text-mute">{localeDigits(`0${i + 1}`, locale)}</div>
              <p className="text-sm font-bold">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* cta */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center md:px-6">
        <div className="rounded-[2.5rem] bg-soft px-6 py-14 shadow-soft">
          <LogoMark size={40} />
          <h2 className="display mx-auto mt-4 max-w-md text-3xl md:text-5xl">
            {t("landing.enter")}
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/auth/sp">
              <Button size="xl">{t("landing.solo")}</Button>
            </Link>
            <Link href="/auth/mp">
              <Button size="xl" variant="soft">
                {t("landing.multi")}
              </Button>
            </Link>
          </div>
        </div>
        <footer className="mt-10 flex flex-col items-center gap-2 text-xs font-semibold text-mute">
          <div className="flex items-center gap-2">
            <LogoMark size={16} />
            <span>{t("app.brand")} · {num(new Date().getFullYear())}</span>
          </div>
          <span>{t("app.tagline")}</span>
        </footer>
      </section>
    </main>
  );
}
