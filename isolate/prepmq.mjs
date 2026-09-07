const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE;
const mail = async (u, p, body) => (await fetch(`${URL}${u}`, { method: p, headers: { apikey: SRV, Authorization: `Bearer ${SRV}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).json();

// clean stale test users
const list = await mail("/auth/v1/admin/users?per_page=200", "GET");
for (const u of list.users || []) if (/emote[12]@resend\.dev/.test(u.email)) await mail(`/auth/v1/admin/users/${u.id}`, "DELETE");

const ids = {};
for (const n of [1, 2]) {
  const r = await mail("/auth/v1/admin/users", "POST", { email: `emote${n}@resend.dev`, password: "Test123456", email_confirm: true });
  ids[`emote${n}`] = r.user.id;
  if (!r.user?.id) { console.log("CREATE FAIL", n, JSON.stringify(r)); process.exit(1); }
}
console.log("users created:", JSON.stringify(ids));
