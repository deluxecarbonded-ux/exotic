"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n, useTheme, LogoMark } from "./providers";
import {
  Home,
  Gamepad2,
  Swords,
  Settings,
  Moon,
  Sun,
  Store,
  UserRound,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound";
import { sp, mp } from "@/lib/supabase";
import { useToast } from "./providers";
import { LanguageMenu } from "./language-menu";
import { MobileTabs } from "./mobile-tabs";

export function Navbar({
  spSignedIn,
  mpSignedIn,
  sparks,
  novas,
}: {
  spSignedIn?: boolean;
  mpSignedIn?: boolean;
  sparks?: number | null;
  novas?: number | null;
}) {
  const { t, num } = useI18n();
  const { theme, setTheme } = useTheme();
  const path = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const links = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/singleplayer", label: t("nav.solo"), icon: Gamepad2 },
    { href: "/multiplayer", label: t("nav.multi"), icon: Swords },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  const inSp = path.startsWith("/singleplayer");
  const inMp = path.startsWith("/multiplayer");

  const subLinks = inSp
    ? [
        { href: "/singleplayer", label: t("nav.solo") },
        { href: "/singleplayer/shop", label: t("nav.shop") },
        { href: "/singleplayer/profile", label: t("nav.profile") },
      ]
    : inMp
    ? [
        { href: "/multiplayer", label: t("nav.multi") },
        { href: "/multiplayer/shop", label: t("nav.shop") },
        { href: "/multiplayer/profile", label: t("nav.profile") },
      ]
    : [];

  const currency = inSp
    ? { label: t("sp.sparks"), value: sparks, icon: "✦" }
    : inMp
    ? { label: t("mp.novas"), value: novas, icon: "◆" }
    : null;

  return (
    <>
      <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 text-fg press" onClick={() => sfx.pop()}>
            <LogoMark size={26} />
            <span className="display text-lg">{t("app.brand")}</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const active =
                l.href === "/" ? path === "/" : path.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => sfx.select()}
                  className={cn(
                    "press flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-fg",
                    active && "bg-soft"
                  )}
                >
                  <l.icon size={16} />
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            {currency && currency.value != null && (
              <span className="hidden items-center gap-1.5 rounded-full bg-soft px-4 py-2 text-sm font-black tabular text-fg sm:inline-flex">
                <span aria-hidden>{currency.icon}</span>
                {num(currency.value)}
                <span className="text-[11px] font-bold uppercase tracking-wider text-mute">
                  {currency.label}
                </span>
              </span>
            )}
            {inSp && spSignedIn && (
              <button
                className="press hidden items-center gap-1.5 rounded-full bg-soft px-3.5 py-2 text-xs font-bold text-mute md:inline-flex"
                onClick={async () => {
                  /* navigate BEFORE clearing the session — the mode page's
                     guard would otherwise race us to /auth/sp */
                  router.push("/");
                  await sp().auth.signOut();
                  sfx.leave();
                  toast(t("common.signedOut"), "info");
                }}
              >
                <LogOut size={14} className="rtl:-scale-x-100" /> {t("common.signOut")}
              </button>
            )}
            {inMp && mpSignedIn && (
              <button
                className="press hidden items-center gap-1.5 rounded-full bg-soft px-3.5 py-2 text-xs font-bold text-mute md:inline-flex"
                onClick={async () => {
                  /* same race guard as the sp sign-out */
                  router.push("/");
                  await mp().auth.signOut();
                  sfx.leave();
                  toast(t("common.signedOut"), "info");
                }}
              >
                <LogOut size={14} className="rtl:-scale-x-100" /> {t("common.signOut")}
              </button>
            )}
            <LanguageMenu />
            <button
              aria-label={t("a11y.theme")}
              onClick={() => {
                sfx.pop();
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                toast(next === "light" ? t("settings.light") : t("settings.dark"), "info");
              }}
              className="press grid h-10 w-10 place-items-center rounded-full bg-soft text-fg"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>

        {subLinks.length > 0 && (
          <div className="mx-auto hidden max-w-6xl items-center gap-1 px-4 pb-3 md:flex">
            {subLinks.map((s) => {
              const active = path === s.href;
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className={cn(
                    "press rounded-full px-4 py-1.5 text-xs font-bold text-fg",
                    active ? "bg-fg text-bg" : "bg-soft"
                  )}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      <MobileTabs />
    </>
  );
}
