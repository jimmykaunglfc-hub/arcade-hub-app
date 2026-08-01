"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Broadcast = {
  id: string;
  title: string;
  message: string;
  action_url: string | null;
  action_label: string | null;
  category: "general" | "system" | "promotion";
  audience: "all" | "ranked" | "vip";
  show_in_app_dialog?: boolean;
};

const SEEN_BROADCAST_KEY = "joeyoke_seen_in_app_broadcast";

export default function InAppBroadcastDialog({
  points,
  gems,
  onAction,
}: {
  points: number;
  gems: number;
  onAction: (actionUrl: string) => void;
}) {
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);

  useEffect(() => {
    let isMounted = true;
    const isEligible = (item: Broadcast) => item.audience === "all" || (item.audience === "ranked" && points > 0) || (item.audience === "vip" && gems > 0);
    const display = (item: Broadcast) => {
      if (isMounted && item.show_in_app_dialog !== false && isEligible(item)) setBroadcast(item);
    };

    const loadLatestUnseenBroadcast = async () => {
      const { data } = await supabase
        .from("push_broadcasts")
        .select("id,title,message,action_url,action_label,category,audience,show_in_app_dialog")
        .order("created_at", { ascending: false })
        .limit(10);
      const latestEligible = (data as Broadcast[] | null)?.find((item) => item.show_in_app_dialog !== false && isEligible(item));
      if (latestEligible && window.localStorage.getItem(SEEN_BROADCAST_KEY) !== latestEligible.id) display(latestEligible);
    };

    void loadLatestUnseenBroadcast();
    const channel = supabase
      .channel("in_app_broadcast_dialog")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "push_broadcasts" }, (event) => {
        display(event.new as Broadcast);
      })
      .subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel); };
  }, [points, gems]);

  if (!broadcast) return null;
  const icon = broadcast.category === "promotion" ? "redeem" : broadcast.category === "system" ? "settings_suggest" : "campaign";
  const dismiss = () => {
    window.localStorage.setItem(SEEN_BROADCAST_KEY, broadcast.id);
    setBroadcast(null);
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="broadcast-title">
      <section className="w-full max-w-sm overflow-hidden rounded-[30px] border border-surface-container-highest bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
        <div className="h-1.5 bg-primary" />
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-container text-primary-fg"><span className="material-symbols-outlined text-2xl">{icon}</span></div>
            <div className="min-w-0">
              <p className="font-caps text-[10px] font-black uppercase tracking-[0.18em] text-primary-fg">{broadcast.category}</p>
              <h2 id="broadcast-title" className="mt-1 font-headline text-xl font-black leading-tight text-on-surface">{broadcast.title}</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-on-surface-variant">{broadcast.message}</p>
          <div className="mt-6 grid gap-2">
            {broadcast.action_url && <button type="button" onClick={() => { const action = broadcast.action_url || ""; dismiss(); onAction(action); }} className="rounded-2xl bg-primary px-4 py-3.5 font-headline text-sm font-black text-on-primary active:scale-[0.98]">{broadcast.action_label || "Open"}</button>}
            <button type="button" onClick={dismiss} className="rounded-2xl border border-surface-container-highest px-4 py-3 text-xs font-bold text-on-surface-variant hover:bg-surface-container-high">Dismiss</button>
          </div>
        </div>
      </section>
    </div>
  );
}

