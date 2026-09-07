/* Translates server/RPC errors into the player's language.
   All backend RPCs raise `Exotic: <fragment>` exceptions (English,
   stored in Postgres) — this maps every known fragment to a locale
   key so players never see raw English error text. */

export type TFn = (
  key: string,
  vars?: Record<string, string | number>,
  fallback?: string
) => string;

/* exact fragment (after "Exotic: ") → i18n key */
const EXACT: Record<string, string> = {
  "sign in first": "err.signin",
  "unknown difficulty": "err.difficulty",
  "game not found": "err.gamenotfound",
  "game over": "err.gameover",
  "no attempts left": "err.noattempts",
  "a guess needs 4 digits": "err.guess4",
  "no clues left": "err.noclues",
  "no active game": "err.noactive",
  "already claimed today": "err.claimed",
  "room not found": "err.roomnotfound",
  "not a member": "err.notmember",
  "only the host can start": "err.hoststart",
  "already running": "err.running",
  "waiting for a second player": "err.waitsecond",
  "only the host creates rounds": "err.hostrounds",
  "max rounds reached": "err.maxrounds",
  "room not active": "err.roomnotactive",
  "match is over": "err.matchover",
  "no guesses left": "err.noguesses",
  "only the host can rematch": "err.hostrematch",
  "only the host": "err.host",
  "opponent is not ready": "err.notready",
  "room is full": "err.roomfull",
  "you are already in a room": "err.inroom",
  "that duel already started": "err.started",
  "not enough Sparks": "err.sparks",
  "not enough Novas": "err.novas",
  "already owned": "err.owned",
  "item not owned": "err.notowned",
  "not owned": "err.notowned",
  "frame not owned": "err.notowned",
  "item is not usable": "err.notusable",
  "not equippable": "err.unequippable",
  "item unavailable": "err.unavailable",
  "name must be 2–16 characters": "err.name216",
  "create a duel account first": "err.duelacc",
  "round not found": "err.roundnotfound",
  "match still running": "err.matchrunning",
  "level locked": "err.levellocked",
  "confirm your email first": "err.confirmEmail",
  "bad answer": "err.tryagain",
  "bad answer kind": "err.tryagain",
};

/* fuzzy fallbacks (host-side validation etc.) */
const FUZZY: [string, string][] = [
  ["no single-player profile", "err.duelacc"],
  ["no multiplayer profile", "err.duelacc"],
  ["please try again", "err.tryagain"],
  ["a round needs 4 options", "err.tryagain"],
  ["bad answer index", "err.tryagain"],
  ["bad question", "err.tryagain"],
  ["bad message", "err.tryagain"],
];

export function gameError(e: unknown, t: TFn): string {
  let msg = "";
  if (typeof e === "string") msg = e;
  else if (e && typeof e === "object" && "message" in e)
    msg = String((e as any).message || "");
  if (!msg) return "";

  const m = msg.match(/Exotic:\s*(.+)$/);
  if (m) {
    const frag = m[1].trim();
    const key = EXACT[frag];
    if (key) return t(key);
    const fuzzy = FUZZY.find(([needle]) => frag.includes(needle));
    if (fuzzy) return t(fuzzy[1]);
  }
  if (/already registered/i.test(msg)) return t("auth.exists");
  if (/duplicate key/i.test(msg)) return t("auth.nameTaken");
  if (/invalid login credentials/i.test(msg)) return t("auth.failed");
  if (/email rate limit exceeded|over_email_send_rate_limit/i.test(msg))
    return t("err.tryagain");
  /* network-level failures — browser fetch aborts, DNS/connection blips,
     or a dev-server restart mid-request. Always transient, never the
     player's fault: show the localized "try again" message instead of
     the raw browser text ("Failed to fetch", "Load failed", …). */
  if (
    /failed to fetch|load failed|fetch failed|networkerror|network request failed|err_name_not_resolved|err_connection|err_internet_disconnected|connection (refused|reset|closed)|timed? ?out|timeout/i.test(
      msg
    )
  )
    return t("err.tryagain");
  return msg;
}
