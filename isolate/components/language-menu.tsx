"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "./providers";
import { Languages, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound";

/* Animated language selector (dropdown menu pattern).
   Available app-wide from the navbar and the landing header.
   Solid surfaces, no borders — theme-safe on pure #000/#fff. */

export function LanguageMenu() {
  const { t, num, locale, setLocale, locales } = useI18n();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const trigRef = useRef<HTMLButtonElement>(null);

  const current = locales.find((l) => l.code === locale);

  /* close on outside click / Escape */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [open]);

  /* keep the highlighted row in view while arrowing */
  useEffect(() => {
    if (!open || sel < 0) return;
    rootRef.current
      ?.querySelectorAll<HTMLButtonElement>("[role='option']")
      ?.[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel, open]);

  const openMenu = () => {
    sfx.pop();
    setOpen(true);
    setSel(locales.findIndex((l) => l.code === locale));
  };

  const pick = (code: string) => {
    sfx.select();
    setLocale(code);
    setOpen(false);
    trigRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (s + 1) % locales.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (s <= 0 ? locales.length - 1 : s - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSel(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSel(locales.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (sel >= 0) pick(locales[sel].code);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={trigRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("settings.language")}
        onClick={() => {
            if (open) {
              sfx.close();
              setOpen(false);
            } else {
              sfx.scroll();
              openMenu();
            }
          }}
        className="press flex h-10 items-center gap-1.5 rounded-full bg-soft px-3 text-fg"
      >
        <Languages
          size={17}
          className={cn(open && "lang-globe-open")}
          aria-hidden
        />
        <span className="hidden min-[420px]:inline text-xs font-bold">
          {current?.name}
        </span>
        <ChevronDown
          size={13}
          aria-hidden
          className={cn("lang-chevron", open && "lang-chevron-open")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("settings.language")}
          className="lang-menu absolute end-0 top-full z-[70] mt-2 w-64 origin-top-right rounded-3xl bg-bg p-2 shadow-pop"
        >
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-black uppercase tracking-widest text-mute">
            {t("settings.language")} · {num(16)}
          </div>
          <div className="max-h-[min(62vh,27rem)] overflow-y-auto no-scrollbar">
            {locales.map((l, i) => {
              const active = l.code === locale;
              return (
                <button
                  key={l.code}
                  role="option"
                  aria-selected={active}
                  tabIndex={-1}
                  onClick={() => pick(l.code)}
                  style={{ animationDelay: `${Math.min(i * 16, 220)}ms` }}
                  className={cn(
                    "lang-item press flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-start text-sm font-bold",
                    active ? "bg-fg text-bg" : "text-fg hover:bg-soft2",
                    sel === i && !active && "bg-soft2"
                  )}
                >
                  <span>{l.name}</span>
                  {active && (
                    <Check size={15} strokeWidth={3} className="icon-pop" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
