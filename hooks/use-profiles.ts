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

/* Live profiles — updates via Supabase realtime, zero refreshes. */
export function useSpProfile(userId?: string | null) {
  const [profile, setProfile] = useState<SpProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
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
    setLoading(false);
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

  return { profile, loading, refresh };
}

export function useMpProfile(userId?: string | null) {
  const [profile, setProfile] = useState<MpProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
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
    setLoading(false);
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

  return { profile, loading, refresh };
}
