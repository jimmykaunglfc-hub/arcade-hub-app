"use client";

import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";

export const PUSH_TOKEN_STORAGE_KEY = "joeyoke_fcm_registration_token";
export const ANDROID_PUSH_CHANNEL_ID = "joe_yoke_updates";

export type NativePushPlatform = "android" | "ios";

export const getNativePushPlatform = (): NativePushPlatform | null => {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  return platform === "android" || platform === "ios" ? platform : null;
};

export const isNativePushApp = () => getNativePushPlatform() !== null;

export async function registerNativePushNotifications() {
  const platform = getNativePushPlatform();
  if (!platform) return { supported: false, granted: false, platform: null, token: null };

  let permission = await FirebaseMessaging.checkPermissions();
  if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
    permission = await FirebaseMessaging.requestPermissions();
  }
  console.info(`[FCM] ${platform} notification permission: ${permission.receive}`);
  if (permission.receive !== "granted") {
    return { supported: true, granted: false, platform, token: null };
  }

  if (platform === "android") {
    await FirebaseMessaging.createChannel({
      id: ANDROID_PUSH_CHANNEL_ID,
      name: "Joe Yoke updates",
      description: "Match invitations, rewards, and account updates.",
      importance: 4,
      vibration: true,
      lights: true,
      lightColor: "#CCFF00",
    });
  }

  const { token } = await FirebaseMessaging.getToken();
  return { supported: true, granted: true, platform, token };
}

export async function unregisterNativePushNotifications() {
  if (!isNativePushApp()) return;
  await FirebaseMessaging.deleteToken();
  localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}
