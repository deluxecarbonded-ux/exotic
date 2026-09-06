"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n, LogoMark } from "@/components/providers";
import { Button, Spinner } from "@/components/ui";
import { mp, mpDb, sp, useMpSession } from "@/lib/supabase";
import { sfx } from "@/lib/sound";
import { gameError } from "@/lib/gameError";
import {
  Swords,
  Mail,
  Lock,
  UserRound,
  ArrowLeft,
  KeyRound,
} from "lucide-react";

/* Multiplayer auth: real email + password Supabase account.
   Fully separated session from the single-player vault.
   Includes the full forgot/reset password email loop (Resend SMTP
   sends the branded Exotic reset email, the link lands back here). */
type Mode = "in" | "up" | "forgot" | "reset" | "register";

export default function MpAuth() {
  const { t } = useI18n();
  const router = useRouter();
  const { user, loading } = useMpSession();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  /* A reset-link click exchanges the token into a session and fires
     PASSWORD_RECOVERY — catch it and show the new-password form
     instead of bouncing to the lobby. */
  useEffect(() => {
    const { data: sub } = mp().auth.onAuthStateChange((evt: any, session: any) => {
      if (evt === "PASSWORD_RECOVERY" && session?.user) {
        setMode("reset");
        setEmail(session.user.email ?? "");
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  /* the app's own Duel reset email links here with a one-time token */
  useEffect(() => {
    const m = window.location.search.match(/[?&]token_hash=([A-Za-z0-9_-]+)/);
    if (!m) return;
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      const { data, error } = await mp().auth.verifyOtp({
        type: "recovery",
        token_hash: m[1],
      });
      if (!error && data?.user) {
        setEmail(data.user.email ?? "");
        setMode("reset");
      }
    })();
  }, []);

  /* the Duel signup confirmation email links here — confirm the account */
  useEffect(() => {
    const m = window.location.search.match(/[?&]verify=([A-Za-z0-9_-]+)/);
    if (!m) return;
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      const r = await fetch("/api/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: m[1] }),
      }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (j.ok) {
        sfx.powerup2();
        setNotice(t("auth.verified"));
        /* signed-in visitors hop straight to the arena */
        setTimeout(() => {
          if (window.location.pathname === "/auth/mp") router.replace("/multiplayer");
        }, 1600);
      } else {
        setErr(t("auth.linkExpired"));
      }
    })();
  }, []);

  /* after ANY successful auth: if this mode's profile exists → mode
     home; otherwise → the MANUAL registration step (a profile is never
     created automatically — the player registers each mode themselves) */
  const afterAuth = async (uid: string) => {
    const { data: prof } = await mpDb()
      .from("profiles" as any)
      .select("username")
      .eq("id", uid)
      .maybeSingle();
    if (prof) {
      sfx.powerup2();
      router.replace("/multiplayer");
      return;
    }
    /* no mp profile yet — prefill the username from the other mode */
    const { data: otherProf } = await sp()
      .schema("sp" as any)
      .from("profiles" as any)
      .select("username")
      .eq("id", uid)
      .maybeSingle();
    setUsername((otherProf as any)?.username ?? "");
    setMode("register");
  };

  useEffect(() => {
    if (user && (mode === "in" || mode === "up")) afterAuth(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const submit = async () => {
    setErr("");
    setNotice("");
    if (mode === "up" && (username.trim().length < 2 || username.trim().length > 16)) {
      setErr(t("auth.needName"));
      return;
    }
    if (mode === "reset") {
      if (password.length < 6 || password !== password2) {
        setErr(t("auth.passMismatch"));
        return;
      }
      setBusy(true);
      sfx.pop();
      try {
        const { error } = await mp().auth.updateUser({ password });
        if (error) throw error;
        sfx.powerup2();
        router.replace("/multiplayer");
      } catch (e: any) {
        setErr(gameError(e, t) || t("auth.failed"));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === "forgot") {
      if (!email.trim()) {
        setErr(t("auth.failed"));
        return;
      }
      setBusy(true);
      sfx.pop();
      try {
        /* the app sends its own Duel-branded reset email */
        const r = await fetch("/api/email/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), mode: "mp" }),
        }).catch(() => null);
        if (!r || !r.ok) throw new Error("mail");
        setNotice(t("auth.resetSent"));
      } catch (e: any) {
        setErr(gameError(e, t) || t("auth.failed"));
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    sfx.pop();
    try {
      if (mode === "up") {
        const { data, error } = await mp().auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: username.trim(), mode: "mp" } },
        });
        if (error) throw error;
        if (!data.session) {
          /* email already registered (autoconfirm is on — a fresh address
             always returns a session) → route to sign-in, not silence */
          const dup =
            data.user &&
            Array.isArray((data.user as any).identities) &&
            (data.user as any).identities.length === 0;
          if (dup) {
            setErr(t("auth.exists"));
            setMode("in");
            return;
          }
          setNotice(t("auth.checkEmail"));
          return;
        }
        await afterAuth(data.user!.id);
      } else {
        const { data, error } = await mp().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        await afterAuth(data.user!.id);
      }
    } catch (e: any) {
      setErr(gameError(e, t) || t("auth.failed"));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    sfx.click();
    setMode(m);
    setErr("");
    setNotice("");
  };

  const doRegister = async () => {
    setErr(""); setNotice("");
    if (username.trim().length < 2 || username.trim().length > 16) {
      setErr(t("auth.needName"));
      return;
    }
    setBusy(true);
    try {
      const { data: j, error } = await mpDb().rpc("register_profile", {
        p_username: username.trim(),
      });
      if (error) throw error;
      if (j && j.ok === false) {
        setErr(t("auth.needName"));
        return;
      }
      sfx.powerup2();
      router.replace("/multiplayer");
    } catch (e: any) {
      setErr(gameError(e, t) || t("auth.failed"));
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = () => {
    if (mode === "register") return t("auth.regBtn");
    if (busy) return t("auth.signing");
    if (mode === "forgot") return t("auth.sendReset");
    if (mode === "reset") return t("auth.resetPass");
    return mode === "in" ? t("auth.signIn") : t("auth.signUp");
  };

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 text-fg">
      <div className="w-full max-w-md animate-fade-up">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-mute press"
        >
          <ArrowLeft size={16} className="rtl:-scale-x-100" /> {t("common.back")}
        </Link>

        <div className="rounded-[2rem] bg-soft p-8 shadow-pop md:p-10">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-fg text-bg">
              {mode === "forgot" || mode === "reset" ? (
                <KeyRound size={22} />
              ) : (
                <Swords size={22} />
              )}
            </div>
            <div>
              <div className="display text-xl">
                {mode === "forgot"
                  ? t("auth.forgot")
                  : mode === "reset"
                    ? t("auth.resetPass")
                    : t("auth.mpTitle")}
              </div>
              <div className="text-xs font-semibold text-mute">{t("app.brand")} · {t("nav.multi")}</div>
            </div>
          </div>

          <p className="mb-6 text-sm font-semibold text-mute">
            {mode === "forgot"
              ? t("auth.forgotSub")
              : mode === "reset"
                ? t("auth.resetSub")
                : mode === "register"
                  ? t("auth.regSub", { mode: t("nav.multi") })
                : t("auth.mpSub")}
          </p>

          {loading ? (
            <div className="grid place-items-center py-10">
              <Spinner />
            </div>
          ) : (
            <>
              {(mode === "in" || mode === "up") && (
                <div className="mb-5 flex rounded-2xl bg-soft2 p-1">
                  {(["in", "up"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className={`press flex-1 rounded-xl py-2.5 text-sm font-bold ${
                        mode === m ? "bg-btn text-btnfg" : "text-mute"
                      }`}
                    >
                      {m === "in" ? t("auth.signIn") : t("auth.signUp")}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-3">
                {(mode === "up" || mode === "register") && (
                  <div className="flex items-center gap-3 rounded-2xl bg-soft2 px-4 focus-within:bg-soft">
                    <UserRound size={17} className="text-mute" />
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t("auth.username")}
                      maxLength={16}
                      className="w-full bg-transparent py-3.5 text-fg placeholder:text-mute"
                    />
                  </div>
                )}
                {mode !== "reset" && mode !== "register" && (
                  <div className="flex items-center gap-3 rounded-2xl bg-soft2 px-4 focus-within:bg-soft">
                    <Mail size={17} className="text-mute" />
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("auth.email")}
                      type="email"
                      className="w-full bg-transparent py-3.5 text-fg placeholder:text-mute"
                    />
                  </div>
                )}
                {(mode === "in" || mode === "up" || mode === "reset") && (
                  <div className="flex items-center gap-3 rounded-2xl bg-soft2 px-4 focus-within:bg-soft">
                    <Lock size={17} className="text-mute" />
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        mode === "reset" ? t("auth.newPass") : t("auth.password")
                      }
                      type="password"
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                      className="w-full bg-transparent py-3.5 text-fg placeholder:text-mute"
                    />
                  </div>
                )}
                {mode === "reset" && (
                  <div className="flex items-center gap-3 rounded-2xl bg-soft2 px-4 focus-within:bg-soft">
                    <Lock size={17} className="text-mute" />
                    <input
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      placeholder={t("auth.newPass2")}
                      type="password"
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                      className="w-full bg-transparent py-3.5 text-fg placeholder:text-mute"
                    />
                  </div>
                )}
              </div>

              <Button size="lg" className="mt-5 w-full" onClick={mode === "register" ? doRegister : submit} disabled={busy}>
                {busy ? <Spinner className="text-btnfg" /> : null}
                {submitLabel()}
              </Button>

              {mode === "in" && (
                <button
                  onClick={() => switchMode("forgot")}
                  className="press mt-3 w-full text-center text-xs font-bold text-mute"
                >
                  {t("auth.forgot")}
                </button>
              )}
              {(mode === "forgot" || mode === "reset") && (
                <button
                  onClick={() => switchMode("in")}
                  className="press mt-4 w-full text-center text-xs font-bold text-mute"
                >
                  {t("auth.backSignIn")}
                </button>
              )}
              {(mode === "in" || mode === "up") && (
                <button
                  onClick={() => switchMode(mode === "in" ? "up" : "in")}
                  className="press mt-2 w-full text-center text-xs font-bold text-mute"
                >
                  {mode === "in" ? t("auth.noAcc") : t("auth.haveAcc")}
                </button>
              )}

              {err && <p className="mt-4 text-center text-xs font-bold text-mute">{err}</p>}
              {notice && <p className="mt-4 text-center text-xs font-bold">{notice}</p>}
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-mute">
          <LogoMark size={16} />
          <span className="text-xs font-bold">{t("app.brand")}</span>
        </div>
      </div>
    </main>
  );
}
