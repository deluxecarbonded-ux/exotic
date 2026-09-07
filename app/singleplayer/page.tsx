"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { useI18n, useToast } from "@/components/providers";
import { useSpSession, spDb, sp } from "@/lib/supabase";
import { useSpInventory } from "@/hooks/use-inventory";
import { useSpProfile } from "@/hooks/use-profiles";
import { Button, Card, SectionTitle, Spinner, Stat, Pill, Empty } from "@/components/ui";
import { Avatar, DynIcon } from "@/components/icons";
import {
  Play,
  Zap,
  Flame,
  Timer,
  Trophy,
  Gift,
  CheckCircle2,
  Crown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_LEVEL } from "@/lib/game";
import { fmtTime } from "@/lib/utils";
import { DIFFICULTIES, type Difficulty } from "@/lib/game";
import { sfx } from "@/lib/sound";
import { gameError } from "@/lib/gameError";

export default function SpHub() {
  const { t, num } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const { user, loading: authLoading } = useSpSession();
  const { profile, loading: profileLoading } = useSpProfile(user?.id);
  const [diff, setDiff] = useState<Difficulty>("easy");
  const [boardKind, setBoardKind] = useState<"wins" | "sparks" | "level" | "time" | "streak">("wins");
  const [level, setLevel] = useState(1);
  const [lvlPerDiff, setLvlPerDiff] = useState<Record<string, number>>({});
  const [board, setBoard] = useState<any[]>([]);
  const [dailyState, setDailyState] = useState<"claim" | "claimed" | "loading">(
    "claim"
  );
  const [useDouble, setUseDouble] = useState(false);
  const invLive = useSpInventory(user?.id);
  const doubleOwned = invLive["double"] ?? 0;

  useEffect(() => {
    if (!user) {
      if (!authLoading) router.replace("/auth/sp");
      return;
    }
    if (!profileLoading && !profile) {
      /* account exists but no singleplayer profile — the player must register
         for this mode manually */
      router.replace("/auth/sp");
      return;
    }
    /* achievements self-heal on visit */
    spDb().rpc("check_achs").then(() => {}, () => {});
  }, [user, authLoading, profile, profileLoading, router]);

  /* live leaderboard — any profile change refetches the active board */
  const loadBoard = useCallback(async () => {
    const { data } = await spDb().rpc("leaderboard", { p_kind: boardKind });
    setBoard((data as any[]) || []);
  }, [boardKind]);
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);
  useEffect(() => {
    const ch = sp()
      .channel("sp-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "sp", table: "profiles" },
        () => loadBoard()
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [loadBoard]);

  useEffect(() => {
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    setDailyState(profile.last_daily === today ? "claimed" : "claim");
    const lv = (profile as any).levels || {};
    setLvlPerDiff({ easy: lv.easy ?? 1, medium: lv.medium ?? 1, hard: lv.hard ?? 1 });
    setLevel((prev) => Math.min(prev, (lv[diff] ?? 1) as number));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const claimDaily = async () => {
    setDailyState("loading");
    const { data, error } = await spDb().rpc("claim_daily");
    if (error) {
      setDailyState("claimed");
      toast(gameError(error, t), "err");
    } else {
      sfx.coins();
      toast(`+${num((data as any)?.amount ?? 25)} ✦ ${t("sp.sparks")}`, "achievement");
      setDailyState("claimed");
    }
  };

  const play = () => {
    if (useDouble && doubleOwned <= 0) {
      toast(t("sp.noBoost"), "warning");
      return;
    }
    sfx.vault();
    router.push(
      `/singleplayer/play?d=${diff}&lvl=${level}${useDouble ? "&double=1" : ""}`
    );
  };

  if (authLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <Spinner className="h-8 w-8" />
      </div>
    );

  return (
    <div className="min-h-screen bg-bg pb-28 text-fg md:pb-12">
      <Navbar spSignedIn={!!user} sparks={profile?.sparks} />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {/* hero row */}
        <div className="mb-8 flex animate-fade-up flex-wrap items-center gap-4">
          <Avatar icon={profile?.avatar} size={56} />
          <div className="min-w-0">
            <h1 className="display truncate text-2xl md:text-3xl">{t("sp.title")}</h1>
            <p className="text-sm font-semibold text-mute">{t("sp.sub")}</p>
          </div>
          {profile && (
            <div className="ms-auto flex items-center gap-2">
              <Pill solid className="px-4 py-2 text-sm">
                ✦ {num(profile.sparks)}
                <span className="opacity-70">{t("sp.sparks")}</span>
              </Pill>
              <Pill className="px-4 py-2 text-sm">
                {t("common.level")} {num(profile.level)}
              </Pill>
            </div>
          )}
        </div>

        {/* confirm-email gate */}
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-6">
            {/* play card */}
            <Card className="animate-fade-up">
              <SectionTitle>{t("sp.play")}</SectionTitle>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-mute">
                {t("sp.difficulty")}
              </div>
              <div className="mb-5 grid gap-2.5 sm:grid-cols-3">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      sfx.select();
                      setDiff(d);
                      setLevel(lvlPerDiff[d] ?? 1);
                    }}
                    className={cn(
                      "press rounded-2xl px-4 py-4 text-start",
                      diff === d ? "bg-btn text-btnfg" : "bg-soft2 text-fg"
                    )}
                  >
                    <div className="display text-base">{t(`sp.${d}`)}</div>
                    <div className="mt-0.5 text-[11px] font-bold opacity-60">
                      {t(`sp.${d}Sub`)}
                    </div>
                  </button>
                ))}
              </div>

              {/* 30-level campaign grid */}
              <div className="mb-2 mt-5 flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-mute">
                  {t("sp.campaign")}
                </div>
                <div className="text-[11px] font-bold text-mute">
                  {t("sp.levelProgress", {
                    n: Math.max(0, (lvlPerDiff[diff] ?? 1) - 1),
                    m: MAX_LEVEL,
                  })}
                </div>
              </div>
              <div className="mb-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
                {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((n) => {
                  const unlocked = n <= (lvlPerDiff[diff] ?? 1);
                  const isCurrent = n === level && unlocked;
                  /* beaten levels stay emerald — even when selected */
                  const completed = n < (lvlPerDiff[diff] ?? 1);
                  return (
                    <button
                      key={n}
                      disabled={!unlocked}
                      onClick={() => {
                        sfx.select();
                        setLevel(n);
                      }}
                      className={cn(
                        "press grid aspect-square place-items-center rounded-xl text-xs font-black tabular",
                        completed
                          ? "bg-emerald-500 text-white"
                          : isCurrent
                            ? "bg-btn text-btnfg"
                            : unlocked
                              ? "bg-soft2 text-fg"
                              : "bg-soft2 text-mute opacity-40"
                      )}
                      aria-label={unlocked ? t("sp.levelN", { n }) : t("sp.levelLocked")}
                    >
                      {unlocked ? num(n) : <Lock size={11} />}
                    </button>
                  );
                })}
              </div>
              <div className="mb-5 flex flex-wrap gap-2 text-[11px] font-bold text-mute">
                <span className="rounded-full bg-soft2 px-3 py-1">
                  {t("sp.levelN", { n: level })}
                </span>
              </div>

              <button
                onClick={() => {
                  sfx.toggle();
                  if (doubleOwned > 0) setUseDouble((v) => !v);
                  else toast(t("sp.noBoost"), "warning");
                }}
                className={cn(
                  "press mb-5 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-start text-sm font-bold",
                  useDouble && doubleOwned > 0
                    ? "bg-fg text-bg"
                    : "bg-soft2 text-fg",
                  doubleOwned <= 0 && "opacity-50"
                )}
              >
                <Zap size={16} className="shrink-0" />
                {t("sp.double")}
                <span className="ms-auto rounded-full bg-soft px-2.5 py-0.5 text-[11px] tabular">
                  ×{num(doubleOwned)}
                </span>
              </button>

              <Button size="xl" className="w-full" onClick={play}>
                <Play size={20} /> {t("sp.play")}
              </Button>
            </Card>

            {/* stats */}
            {profile && (
              <Card className="animate-fade-up">
                <SectionTitle>{t("sp.stats")}</SectionTitle>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label={t("sp.games")} value={num(profile.games)} icon={<Trophy size={13} />} />
                  <Stat label={t("sp.cracked")} value={num(profile.wins)} icon={<CheckCircle2 size={13} />} />
                  <Stat
                    label={t("common.streak")}
                    value={num(profile.streak)}
                    icon={<Flame size={13} />}
                  />
                  <Stat
                    label={t("sp.bestTime")}
                    value={profile.best_time ? fmtTime(profile.best_time, num) : "—"}
                    icon={<Timer size={13} />}
                  />
                </div>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-6">
            {/* daily */}
            <Card className="animate-fade-up text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-fg text-bg">
                <Gift size={24} />
              </div>
              <div className="display text-lg">{t("sp.daily")}</div>
              <Button
                className="mt-4 w-full"
                disabled={dailyState !== "claim"}
                onClick={claimDaily}
              >
                {dailyState === "loading" ? (
                  <Spinner className="text-btnfg" />
                ) : dailyState === "claimed" ? (
                  <>
                    <CheckCircle2 size={16} /> {t("sp.claimed")}
                  </>
                ) : (
                  <>
                    <Gift size={16} /> {t("sp.claim")}
                  </>
                )}
              </Button>
            </Card>

            {/* leaderboard */}
            <Card className="animate-fade-up">
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <Crown size={17} /> {t("sp.board")}
                </span>
              </SectionTitle>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ["wins", "lb.wins"],
                    ["sparks", "lb.sparks"],
                    ["level", "lb.level"],
                    ["time", "lb.bestTime"],
                    ["streak", "lb.streak"],
                  ] as const
                ).map(([k, key]) => (
                  <button
                    key={k}
                    onClick={() => {
                      sfx.select();
                      setBoardKind(k);
                    }}
                    className={cn(
                      "press rounded-full px-3 py-1 text-[11px] font-black",
                      boardKind === k ? "bg-btn text-btnfg" : "bg-soft2 text-mute"
                    )}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
              {board.length === 0 ? (
                <Empty>{t("common.empty")}</Empty>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {board.slice(0, 8).map((row, i) => (
                    <div
                      key={row.id}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-3 py-2",
                        row.id === user?.id ? "bg-fg text-bg" : "bg-soft2"
                      )}
                    >
                      <span className="w-5 text-xs font-black tabular opacity-60">
                        {num(i + 1)}
                      </span>
                      <Avatar icon={row.avatar} size={30} />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">
                        {row.username}
                      </span>
                      <span className="text-xs font-black tabular">
                        {boardKind === "time" ? fmtTime(row.value, num) : num(row.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
