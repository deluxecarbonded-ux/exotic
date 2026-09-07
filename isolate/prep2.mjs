const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE;
const H = { "Content-Type": "application/json" };
const srv = async (u, p, body) => { const r = await fetch(BASE + u, { method: p, headers: { ...H, apikey: SRV, Authorization: `Bearer ${SRV}` }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };

// clean stale
const list = await srv("/auth/v1/admin/users?per_page=200", "GET");
for (const u of list.j.users || []) if (/emote[12]@resend\.dev/.test(u.email)) await srv(`/auth/v1/admin/users/${u.id}`, "DELETE");

const ids = {};
for (const n of [1, 2]) {
  const r = await srv("/auth/v1/admin/users", "POST", { email: `emote${n}@resend.dev`, password: "Test123456", email_confirm: true });
  const id = r.j.user?.id ?? r.j.id;
  if (!id) { console.log("CREATE FAIL", n, r.status, JSON.stringify(r.j).slice(0, 200)); process.exit(1); }
  ids[n] = id;
}

// tokens
const tok = {};
for (const n of [1, 2]) {
  const r = await fetch(BASE + "/auth/v1/token?grant_type=password", { method: "POST", headers: { ...H, apikey: ANON, Authorization: `Bearer ${ANON}` }, body: JSON.stringify({ email: `emote${n}@resend.dev`, password: "Test123456" }) });
  const j = await r.json();
  if (!j.access_token) { console.log("TOKEN FAIL", n, r.status, JSON.stringify(j).slice(0, 200)); process.exit(1); }
  tok[n] = j;
}
console.log("auth ok:", Object.keys(ids).map(n => `emote${n}=${ids[n].slice(0, 8)}…`).join(" "));

// room: p1 creates, p2 joins
const rpc = async (name, body, tk) => { const r = await fetch(`${BASE}/rest/v1/rpc/${name}`, { method: "POST", headers: { ...H, apikey: ANON, Authorization: `Bearer ${tk}` }, body: JSON.stringify(body || {}) }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
const c1 = await rpc("create_room", {}, tok[1].access_token);
if (c1.status !== 200) { console.log("create_room FAIL", c1.status, JSON.stringify(c1.j).slice(0, 200)); process.exit(1); }
const code = c1.j.code ?? c1.j.room_code ?? c1.j;
const j2 = await rpc("join_room", { code }, tok[2].access_token);
console.log("room:", code, "│ p2 join:", j2.status, JSON.stringify(j2.j).slice(0, 80));

// output for next step
const fs = await import("fs");
fs.writeFileSync("/tmp/t/mq.json", JSON.stringify({ ids, code, session: { access_token: tok[1].access_token, refresh_token: tok[1].refresh_token, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user: tok[1].user } }));
console.log("session saved → /tmp/t/mq.json");
