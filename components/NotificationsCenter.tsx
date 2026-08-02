"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  action_url?: string | null;
  is_read: boolean;
  kind?: string;
  category?: "general" | "system" | "promotion";
};

export default function NotificationsCenter({
  userId,
  points,
  gems,
  onBack,
}: {
  userId: string | null;
  points: number;
  gems: number;
  onBack: () => void;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<
    "all" | "general" | "system" | "promotion"
  >("all");

  const load = async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [personal, broadcasts] = await Promise.all([
      supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("push_broadcasts")
        .select(
          "id, title, message, audience, category, action_url, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const direct = (personal.data || []) as NotificationItem[];
    const matchingBroadcasts: NotificationItem[] = (broadcasts.data || [])
      .filter(
        (item: { audience?: string }) =>
          item.audience === "all" ||
          (item.audience === "vip" && gems > 0) ||
          (item.audience === "ranked" && points > 0)
      )
      .map((item) => ({
        id: `broadcast-${item.id}`,
        title: item.title,
        message: item.message,
        created_at: item.created_at,
        action_url: item.action_url,
        is_read: true,
        kind: "broadcast",
        category: item.category || "general",
      }));
    setItems(
      [...direct, ...matchingBroadcasts].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [userId, points, gems]);
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile_notifications_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${userId}`,
        },
        load
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "push_broadcasts" },
        load
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markRead = async (item: NotificationItem) => {
    if (item.kind === "broadcast" || item.is_read) return;
    await supabase
      .from("user_notifications")
      .update({ is_read: true })
      .eq("id", item.id);
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, is_read: true } : entry
      )
    );
  };
  const markAllRead = async () => {
    if (!userId) return;
    const unreadIds = items.filter((item) => item.kind !== "broadcast" && !item.is_read).map((item) => item.id);
    if (!unreadIds.length) return;
    await supabase.from("user_notifications").update({ is_read: true }).in("id", unreadIds).eq("user_id", userId);
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
  };

  const filteredItems =
    category === "all"
      ? items
      : items.filter((item) => (item.category || "general") === category);
  if (!userId)
    return (
      <div className="py-12 text-center text-sm text-on-surface-variant">
        Sign in to see your notifications.
      </div>
    );
  return (
    <div className="flex h-full min-h-0 max-w-full flex-col animate-fade-in overflow-hidden">
      <div className="shrink-0 border-b border-surface-container-highest bg-background pb-4 pt-1">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1 text-xs font-bold text-primary"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-headline text-xl font-black">Notifications</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Game activity, automated updates, and announcements from the team.
            </p>
          </div>
          <button
            onClick={() => void markAllRead()}
            disabled={!items.some((item) => item.kind !== "broadcast" && !item.is_read)}
            className="shrink-0 rounded-lg bg-primary-container px-3 py-2 text-[10px] font-black text-primary disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>
        <div className="mt-4 flex max-w-full min-w-0 gap-2 overflow-x-auto no-scrollbar touch-pan-x">
          {(["all", "general", "system", "promotion"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setCategory(tab)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold capitalize ${
                category === tab
                  ? "bg-primary text-on-primary"
                  : "bg-surface border border-surface-container-highest text-on-surface-variant"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div className="relative z-0 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-6 pt-3 no-scrollbar">
      {loading ? (
        <p className="py-10 text-center text-xs text-on-surface-variant animate-pulse">
          Loading notifications…
        </p>
      ) : filteredItems.length === 0 ? (
        <div className="bg-surface border border-surface-container-highest rounded-[24px] p-8 text-center text-sm text-on-surface-variant">
          You’re all caught up.
        </div>
      ) : (
        <>
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => void markRead(item)}
              className={`w-full text-left bg-surface border rounded-[20px] p-4 ${
                item.is_read
                  ? "border-surface-container-highest"
                  : "border-primary bg-primary-container/30"
              }`}
            >
              <div className="flex gap-3">
                <span className="material-symbols-outlined text-primary">
                  {item.kind === "broadcast" ? "campaign" : "notifications"}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    {item.category || "general"}
                  </p>
                  <p className="text-sm font-bold mt-1">{item.title}</p>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    {item.message}
                  </p>
                  <p className="text-[10px] text-on-surface-variant mt-2">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                {!item.is_read && (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                )}
              </div>
            </button>
          ))}
        </>
      )}
      </div>
    </div>
  );
}
