"use client";

import { useCallback, useEffect, useState } from "react";
import { sp, mp, spDb, mpDb } from "@/lib/supabase";

export type SpProfile = {
  id: string;
  username: string;
  avatar: string;
  level: number;
  xp: number;
  sparks: number;
  streak: number;
  games: number;
  wins: number;
  best_time: number | null;
  last_daily: string | null;
  created_at: string;
  levels?: Record<string, number>;
  email_verified?: boolean;
};

export type MpProfile = {
  id: string;
  username: string;
  avatar: string;
  frame: string;
  level: number;
  xp: number;
  novas: number;
  rank_points: number;
  wins: number;
  losses: number;
  streak: number;
  best_streak: number;
  games: number;
  last_daily: string | null;
  created_at: string;
  email_verified?: boolean;
};

/* Live profiles — updates via Supabase realtime, zero refreshes.

   `loading` is DERIVED from which userId the lookup has actually
   completed for (`checkedId`), never a raw boolean: when the signed-in
   user arrives the hub's guard effect runs in the same commit with the
   previous state, and a plain boolean stays stale-false during the
   in-flight refetch — that stale pair (`loading=false, profile=null`)
   made the hub bounce signed-in players to /auth while the auth page
   bounced them straight back (auth ⇄ hub ping-pong). Derived loading
   is correct in every render, so the guard waits for the real answer. */
export function useSpProfile(userId?: string | null) {
  const [profile, setProfile] = useState<SpProfile | null>(null);
  const [checkedId, setCheckedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setCheckedId(null);
      return;
    }
    const { data } = await spDb()
      .from("profiles" as any)
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (data) {
      setProfile(data as SpProfile);
    }
    /* no profile = not registered for this mode yet (manual step) */
    setCheckedId(userId);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const ch = sp()
      .channel(`sp-profile-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "sp",
          table: "profiles" as any,
          filter: `id=eq.${userId}`,
        },
        () => refresh()
      )
      .subscribe();
    return () => {
      sp().removeChannel(ch);
    };
  }, [userId, refresh]);

  return { profile, loading: userId ? checkedId !== userId : false, refresh };
}

export function useMpProfile(userId?: string | null) {
  const [profile, setProfile] = useState<MpProfile | null>(null);
  const [checkedId, setCheckedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setCheckedId(null);
      return;
    }
    const { data } = await mpDb()
      .from("profiles" as any)
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (data) {
      setProfile(data as MpProfile);
    }
    /* no profile = not registered for this mode yet (manual step) */
    setCheckedId(userId);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const ch = mp()
      .channel(`mp-profile-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "mp",
          table: "profiles" as any,
          filter: `id=eq.${userId}`,
        },
        () => refresh()
      )
      .subscribe();
    return () => {
      mp().removeChannel(ch);
    };
  }, [userId, refresh]);

  return { profile, loading: userId ? checkedId !== userId : false, refresh };
}
