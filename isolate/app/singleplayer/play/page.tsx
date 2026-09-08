"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { useI18n, useToast, titleCaseEveryWord, localeDigits } from "@/components/providers";
import { useSpSession, sp, spDb } from "@/lib/supabase";
import { Button, Card, Modal, Spinner, Pill } from "@/components/ui";
import { QuestionCard } from "@/components/question";
import { Confetti } from "@/components/confetti";
import { fetchQuestion, fetchOracleHint, relocalizeQuestion } from "@/lib/ai";
import { categoryForLevel, clueText, type AIQuestion, type Clue, type Difficulty } from "@/lib/game";
import { sfx } from "@/lib/sound";
import { gameError } from "@/lib/gameError";
import {
  Lightbulb,
  Sparkles,
  Trophy,
  Skull,
  Zap,
  Flag,
  PartyPopper,
  Layers,
  SkipForward,
  Crosshair,
  Play,
  RotateCcw,
  Eye,
} from "lucide-react";
import { LockOpen } from "lucide-react";
import { LevelCompletionModal } from "@/components/level-completion-modal";

type GameMeta = {
  id: string;
  time_limit: number;
  level?: number;
};

/* ── solo level = exactly ONE riddle / logic / math / trivia question.
     The answer is typed on the letters or numbers keyboard and verified
     server-side; unlimited tries — take all the time you need.
     Completing the level clears it and unlocks the next one. ── */
