"use client";

import { useState } from "react";
import { useI18n, useTheme } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { Card, SectionTitle } from "@/components/ui";
import { Moon, Sun, Volume2, VolumeX, Languages, Info, Check, Bot, Swords, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { sfx, soundEnabled, setSoundEnabled } from "@/lib/sound";

export default function SettingsPage() {
  const { t, locale, setLocale, locales, aiQuestions, setAiQuestions } = useI18n();
  const { theme, setTheme } = useTheme();
  const [sound, setSound] = useState(soundEnabled());

  return (
    <div className="min-h-screen bg-bg pb-28 text-fg md:pb-12">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        <h1 className="display mb-8 animate-fade-up text-3xl md:text-4xl">
          {t("settings.title")}
        </h1>

        <div className="flex flex-col gap-6">
          <Card className="animate-fade-up">
            <SectionTitle>{t("settings.theme")}</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  sfx.select();
                  setTheme("light");
                }}
                className={cn(
                  "press flex items-center justify-center gap-2 rounded-2xl px-6 py-5 font-bold",
                  theme === "light" ? "bg-btn text-btnfg" : "bg-soft2 text-fg"
                )}
              >
                <Sun size={17} /> {t("settings.light")}
              </button>
              <button
                onClick={() => {
                  sfx.select();
                  setTheme("dark");
                }}
                className={cn(
                  "press flex items-center justify-center gap-2 rounded-2xl px-6 py-5 font-bold",
                  theme === "dark" ? "bg-btn text-btnfg" : "bg-soft2 text-fg"
                )}
              >
                <Moon size={17} /> {t("settings.dark")}
              </button>
            </div>
          </Card>

          <Card className="animate-fade-up" >
            <SectionTitle>{t("settings.sound")}</SectionTitle>
            <button
              onClick={() => {
                const next = !sound;
                setSound(next);
                setSoundEnabled(next);
                if (next) sfx.toggle();
              }}
              className={cn(
                "press flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-5 font-bold",
                sound ? "bg-btn text-btnfg" : "bg-soft2 text-fg"
              )}
            >
              {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
              {sound ? t("common.on") : t("common.off")}
            </button>
          </Card>

          <Card className="animate-fade-up">
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Bot size={18} /> {t("settings.ai")}
              </span>
            </SectionTitle>
            <button
              onClick={() => {
                sfx.toggle();
                setAiQuestions(!aiQuestions);
              }}
              className={cn(
                "press flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-5 font-bold",
                aiQuestions ? "bg-btn text-btnfg" : "bg-soft2 text-fg"
              )}
            >
              <Bot size={17} />
              {aiQuestions ? t("common.on") : t("common.off")}
            </button>
            <p className="mt-2 text-xs font-semibold text-mute">{t("settings.aiSub")}</p>

            <div className="mt-3 flex items-center justify-between rounded-2xl bg-soft2 px-4 py-3.5">
              <span className="flex items-center gap-2 text-sm font-bold text-fg">
                <Swords size={15} /> {t("nav.multi")}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-mute">
                  {t("settings.alwaysOn")}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-fg px-2.5 py-1.5 text-bg">
                  <Check size={12} strokeWidth={3} aria-hidden />
                  <Lock size={11} aria-hidden />
                </span>
              </span>
            </div>
          </Card>

          <Card className="animate-fade-up">
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Languages size={18} /> {t("settings.language")}
              </span>
            </SectionTitle>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {locales.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    sfx.select();
                    setLocale(l.code);
                  }}
                  className={cn(
                    "press flex items-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-bold",
                    locale === l.code ? "bg-btn text-btnfg" : "bg-soft2 text-fg"
                  )}
                >
                  <span className="flex-1 text-start">{l.name}</span>
                  {locale === l.code && (
                    <Check size={15} strokeWidth={3} className="icon-pop" aria-hidden />
                  )}
                </button>
              ))}
            </div>
          </Card>

          <Card className="animate-fade-up">
            <SectionTitle>
              <span className="flex items-center gap-2">
                <Info size={18} /> {t("settings.about")}
              </span>
            </SectionTitle>
            <p className="text-sm font-medium leading-relaxed text-mute">
              {t("settings.aboutText")}
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
