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
};

export default function NotificationsCenter({ userId, points, gems }: { userId: string | null; points: number; gems: number }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const [personal, broadcasts] = await Promise.all([
      supabase.from("user_notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("push_broadcasts").select("id, title, message, audience, action_url, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    const direct = (personal.data || []) as NotificationItem[];
    const matchingBroadcasts: NotificationItem[] = (broadcasts.data || [])
      .filter((item: { audience?: string }) => item.audience === "all" || (item.audience === "vip" && gems > 0) || (item.audience === "ranked" && points > 0))
      .map((item) => ({ id: `broadcast-${item.id}`, title: item.title, message: item.message, created_at: item.created_at, action_url: item.action_url, is_read: true, kind: "broadcast" }));
    setItems([...direct, ...matchingBroadcasts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [userId, points, gems]);
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`profile_notifications_${userId}`).on("postgres_changes", { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${userId}` }, load).on("postgres_changes", { event: "INSERT", schema: "public", table: "push_broadcasts" }, load).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const markRead = async (item: NotificationItem) => {
    if (item.kind === "broadcast" || item.is_read) return;
    await supabase.from("user_notifications").update({ is_read: true }).eq("id", item.id);
    setItems(current => current.map(entry => entry.id === item.id ? { ...entry, is_read: true } : entry));
  };

  if (!userId) return <div className="py-12 text-center text-sm text-on-surface-variant">Sign in to see your notifications.</div>;
  return <div className="space-y-4 pb-8 animate-fade-in"><div><h2 className="font-headline text-xl font-black">Notifications</h2><p className="text-xs text-on-surface-variant mt-1">Game activity, automated updates, and announcements from the team.</p></div>{loading ? <p className="py-10 text-center text-xs text-on-surface-variant animate-pulse">Loading notifications…</p> : items.length === 0 ? <div className="bg-surface border border-surface-container-highest rounded-[24px] p-8 text-center text-sm text-on-surface-variant">You’re all caught up.</div> : <div className="space-y-3">{items.map(item => <button key={item.id} onClick={() => void markRead(item)} className={`w-full text-left bg-surface border rounded-[20px] p-4 ${item.is_read ? "border-surface-container-highest" : "border-primary bg-primary-container/30"}`}><div className="flex gap-3"><span className="material-symbols-outlined text-primary">{item.kind === "broadcast" ? "campaign" : "notifications"}</span><div className="min-w-0"><p className="text-sm font-bold">{item.title}</p><p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{item.message}</p><p className="text-[10px] text-on-surface-variant mt-2">{new Date(item.created_at).toLocaleString()}</p></div>{!item.is_read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}</div></button>)}</div>}</div>;
}
