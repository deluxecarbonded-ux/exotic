"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { useI18n, useToast, titleCaseEveryWord, localeDigits } from "@/components/providers";
import { useMpSession, mp, mpDb } from "@/lib/supabase";
import { useMpInventory } from "@/hooks/use-inventory";
import { gameError } from "@/lib/gameError";
import { useMpProfile } from "@/hooks/use-profiles";
import { Button, Card, Modal, Pill, Spinner, Empty } from "@/components/ui";
import { Avatar, DynIcon } from "@/components/icons";
import { Confetti } from "@/components/confetti";
import { LettersKeyboard, NumbersKeyboard, AnswerSlots } from "@/components/keyboard";
import { fetchQuestion, relocalizeQuestion } from "@/lib/ai";
import { CATEGORIES, type AIQuestion } from "@/lib/game";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound";
import {
  Crown,
  Swords,
  CheckCircle2,
  Circle,
  Copy,
  LogOut,
  Send,
  SmilePlus,
  Trophy,
  Skull,
  Handshake,
  Radio,
  Check,
  KeyRound,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { EmoteIcon } from "@/components/emote-icon";
import { LevelCompletionModal } from "@/components/level-completion-modal";

type Room = {
  id: string;
  code: string;
  host_id: string;
  status: "waiting" | "active" | "finished";
  difficulty: string;
  round_no: number;
  max_rounds: number;
  match_no: number;
  winner_id: string | null;
};

function RoomInner() {
  const { t, locale, num } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const code = String(params.code || "").toUpperCase();
  const { user, loading: authLoading } = useMpSession();
  const { profile } = useMpProfile(user?.id);
  const invMp = useMpInventory(user?.id);

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [round, setRound] = useState<any | null>(null);
  const [qState, setQState] = useState<{
    q: AIQuestion;
    roundId: number;
    len: number;
  } | null>(null);
  const [chat, setChat] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [emotes, setEmotes] = useState<any[]>([]);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [levelModalPosted, setLevelModalPosted] = useState(false);

  const roomIdRef = useRef<string>("");
  const creatingRef = useRef(false);
  const mpRoomRef = useRef<Room | null>(null);
  const iAmHost = !!room && !!user && room.host_id === user.id;
  const me = players.find((p) => p.player_id === user?.id);
  const iAmLocked =
    !!round &&
    !round.answered_by &&
    Array.isArray(round.wrong_by) &&
    !!user &&
    round.wrong_by.includes(user.id);

  /* ── loaders ── */
  const loadAll = useCallback(async (roomId: string, matchNo: number) => {
    const [{ data: ps }, { data: cs }] = await Promise.all([
      mpDb()
        .from("room_players" as any)
        .select("*, profiles!room_players_player_id_fkey(username, avatar, frame)")
        .eq("room_id", roomId)
        .order("joined_at"),
      mpDb()
        .from("chat" as any)
        .select("*")
        .eq("room_id", roomId)
        .order("created_at")
        .limit(80),
    ]);
    setPlayers(
      ((ps as any[]) || []).map((r: any) => {
        const { profiles, ...rest } = r;
        return { ...rest, ...(profiles || {}) };
      })
    );
    setChat((cs as any[]) || []);
  }, []);

  /* language switched (or a round parked in the host's language arrived) —
     re-render the SAME round question in this player's language; the parked
     answer never changes */
  const qSrcRef = useRef<{ text: string; lang: string } | null>(null);
  useEffect(() => {
    const cur = qState?.q?.question;
    if (!cur) return;
    const last = qSrcRef.current;
    if (last && last.text === cur && last.lang === locale) return;
    qSrcRef.current = { text: cur, lang: locale };
    if (/^[\d\s+\-\u2212\u00d7=,.\u2026?]+$/.test(cur)) return; /* digits-only */
    relocalizeQuestion(cur, locale).then((res) => {
      /* display-only in duels — the parked answer stays; every language's
         word for it is accepted via the server-side answer groups */
      if (res) setQState((s) => (s && s.q.question === cur ? { ...s, q: { ...s.q, question: res.text } } : s));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, qState?.q?.question]);

  const loadCurrentRound = useCallback(async (roomId: string, matchNo: number, roundNo: number) => {
    if (roundNo <= 0) {
      setRound(null);
      setQState(null);
      return;
    }
    const { data } = await mpDb()
      .from("rounds" as any)
      .select("*")
      .eq("room_id", roomId)
      .eq("match_no", matchNo)
      .eq("round_no", roundNo)
      .maybeSingle();
    if (data) {
      setRound(data);
      setQState({
        q: {
          question: data.prompt,
          /* correctness is verified server-side — the answer is
             intentionally never shipped to clients (it lives in mp.answers) */
          answer: "",
          kind: data.answer_kind === "number" ? "number" : "word",
          category: data.category,
          fun_fact: "",
          ai: true,
        },
        roundId: data.id,
        len: data.answer_len || 4,
      });
    }
  }, []);

  /* boot: find room by code */
  useEffect(() => {
    if (!user) {
      if (!authLoading) router.replace("/auth/mp");
      return;
    }
    (async () => {
      const { data } = await mpDb()
        .from("rooms" as any)
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (!data) {
        setNotFound(true);
        return;
      }
      const r = data as Room;
      setRoom(r);
      roomIdRef.current = r.id;
      loadAll(r.id, r.match_no);
      loadCurrentRound(r.id, r.match_no, r.round_no);
      mpDb()
        .from("inventory" as any)
        .select("item_id, shop_items!inventory_item_id_fkey(effect)")
        .eq("player_id", user.id)
        .then(({ data: inv }: any) => {
          setEmotes(
            ((inv as any[]) || [])
              .filter((r: any) => String(r.item_id).startsWith("emote-"))
              .map((r: any) => ({ item_id: r.item_id, effect: r.shop_items?.effect }))
          );
        });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, code]);

  /* realtime — every table, zero refresh */
  useEffect(() => {
    if (!room || !user) return;
    const rid = room.id;
    const ch = mp()
      .channel(`room-${rid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "mp", table: "rooms" as any, filter: `id=eq.${rid}` },
        async (payload: any) => {
          const r = payload.new as Room;
          if (payload.eventType === "DELETE") return;
          const prevStatus = room.status;
          setRoom(r);
          if (r.status === "active" && prevStatus !== "active") {
            sfx.phaserup();
            toast(t("mp.started"), "info");
          }
          if (r.status === "finished" && prevStatus !== "finished") {
            if (r.winner_id === user.id) {
              sfx.win();
              setConfetti(true);
            } else if (r.winner_id) {
              sfx.lose();
            }
          }
          loadAll(rid, r.match_no);
          loadCurrentRound(rid, r.match_no, r.round_no);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "mp", table: "room_players" as any, filter: `room_id=eq.${rid}` },
        (payload: any) => {
          loadAll(rid, (room.match_no as number) || 1);
          /* the moment an opponent steps in — welcome them (silent for us) */
          if (
            payload.eventType === "INSERT" &&
            (payload.new as any)?.player_id &&
            (payload.new as any).player_id !== user.id
          ) {
            sfx.join();
            mpDb()
              .from("profiles" as any)
              .select("username")
              .eq("id", (payload.new as any).player_id)
              .maybeSingle()
              .then(({ data }: any) => {
                toast(
                  t("mp.playerJoined", { name: data?.username || t("mp.duelist") }),
                  "info"
                );
              });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "mp", table: "rounds" as any, filter: `room_id=eq.${rid}` },
        () => {
          const cur = mpRoomRef.current;
          if (cur) loadCurrentRound(rid, cur.match_no, cur.round_no);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "mp", table: "chat" as any, filter: `room_id=eq.${rid}` },
        (payload: any) => {
          const c = payload.new as any;
          if (c.player_id !== user.id) {
            if (c.kind === "emote") sfx.emote();
            else sfx.chatIn();
          }
          setChat((list) => [...list.filter((x) => x.id !== c.id), c].slice(-80));
        }
      )
      .subscribe();
    return () => {
      mp().removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, user?.id]);

  useEffect(() => {
    mpRoomRef.current = room;
  }, [room]);

  /* match just finished → offer the level-completion share modal
     (the winner's mp.profiles.levels[difficulty] was bumped server-side) */
  const prevFinishedRef = useRef(false);
  useEffect(() => {
    if (!finished && room?.status !== "finished") {
      prevFinishedRef.current = false;
      return;
    }
    if (!prevFinishedRef.current && room?.status === "finished") {
      prevFinishedRef.current = true;
      if (room.winner_id) {
        /* only the two duelists get the modal — draw has no level to share */
        const isPlayer = players.some((p) => p.player_id === user?.id);
        if (isPlayer) {
          setLevelModalOpen(true);
        }
      }
    }
  }, [room?.status, room?.winner_id, players, user?.id]);

  /* ── host: generate the next round via Ollama and commit it server-side ── */
  useEffect(() => {
    if (!room || !iAmHost || room.status !== "active" || creatingRef.current) return;
    /* a round is done when someone answered it OR every player locked out */
    const allLocked =
      !!round &&
      !round.answered_by &&
      players.length > 0 &&
      players.every(
        (p) => Array.isArray(round.wrong_by) && round.wrong_by.includes(p.player_id)
      );
    const needNext =
      room.round_no < room.max_rounds &&
      (room.round_no === 0 || (round && (round.answered_by || allLocked)));
    if (!needNext) return;
    creatingRef.current = true;
    (async () => {
      try {
        const cat = CATEGORIES[room.round_no % CATEGORIES.length];
        const q = await fetchQuestion({
          category: cat,
          difficulty: room.difficulty,
          lang: locale,
        });
        const cur = mpRoomRef.current;
        if (!cur || cur.status !== "active") return;
        await mpDb().rpc("create_round", {
          p_room: cur.id,
          p_category: cat,
          p_prompt: q.question,
          p_kind: q.kind,
          p_answer: q.answer,
        });
      } finally {
        setTimeout(() => (creatingRef.current = false), 1200);
      }
    })();
  }, [room, iAmHost, round, locale, players]);

  /* host: rounds exhausted with no winner → draw (also when the last
     round dead-ends because everyone locked out) */
  useEffect(() => {
    if (!room || !iAmHost || room.status !== "active") return;
    const allLocked =
      !!round &&
      !round.answered_by &&
      players.length > 0 &&
      players.every(
        (p) => Array.isArray(round.wrong_by) && round.wrong_by.includes(p.player_id)
      );
    if (room.round_no >= room.max_rounds && round && (round.answered_by || allLocked)) {
      mpDb().rpc("end_match", { p_room: room.id }).then(() => {}, () => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.answered_by, round?.wrong_by, room?.status, room?.round_no, players]);

  /* ── actions ── */
  const toggleReady = async () => {
    sfx.click();
    await mpDb().rpc("set_ready", { p_room: room!.id, p_ready: !me?.ready });
  };

  const startDuel = async () => {
    const { error } = await mpDb().rpc("start_match", { p_room: room!.id });
    if (error) toast(gameError(error, t), "err");
  };

  const answer = async (value: string) => {
    if (!room || !qState) return false;
    const { data, error } = await mpDb().rpc("answer_round", {
      p_room: room.id,
      p_round: qState.roundId,
      p_answer: value,
    });
    if (error) return false;
    const r = data as any;
    if (r.correct) {
      setBanner(t("game.correct"));
      setTimeout(() => setBanner(null), 2200);
    }
    return !!r.correct;
  };

  /* Extra Guess: buy your way back into a round you got wrong */
  const unlockRound = async () => {
    if (!room) return;
    const { error } = await mpDb().rpc("use_item", {
      p_item: "guess-plus",
      p_room: room.id,
    });
    if (error) {
      toast(gameError(error, t), "err");
      return;
    }
    sfx.correct();
    setBanner(t("game.q.unlocked"));
    setTimeout(() => setBanner(null), 2200);
  };

  const sendChat = async (kind: "text" | "emote", body: string) => {
    if (!room || !body.trim()) return;
    await mpDb().rpc("send_chat", {
      p_room: room.id,
      p_kind: kind,
      p_body: body.trim().slice(0, 200),
    });
    if (kind === "emote") sfx.emote();
    else sfx.chat();
    setMsg("");
  };

  const leave = async () => {
    sfx.leave();
    if (room) await mpDb().rpc("leave_room", { p_room: room.id });
    router.replace("/multiplayer");
  };

  const rematch = async () => {
    const { error } = await mpDb().rpc("rematch", { p_room: room!.id });
    if (error) toast(gameError(error, t), "err");
    else {
      setConfetti(false);
      sfx.phaserup();
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    sfx.confirm2();
    toast(t("common.copied"), "info");
  };

  if (authLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <Spinner className="h-8 w-8" />
      </div>
    );

  if (notFound)
    return (
      <div className="min-h-screen bg-bg text-fg">
        <Navbar mpSignedIn={!!user} />
        <div className="grid min-h-[60vh] place-items-center px-4">
          <div className="text-center animate-fade-up">
            <div className="display text-3xl">{t("common.error")}</div>
            <Link href="/multiplayer" className="mt-6 inline-block">
              <Button>{t("common.back")}</Button>
            </Link>
          </div>
        </div>
      </div>
    );

  const opponent = players.find((p) => p.player_id !== user?.id);
  const finished = room?.status === "finished";
  const iWon = finished && room?.winner_id === user?.id;
  const draw = finished && !room?.winner_id;

  return (
    <div className="min-h-screen bg-bg pb-28 text-fg md:pb-12">
      <Navbar mpSignedIn={!!user} novas={profile?.novas} />
      {confetti && <Confetti />}

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        {/* top HUD */}
        <div className="mb-6 flex flex-wrap items-center gap-2 animate-fade-up">
          <button
            onClick={copyCode}
            className="press flex items-center gap-2 rounded-full bg-fg px-4 py-2 text-sm font-black tracking-[0.3em] text-bg"
          >
            {code} <Copy size={13} />
          </button>
          {room && (
            <Pill className="px-4 py-2">
              {t(`sp.${room.difficulty}`)} · {t("mp.round")} {num(room.round_no)}/{num(room.max_rounds)}
            </Pill>
          )}
          <Pill className="px-4 py-2">
            <Radio size={12} className="animate-pulse-soft" /> live
          </Pill>
          <button
            onClick={leave}
            className="press ms-auto flex items-center gap-1.5 rounded-full bg-soft px-4 py-2 text-xs font-bold text-mute"
          >
            <LogOut size={13} className="rtl:-scale-x-100" /> {t("mp.forfeit")}
          </button>
        </div>

        {/* scoreboard */}
        <div className="mb-6 grid animate-fade-up gap-3 sm:grid-cols-2">
          {[me, opponent].filter(Boolean).map((p: any) => (
            <div
              key={p.player_id}
              className={cn(
                "flex items-center gap-3 rounded-3xl px-5 py-3.5 shadow-soft",
                p.player_id === user?.id ? "bg-fg text-bg" : "bg-soft"
              )}
            >
              <Avatar icon={p.avatar} size={40} frame={p.frame} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black">
                  {p.username}{" "}
                  {p.player_id === user?.id && (
                    <span className="opacity-60">· {t("common.you")}</span>
                  )}
                  {room?.winner_id === p.player_id && (
                    <Crown size={13} className="ms-1 inline" />
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold opacity-70">
                  <Swords size={11} /> {t("mp.duelist")}
                </div>
              </div>
              <div className="text-end">
                <div className="display text-2xl tabular">{num(p.score)}</div>
              </div>
            </div>
          ))}
          {!opponent && room?.status === "waiting" && (
            <div className="grid place-items-center rounded-3xl bg-soft px-5 py-3.5 shadow-soft">
              <span className="flex animate-pulse-soft items-center gap-2 text-sm font-bold text-mute">
                <Radio size={14} /> {t("mp.needTwo")}
              </span>
            </div>
          )}
        </div>

        {/* waiting phase */}
        {room?.status === "waiting" && (
          <Card className="animate-fade-up text-center">
            <Swords size={30} className="mx-auto mb-3" />
            <div className="display text-2xl">{t("mp.title")}</div>
            <p className="mt-1 text-sm font-semibold text-mute">{t("mp.sub")}</p>
            <div className="mt-6 flex justify-center gap-3">
              {players.map((p: any) => (
                <div key={p.player_id} className="flex flex-col items-center gap-2">
                  <Avatar icon={p.avatar} size={56} frame={p.frame} />
                  <span className="max-w-[110px] truncate text-xs font-bold">{p.username}</span>
                  <Pill solid={p.ready} className={!p.ready ? "opacity-50" : ""}>
                    {p.ready ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <Circle size={12} />
                    )}
                    {p.ready ? t("common.ready") : t("common.waiting")}
                  </Pill>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-col items-center gap-3">
              {iAmHost ? (
                <Button size="xl" disabled={players.length < 2} onClick={startDuel}>
                  <Swords size={19} /> {t("mp.start")}
                </Button>
              ) : (
                <Button size="xl" variant={me?.ready ? "soft" : "primary"} onClick={toggleReady}>
                  {me?.ready ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  {t("common.ready")}
                </Button>
              )}
              {iAmHost && players.length < 2 && (
                <span className="animate-pulse-soft text-xs font-bold text-mute">
                  {t("mp.needTwo")}
                </span>
              )}
            </div>
          </Card>
        )}

        {/* active phase — the race */}
        {room?.status === "active" && (
          <div className="flex flex-col gap-6">
              {qState && round && !round.answered_by ? (
                <div
                  key={`${qState.roundId}-${iAmLocked ? "locked" : "open"}`}
                  className="animate-fade-up"
                >
                  <LocalQuestion q={qState.q} len={qState.len} locked={iAmLocked} onAnswer={answer} />
                  {(invMp["guess-plus"] || 0) > 0 && (
                    <button
                      onClick={unlockRound}
                      disabled={!iAmLocked}
                      className="press mx-auto mt-4 flex items-center justify-center gap-2 rounded-full bg-soft2 px-5 py-2.5 text-xs font-bold text-fg disabled:opacity-40"
                    >
                      <KeyRound size={13} /> {t("mp_items.guess-plus.n", undefined, "Extra Guess")} ×{num(invMp["guess-plus"] || 0)}
                    </button>
                  )}
                </div>
              ) : qState && round && round.answered_by ? (
                <Card className="animate-fade-up text-center">
                  <CheckCircle2 size={26} className="mx-auto mb-2 text-mute" />
                  <p className="text-sm font-bold text-mute">
                    {players.find((p) => p.player_id === round.answered_by)?.username}{" "}
                    · {t("game.correct")}
                  </p>
                  {iAmHost && (
                    <p className="mt-2 animate-pulse-soft text-xs font-bold text-mute">
                      {t("mp.round")} {num(room.round_no + 1)}…
                    </p>
                  )}
                </Card>
              ) : (
                <Card className="grid min-h-[220px] animate-pulse-soft place-items-center">
                  <div className="flex flex-col items-center gap-2 text-mute">
                    <Sparkles size={20} />
                    <span className="text-sm font-bold">{t("game.thinking")}</span>
                  </div>
                </Card>
              )}
          </div>
        )}

        {/* finished phase */}
        {finished && (
          <Card className="animate-pop text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-fg text-bg">
              {draw ? <Handshake size={27} /> : iWon ? <Trophy size={27} /> : <Skull size={27} />}
            </div>
            <div className="display text-3xl">
              {draw ? t("mp.draw") : iWon ? t("game.win") : t("mp.youLose")}
            </div>
            <p className="mt-1 text-sm font-bold text-mute">
              {draw ? t("mp.drawSub") : iWon ? t("mp.youWin") : t("mp.youLose")}
            </p>
            {room?.winner_id && opponent && (
              <div className="mt-5 flex justify-center">
                <div className="flex items-center gap-3 rounded-full bg-soft px-6 py-3">
                  <Crown size={16} />
                  <Avatar
                    icon={(iWon ? me : opponent)?.avatar}
                    size={34}
                    frame={(iWon ? me : opponent)?.frame}
                  />
                  <span className="text-sm font-black">
                    {(iWon ? me : opponent)?.username} · {t("mp.winner")}
                  </span>
                </div>
              </div>
            )}
            <div className="mt-7 flex justify-center gap-3">
              {!draw && iWon && !levelModalPosted && (
                <Button
                  variant="soft"
                  size="lg"
                  onClick={() => setLevelModalOpen(true)}
                >
                  <Trophy size={16} /> {t("levelCompletion.cta")}
                </Button>
              )}
              <Link href="/multiplayer">
                <Button variant="soft" size="lg">
                  {t("game.hub")}
                </Button>
              </Link>
              {iAmHost && opponent && (
                <Button size="lg" onClick={rematch}>
                  <RotateCcw size={17} /> {t("mp.rematch")}
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* chat */}
        {room && (
          <Card className="mt-6 animate-fade-up">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-mute">
                {t("mp.chat")}
              </span>
              <button
                onClick={() => setEmoteOpen((v) => !v)}
                className="press grid h-9 w-9 place-items-center rounded-full bg-soft2"
                aria-label={t("a11y.emotes")}
              >
                <SmilePlus size={16} />
              </button>
            </div>

            {emoteOpen && (
              <div className="mb-3 flex flex-wrap gap-2 animate-fade-up">
                {emotes.length === 0 ? (
                  <span className="text-xs font-bold text-mute">{t("common.empty")}</span>
                ) : (
                  emotes.map((e: any) => (
                    <button
                      key={e.item_id}
                      onClick={() => sendChat("emote", e.effect?.char || "✦")}
                      className="press grid h-11 w-11 place-items-center rounded-2xl bg-soft2 text-xl"
                    >
                      <EmoteIcon char={e.effect?.char} size={22} />
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="mb-3 flex max-h-52 flex-col gap-1.5 overflow-y-auto no-scrollbar">
              {chat.length === 0 ? (
                <Empty>{t("common.empty")}</Empty>
              ) : (
                chat.map((c: any) => {
                  const mine = c.player_id === user?.id;
                  const who = players.find((p) => p.player_id === c.player_id);
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "flex animate-pop",
                        mine ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2",
                          mine ? "bg-fg text-bg" : "bg-soft2"
                        )}
                      >
                        {c.kind === "emote" ? (
                          <EmoteIcon char={c.body} size={26} className="animate-pop" />
                        ) : (
                          <>
                            {!mine && (
                              <div className="text-[10px] font-black opacity-60">
                                {who?.username}
                              </div>
                            )}
                            <div className="text-sm font-bold">{c.body}</div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat("text", msg)}
                placeholder={t("mp.msgPh")}
                maxLength={200}
                className="w-full rounded-2xl bg-soft2 px-5 py-3 text-base font-semibold placeholder:text-mute md:text-sm"
              />
              <Button onClick={() => sendChat("text", msg)} disabled={!msg.trim()}>
                <Send size={15} className="rtl:-scale-x-100" />
              </Button>
            </div>
          </Card>
        )}
      </main>

      {/* live banner */}
      {banner && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-[60] flex justify-center">
          <div className="animate-pop rounded-full bg-fg px-6 py-3 text-sm font-black text-bg shadow-pop">
            {banner}
          </div>
        </div>
      )}

      {/* level-completion share modal (MP) */}
      {room && (
        <LevelCompletionModal
          open={levelModalOpen && finished}
          onClose={() => {
            setLevelModalOpen(false);
            setLevelModalPosted(true);
          }}
          mode="mp"
          difficulty={room.difficulty}
          level={Math.min(30, (profile?.levels?.[room.difficulty] as number) || 1)}
          playerId={user?.id || ""}
          playerName={profile?.username || "Player"}
          playerAvatar={profile?.avatar || "sparkles"}
          playerFrame={profile?.frame}
        />
      )}
    </div>
  );
}

/* Local typed-answer renderer for duel rounds — the player types on
   the letters or numbers keyboard; correctness is verified server-side
   (one wrong answer locks you out of the round, exactly like before). */
function LocalQuestion({
  q,
  len,
  locked,
  onAnswer,
}: {
  q: AIQuestion;
  len: number;
  locked: boolean;
  onAnswer: (value: string) => Promise<boolean>;
}) {
  const { t, locale, num } = useI18n();
  const [value, setValue] = useState("");
  const [state, setState] = useState<"typing" | "sent" | "wrong" | "correct">("typing");
  const maxLen = q.kind === "number" ? Math.max(len, 1) : 16;

  const submit = async () => {
    if (locked || state !== "typing" || value.trim().length < 1) return;
    setState("sent");
    const ok = await onAnswer(value);
    setState(ok ? "correct" : value.length ? "wrong" : "typing");
    if (ok) sfx.correct();
    else if (state === "typing") sfx.wrong();
  };

  const disabled = locked || state === "sent" || state === "correct" || state === "wrong";

  return (
    <div className="rounded-[2rem] bg-soft p-6 shadow-soft md:p-7">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill solid>
          <Swords size={12} />
          {t(`game.q.${q.category}`) !== `game.q.${q.category}`
            ? t(`game.q.${q.category}`)
            : q.category}
        </Pill>
        <Pill className="text-mute">
          {q.kind === "number" ? t("game.q.number") : t("game.q.word")}
        </Pill>
        <Pill className="text-mute">{t("game.q.oneShot")}</Pill>
      </div>
      <p className="display mb-5 text-lg leading-snug md:text-xl">
        {localeDigits(titleCaseEveryWord(q.question, locale), locale)}
      </p>

      <div className="mx-auto max-w-sm">
        <AnswerSlots
          value={value}
          length={q.kind === "number" ? maxLen : undefined}
          rtl={q.kind === "word" && locale === "ar"}
          shake={state === "wrong"}
          good={state === "correct"}
          digitLocale={q.kind === "number" ? locale : undefined}
        />

        {state === "correct" ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-fg px-4 py-3 text-sm font-black text-bg animate-pop">
            <Check size={16} /> {t("game.q.correct")}
          </div>
        ) : state === "wrong" || locked ? (
          <div className="rounded-2xl bg-soft2 px-4 py-3 text-center text-sm font-black text-mute">
            {t("game.q.lockedOut")}
          </div>
        ) : q.kind === "number" ? (
          <NumbersKeyboard
            disabled={disabled}
            enterEnabled={value.length > 0}
            onDigit={(d) => {
              if (state === "typing")
                setValue((v) => (v.length < maxLen ? v + String(d) : v));
            }}
            onBackspace={() => value.length && setValue((v) => v.slice(0, -1))}
            onEnter={submit}
          />
        ) : (
          <LettersKeyboard
            disabled={disabled}
            enterEnabled={value.trim().length >= 2}
            maxLength={16}
            onChar={(c) => {
              if (state === "typing")
                setValue((v) => (v.length < 16 ? v + c : v));
            }}
            onBackspace={() => value.length && setValue((v) => v.slice(0, -1))}
            onEnter={submit}
          />
        )}
      </div>
    </div>
  );
}

export default function MpRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-bg">
          <Spinner className="h-8 w-8" />
        </div>
      }
    >
      <RoomInner />
    </Suspense>
  );
}
