"use client";

import {
  Sparkles,
  Squirrel,
  Ghost,
  Rocket,
  Crown,
  Orbit,
  Cat,
  Bot,
  Skull,
  Wand2,
  Gem,
  Zap,
  Flame,
  Star,
  Shield,
  Eye,
  KeyRound,
  Snowflake,
  BrainCircuit,
  Timer,
  Gift,
  Trophy,
  Smile,
  Medal,
  Heart,
  TrendingUp,
  MessageCircle,
  Package,
} from "lucide-react";

/* Single source of truth for every avatar / item icon in the game. */
export const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  sparkles: Sparkles,
  squirrel: Squirrel,
  ghost: Ghost,
  rocket: Rocket,
  crown: Crown,
  comet: Orbit,
  cat: Cat,
  dragon: Flame,
  bot: Bot,
  skull: Skull,
  wand: Wand2,
  gem: Gem,
  zap: Zap,
  flame: Flame,
  star: Star,
  shield: Shield,
  eye: Eye,
  key: KeyRound,
  snowflake: Snowflake,
  brain: BrainCircuit,
  timer: Timer,
  gift: Gift,
  trophy: Trophy,
  smile: Smile,
  medal: Medal,
  heart: Heart,
  trend: TrendingUp,
  chat: MessageCircle,
  package: Package,
};

export function DynIcon({
  name,
  size = 20,
  className,
}: {
  name?: string;
  size?: number | string;
  className?: string;
}) {
  const Cmp = ICONS[name || "sparkles"] || Sparkles;
  return <Cmp size={size} className={className} />;
}

export function Avatar({
  icon,
  size = 44,
  frame,
}: {
  icon?: string;
  size?: number;
  frame?: string;
}) {
  const pad = Math.round(size * 0.26);
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full bg-soft2 text-fg"
      style={{
        width: size,
        height: size,
        boxShadow:
          frame === "halo"
            ? "0 0 0 3px var(--bg), 0 0 0 6px var(--fg)"
            : frame === "star"
            ? "0 0 0 3px var(--bg), 0 0 0 5px var(--fg), 0 0 22px rgba(128,128,128,.55)"
            : frame === "bolt"
            ? "0 4px 0 2px var(--fg)"
            : undefined,
      }}
    >
      <DynIcon name={icon} size={size - pad} />
    </div>
  );
}
