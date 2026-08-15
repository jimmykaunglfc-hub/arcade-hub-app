"use client";

import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/lib/supabaseClient";

export type SocialLoginProvider = "google" | "apple" | "custom:telegram";

export const SOCIAL_AUTH_EVENT = "joe-yoke-social-auth-complete";
export const SOCIAL_AUTH_ERROR_EVENT = "joe-yoke-social-auth-error";

// Keep this value identical to the redirect URL allow-listed in Supabase and
// the custom scheme registered by the Android and iOS packages.
export const NATIVE_SOCIAL_AUTH_REDIRECT_URL =
  "com.joeyoke.app://auth/callback";
const PENDING_REFERRAL_STORAGE_KEY = "joe_yoke_pending_social_referral";

function getCallbackParameters(url: URL) {
  const hashParameters = new URLSearchParams(url.hash.replace(/^#/, ""));
  return {
    code: url.searchParams.get("code") ?? hashParameters.get("code"),
    error: url.searchParams.get("error") ?? hashParameters.get("error"),
    errorDescription:
      url.searchParams.get("error_description") ??
      hashParameters.get("error_description") ??
      url.searchParams.get("error_code") ??
      hashParameters.get("error_code"),
  };
}

export function isSocialAuthCallback(urlString: string) {
  try {
    const url = new URL(urlString);
    const { code, error } = getCallbackParameters(url);

    if (!code && !error) return false;
    if (url.protocol === "com.joeyoke.app:") {
      // Android browsers can normalize custom-scheme URLs slightly
      // differently. The scheme belongs only to Joe Yoke, so accepting every
      // URL on this scheme that contains an OAuth response is both safe and
      // more reliable than requiring an exact host/path representation.
      return true;
    }

    return typeof window !== "undefined" && url.origin === window.location.origin;
  } catch {
    return false;
  }
}

function rememberReferral(referralCode?: string) {
  const normalized = referralCode?.trim().toUpperCase();
  if (normalized) {
    window.localStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, normalized);
  } else {
    window.localStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
  }
}

async function applyPendingReferral(userId: string) {
  const referralCode = window.localStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);
  if (!referralCode) return;

  try {
    await supabase.rpc("ensure_my_profile");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("referred_by")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;

    if (!profile?.referred_by) {
      const { error } = await supabase.rpc("apply_referral_code", {
        p_referral_code: referralCode,
      });
      if (error) throw error;
    }
  } catch (error) {
    // A referral issue must never block an otherwise successful social login.
    // Keep this visible to developers while avoiding a sign-in failure for a
    // player whose code has expired or was already used.
    console.warn("[Auth] Could not apply the saved referral code.", error);
  } finally {
    window.localStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
  }
}

export async function beginSocialLogin(
  provider: SocialLoginProvider,
  referralCode?: string
) {
  rememberReferral(referralCode);

  const platform = Capacitor.getPlatform();
  const native = platform === "android" || platform === "ios";
  const redirectTo = native
    ? NATIVE_SOCIAL_AUTH_REDIRECT_URL
    : `${window.location.origin}/`;

  console.info("[Auth] Starting social sign-in.", {
    provider,
    platform,
    redirectTo,
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: native,
      ...(provider === "google"
        ? { queryParams: { prompt: "select_account" } }
        : {}),
    },
  });
  if (error) throw error;

  if (native) {
    if (!data.url) {
      throw new Error("The sign-in provider did not return an authorization URL.");
    }
    await Browser.open({ url: data.url, presentationStyle: "fullscreen" });
  }
}

export async function completeSocialLogin(urlString: string) {
  console.info("[Auth] Received social sign-in callback.", urlString);
  const callbackUrl = new URL(urlString);
  const { code, error, errorDescription } = getCallbackParameters(callbackUrl);

  if (error) {
    throw new Error(errorDescription || error);
  }
  if (!code) {
    throw new Error("The sign-in response did not contain an authorization code.");
  }

  const { data, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  if (!data.session?.user) {
    throw new Error("The sign-in session could not be created.");
  }

  await applyPendingReferral(data.session.user.id);
  if (Capacitor.isNativePlatform()) {
    await Browser.close().catch(() => undefined);
  }

  return data.session;
}

export function cleanBrowserSocialCallback(urlString: string) {
  const url = new URL(urlString);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  ["code", "error", "error_description", "error_code", "state"].forEach((key) =>
    url.searchParams.delete(key)
  );
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}
