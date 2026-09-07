"use client";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { safeStorage } from "./safe-store";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/* Two fully separated Supabase sessions (same email identity can be
   signed into both at once — each side keeps its own profile/progress):
   – Single Player  → email account (storage: exotic-sp-session)
   – Multiplayer    → email account (storage: exotic-mp-session)

   Sessions persist through `safeStorage` (localStorage, with an
   in-memory fallback for sandboxed iframes where storage access
   throws). Cookie storage is deliberately NOT used: embedded previews
   and privacy browsers drop third-party cookies, which used to silently
   erase the session and bounce players back to the auth pages. */

let _sp: SupabaseClient | null = null;
let _mp: SupabaseClient | null = null;

function makeClient(storageKey: string) {
  return createClient(URL, KEY, {
    auth: {
      storageKey,
      storage: safeStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function sp(): SupabaseClient {
  if (!_sp) _sp = makeClient("exotic-sp-session");
  return _sp as SupabaseClient;
}

export function mp(): SupabaseClient {
  if (!_mp) _mp = makeClient("exotic-mp-session");
  return _mp as SupabaseClient;
}

/* Schema-scoped query builders (tables live in the `sp` / `mp` schemas). */
export function spDb(): any {
  return (sp() as any).schema("sp");
}
export function mpDb(): any {
  return (mp() as any).schema("mp");
}

/* Retry a transiently-failing auth call (network blip, dev-server
   restart mid-request, flaky connection). supabase-js does NOT retry
   signInWithPassword/signUp internally, so one dropped request used to
   surface the raw browser text ("Failed to fetch") in the UI.
   Only fetch-level errors (AuthRetryableFetchError, status 0) are
   retried — real rejections (bad credentials, etc.) pass through
   immediately. */
export async function withAuthRetry<T>(
  fn: () => Promise<{ data: any; error: any }>
): Promise<{ data: any; error: any }> {
  let last: { data: any; error: any } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fn();
    const status: number =
      typeof res.error?.status === "number" ? res.error.status : 0;
    const retryable =
      res.error &&
      (res.error.name === "AuthRetryableFetchError" ||
        res.error.name === "AuthRetryableError" ||
        status === 0);
    if (!retryable) return res;
    last = res;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return last!;
}

/* Resolve the signed-in user with the server as the only authority —
   but never let a TRANSIENT failure log a valid session out.
   - happy path: server-verified user
   - transient error (network / 5xx / 429): retry, then fall back to the
     local session optimistically — a blip must not bounce the player
   - definitive rejection (401/403/404 — deleted account, bad token):
     purge the stored session so pages can't flap  */
async function resolveUser(c: any, attempt = 0): Promise<User | null> {
  const { data, error } = await c.auth.getUser();
  if (data?.user) return data.user;
  if (error) {
    const status = typeof error.status === "number" ? error.status : 0;
    const transient =
      error.name === "AuthRetryableFetchError" ||
      error.name === "AuthRetryableError" ||
      status === 0 ||
      status >= 500 ||
      status === 429;
    if (transient && attempt < 2) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      return resolveUser(c, attempt + 1);
    }
    if (transient) {
      /* unverifiable right now — trust the local session over logout */
      const { data: s } = await c.auth.getSession();
      return (s.session?.user as User) ?? null;
    }
    /* definitive rejection — purge the poison session */
    const { data: s } = await c.auth.getSession();
    if (s.session) await c.auth.signOut().catch(() => {});
    return null;
  }
  /* no user and no error: either no session at all, or a deleted-account
     ghost the server quietly ignores — purge only if something is stored */
  const { data: s } = await c.auth.getSession();
  if (s.session) await c.auth.signOut().catch(() => {});
  return null;
}

export function useSpSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = sp();
    let alive = true;
    resolveUser(c).then((u) => {
      if (!alive) return;
      setUser(u);
      setLoading(false);
    });
    const { data: sub } = c.auth.onAuthStateChange((evt: any, s: any) => {
      /* INITIAL_SESSION just replays the local cache — resolveUser()
         above is the authority (it may still be in flight) */
      if (evt === "INITIAL_SESSION") return;
      setUser(s?.user ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);
  return { user, loading };
}

export function useMpSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = mp();
    let alive = true;
    resolveUser(c).then((u) => {
      if (!alive) return;
      setUser(u);
      setLoading(false);
    });
    const { data: sub } = c.auth.onAuthStateChange((evt: any, s: any) => {
      if (evt === "INITIAL_SESSION") return;
      setUser(s?.user ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);
  return { user, loading };
}
