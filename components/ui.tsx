"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";
import { sfx } from "@/lib/sound";
import { useI18n } from "./providers";

/* ── Button ── */
export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  onClick,
  disabled,
  type = "button",
  silent,
}: {
  children: React.ReactNode;
  variant?: "primary" | "soft" | "ghost";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  type?: "button" | "submit";
  silent?: boolean;
}) {
  const sizes = {
    sm: "px-4 py-2 text-sm rounded-xl",
    md: "px-6 py-3 text-sm rounded-2xl",
    lg: "px-8 py-4 text-base rounded-2xl",
    xl: "px-10 py-5 text-lg rounded-3xl",
  };
  const variants = {
    primary: "bg-btn text-btnfg shadow-soft",
    soft: "bg-soft text-fg",
    ghost: "bg-transparent text-fg",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={(e) => {
        if (!silent) sfx.click();
        onClick?.(e);
      }}
      className={cn(
        "press inline-flex items-center justify-center gap-2 font-bold tracking-tight disabled:opacity-40",
        sizes[size],
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

/* ── Card ── */
export function Card({
  children,
  className,
  onClick,
  hover,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-3xl bg-soft p-6 shadow-soft",
        hover && "press cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ── Input ── */
export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  className,
  autoFocus,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  className?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      className={cn(
        "w-full rounded-2xl bg-soft px-5 py-3.5 text-fg placeholder:text-mute transition-colors focus:bg-soft2",
        className
      )}
    />
  );
}

/* ── Badge / Pill ── */
export function Pill({
  children,
  className,
  solid,
}: {
  children: React.ReactNode;
  className?: string;
  solid?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
        solid ? "bg-fg text-bg" : "bg-soft2 text-fg",
        className
      )}
    >
      {children}
    </span>
  );
}

/* ── Modal ── */
export function Modal({
  open,
  onClose,
  children,
  className,
  locked,
}: {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  locked?: boolean;
}) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div
      className="modal-root fixed inset-0 z-[80] grid place-items-center p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,.72)" }}
      onClick={() => !locked && onClose?.()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "modal-panel relative w-full max-w-md animate-pop rounded-[2rem] bg-bg p-8 shadow-pop",
          className
        )}
      >
        {!locked && onClose && (
          <button
            onClick={() => {
              sfx.pop();
              onClose();
            }}
            className="press absolute end-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-soft text-fg"
            aria-label={t("a11y.close")}
          >
            <X size={17} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/* ── Spinner ── */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={22} className={cn("animate-spin text-fg", className)} />;
}

export function FullLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-4 animate-pulse-soft">
        <Spinner className="h-8 w-8" />
      </div>
    </div>
  );
}

/* ── Stat tile ── */
export function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-soft p-5 shadow-soft">
      <div className="flex items-center gap-1.5 text-mute">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-black tabular display">{value}</div>
    </div>
  );
}

/* ── Section heading ── */
export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h2 className="display text-xl md:text-2xl">{children}</h2>
      {right}
    </div>
  );
}

/* ── Empty state ── */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-soft px-6 py-10 text-center text-sm font-semibold text-mute">
      {children}
    </div>
  );
}
