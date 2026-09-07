"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { useI18n, useToast } from "@/components/providers";
import { useMpSession, mpDb, mp } from "@/lib/supabase";
import { useMpProfile } from "@/hooks/use-profiles";
import { Button, Card, Input, Pill, SectionTitle, Stat, Spinner, Empty } from "@/components/ui";
import { Avatar, DynIcon, ICONS } from "@/components/icons";
import { pct, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound";
import { gameError } from "@/lib/gameError";
import { Trophy, Swords, Flame, Target, Medal, CheckCircle2, Lock as LockIcon } from "lucide-react";

export default function MpProfile() {
  const { t, num, locale } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const { user, loading: authLoading } = useMpSession();
  const { profile, refresh } = useMpProfile(user?.id);
  const [name, setName] = useState("");
  const [achievements, setAchievements] = useState<any[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [frames, setFrames] = useState<any[]>([]);

  const load = useCallback(async (uid: string) => {
    const [{ data: cat }, { data: pa }, { data: invData }, { data: items }] =
      await Promise.all([
        mpDb().from("achievements_catalog" as any).select("*"),
        mpDb()
          .from("player_achievements" as any)
          .select("achievement_id")
          .eq("player_id", uid),
        mpDb()
          .from("inventory" as any)
          .select("item_id, equipped")
          .eq("player_id", uid)
          .eq("equipped", false),
        mpDb().from("shop_items" as any).select("id, name, icon, category, effect"),
      ]);
    setAchievements((cat as any[]) || []);
    setUnlocked(new Set(((pa as any[]) || []).map((r: any) => r.achievement_id)));
    const ownedIds = new Set(((invData as any[]) || []).map((r: any) => r.item_id));
    // also include equipped frames
    const { data: equipped } = await mpDb()
      .from("inventory" as any)
      .select("item_id")
      .eq("player_id", uid)
      .eq("equipped", true);
    (equipped as any[] | null)?.forEach((r: any) => ownedIds.add(r.item_id));
    setFrames(
      ((items as any[]) || []).filter(
        (i: any) => i.category === "frames" && ownedIds.has(i.id)
      )
    );
  }, []);

  useEffect(() => {
    if (!user) {
      if (!authLoading) router.replace("/auth/mp");
      return;
    }
    load(user.id);
    /* live achievements & inventory — unlocks appear instantly */
    const ch = mp()
      .channel(`mp-prof-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "mp", table: "player_achievements", filter: `player_id=eq.${user.id}` },
        () => load(user.id)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "mp", table: "inventory", filter: `player_id=eq.${user.id}` },
        () => load(user.id)
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [user, authLoading, router, load]);

  useEffect(() => {
    if (profile) setName(profile.username);
  }, [profile?.id]);

  const saveName = async () => {
    if (name.trim().length < 2) return;
    const { error } = await mpDb().rpc("rename", { p_username: name.trim() });
    if (error) toast(gameError(error, t), "err");
    else {
      toast(t("profile.saved"), "success");
      refresh();
    }
  };

  const setAvatar = async (icon: string) => {
    sfx.latch();
    const { error } = await mpDb().rpc("set_avatar", { p_icon: icon });
    if (error) {
      toast(gameError(error, t), "err");
      return;
    }
    toast(t("profile.saved"), "success");
    refresh();
  };

  const setFrame = async (frameId: string) => {
    sfx.latch();
    const { error } = await mpDb().rpc("set_frame", { p_frame: frameId });
    if (error) {
      toast(gameError(error, t), "err");
      return;
    }
    toast(t("profile.saved"), "success");
    refresh();
    if (user) load(user.id);
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
        <h1 className="display mb-8 animate-fade-up text-3xl md:text-4xl">
          {t("profile.title")} · {t("nav.multi")}
        </h1>

        {profile && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            <div className="flex flex-col gap-6">
              <Card className="animate-fade-up text-center">
                <div className="flex justify-center">
                  <Avatar icon={profile.avatar} size={92} frame={profile.frame} />
                </div>
                <div className="display mt-4 text-2xl">{profile.username}</div>
                <div className="mt-1 text-xs font-bold text-mute">
                  {t("profile.memberSince")} {timeAgo(profile.created_at, locale)}
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Pill solid>◆ {profile.novas.toLocaleString()}</Pill>
                  <Pill>
                    <Target size={12} /> {num(profile.rank_points)} {t("mp.points")}
                  </Pill>
                  <Pill>
                    {t("common.level")} {num(profile.level)} · {num(profile.xp)} XP
                  </Pill>
                </div>
                <div className="mt-6 text-start">
                  <div className="mb-2 text-xs font-bold uppercase tracking-widest text-mute">
                    {t("profile.name")}
                  </div>
                  <div className="flex gap-2">
                    <Input value={name} onChange={setName} maxLength={16} className="bg-soft2" />
                    <Button onClick={saveName}>{t("profile.save")}</Button>
                  </div>
                </div>
              </Card>

              <Card className="animate-fade-up">
                <SectionTitle>{t("profile.frame")}</SectionTitle>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => setFrame("none")}
                    className={cn(
                      "press flex flex-col items-center gap-2 rounded-2xl px-4 py-3",
                      profile.frame === "none" || !profile.frame
                        ? "bg-btn text-btnfg"
                        : "bg-soft2"
                    )}
                  >
                    <Avatar icon={profile.avatar} size={44} />
                    <span className="text-[10px] font-bold">—</span>
                  </button>
                  {frames.map((f: any) => (
                    <button
                      key={f.id}
                      onClick={() => setFrame(f.effect?.frame || "halo")}
                      className={cn(
                        "press flex flex-col items-center gap-2 rounded-2xl px-4 py-3",
                        profile.frame === (f.effect?.frame || "")
                          ? "bg-btn text-btnfg"
                          : "bg-soft2"
                      )}
                    >
                      <Avatar
                        icon={profile.avatar}
                        size={44}
                        frame={f.effect?.frame}
                      />
                      <span className="text-[10px] font-bold">{t(`mp_items.${f.id}.n`, undefined, f.name)}</span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>

            <div className="flex flex-col gap-6">
              <div className="grid animate-fade-up grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t("common.wins")} value={num(profile.wins)} icon={<Trophy size={13} />} />
                <Stat label={t("common.losses")} value={num(profile.losses)} icon={<Swords size={13} />} />
                <Stat
                  label={t("profile.winRate")}
                  value={pct(profile.wins, profile.losses, num)}
                  icon={<Medal size={13} />}
                />
                <Stat label={t("profile.bestStreak")} value={num(profile.best_streak)} icon={<Flame size={13} />} />
              </div>

              <Card className="animate-fade-up">
                <SectionTitle>{t("shop.mpAvatars")}</SectionTitle>
                <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                  {["sparkles", "dragon", "bot", "skull", "wand", "ghost", "rocket", "cat", "squirrel", "comet", "zap", "star"].map(
                    (ic) => (
                      <button
                        key={ic}
                        onClick={() => setAvatar(ic)}
                        className={cn(
                          "press grid aspect-square place-items-center rounded-2xl",
                          profile.avatar === ic ? "bg-btn text-btnfg" : "bg-soft2 text-fg"
                        )}
                      >
                        <DynIcon name={ic} size={22} />
                      </button>
                    )
                  )}
                </div>
              </Card>

              <Card className="animate-fade-up">
                <SectionTitle>
                  <span className="flex items-center gap-2">
                    <Medal size={17} /> {t("profile.achievements")}
                  </span>
                </SectionTitle>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {achievements.map((a: any) => {
                    const has = unlocked.has(a.id);
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl px-4 py-3",
                          has ? "bg-fg text-bg" : "bg-soft2 opacity-60"
                        )}
                      >
                        <DynIcon name={a.icon} size={19} />
                        <span className="flex-1 text-sm font-bold">{t(`mp_ach.${a.id}`, undefined, a.name)}</span>
                        {!has && <LockIcon size={13} />}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
