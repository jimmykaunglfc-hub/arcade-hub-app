"use client";

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

export const ANDROID_PUSH_CHANNEL_ID = "joe_yoke_updates";

export const isAndroidNativeApp = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export async function registerAndroidPushNotifications() {
  if (!isAndroidNativeApp()) return { supported: false, granted: false };

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    return { supported: true, granted: false };
  }

  await PushNotifications.createChannel({
    id: ANDROID_PUSH_CHANNEL_ID,
    name: "Joe Yoke updates",
    description: "Match invitations, rewards, and account updates.",
    importance: 4,
    vibration: true,
    lights: true,
    lightColor: "#CCFF00",
  });
  await PushNotifications.register();
  return { supported: true, granted: true };
}

export async function unregisterAndroidPushNotifications() {
  if (!isAndroidNativeApp()) return;
  await PushNotifications.unregister();
  localStorage.removeItem("joeyoke_fcm_registration_token");
}
