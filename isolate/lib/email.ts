/* Server-side email — every message the app sends goes through here.
   Two fully separate brands, one per mode:
     – Exotic Solo  (single player: Sparks, 30 levels)
     – Exotic Duel  (multiplayer: Novas, live races)
   Sent with Resend from Exotic@DevilExotic.com. Pure #000/#fff theme,
   inline styles only (email clients strip stylesheets). */

const RESEND = "https://api.resend.com/emails";

type Mode = "sp" | "mp";

export async function sendMail(opts: { to: string; subject: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Exotic <Exotic@DevilExotic.com>";
  if (!key) throw new Error("mail-not-configured");
  const r = await fetch(RESEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!r.ok) throw new Error(`resend-${r.status}`);
  const j: any = await r.json().catch(() => ({}));
  return j.id as string | undefined;
}

/* ── layout ── */

const STYLE = `
  body{margin:0;padding:0;background:#000;}
  .wrap{background:#000;color:#fff;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:36px 28px;}
  .mark{font-size:22px;font-weight:900;letter-spacing:.34em;text-transform:uppercase;}
  .tag{display:inline-block;background:#fff;color:#000;font-size:11px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;padding:6px 12px;border-radius:999px;margin:18px 0 22px;}
  h1{font-size:26px;line-height:1.25;font-weight:900;margin:0 0 12px;}
  p{font-size:15px;line-height:1.65;color:#cccccc;margin:0 0 14px;}
  .cta{display:inline-block;background:#fff;color:#000;font-size:14px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;padding:14px 30px;border-radius:16px;margin:10px 0 8px;}
  .foot{margin-top:30px;padding-top:18px;border-top:1px solid #1c1c1c;font-size:11px;line-height:1.6;color:#777777;}
  .mono{font-size:12px;color:#999999;word-break:break-all;}
`;

function layout(mode: Mode, inner: string) {
  const brand = mode === "sp" ? "Exotic Solo" : "Exotic Duel";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body><div class="wrap">${inner}<div class="foot">Exotic · ${brand}<br>This Address Receives ${brand} Account Mail Only.<br><a href="__ORIGIN__" style="color:#ffffff;">__HOST__</a></div></div><style>${STYLE}</style></body></html>`;
}

/* ── signup confirmation — the account must confirm before it can play ── */

function withOrigin(html: string, link: string): string {
  try {
    const o = new URL(link).origin;
    return html.replaceAll("__ORIGIN__", o).replaceAll("__HOST__", o.replace(/^https?:\/\//, ""));
  } catch {
    return html.replaceAll("__ORIGIN__", "#").replaceAll("__HOST__", "Exotic");
  }
}

export function confirmHtml(mode: Mode, username: string, link: string) {
  const name = (username || "Player").replace(/[<>&"]/g, "").slice(0, 16);
  if (mode === "sp") {
    return withOrigin(layout(
      "sp",
      `<div class="mark">Exotic</div><div class="tag">Solo</div>
       <h1>Confirm Your Email, ${esc(name)}.</h1>
       <p>One tap and your Exotic Solo vault is fully live. Until you confirm, the thirty levels stay locked.</p>
       <p>Riddles, logic, math and trivia — one question per level, and every level climbs.</p>
       <a class="cta" href="${link}">Confirm Email</a>
       <p class="mono">${link}</p>
       <p>If You Didn't Create This Account, Ignore This Email.</p>`,
    ), link);
  }
  return withOrigin(layout(
    "mp",
    `<div class="mark">Exotic</div><div class="tag">Duel</div>
     <h1>Confirm Your Email, ${esc(name)}.</h1>
     <p>One tap and the Exotic Duel arena opens. Until you confirm, duels stay locked.</p>
     <p>Race live opponents through the same questions — first correct answer takes the round.</p>
     <a class="cta" href="${link}">Confirm Email</a>
     <p class="mono">${link}</p>
     <p>If You Didn't Create This Account, Ignore This Email.</p>`,
  ), link);
}


/* ── password recovery ── */

export function recoveryHtml(mode: Mode, link: string) {
  const brand = mode === "sp" ? "Solo" : "Duel";
  return withOrigin(layout(
    mode,
    `<div class="mark">Exotic</div><div class="tag">${brand}</div>
     <h1>Reset Your ${brand} Password.</h1>
     <p>Tap the button below to choose a new password for your Exotic ${brand} account. The link works once and expires shortly.</p>
     <a class="cta" href="${link}">Set New Password</a>
     <p class="mono">${link}</p>
     <p>If You Didn't Request This, Ignore This Email — Your Password Stays As Is.</p>`,
  ), link);
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
