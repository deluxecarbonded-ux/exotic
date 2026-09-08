"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { useI18n, useToast } from "@/components/providers";
import { useMpSession, mp, mpDb } from "@/lib/supabase";
import { useMpProfile } from "@/hooks/use-profiles";
import { Button, Card, Input, Pill, SectionTitle, Stat, Spinner, Empty } from "@/components/ui";
import { Avatar } from "@/components/icons";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound";
import { gameError } from "@/lib/gameError";
import {
  Plus,
  LogIn,
  Zap,
  Crown,
  Swords,
  DoorOpen,
  Radio,
  Trophy,
  Flame,
  Target,
} from "lucide-react";
import { DIFFICULTIES, type Difficulty } from "@/lib/game";

export default function MpLobby() {
  const { t, num } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const { user, loading: authLoading } = useMpSession();
  const { profile, loading: profileLoading } = useMpProfile(user?.id);
  const [code, setCode] = useState("");
  const [diff, setDiff] = useState<Difficulty>("easy");
  const [rooms, setRooms] = useState<any[]>([]);
  const [myRoom, setMyRoom] = useState<any | null>(null);
  const [board, setBoard] = useState<any[]>([]);
  const [boardKind, setBoardKind] = useState<"rank" | "wins" | "novas" | "streak" | "level">("rank");
  const [busy, setBusy] = useState(false);

  const loadRooms = useCallback(async () => {
    const { data } = await mpDb()
      .from("rooms" as any)
      .select("id, code, difficulty, created_at, host_id")
      .eq("status", "waiting")
      .order("created_at", { ascending: false })
      .limit(12);
    setRooms((data as any[]) || []);
  }, []);

  useEffect(() => {
    if (!user) {
      if (!authLoading) router.replace("/auth/mp");
      return;
    }
    if (!profileLoading && !profile) {
      /* account exists but no multiplayer profile — the player must
         register for this mode manually */
      router.replace("/auth/mp");
      return;
    }
    loadRooms();
    mpDb().rpc("my_room").then(({ data }: any) => setMyRoom((data as any) || null));
    mpDb().rpc("check_achs").then(() => {}, () => {});

    /* realtime lobby — rooms appear/disappear live */
    const ch = mp()
      .channel("mp-lobby")
      .on(
        "postgres_changes",
        { event: "*", schema: "mp", table: "rooms" as any },
        () => loadRooms()
      )
      .subscribe();
    return () => {
      mp().removeChannel(ch);
    };
  }, [user, authLoading, profile, profileLoading, router, loadRooms]);

  /* live leaderboard — any duel-profile change refetches the board */
  const loadBoard = useCallback(async () => {
    const { data } = await mpDb().rpc("leaderboard", { p_kind: boardKind });
    setBoard((data as any[]) || []);
  }, [boardKind]);
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);
  useEffect(() => {
    const ch = mp()
      .channel("mp-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "mp", table: "profiles" },
        () => loadBoard()
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [loadBoard]);

  const createRoom = async () => {
    setBusy(true);
    const { data, error } = await mpDb().rpc("create_room", {
      p_difficulty: diff,
    });
    setBusy(false);
    if (error) {
      toast(gameError(error, t), "err");
      return;
    }
    sfx.join();
    router.push(`/multiplayer/room/${(data as any).code}`);
  };

  const joinByCode = async (joinCode: string) => {
    const c = joinCode.trim().toUpperCase();
    if (c.length < 4) return;
    setBusy(true);
    const { data, error } = await mpDb().rpc("join_room", { p_code: c });
    setBusy(false);
    if (error) {
      toast(gameError(error, t), "err");
      return;
    }
    sfx.join();
    router.push(`/multiplayer/room/${c}`);
  };

  const quickMatch = async () => {
    sfx.shuffle();
    if (rooms.length > 0) {
      await joinByCode(rooms[0].code);
    } else {
      await createRoom();
    }
  };

  if (authLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <Spinner className="h-8 w-8" />
      </div>
    );

  return (
    <div className="min-h-screen bg-bg pb-28 text-fg md:pb-12">
      <Navbar mpSignedIn={!!user} novas={profile?.novas} />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {/* hero */}
        <div className="mb-8 flex animate-fade-up flex-wrap items-center gap-4">
          <Avatar icon={profile?.avatar} size={56} frame={profile?.frame} />
          <div>
            <h1 className="display text-2xl md:text-3xl">{t("mp.title")}</h1>
            <p className="text-sm font-semibold text-mute">{t("mp.sub")}</p>
          </div>
          {profile && (
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <Pill solid className="px-4 py-2 text-sm tabular">
                ◆ {num(profile.novas)}
              </Pill>
              <Pill className="px-4 py-2 text-sm tabular">
                <Target size={13} /> {num(profile.rank_points)} {t("mp.points")}
              </Pill>
            </div>
          )}
        </div>

        {/* rejoin banner */}
        {myRoom && (
          <button
            onClick={() => router.push(`/multiplayer/room/${myRoom.code}`)}
            className="press mb-6 flex w-full animate-fade-up items-center gap-3 rounded-3xl bg-fg px-6 py-4 text-start text-bg shadow-pop"
          >
            <Radio size={19} className="animate-pulse-soft" />
            <span className="font-bold">{t("mp.rejoin")}</span>
            <span className="ms-auto rounded-full bg-bg px-3 py-1 text-xs font-black tracking-widest text-fg">
              {myRoom.code}
            </span>
          </button>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-6">
            {/* create / join */}
            <Card className="animate-fade-up">
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <Swords size={18} /> {t("mp.create")}
                </span>
              </SectionTitle>
              <div className="mb-4 grid grid-cols-3 gap-2.5">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      sfx.click();
                      setDiff(d);
                    }}
                    className={cn(
                      "press rounded-2xl px-3 py-3 text-sm font-bold",
                      diff === d ? "bg-btn text-btnfg" : "bg-soft2 text-fg"
                    )}
                  >
                    {t(`sp.${d}`)}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="flex-1" onClick={createRoom} disabled={busy}>
                  {busy ? <Spinner className="text-btnfg" /> : <Plus size={17} />}
                  {t("mp.create")}
                </Button>
                <Button
                  size="lg"
                  variant="soft"
                  className="flex-1"
                  onClick={quickMatch}
                  disabled={busy}
                >
                  <Zap size={17} /> {t("mp.quick")}
                </Button>
              </div>
              <div className="mt-4 flex gap-2">
                <Input
                  value={code}
                  onChange={(v) => setCode(v.toUpperCase())}
                  placeholder={t("mp.enterCode")}
                  maxLength={5}
                  className="bg-soft2 uppercase tracking-[0.35em]"
                  onEnter={() => joinByCode(code)}
                />
                <Button onClick={() => joinByCode(code)} disabled={busy}>
                  <LogIn size={16} className="rtl:-scale-x-100" /> {t("mp.join").split(" ")[0]}
                </Button>
              </div>
            </Card>

            {/* open rooms */}
            <Card className="animate-fade-up">
              <SectionTitle
                right={
                  <span className="flex items-center gap-1.5 text-xs font-bold text-mute">
                    <Radio size={13} className="animate-pulse-soft" /> live
                  </span>
                }
              >
                <span className="flex items-center gap-2">
                  <DoorOpen size={18} /> {t("mp.openRooms")}
                </span>
              </SectionTitle>
              {rooms.length === 0 ? (
                <Empty>{t("mp.noRooms")}</Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {rooms.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => joinByCode(r.code)}
                      className="press flex animate-pop items-center gap-3 rounded-2xl bg-soft2 px-4 py-3 text-start"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-fg text-xs font-black text-bg">
                        {t(`sp.${r.difficulty}`).slice(0, 2).toUpperCase()}
                      </span>
                      <span className="flex-1 text-sm font-black tracking-[0.3em]">
                        {r.code}
                      </span>
                      <span className="text-xs font-bold text-mute">
                        {t("mp.players")} 1/2
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            {profile && (
              <div className="grid animate-fade-up grid-cols-2 gap-3">
                <Stat label={t("common.wins")} value={num(profile.wins)} icon={<Trophy size={13} />} />
                <Stat label={t("common.losses")} value={num(profile.losses)} icon={<Swords size={13} />} />
                <Stat label={t("common.streak")} value={num(profile.streak)} icon={<Flame size={13} />} />
                <Stat label={t("common.level")} value={num(profile.level)} icon={<Crown size={13} />} />
              </div>
            )}

            <Card className="animate-fade-up">
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <Crown size={17} /> {t("mp.board")}
                </span>
              </SectionTitle>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ["rank", "lb.rank"],
                    ["wins", "lb.wins"],
                    ["novas", "lb.novas"],
                    ["streak", "lb.streak"],
                    ["level", "lb.level"],
                  ] as const
                ).map(([k, key]) => (
                  <button
                    key={k}
                    onClick={() => {
                      sfx.click();
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
                      <span className="w-5 text-xs font-black tabular opacity-60">{i + 1}</span>
                      <Avatar icon={row.avatar} size={30} frame={row.frame} />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">
                        {row.username}
                      </span>
                      <span className="text-xs font-black tabular">
                        {num(row.value)}
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
