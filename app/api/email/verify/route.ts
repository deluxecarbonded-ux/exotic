import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import postgres from "postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Consumes a one-time confirmation token (from the Solo / Duel signup
   email) and unlocks the matching mode: profiles.email_verified=true.
   Single use, 24h expiry. */
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const token = String(body.token || "");
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(token)) {
    return NextResponse.json({ ok: false });
  }
  const hash = createHash("sha256").update(token).digest("hex");

  try {
    const sql = postgres(process.env.POSTGRES_URL!, {
      max: 1,
      prepare: false,
      idle_timeout: 5,
    });
    const rows = await sql.unsafe(
      "select user_id, mode from public.email_tokens where token_hash = $1 and expires_at > now() limit 1",
      [hash],
    );
    if (rows.length === 0) {
      await sql.end({ timeout: 5 });
      return NextResponse.json({ ok: false });
    }
    const { user_id: uid, mode } = rows[0];
    const schema = mode === "mp" ? "mp" : "sp";
    await sql.unsafe(
      `update ${schema}.profiles set email_verified = true where id = $1`,
      [uid],
    );
    /* profile row not created yet (user never opened the hub)? create it verified */
    await sql.unsafe(
      `insert into ${schema}.profiles (id, username, email_verified)
       values ($1, coalesce(nullif(trim((select raw_user_meta_data->>'username' from auth.users where id = $1)), ''), 'Player'), true)
       on conflict (id) do update set email_verified = true`,
      [uid],
    );
    await sql.unsafe(
      "delete from public.email_tokens where token_hash = $1",
      [hash],
    );
    await sql.end({ timeout: 5 });
    return NextResponse.json({ ok: true, mode });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
