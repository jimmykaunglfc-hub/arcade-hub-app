"use client";

import { useEffect, useRef } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "../lib/supabaseClient";
import { isAndroidNativeApp, registerAndroidPushNotifications } from "../lib/androidPushNotifications";

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

    const configureAndroidPush = async () => {
      if (!isAndroidNativeApp()) return;
      nativeListeners.push(
        await PushNotifications.addListener("registration", (token) => {
          localStorage.setItem("joeyoke_fcm_registration_token", token.value);
          console.info("[FCM] registration token:", token.value);
          void supabase.rpc("upsert_my_push_device", {
            p_token: token.value,
            p_platform: "android",
          }).then(({ error }) => {
            if (error) console.error("[FCM] device token sync failed:", error.message);
            else console.info("[FCM] device token synced for this account.");
          });
        }),
        await PushNotifications.addListener("registrationError", (error) => {
          console.error("[FCM] registration error:", error.error);
        }),
        await PushNotifications.addListener("pushNotificationReceived", (notification) => {
          console.info("[FCM] foreground notification received:", notification);
        }),
        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          routePushAction(action.notification);
        }),
      );
    };

    const loadPreference = async () => {
      const { data } = await supabase.from("profiles").select("push_enabled").eq("id", userId).maybeSingle();
      enabled = Boolean(data?.push_enabled);
      if (enabled && !disposed) {
        try {
          const registration = await registerAndroidPushNotifications();
          if (registration.supported && !registration.granted) {
            console.warn("[FCM] Android notification permission is not granted.");
          }
        } catch (error) {
          console.error("[FCM] Android registration failed", error);
        }
      }
    };
    const startNativePush = async () => {
      // Attach native listeners before registration, otherwise a fast FCM
      // registration response can arrive before the token handler exists.
      await configureAndroidPush();
      if (!disposed) await loadPreference();
    };
    void startNativePush();
    const channel = supabase.channel(`broadcast_notifications_${userId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "push_broadcasts" }, (event) => {
      const payload = event.new as { title?: string; message?: string };
      if (enabled && "Notification" in window && Notification.permission === "granted") new Notification(payload.title || "Joe Yoke", { body: payload.message || "You have a new update." });
    }).subscribe();
    return () => {
      disposed = true;
      supabase.removeChannel(channel);
      void Promise.all(nativeListeners.map((listener) => listener.remove()));
    };
  }, [userId]);
  return null;
}
