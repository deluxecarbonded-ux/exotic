"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal, Button } from "@/components/ui";
import { useI18n, useToast } from "@/components/providers";
import { sp, mp, spDb, mpDb } from "@/lib/supabase";
import { sfx } from "@/lib/sound";
import {
  Trophy,
  Share2,
  X,
  Star,
} from "lucide-react";

type LevelCompletionModalProps = {
  open: boolean;
  onClose: () => void;
  /** 'sp' | 'mp' — which leaderboard schema to post to */
  mode: "sp" | "mp";
  /** difficulty whose level board to show */
  difficulty: string;
  /** the level that was just cleared */
  level: number;
  /** player id for posting to leaderboard */
  playerId: string;
  /** player name + avatar for the "you" row */
  playerName: string;
  playerAvatar: string;
  /** mp-only frame */
  playerFrame?: string;
};

type BoardRow = {
  id: string;
  username: string;
  avatar: string;
  frame?: string;
  level: number;
  cleared: number;
  total: number;
};

export function LevelCompletionModal({
  open,
  onClose,
  mode,
  difficulty,
  level,
  playerId,
  playerName,
  playerAvatar,
  playerFrame,
}: LevelCompletionModalProps) {
  const { t, num, locale } = useI18n();
  const { toast } = useToast();
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [posted, setPosted] = useState(false);

  const loadBoard = useCallback(async () => {
    if (!open || !playerId) return;
    setLoading(true);
    try {
      const client = mode === "sp" ? spDb() : mpDb();
      const { data } = await client.rpc("leaderboard_by_level", { p_difficulty: difficulty });
      const rows = ((data as any[]) || []) as BoardRow[];
      const me = rows.find((r) => r.id === playerId);
      if (me) {
        setBoard([me, ...rows.filter((r) => r.id !== playerId).slice(0, 9)]);
      } else {
        setBoard(rows.slice(0, 10));
      }
    } catch {
      setBoard([]);
    } finally {
      setLoading(false);
    }
  }, [open, playerId, mode, difficulty]);

  useEffect(() => {
    if (open) {
      setPosted(false);
      loadBoard();
    }
  }, [open, loadBoard]);

  /* live board — while the modal is open, any level share or profile
     change (e.g. the winner's level bump) refetches instantly, zero
     page refresh, zero navigation */
  useEffect(() => {
    if (!open) return;
    const client = mode === "sp" ? sp : mp;
    const ch = client()
      .channel(`level-modal-${mode}-${playerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: mode, table: "level_shares" as any },
        () => loadBoard()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: mode, table: "profiles" as any },
        () => loadBoard()
      )
      .subscribe();
    return () => {
      client().removeChannel(ch);
    };
  }, [open, mode, playerId, loadBoard]);

  const shareToLeaderboard = async () => {
    if (!playerId) {
      toast(t("err.signin"), "err");
      return;
    }
    sfx.confirm2();
    try {
      const db = mode === "sp" ? spDb() : mpDb();
      const { error } = await db.rpc("share_level_completion", {
        p_difficulty: difficulty,
        p_level: level,
      });
      if (error) throw error;
      setPosted(true);
      toast(t("levelCompletion.posted"), "ok");
      sfx.powerup2();
      loadBoard();
    } catch {
      toast(t("common.error"), "err");
    }
  };

  const shareToSocial = async () => {
    sfx.confirm2();
    const text =
      mode === "sp"
        ? `${playerName} just cleared Level ${level} (${difficulty}) in Exotic Solo — ${t("levelCompletion.beat")}!`
        : `${playerName} just cleared Level ${level} (${difficulty}) in Exotic Duel — ${t("levelCompletion.beat")}!`;
    if (navigator.share && locale !== "ar" && locale !== "hi") {
      try {
        await navigator.share({ title: t("app.name"), text });
        toast(t("levelCompletion.shared"), "ok");
      } catch {
        fallbackCopy(text);
      }
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    toast(t("common.copied"), "ok");
  };

  const rankLabel = (row: BoardRow, idx: number) => {
    if (row.id === playerId) return t("levelCompletion.you");
    return num(idx + 1);
  };

  return (
    <Modal open={open} onClose={onClose} locked>
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-fg text-bg">
          <Trophy size={26} />
        </div>
        <div className="display text-2xl">
          {t("levelCompletion.title", { level })}
        </div>
        <p className="mt-1 text-sm font-bold text-mute">
          {t("levelCompletion.sub", { diff: t(`sp.${difficulty}`) })}
        </p>

        {/* live leaderboard preview */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-mute">
            <span>{t("levelCompletion.leaderboard")}</span>
            <span className="text-[10px]">{difficulty}</span>
          </div>
          {loading ? (
            <div className="grid place-items-center py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-btn text-bg" />
            </div>
          ) : board.length === 0 ? (
            <div className="rounded-2xl bg-soft2 py-6 text-sm font-bold text-mute">
              {t("common.empty")}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {board.map((row, i) => (
                <div
                  key={row.id}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 ${
                    row.id === playerId
                      ? "bg-fg text-bg"
                      : i === 0
                        ? "bg-soft"
                        : "bg-soft2"
                  }`}
                >
                  <span
                    className={`w-5 text-xs font-black tabular ${
                      row.id === playerId ? "text-bg/70" : "text-mute"
                    }`}
                  >
                    {rankLabel(row, i)}
                  </span>
                  <div
                    className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${
                      row.id === playerId
                        ? "bg-bg text-fg"
                        : row.id === board[0]?.id
                          ? "bg-fg text-bg"
                          : "bg-soft text-fg"
                    }`}
                  >
                    {row.username?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {row.username}
                  </span>
                  {row.id === playerId && playerFrame && (
                    <Star size={12} className="text-mute" />
                  )}
                  <span className="text-xs font-black tabular">
                    {row.cleared}/{row.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* actions */}
        <div className="mt-7 flex flex-col gap-2.5">
          <Button
            size="xl"
            className="w-full"
            onClick={shareToLeaderboard}
            disabled={posted}
          >
            <Share2 size={17} />{" "}
            {posted ? t("levelCompletion.posted") : t("levelCompletion.shareBoard")}
          </Button>
          <Button
            variant="soft"
            size="lg"
            className="w-full"
            onClick={shareToSocial}
          >
            <Share2 size={17} /> {t("levelCompletion.shareSocial")}
          </Button>
          <Button
            variant="soft"
            size="md"
            className="w-full"
            onClick={onClose}
          >
            <X size={15} className="rtl:-scale-x-100" /> {t("levelCompletion.dontShare")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
