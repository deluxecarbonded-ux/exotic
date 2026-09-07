"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { useI18n, useToast } from "@/components/providers";
import { useSpSession, spDb, sp } from "@/lib/supabase";
import { useSpProfile } from "@/hooks/use-profiles";
import { Button, Card, Input, Pill, SectionTitle, Stat, Spinner, Empty } from "@/components/ui";
import { Avatar, DynIcon, ICONS } from "@/components/icons";
import { fmtTime, pct, timeAgo } from "@/lib/utils";
import {
  Trophy,
  Flame,
  Timer,
  CheckCircle2,
  Package,
  Medal,
  Lock as LockIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound";
import { gameError } from "@/lib/gameError";

export default function SpProfile() {
  const { t, num, locale } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const { user, loading: authLoading } = useSpSession();
  const { profile, refresh } = useSpProfile(user?.id);
  const [name, setName] = useState("");
  const [achievements, setAchievements] = useState<any[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [inventory, setInventory] = useState<any[]>([]);

  const load = useCallback(async (uid: string) => {
    const [{ data: cat }, { data: pa }, { data: invData }, { data: items }] =
      await Promise.all([
        spDb().from("achievements_catalog" as any).select("*"),
        spDb()
          .from("player_achievements" as any)
          .select("achievement_id")
          .eq("player_id", uid),
        spDb()
          .from("inventory" as any)
          .select("item_id, qty, equipped")
          .eq("player_id", uid),
        spDb().from("shop_items" as any).select("id, name, icon, category"),
      ]);
    setAchievements((cat as any[]) || []);
    setUnlocked(new Set(((pa as any[]) || []).map((r: any) => r.achievement_id)));
    const byId = Object.fromEntries(
      ((items as any[]) || []).map((i: any) => [i.id, i])
    );
    setInventory(
      ((invData as any[]) || []).map((r: any) => ({ ...r, ...(byId[r.item_id] || {}) }))
    );
  }, []);

  useEffect(() => {
    if (!user) {
      if (!authLoading) router.replace("/auth/sp");
      return;
    }
    load(user.id);
    /* live achievements & inventory — unlocks appear instantly */
    const ch = sp()
      .channel(`sp-prof-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "sp", table: "player_achievements", filter: `player_id=eq.${user.id}` },
        () => load(user.id)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "sp", table: "inventory", filter: `player_id=eq.${user.id}` },
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
    const { error } = await spDb().rpc("rename", { p_username: name.trim() });
    if (error) toast(gameError(error, t), "err");
    else {
      toast(t("profile.saved"), "success");
      refresh();
    }
  };

  const setAvatar = async (icon: string) => {
    sfx.latch();
    const { error } = await spDb().rpc("set_avatar", { p_icon: icon });
    if (!error) refresh();
  };

  if (authLoading || (!profile && authLoading === false && user)) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-28 text-fg md:pb-12">
      <Navbar spSignedIn={!!user} sparks={profile?.sparks} />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <h1 className="display mb-8 animate-fade-up text-3xl md:text-4xl">
          {t("profile.title")} · {t("nav.solo")}
        </h1>

        {profile && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            <div className="flex flex-col gap-6">
              <Card className="animate-fade-up text-center">
                <div className="flex justify-center">
                  <Avatar icon={profile.avatar} size={92} />
                </div>
                <div className="display mt-4 text-2xl">{profile.username}</div>
                <div className="mt-1 text-xs font-bold text-mute">
                  {t("profile.memberSince")} {timeAgo(profile.created_at, locale)}
                </div>
                <div className="mt-3 flex justify-center gap-2">
                  <Pill solid>
                    ✦ {profile.sparks.toLocaleString()}
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
                <SectionTitle>{t("profile.inventory")}</SectionTitle>
                {inventory.length === 0 ? (
                  <Empty>{t("profile.noItems")}</Empty>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {inventory.map((r: any) => (
                      <div
                        key={r.item_id}
                        className="flex items-center gap-3 rounded-2xl bg-soft2 px-4 py-2.5"
                      >
                        <DynIcon name={r.icon} size={17} />
                        <span className="flex-1 truncate text-sm font-bold">{r.name}</span>
                        {r.equipped && <CheckCircle2 size={14} className="text-mute" />}
                        <span className="text-xs font-black tabular">×{r.qty}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="flex flex-col gap-6">
              <div className="grid animate-fade-up grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t("sp.games")} value={num(profile.games)} icon={<Trophy size={13} />} />
                <Stat label={t("sp.cracked")} value={num(profile.wins)} icon={<CheckCircle2 size={13} />} />
                <Stat label={t("profile.winRate")} value={pct(profile.wins, profile.games - profile.wins, num)} icon={<Medal size={13} />} />
                <Stat
                  label={t("sp.bestTime")}
                  value={profile.best_time ? fmtTime(profile.best_time, num) : "—"}
                  icon={<Timer size={13} />}
                />
              </div>

              <Card className="animate-fade-up">
                <SectionTitle>{t("profile.avatar")}</SectionTitle>
                <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                  {Object.keys(ICONS).slice(0, 12).map((ic) => (
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
                  ))}
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
                        <span className="flex-1 text-sm font-bold">{t(`sp_ach.${a.id}`, undefined, a.name)}</span>
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
