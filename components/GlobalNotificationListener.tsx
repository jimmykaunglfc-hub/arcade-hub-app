"use client";

import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export default function GlobalNotificationListener({ userId }: { userId: string }) {
  useEffect(() => {
    let enabled = false;
    const loadPreference = async () => {
      const { data } = await supabase.from("profiles").select("push_enabled").eq("id", userId).maybeSingle();
      enabled = Boolean(data?.push_enabled);
    };
    void loadPreference();
    const channel = supabase.channel(`broadcast_notifications_${userId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "push_broadcasts" }, (event) => {
      const payload = event.new as { title?: string; message?: string };
      if (enabled && "Notification" in window && Notification.permission === "granted") new Notification(payload.title || "Joe Yoke", { body: payload.message || "You have a new update." });
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);
  return null;
}
