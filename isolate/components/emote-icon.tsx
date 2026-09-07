"use client";

import { Flame, Laugh, Medal, Heart, Zap, Crown, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* Emote chars live in the DB as stable identifiers (effect.char) and in
   chat rows — the UI never renders them as text. Every char maps to an
   animated Lucide icon; unknown chars fall back to twinkling sparkles. */

const MAP: Record<string, { Icon: LucideIcon; anim: string }> = {
  "🔥": { Icon: Flame, anim: "emote-flicker" },
  "😂": { Icon: Laugh, anim: "emote-laugh" },
  "🫡": { Icon: Medal, anim: "emote-salute" },
  "🤍": { Icon: Heart, anim: "emote-heartbeat" },
  "🤯": { Icon: Zap, anim: "emote-shock" },
  "👑": { Icon: Crown, anim: "emote-crown" },
};

export function EmoteIcon({
  char,
  size = 22,
  className = "",
}: {
  char?: string;
  size?: number;
  className?: string;
}) {
  const { Icon, anim } = MAP[char || ""] ?? {
    Icon: Sparkles,
    anim: "emote-twinkle",
  };
  return (
    <Icon
      size={size}
      strokeWidth={2.4}
      aria-hidden
      className={`inline-block ${anim} ${className}`}
    />
  );
}
