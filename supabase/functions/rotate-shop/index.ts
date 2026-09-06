// Exotic · Edge Function: `rotate-shop`
// Rotates the "Featured" shelf in both shops (solo + duel).
// Call it from a Supabase cron schedule or manually:
//   curl -X POST https://<project>.functions.supabase.co/rotate-shop \
//        -H "Authorization: Bearer <service-role-key>"

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const featured: string[] = [];
  for (const schema of ["sp", "mp"]) {
    const { data: items } = await admin
      .schema(schema as "public")
      .from("shop_items")
      .select("id")
      .eq("available", true);

    const ids = (items ?? []).map((i: { id: string }) => i.id);
    const picks = ids.sort(() => Math.random() - 0.5).slice(0, 3);

    await admin.schema(schema as "public").from("shop_items").update({ featured: false }).gt("price", -1);
    for (const id of picks) {
      await admin.schema(schema as "public").from("shop_items").update({ featured: true }).eq("id", id);
      featured.push(`${schema}:${id}`);
    }
  }

  return json({ ok: true, featured });
});
