"use client";

import Link from "next/link";
import { sfx } from "@/lib/sound";
import { usePathname } from "next/navigation";
import { useI18n } from "./providers";
import { Home, Gamepad2, Swords, Settings, Store, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/* Mobile bottom tab bar — shared by the Navbar pages and the landing
   page. Hidden on desktop and during immersive play (game / duel room). */
export function MobileTabs() {
  const path = usePathname();
  const { t } = useI18n();

  const links = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/singleplayer", label: t("nav.solo"), icon: Gamepad2 },
    { href: "/multiplayer", label: t("nav.multi"), icon: Swords },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];
  const inSp = path.startsWith("/singleplayer");
  const inMp = path.startsWith("/multiplayer");

  if (path.startsWith("/singleplayer/play") || path.startsWith("/multiplayer/room"))
    return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 bg-bg/90 pb-[env(safe-area-inset-bottom)] shadow-soft backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {links.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => sfx.select()}
              className={cn(
                "press flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 text-[10px] font-bold",
                active ? "bg-fg text-bg" : "text-fg"
              )}
            >
              <l.icon size={19} className={active ? "icon-pop" : ""} />
              {l.label}
            </Link>
          );
        })}
        {(inSp || inMp) && (
          <Link
            href={`${inSp ? "/singleplayer" : "/multiplayer"}/shop`}
            className={cn(
              "press flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 text-[10px] font-bold text-fg",
              path.endsWith("/shop") && "bg-soft"
            )}
          >
            <Store size={19} />
            {t("nav.shop")}
          </Link>
        )}
        {(inSp || inMp) && (
          <Link
            href={`${inSp ? "/singleplayer" : "/multiplayer"}/profile`}
            className={cn(
              "press flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 text-[10px] font-bold text-fg",
              path.endsWith("/profile") && "bg-soft"
            )}
          >
            <UserRound size={19} />
            {t("nav.profile")}
          </Link>
        )}
      </div>
    </nav>
  );
}
