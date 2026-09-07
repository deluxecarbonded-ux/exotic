"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { useI18n, useToast } from "@/components/providers";
import { useSpSession, spDb, sp } from "@/lib/supabase";
import { useSpProfile } from "@/hooks/use-profiles";
import { Button, Card, Modal, Pill, Spinner, SectionTitle, Empty } from "@/components/ui";
import { DynIcon } from "@/components/icons";
import { Check, Star, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound";
import { gameError } from "@/lib/gameError";

export default function SpShop() {
  const { t, num } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const { user, loading: authLoading } = useSpSession();
  const { profile, refresh } = useSpProfile(user?.id);
  const [items, setItems] = useState<any[]>([]);
  const [inv, setInv] = useState<Record<string, { qty: number; equipped: boolean }>>({});
  const [confirm, setConfirm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (uid: string) => {
    const [{ data: it }, { data: own }] = await Promise.all([
      spDb().from("shop_items" as any).select("*").eq("available", true),
      spDb().from("inventory" as any).select("*").eq("player_id", uid),
    ]);
    setItems((it as any[]) || []);
    const map: Record<string, { qty: number; equipped: boolean }> = {};
    (own as any[] | null)?.forEach((r: any) => {
      map[r.item_id] = { qty: r.qty, equipped: r.equipped };
    });
    setInv(map);
  }, []);

  useEffect(() => {
    if (!user) {
      if (!authLoading) router.replace("/auth/sp");
      return;
    }
    load(user.id);
    /* live inventory — purchases & usage stream in, no refresh */
    const ch = sp()
      .channel(`sp-shop-inv-${user.id}`)
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

  const buy = async () => {
    if (!confirm) return;
    setBusy(true);
    const { error } = await spDb().rpc("buy_item", { p_item: confirm.id });
    setBusy(false);
    setConfirm(null);
    if (error) {
      toast(gameError(error, t), "err");
      return;
    }
    sfx.buy();
    toast(t("shop.success"), "success");
    if (user) load(user.id);
    refresh();
  };

  const toggleEquip = async (item: any) => {
    const cur = inv[item.id]?.equipped;
    const { error } = await spDb().rpc("equip_item", {
      p_item: item.id,
      p_on: !cur,
    });
    if (error) {
      toast(gameError(error, t), "err");
      return;
    }
    sfx.latch();
    if (user) load(user.id);
    refresh();
  };

  const groups = [
    { key: "consumables", label: t("shop.consumables") },
    { key: "boosters", label: t("shop.boosters") },
    { key: "cosmetics", label: t("shop.cosmetics") },
  ];

  return (
    <div className="min-h-screen bg-bg pb-28 text-fg md:pb-12">
      <Navbar spSignedIn={!!user} sparks={profile?.sparks} />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-8 flex animate-fade-up flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="display text-3xl">{t("shop.spTitle")}</h1>
            <p className="text-sm font-semibold text-mute">{t("shop.spSub")}</p>
          </div>
          {profile && (
            <Pill solid className="px-5 py-2.5 text-base tabular">
              ✦ {num(profile.sparks)}
              <span className="text-xs opacity-70">{t("shop.balance")}</span>
            </Pill>
          )}
        </div>

        {items.length === 0 ? (
          <div className="grid min-h-[40vh] place-items-center">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          groups.map((g, gi) => {
            const list = items.filter((i) => i.category === g.key);
            if (!list.length) return null;
            return (
              <section key={g.key} className="mb-10 animate-fade-up" style={{ animationDelay: `${gi * 0.05}s` }}>
                <SectionTitle>{g.label}</SectionTitle>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((item) => {
                    const owned = inv[item.id];
                    const cosmetic = item.category === "cosmetics";
                    const affordable = (profile?.sparks ?? 0) >= item.price;
                    return (
                      <Card key={item.id} className="flex flex-col gap-3">
                        <div className="flex items-start justify-between">
                          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-soft2">
                            <DynIcon name={item.icon} size={22} />
                          </div>
                          {item.featured && (
                            <Pill solid>
                              <Star size={11} /> {t("shop.featured")}
                            </Pill>
                          )}
                        </div>
                        <div>
                          <div className="display text-base">{t(`sp_items.${item.id}.n`, undefined, item.name)}</div>
                          <p className="mt-1 min-h-[2.4rem] text-xs font-semibold text-mute">
                            {t(`sp_items.${item.id}.d`, undefined, item.description)}
                          </p>
                        </div>
                        <div className="mt-auto flex items-center gap-2">
                          {cosmetic && owned ? (
                            <Button
                              className="flex-1"
                              variant={owned.equipped ? "soft" : "primary"}
                              onClick={() => toggleEquip(item)}
                            >
                              {owned.equipped ? (
                                <>
                                  <Check size={15} /> {t("common.equipped")}
                                </>
                              ) : (
                                t("common.equip")
                              )}
                            </Button>
                          ) : (
                            <Button
                              className="flex-1"
                              disabled={!affordable}
                              onClick={() => {
                                if (cosmetic && owned) {
                                  toast(t("shop.alreadyOwned"), "warning");
                                  return;
                                }
                                setConfirm(item);
                              }}
                            >
                              {affordable ? "" : <Lock size={13} />}
                              {t("common.buy")} · ✦{num(item.price)}
                            </Button>
                          )}
                          {owned && !cosmetic && (
                            <span className="rounded-full bg-soft2 px-3 py-1.5 text-xs font-black tabular">
                              ×{num(owned.qty)}
                            </span>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </main>

      <Modal open={!!confirm} onClose={() => setConfirm(null)}>
        {confirm && (
          <div className="text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-soft">
              <DynIcon name={confirm.icon} size={26} />
            </div>
            <div className="display text-xl">{t("shop.confirmTitle")}</div>
            <p className="mt-1 text-sm font-bold">{t(`sp_items.${confirm.id}.n`, undefined, confirm.name)}</p>
            <p className="mt-2 text-sm font-semibold text-mute">
              {t("shop.confirmSub", { p: `✦${num(confirm.price)}` })}
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="soft" className="flex-1" onClick={() => setConfirm(null)}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1" onClick={buy} disabled={busy}>
                {busy ? <Spinner className="text-btnfg" /> : t("common.confirm")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
