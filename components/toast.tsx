"use client";

import React from "react";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound";

export type ToastKind = "success" | "error" | "info" | "warning" | "achievement";

export type ToastData = {
  id: number;
  msg: string;
  kind: ToastKind;
};

/* supported input kinds — includes legacy "ok"/"err" aliases */
export type ToastKindInput = ToastKind | "ok" | "err";

/* ── per-kind visual config ───────────────────────────────────
   Chips stay on the app's pure theme tokens (monochrome surfaces).
   Each kind is told apart by its icon + a tiny status dot — the
   single chroma allowed, so "kind" reads at a glance in dark AND
   light. Achievement gets a soft gold ring (the one celebration
   exception) plus sparking accents. */
const DOT: Record<ToastKind, string> = {
  success: "bg-emerald-400",
  error: "bg-red-500",
  info: "bg-sky-400",
  warning: "bg-amber-400",
  achievement: "bg-yellow-300",
};

const KIND_CHIP: Record<ToastKind, string> = {
  success: "bg-fg text-bg",
  error: "bg-fg text-bg",
  info: "bg-soft text-fg",
  warning: "bg-fg text-bg",
  achievement: "bg-fg text-bg ring-yellow-300/60",
};

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 size={17} strokeWidth={2.6} />,
  error: <XCircle size={17} strokeWidth={2.6} />,
  info: <Info size={17} strokeWidth={2.6} />,
  warning: <AlertTriangle size={17} strokeWidth={2.6} />,
  achievement: <Sparkles size={17} strokeWidth={2.6} />,
};

/* legacy kinds ("ok" / "err") still work everywhere */
const LEGACY_KIND: Record<string, ToastKind> = { ok: "success", err: "error" };
export function normalizeKind(kind: string | undefined): ToastKind {
  if (!kind) return "success";
  const k = LEGACY_KIND[kind];
  if (k) return k;
  return (["success", "error", "info", "warning", "achievement"] as const).includes(
    kind as ToastKind
  )
    ? (kind as ToastKind)
    : "info";
}

/* ── motion variants — one voice per kind ───────────────────── */

const VARIANTS: Record<ToastKind, Variants> = {
  /* springs up, settles soft */
  success: {
    initial: { opacity: 0, y: 28, scale: 0.9 },
    enter: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: "spring", stiffness: 380, damping: 24, mass: 0.9 },
    },
    exit: {
      opacity: 0,
      y: 16,
      scale: 0.95,
      transition: { duration: 0.18, ease: "easeIn" },
    },
  },
  /* slides in with a warning tilt, then settles */
  error: {
    initial: { opacity: 0, y: 30, x: 26, rotate: -2 },
    enter: {
      opacity: 1,
      y: 0,
      x: 0,
      rotate: 0,
      transition: {
        type: "spring",
        stiffness: 320,
        damping: 17,
        mass: 0.85,
        rotate: { type: "spring", stiffness: 260, damping: 14 },
      },
    },
    exit: {
      opacity: 0,
      y: 12,
      x: -18,
      rotate: 1,
      transition: { duration: 0.18, ease: "easeIn" },
    },
  },
  /* gentle fade-rise, never loud */
  info: {
    initial: { opacity: 0, y: 20, scale: 0.97 },
    enter: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: "spring", stiffness: 300, damping: 26, mass: 0.9 },
    },
    exit: {
      opacity: 0,
      y: 12,
      scale: 0.97,
      transition: { duration: 0.18, ease: "easeIn" },
    },
  },
  /* quick settle with a wobble — heads-up, not panic */
  warning: {
    initial: { opacity: 0, y: 26, scale: 0.92 },
    enter: {
      opacity: 1,
      y: 0,
      scale: [0.92, 1.04, 0.98, 1],
      transition: {
        type: "spring",
        stiffness: 420,
        damping: 20,
        mass: 0.9,
        scale: { duration: 0.42, ease: "easeOut" },
      },
    },
    exit: {
      opacity: 0,
      y: 14,
      scale: 0.96,
      transition: { duration: 0.18, ease: "easeIn" },
    },
  },
  /* big celebratory bounce — the drop-in moment */
  achievement: {
    initial: { opacity: 0, y: 46, scale: 0.6, rotate: -2 },
    enter: {
      opacity: 1,
      y: 0,
      scale: [0.6, 1.1, 0.94, 1.04, 1],
      rotate: [-2, 0, 1.5, -0.5, 0],
      transition: {
        duration: 0.6,
        ease: "easeOut",
        scale: { times: [0, 0.3, 0.55, 0.78, 1] },
      },
    },
    exit: {
      opacity: 0,
      y: -18,
      scale: 0.9,
      transition: { duration: 0.2, ease: "easeIn" },
    },
  },
};

/* ── sparkle accents for achievement toasts ─────────────────── */

function AchievementAccents() {
  return (
    <div className="pointer-events-none absolute -top-1.5 start-3 end-3 flex h-0 justify-between opacity-80">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-yellow-300"
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.4, 0],
            y: [0, -10],
          }}
          transition={{
            duration: 0.8,
            delay: 0.15 + i * 0.09,
            repeat: Infinity,
            repeatDelay: 1.4,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

/* ── toast item ─────────────────────────────────────────────── */

export function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const dot = DOT[toast.kind];
  const iconAnim =
    toast.kind === "achievement"
      ? {
          opacity: 1,
          scale: [0.3, 1.25, 1],
          rotate: [0, 12, 0],
          transition: {
            duration: 0.55,
            ease: "easeOut" as const,
            delay: 0.12,
          },
        }
      : { opacity: 1, scale: [0.3, 1.15, 1], transition: { duration: 0.35 } };

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex items-center gap-3 rounded-full py-2.5 pe-2.5 ps-4 shadow-pop",
        reduceMotion ? "ring-1 ring-fg/10" : "",
        toast.kind === "achievement" ? "ring-1 ring-yellow-300/50" : "",
        KIND_CHIP[toast.kind]
      )}
    >
      {toast.kind === "achievement" && <AchievementAccents />}

      {/* status dot — the only chroma; kind reads at a glance */}
      <span
        className={cn(
          "absolute -start-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full",
          dot
        )}
        style={{ boxShadow: "0 0 0 2px var(--bg)" }}
        aria-hidden
      />

      <motion.span
        initial={{ opacity: 0, scale: 0.3 }}
        animate={reduceMotion ? { opacity: 1, scale: 1 } : iconAnim}
        className="grid shrink-0 place-items-center"
      >
        {KIND_ICON[toast.kind]}
      </motion.span>

      <span className="max-w-[260px] min-w-0 text-sm font-bold leading-snug">
        {toast.msg}
      </span>

      <button
        onClick={() => {
          sfx.close();
          onDismiss(toast.id);
        }}
        aria-label="Dismiss notification"
        className="press grid h-7 w-7 shrink-0 place-items-center rounded-full opacity-60 hover:opacity-100"
      >
        <X size={14} strokeWidth={2.6} />
      </button>
    </div>
  );
}

/* ── stack (animated container) ─────────────────────────────── */

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[95] flex flex-col items-center gap-2 px-4 md:bottom-8"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial="initial"
            animate="enter"
            exit="exit"
            variants={VARIANTS[t.kind]}
            className="pointer-events-auto max-w-full"
          >
            <ToastItem toast={t} onDismiss={onDismiss} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}