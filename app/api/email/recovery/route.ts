import { NextResponse } from "next/server";
import postgres from "postgres";
import { sendMail, recoveryHtml } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Password recovery email — the app mints the one-time recovery token
   server-side and sends its own branded message (separate Solo / Duel
   variants). The auth server itself never sends an email in this flow.
   Always answers {ok:true} — no account enumeration. */
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const email = String(body.email || "").trim().toLowerCase();
  const mode = body.mode === "mp" ? "mp" : "sp";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: true });
  }

  try {
    /* 1 · the account must exist */
    const sql = postgres(process.env.POSTGRES_URL!, {
      max: 1,
      prepare: false,
      idle_timeout: 5,
    });
    const rows = await sql.unsafe(
      "select id from auth.users where email = $1 limit 1",
      [email],
    );
    await sql.end({ timeout: 5 });
    if (rows.length === 0) return NextResponse.json({ ok: true });

    /* 2 · mint a single-use recovery token */
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const sr = process.env.SUPABASE_SERVICE_ROLE!;
    const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        apikey: sr,
        Authorization: `Bearer ${sr}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "recovery", email }),
    });
    if (!res.ok) throw new Error(`link-${res.status}`);
    const j: any = await res.json();
    const hashed = j?.properties?.hashed_token || j?.hashed_token;
    if (!hashed) throw new Error("no-token");

    /* 3 · send the mode-branded email with our own landing page */
    const origin = new URL(req.url).origin;
    const link = `${origin}/auth/${mode}?token_hash=${hashed}`;
    await sendMail({
      to: email,
      subject:
        mode === "sp"
          ? "Reset Your Exotic Solo Password"
          : "Reset Your Exotic Duel Password",
      html: recoveryHtml(mode, link),
    });
  } catch {
    /* swallow — the UI always shows the same "check your inbox" notice */
  }
  return NextResponse.json({ ok: true });
}
