"use client";

import { useCallback, useEffect, useState } from "react";
import { sp, mp, spDb, mpDb } from "@/lib/supabase";

/* Live inventory — qty updates stream in via Supabase realtime,
   zero refreshes. Works for both the sp and mp schemas. */
function useLiveInventory(
  client: () => any,
  db: () => any,
  schema: "sp" | "mp",
  key: string,
  userId?: string | null
) {
  const [inv, setInv] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!userId) {
      setInv({});
      return;
    }
    const { data } = await db()
      .from("inventory" as any)
      .select("item_id, qty")
      .eq("player_id", userId);
    const m: Record<string, number> = {};
    (data as any[] | null)?.forEach((r: any) => (m[r.item_id] = r.qty));
    setInv(m);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const ch = client()
      .channel(`${key}-inv-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema, table: "inventory", filter: `player_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [refresh, userId]);

  return inv;
}

export function useSpInventory(userId?: string | null) {
  return useLiveInventory(sp, spDb, "sp", "sp", userId);
}

export function useMpInventory(userId?: string | null) {
  return useLiveInventory(mp, mpDb, "mp", "mp", userId);
}
