export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function fmtTime(totalSeconds: number, num: (n: number) => string = String) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  const digits = r.split("").map((c) => num(Number(c))).join("");
  return `${num(m)}:${digits}`;
}

export function timeAgo(iso: string, locale = "en") {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function shortNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString();
}

export function pct(wins: number, losses: number, num: (n: number) => string = String) {
  const t = wins + losses;
  if (!t) return `${num(0)}%`;
  return `${num(Math.round((wins / t) * 100))}%`;
}