function PlayInner() {
  const { t, locale, num, aiQuestions } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useSpSession();

  const [game, setGame] = useState<GameMeta | null>(null);
  const [q, setQ] = useState<AIQuestion | null>(null);
  const [answerLen, setAnswerLen] = useState(4);
  const [qLoading, setQLoading] = useState(false);
  const [hints, setHints] = useState<Clue[]>([]); /* Digit Lens / Deep Lens reveals */
  const [result, setResult] = useState<any | null>(null); // win/lose payload
  const [outcome, setOutcome] = useState<"playing" | "won" | "lost">("playing");
  const [oracleOpen, setOracleOpen] = useState(false);
  const [oracleText, setOracleText] = useState("");
  const [oracleBusy, setOracleBusy] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [items, setItems] = useState<Record<string, number>>({});
  const [showConfetti, setShowConfetti] = useState(false);
  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [levelModalDiff, setLevelModalDiff] = useState<string>("easy");
  const [levelModalLevel, setLevelModalLevel] = useState(1);
  const [levelModalPosted, setLevelModalPosted] = useState(false);
  const [profile, setProfile] = useState<any | null>(null);

  const overRef = useRef(false);
  const qTriesRef = useRef(0);

  const loadItems = useCallback(async (uid: string) => {
    const { data } = await spDb()
      .from("inventory" as any)
      .select("item_id, qty")
      .eq("player_id", uid);
    const map: Record<string, number> = {};
    (data as any[] | null)?.forEach((r: any) => (map[r.item_id] = r.qty));
    setItems(map);
  }, []);

  /* fetch the level's single question and park the answer server-side —
     it never stays on the client */
  const loadQuestion = useCallback(async () => {
    if (!game) return;
    setQLoading(true);
    const diff = (params.get("d") as Difficulty) || "easy";
    const lvl = Number(params.get("lvl")) || 1;
    const cat = categoryForLevel(lvl);
    try {
      const question = await fetchQuestion({
        category: cat,
        difficulty: diff,
        lang: locale,
        level: lvl,
        ai: aiQuestions,
      });
      const { data, error } = await spDb().rpc("set_question", {
        p_game: game.id,
        p_prompt: question.question,
        p_answer: question.answer,
        p_kind: question.kind,
        p_category: question.category || cat,
      });
      if (error) throw new Error("park-failed");
      qTriesRef.current = 0;
      if (!overRef.current) {
        setAnswerLen(
          (data as any)?.answer_len ||
            (question.kind === "number" ? question.answer.length : 16)
        );
        sfx.question();
        setQ({ ...question, answer: "" }); /* scrub the answer */
        setHints([]);
      }
    } catch {
      /* the route falls back deterministically; a network blip retries */
      qTriesRef.current += 1;
      if (!overRef.current) {
        if (qTriesRef.current < 3) setTimeout(() => loadQuestion(), 1800);
        else toast(t("common.error"), "err");
      }
    } finally {
      setQLoading(false);
    }
  }, [game, locale, params, toast, t, aiQuestions]);

  /* boot: create the game server-side (levels + locks live there) */
  useEffect(() => {
    if (!user) {
      if (!authLoading) router.replace("/auth/sp");
      return;
    }
    loadItems(user.id);
    const diff = (params.get("d") as Difficulty) || "easy";
    const dbl = params.get("double") === "1";
    const lvl = Number(params.get("lvl")) || 1;
    (async () => {
      const { data, error } = await spDb().rpc("start_game", {
        p_difficulty: diff,
        p_double: dbl,
        p_level: lvl,
      });
      if (error || !data) {
        toast(gameError(error, t) || t("common.error"), "err");
        router.replace("/singleplayer");
        return;
      }
      const meta = data as GameMeta;
      setGame(meta);
      /* fetch the question once the game id is in state */
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* track the difficulty for the level-completion modal */
  useEffect(() => {
    setLevelModalDiff((params.get("d") as Difficulty) || "easy");
  }, [params]);

  /* profile for the level-completion modal (name + avatar) — live via realtime */
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await spDb()
        .from("profiles" as any)
        .select("username, avatar")
        .eq("id", user.id)
        .maybeSingle();
      if (data) setProfile(data);
    };
    load();
    const ch = sp()
      .channel(`sp-play-profile-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "sp", table: "profiles" as any, filter: `id=eq.${user.id}` },
        load
      )
      .subscribe();
    return () => {
      sp().removeChannel(ch);
    };
  }, [user?.id]);

  useEffect(() => {
    if (game && !q && !qLoading) loadQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  /* language switched mid-level — re-render the SAME question in the new
     language; the parked answer (and any clues) stay exactly as they were */
  const qSrcRef = useRef<{ text: string; lang: string } | null>(null);
  useEffect(() => {
    const cur = q?.question;
    if (!cur || outcome !== "playing") return;
    const last = qSrcRef.current;
    if (last && last.text === cur && last.lang === locale) return;
    qSrcRef.current = { text: cur, lang: locale };
    if (/^[\d\s+\-\u2212\u00d7=,.\u2026?]+$/.test(cur)) return; /* digits-only */
    relocalizeQuestion(cur, locale).then(async (res) => {
      if (!res) return;
      if (res.answer && game && q?.kind) {
        /* the answer exists in the new language — repark it server-side so
           the parked answer matches the language the player is reading
           (answer length + slots update; old language stays valid via
           the answer-groups check) */
        const { data } = await spDb().rpc("set_question", {
          p_game: game.id,
          p_prompt: res.text,
          p_answer: res.answer,
          p_kind: q.kind === "number" ? "number" : "word",
        });
        setQ((c) => (c && c.question === cur ? { ...c, question: res.text } : c));
        const alen = (data as any)?.answer_len;
        if (alen) setAnswerLen(alen);
        setHints([]);
      } else {
        setQ((c) => (c && c.question === cur ? { ...c, question: res.text } : c));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, q?.question, q?.kind, outcome]);

  /* the level's one answer, verified server-side */
  const submitAnswer = async (value: string): Promise<boolean> => {
    if (!game) return false;
    sfx.pop();
    const { data, error } = await spDb().rpc("submit_answer", {
      p_game: game.id,
      p_answer: value,
    });
    if (error) {
      toast(gameError(error, t), "err");
      return false;
    }
    const r = data as any;
    if (!r?.win) return false;
    if (r.level_up) setTimeout(() => sfx.levelup(), 900); /* stacks after the win sting */
    setResult(r);
    return true;
  };

  const onSolved = () => {
    overRef.current = true;
    sfx.win();
    setShowConfetti(true);
    setOutcome("won");
  };

  const useItem = async (itemId: string) => {
    if (!game) return;
    if ((items[itemId] || 0) <= 0) return;
    const { data, error } = await spDb().rpc("use_item", {
      p_item: itemId,
      p_game: game.id,
    });
    if (error) {
      toast(gameError(error, t), "err");
      return;
    }
    const r = data as any;
    setItems((m) => ({ ...m, [itemId]: Math.max(0, (m[itemId] || 0) - 1) }));
    if (itemId === "reveal") sfx.reveal();
    else if (itemId === "reveal2") sfx.deepReveal();
    else if (itemId === "skip") sfx.skip();
    else if (itemId === "oracle") sfx.oracle();
    if (itemId === "reveal" && r?.clue) {
      setHints((h) => [...h, r.clue]);
      toast(localeDigits(clueText(r.clue, t), locale), "info");
      sfx.correct();
    } else if (itemId === "reveal2" && r?.clue) {
      const two: Clue[] = [r.clue, r.clue2].filter(Boolean);
      setHints((h) => [...h, ...two]);
      toast(localeDigits(two.map((c) => clueText(c, t)).join("  ·  "), locale), "info");
      sfx.correct();
    } else if (itemId === "skip") {
      sfx.pop();
      loadQuestion();
    } else if (itemId === "oracle") {
      setOracleOpen(true);
      setOracleBusy(true);
      const hint = q
        ? await fetchOracleHint(q.question, q.kind, answerLen, locale)
        : "";
      setOracleText(hint);
      setOracleBusy(false);
      sfx.pop();
    }
  };

  const abandon = async () => {
    if (!game) return;
    overRef.current = true;
    sfx.leave();
    await spDb().rpc("abandon_game", { p_game: game.id });
    router.replace("/singleplayer");
    toast(t("game.abandoned"), "info");
  };

  const itemDefs = [
    { id: "reveal", icon: Eye, label: t("game.revealDigit") },
    { id: "reveal2", icon: Crosshair, label: t("game.deepReveal") },
    { id: "skip", icon: SkipForward, label: t("game.skipQ") },
    { id: "oracle", icon: Sparkles, label: t("game.oracle") },
  ];

  return (
    <div className="min-h-screen bg-bg pb-28 text-fg md:pb-12">
      <Navbar spSignedIn={!!user} />
      {showConfetti && <Confetti />}

      <main className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        {/* HUD */}
        <div className="mb-6 flex flex-wrap items-center gap-2 animate-fade-up">
          <Pill className="px-4 py-2 text-sm">
            <Layers size={14} /> {t("sp.levelN", { n: Number(params.get("lvl")) || 1 })}
          </Pill>
          <button
            onClick={() => setAbandonOpen(true)}
            className="press ms-auto flex items-center gap-1.5 rounded-full bg-soft px-4 py-2 text-xs font-bold text-mute"
          >
            <Flag size={13} /> {t("game.abandon").replace("?", "")}
          </button>
        </div>

        {/* gear bar + passive Spare Key */}
        <div className="mb-6 flex flex-wrap gap-2 animate-fade-up">
          {itemDefs.map((it) => {
            const count = items[it.id] || 0;
            return (
              <button
                key={it.id}
                disabled={count <= 0 || outcome !== "playing"}
                onClick={() => useItem(it.id)}
                className="press flex items-center gap-2 rounded-full bg-soft px-4 py-2 text-xs font-bold text-fg disabled:opacity-40"
              >
                <it.icon size={14} className={it.id === "skip" ? "rtl:-scale-x-100" : undefined} />
                {it.label}
                <span className="rounded-full bg-soft2 px-2 py-0.5 tabular">{count}</span>
              </button>
            );
          })}
        </div>

        {/* revealed characters */}
        {hints.length > 0 && (
          <Card className="mb-6 animate-pop">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-mute">
              <Lightbulb size={13} /> {t("game.hints")}
            </div>
            <div className="flex flex-wrap gap-2">
              {hints.map((c, i) => (
                <span
                  key={i}
                  className="animate-pop rounded-full bg-soft2 px-4 py-2 text-sm font-bold"
                >
                  {localeDigits(clueText(c, t), locale)}
                </span>
              ))}
            </div>
          </Card>
        )}

        {!game || qLoading || !q ? (
          <Card className="grid min-h-[240px] animate-pulse-soft place-items-center">
            <div className="flex flex-col items-center gap-3 text-mute">
              <Sparkles size={22} />
              <span className="text-sm font-bold">{t("game.thinking")}</span>
            </div>
          </Card>
        ) : (
          <div className="animate-fade-up" key={q.question}>
            <QuestionCard
              q={q}
              answerLen={answerLen}
              locked={outcome !== "playing"}
              onCheck={submitAnswer}
              onSolved={onSolved}
            />
          </div>
        )}
      </main>

      {/* oracle modal */}
      <Modal open={oracleOpen} onClose={() => setOracleOpen(false)}>
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-fg text-bg">
            <Sparkles size={24} />
          </div>
          <div className="display text-xl">{t("game.oracle")}</div>
          <p className="mt-4 min-h-[3.5rem] text-sm font-semibold leading-relaxed text-mute">
            {oracleBusy
              ? "…"
              : oracleText
                ? titleCaseEveryWord(oracleText, locale)
                : t("game.oracleEmpty")}
          </p>
        </div>
      </Modal>

      {/* abandon confirm */}
      <Modal open={abandonOpen} onClose={() => setAbandonOpen(false)}>
        <div className="text-center">
          <div className="display text-xl">{t("game.abandon")}</div>
          <p className="mt-2 text-sm font-semibold text-mute">{t("game.abandonQ")}</p>
          <div className="mt-6 flex gap-3">
            <Button variant="soft" className="flex-1" onClick={() => setAbandonOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="flex-1" onClick={abandon}>
              {t("common.confirm")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* win / lose */}
      <Modal open={outcome !== "playing"} locked>
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-fg text-bg">
            {outcome === "won" ? <Trophy size={28} /> : <Skull size={28} />}
          </div>
          <div className="display text-3xl">
            {outcome === "won" ? t("game.win") : t("game.lose")}
          </div>
          <p className="mt-1 text-sm font-bold text-mute">
            {outcome === "won" ? t("game.winSub") : result?.timeout ? t("game.timeout") : t("game.loseSub")}
          </p>
          {outcome === "won" && result?.next_level ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-soft2 px-4 py-2.5 text-sm font-black animate-pop">
              <LockOpen size={16} strokeWidth={2.6} className="icon-pop" aria-hidden />
              {t("sp.unlocked", { n: result.next_level })}
            </p>
          ) : null}

          {outcome === "lost" && result?.answer && (
            <div className="mt-5">
              <div className="text-[11px] font-bold uppercase tracking-widest text-mute">
                {t("game.theAnswer")}
              </div>
              <div className="mt-2 inline-block rounded-2xl bg-soft px-6 py-3 text-lg font-black tracking-[0.25em]">
                {localeDigits(result.answer, locale)}
              </div>
            </div>
          )}

          {outcome === "won" && result && (
            <div className="mt-5 flex flex-col items-center gap-2">
              <Pill solid className="px-5 py-2 text-base">
                <Zap size={15} /> +{num(result.reward)} ✦ {t("sp.sparks")}
              </Pill>
              <Pill className="px-4 py-1.5">
                +{num(result.xp_earned)} XP · {t("common.level")} {num(result.level)}
              </Pill>
              {result.level_up && (
                <div className="animate-pop text-sm font-black uppercase tracking-[0.3em]">
                  <PartyPopper size={14} className="me-1 inline" />
                  {t("game.levelUp")}
                </div>
              )}
              {Array.isArray(result.new_achievements) &&
                result.new_achievements.length > 0 && (
                  <div className="mt-2 text-xs font-bold text-mute">
                    {t("game.newAchievements")}:{" "}
                    {result.new_achievements
                      .map((a: string) => t(`sp_ach.${a}`, undefined, a))
                      .join(" · ")}
                  </div>
                )}
            </div>
          )}

          <div className="mt-7 flex flex-col gap-2.5">
            {outcome === "won" && (
              <Button
                variant="soft"
                className="w-full"
                onClick={() => {
                  setLevelModalLevel(Number(params.get("lvl")) || 1);
                  setLevelModalOpen(true);
                }}
              >
                <Trophy size={16} /> {t("levelCompletion.cta")}
              </Button>
            )}

            {outcome === "won" && result?.next_level ? (
              <Button
                size="xl"
                className="w-full"
                onClick={() => {
                  const d = params.get("d") || "easy";
                  window.location.href = `/singleplayer/play?d=${d}&lvl=${result.next_level}&r=${Date.now()}`;
                }}
              >
                <Play size={17} /> {t("game.nextLevel")} ·{" "}
                {num(result.next_level)}
              </Button>
            ) : null}

            <div className="flex gap-2.5">
              <Link href="/singleplayer" className="flex-1">
                <Button variant="soft" className="w-full">
                  {t("game.levelSelect")}
                </Button>
              </Link>
              <Button
                variant={outcome === "won" && result?.next_level ? "soft" : "primary"}
                className="flex-1"
                onClick={() => {
                  const d = params.get("d") || "easy";
                  const lvl = Number(params.get("lvl")) || 1;
                  const dbl = params.get("double") === "1" ? "&double=1" : "";
                  window.location.href = `/singleplayer/play?d=${d}&lvl=${lvl}${dbl}&r=${Date.now()}`;
                }}
              >
                <RotateCcw size={15} /> {t("game.retry")}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* level-completion share modal (SP) — layered above the win modal */}
      <LevelCompletionModal
        open={levelModalOpen && outcome === "won"}
        onClose={() => {
          setLevelModalOpen(false);
          setLevelModalPosted(true);
        }}
        mode="sp"
        difficulty={levelModalDiff}
        level={levelModalLevel}
        playerId={user?.id || ""}
        playerName={profile?.username || "Player"}
        playerAvatar={profile?.avatar || "sparkles"}
      />
    </div>
  );
}

export default function SpPlayPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-bg">
          <Spinner className="h-8 w-8" />
        </div>
      }
    >
      <PlayInner />
    </Suspense>
  );
}
