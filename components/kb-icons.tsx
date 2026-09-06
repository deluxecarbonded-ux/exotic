"use client";

import { useState } from "react";
import { Eraser, CornerDownLeft } from "lucide-react";

/* Animated Erase & Submit icons for the on-screen keyboards.
   Idle: continuous subtle motion (scrub / nudge).
   Click: a one-shot burst animation restarts via remount. */

export function EraseIcon({ size = 17 }: { size?: number }) {
  const [burst, setBurst] = useState(0);
  return (
    <span
      key={burst}
      className="kb-erase-burst relative inline-grid place-items-center"
      onClickCapture={() => setBurst((b) => b + 1)}
    >
      <Eraser size={size} strokeWidth={2.4} className="kb-erase" aria-hidden />
      {/* crumbs that fly off while erasing */}
      <span className="kb-crumb kb-crumb-a" aria-hidden />
      <span className="kb-crumb kb-crumb-b" aria-hidden />
      <span className="kb-crumb kb-crumb-c" aria-hidden />
    </span>
  );
}

export function SubmitIcon({ size = 16 }: { size?: number }) {
  const [burst, setBurst] = useState(0);
  return (
    <span
      key={burst}
      className="kb-submit-burst relative inline-grid place-items-center"
      onClickCapture={() => setBurst((b) => b + 1)}
    >
      <span className="kb-submit-ring" aria-hidden />
      <CornerDownLeft
        size={size}
        strokeWidth={2.6}
        className="kb-submit"
        aria-hidden
      />
    </span>
  );
}
