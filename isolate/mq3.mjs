const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE;
const H = { "Content-Type": "application/json" };
const srv = async (u, p, body) => { const r = await fetch(BASE + u, { method: p, headers: { ...H, apikey: SRV, Authorization: `Bearer ${SRV}` }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };

const list = await srv("/auth/v1/admin/users?per_page=200", "GET");
const existing = {};
for (const u of list.j.users || []) if (/emote[12]@resend\.dev/.test(u.email)) existing[u.email.match(/emote\d/)[0]] = u.id;
const ids = {};
for (const n of [1, 2]) {
  if (existing[`emote${n}`]) { ids[n] = existing[`emote${n}`]; continue; }
  const r = await srv("/auth/v1/admin/users", "POST", { email: `emote${n}@resend.dev`, password: "Test123456", email_confirm: true });
  ids[n] = r.j.user?.id ?? r.j.id;
  if (!ids[n]) { console.log("CREATE FAIL", n, r.status, JSON.stringify(r.j).slice(0, 150)); process.exit(1); }
}

// 1) seed verified profiles FIRST (gate checks them)
const postgres = (await import("/home/user/exotic/node_modules/postgres/cjs/src/index.js")).default;
const sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false });
await sql.unsafe("insert into mp.profiles (id, username, email_verified) values ($1,'EmoteOne',true), ($2,'EmoteTwo',true) on conflict (id) do update set email_verified = true, username = excluded.username", [ids[1], ids[2]]);

// 2) tokens
const tok = {};
for (const n of [1, 2]) {
  const r = await fetch(BASE + "/auth/v1/token?grant_type=password", { method: "POST", headers: { ...H, apikey: ANON, Authorization: `Bearer ${ANON}` }, body: JSON.stringify({ email: `emote${n}@resend.dev`, password: "Test123456" }) });
  tok[n] = await r.json();
  if (!tok[n].access_token) { console.log("TOKEN FAIL", JSON.stringify(tok[n]).slice(0, 150)); process.exit(1); }
}

// 3) room
const rpc = async (name, body, tk) => {
  const r = await fetch(`${BASE}/rest/v1/rpc/${name}`, { method: "POST", headers: { ...H, apikey: ANON, Authorization: `Bearer ${tk}`, "Content-Profile": "mp", "Accept-Profile": "mp" }, body: JSON.stringify(body || {}) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
const c1 = await rpc("create_room", { p_difficulty: "easy" }, tok[1].access_token);
const code = c1.j?.code;
const j2 = code ? await rpc("join_room", { p_code: code }, tok[2].access_token) : { status: 0, j: c1.j };
console.log("room:", code, "│ create:", c1.status, "│ p2 join:", j2.status, JSON.stringify(j2.j).slice(0, 60));
await sql.end();
if (code && j2.status === 200) {
  require("fs").writeFileSync("/tmp/t/mq.json", JSON.stringify({ ids, code, session: { access_token: tok[1].access_token, refresh_token: tok[1].refresh_token, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user: tok[1].user } }));
  console.log("session saved → /tmp/t/mq.json");
} else process.exit(1);
