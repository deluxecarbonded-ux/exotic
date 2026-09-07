"use client";

import { useMemo } from "react";

/* Monochrome confetti burst — pure CSS, no assets. */
export function Confetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.7,
        dur: 2.1 + Math.random() * 1.6,
        size: 5 + Math.random() * 7,
        round: Math.random() > 0.5,
        op: 0.35 + Math.random() * 0.65,
        key: i,
      })),
    [count]
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {pieces.map((p) => (
        <i
          key={p.key}
          className="absolute top-0 block animate-fall bg-fg"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.round ? 1 : 1.7),
            borderRadius: p.round ? "50%" : "2px",
            opacity: p.op,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}
