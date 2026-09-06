// Exotic · Edge Function: `cleanup-rooms`
// Deletes stale duel rooms (waiting > 30 minutes with no activity).
// Schedule it hourly via pg_cron / Supabase scheduled functions, or call manually.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .schema("mp" as "public")
    .from("rooms")
    .delete()
    .eq("status", "waiting")
    .lt("updated_at", cutoff)
    .select("id");

  return new Response(
    JSON.stringify({ ok: !error, removed: data?.length ?? 0, error: error?.message }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
