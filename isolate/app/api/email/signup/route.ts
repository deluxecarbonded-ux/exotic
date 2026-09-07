import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import { sendMail, confirmHtml } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Signup confirmation email — one per mode (Solo / Duel), sent from
   Exotic@DevilExotic.com. It carries a one-time confirm token; the
   account must confirm before it can play. Always answers {ok:true}:
   never reveals whether an address has an account. */
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const email = String(body.email || "").trim().toLowerCase();
  const mode = body.mode === "mp" ? "mp" : "sp";
  const username = String(body.username || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: true });
  }

  try {
    const sql = postgres(process.env.POSTGRES_URL!, {
      max: 1,
      prepare: false,
      idle_timeout: 5,
    });
    const rows = await sql.unsafe(
      "select id from auth.users where email = $1 limit 1",
      [email],
    );
    if (rows.length === 0) {
      await sql.end({ timeout: 5 });
      return NextResponse.json({ ok: true });
    }
    const uid: string = rows[0].id;

    /* already confirmed for this mode? nothing to send */
    const done = await sql.unsafe(
      `select 1 from ${mode}.profiles where id = $1 and email_verified limit 1`,
      [uid],
    );
    if (done.length > 0) {
      await sql.end({ timeout: 5 });
      return NextResponse.json({ ok: true, confirmed: true });
    }

    /* gentle throttle: max one confirmation mail per mode per minute */
    const recent = await sql.unsafe(
      "select 1 from public.email_tokens where user_id = $1 and mode = $2 and created_at > now() - interval '60 seconds' limit 1",
      [uid, mode],
    );
    if (recent.length > 0) {
      await sql.end({ timeout: 5 });
      return NextResponse.json({ ok: true });
    }

    /* mint a one-time token (hash-stored, 24h) */
    const token = randomBytes(24).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    await sql.unsafe(
      "insert into public.email_tokens (user_id, mode, token_hash, expires_at) values ($1, $2, $3, now() + interval '24 hours')",
      [uid, mode, hash],
    );
    await sql.end({ timeout: 5 });

    const origin = new URL(req.url).origin;
    const link = `${origin}/auth/${mode}?verify=${token}`;
    await sendMail({
      to: email,
      subject:
        mode === "sp"
          ? "Confirm Your Email — Exotic Solo"
          : "Confirm Your Email — Exotic Duel",
      html: confirmHtml(mode, username, link),
    });
  } catch {
    /* mail is best-effort — signup must never fail because of it */
  }
  return NextResponse.json({ ok: true });
}
