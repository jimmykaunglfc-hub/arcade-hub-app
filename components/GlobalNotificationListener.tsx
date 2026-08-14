"use client";

import { useEffect, useRef } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { supabase } from "../lib/supabaseClient";
import {
  getNativePushPlatform,
  isNativePushApp,
  PUSH_TOKEN_STORAGE_KEY,
  registerNativePushNotifications,
} from "../lib/firebasePushNotifications";

type Props = {
  userId: string;
  onPushAction?: (actionUrl: string) => void;
};

export default function GlobalNotificationListener({ userId, onPushAction }: Props) {
  const onPushActionRef = useRef(onPushAction);
  onPushActionRef.current = onPushAction;

  useEffect(() => {
    let enabled = false;
    let disposed = false;
    const nativeListeners: PluginListenerHandle[] = [];

    const routePushAction = (notification: { data?: unknown; link?: string }) => {
      const data = (notification.data && typeof notification.data === "object"
        ? notification.data
        : {}) as Record<string, unknown>;
      const actionUrl = [data.action_url, data.actionUrl, data.deep_link, data.deepLink, notification.link]
        .find((value): value is string => typeof value === "string" && value.trim().length > 0);
      console.info("[FCM] notification opened", notification);
      if (actionUrl) onPushActionRef.current?.(actionUrl);
    };

    const syncNativeToken = (token: string) => {
      const platform = getNativePushPlatform();
      if (!platform || !token) return;
      localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
      console.info("[FCM] registration token:", token);
      void supabase.rpc("upsert_my_push_device", {
        p_token: token,
        p_platform: platform,
      }).then(({ error }) => {
        if (error) console.error("[FCM] device token sync failed:", error.message);
        else console.info(`[FCM] ${platform} device token synced for this account.`);
      });
    };

    const configureNativePush = async () => {
      if (!isNativePushApp()) return;
      nativeListeners.push(
        await FirebaseMessaging.addListener("tokenReceived", ({ token }) => syncNativeToken(token)),
        await FirebaseMessaging.addListener("notificationReceived", ({ notification }) => {
          console.info("[FCM] foreground notification received:", notification);
        }),
        await FirebaseMessaging.addListener("notificationActionPerformed", ({ notification }) => {
          routePushAction(notification);
        }),
      );
    };

    const loadPreference = async () => {
      const { data } = await supabase.from("profiles").select("push_enabled").eq("id", userId).maybeSingle();
      enabled = Boolean(data?.push_enabled);
      if (!enabled || disposed) return;
      try {
        const registration = await registerNativePushNotifications();
        if (registration.token) syncNativeToken(registration.token);
        if (registration.supported && !registration.granted) {
          console.warn("[FCM] Native notification permission is not granted.");
        }
      } catch (error) {
        console.error("[FCM] native registration failed", error);
      }
    };

    const startNativePush = async () => {
      // Attach listeners before requesting a token, otherwise an immediate
      // refresh could arrive before the token handler exists.
      await configureNativePush();
      if (!disposed) await loadPreference();
    };

    void startNativePush();
    const channel = supabase.channel(`broadcast_notifications_${userId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "push_broadcasts" },
      (event) => {
        const payload = event.new as { title?: string; message?: string };
        if (enabled && "Notification" in window && Notification.permission === "granted") {
          new Notification(payload.title || "Joe Yoke", { body: payload.message || "You have a new update." });
        }
      },
    ).subscribe();

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
      void Promise.all(nativeListeners.map((listener) => listener.remove()));
    };
  }, [userId]);

  return null;
}
