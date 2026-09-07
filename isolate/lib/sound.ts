"use client";

import { safeGet, safeSet } from "./safe-store";

/* ─────────────────────────────────────────────────────────────
   Sound engine — real audio files (Kenney.nl packs, CC0) served
   from /public/sfx. Same public API as the old oscillator build:
   sfx.click(), sfx.type(), sfx.correct(), … plus a full event
   vocabulary. Falls back to nothing silently if a file can't
   load (game must never break over audio).
   ───────────────────────────────────────────────────────────── */

type SfxName =
  | "click" | "click2" | "back" | "open" | "close" | "select"
  | "toggle" | "switch" | "tick" | "tick2" | "error" | "error2"
  | "glitch" | "confirm" | "confirm2" | "question" | "glass"
  | "glass2" | "scratch" | "scroll" | "pluck" | "bong" | "drop"
  | "powerup" | "powerup2" | "phaserdown" | "phaserup" | "pep"
  | "lowtone" | "coins" | "vault" | "latch" | "metal" | "creak"
  | "chip" | "chips" | "shuffle" | "win" | "lose" | "key1"
  | "key2" | "key3";

/* volume per event — stings loud, ticks soft */
const VOL: Partial<Record<SfxName, number>> = {
  tick: 0.35, tick2: 0.35, key1: 0.4, key2: 0.4, key3: 0.4,
  click: 0.55, click2: 0.5, back: 0.5, pluck: 0.55, drop: 0.5,
  glitch: 0.5, scroll: 0.4, glass: 0.55, glass2: 0.6, chip: 0.6,
  win: 0.8, lose: 0.7, powerup: 0.65, powerup2: 0.65,
  phaserup: 0.5, phaserdown: 0.5, lowtone: 0.55, bong: 0.6,
  vault: 0.65, coins: 0.65, chips: 0.65,
};

let enabled: boolean | null = null;

export function soundEnabled() {
  if (typeof window === "undefined") return true;
  if (enabled === null) {
    enabled = safeGet("exotic-sound") !== "off";
  }
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  safeSet("exotic-sound", on ? "on" : "off");
}

/* preload pool — one Audio element per file, cloned on play so
   overlapping hits never cut each other off */
const pool = new Map<string, HTMLAudioElement>();

function base(n: SfxName): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let a = pool.get(n);
  if (!a) {
    a = new Audio(`/sfx/${n}.ogg`);
    a.preload = "auto";
    pool.set(n, a);
  }
  return a;
}

/* warm the common files after first user gesture so first plays
   are instant */
let warmed = false;
export function warmSfx() {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  (["click", "key1", "key2", "key3", "confirm", "error2", "back",
    "select", "tick", "pluck", "question"] as SfxName[]).forEach(base);
}

let keyRot = 0;

function play(n: SfxName) {
  if (!soundEnabled()) return;
  const b = base(n);
  if (!b) return;
  try {
    const a = b.cloneNode() as HTMLAudioElement;
    a.volume = VOL[n] ?? 0.6;
    a.play().catch(() => {});
  } catch {}
}

/* legacy names keep working everywhere the old engine was wired;
   new names give every interaction its own voice */
export const sfx = {
  /* generic */
  click: () => play("click"),
  click2: () => play("click2"),
  pop: () => play("pluck"),
  select: () => play("select"),
  back: () => play("back"),
  open: () => play("open"),
  close: () => play("close"),
  toggle: () => play("toggle"),
  switch: () => play("switch"),
  scroll: () => play("scroll"),
  tick: () => play("tick"),
  tick2: () => play("tick2"),
  /* feedback */
  correct: () => play("confirm"),
  confirm: () => play("confirm"),
  confirm2: () => play("confirm2"),
  wrong: () => play("error2"),
  error: () => play("error"),
  glitch: () => play("glitch"),
  question: () => play("question"),
  /* typing */
  type: () => {
    play((["key1", "key2", "key3"] as SfxName[])[keyRot++ % 3]);
  },
  key: () => {
    play((["key1", "key2", "key3"] as SfxName[])[keyRot++ % 3]);
  },
  keyBack: () => play("back"),
  enter: () => play("confirm2"),
  /* power-ups + vault */
  reveal: () => play("glass"),
  deepReveal: () => play("glass2"),
  freeze: () => play("lowtone"),
  skip: () => play("scratch"),
  oracle: () => play("bong"),
  vault: () => play("vault"),
  latch: () => play("latch"),
  metal: () => play("metal"),
  shuffle: () => play("shuffle"),
  /* economy */
  coin: () => play("chip"),
  chip: () => play("chip"),
  coins: () => play("coins"),
  buy: () => play("chips"),
  /* results */
  win: () => play("win"),
  lose: () => play("lose"),
  levelup: () => play("powerup"),
  powerup: () => play("powerup"),
  powerup2: () => play("powerup2"),
  phaserup: () => play("phaserup"),
  phaserdown: () => play("phaserdown"),
  timeout: () => play("phaserdown"),
  /* social */
  chat: () => play("pluck"),
  chatIn: () => play("drop"),
  emote: () => play("pep"),
  join: () => play("phaserup"),
  leave: () => play("creak"),
};
