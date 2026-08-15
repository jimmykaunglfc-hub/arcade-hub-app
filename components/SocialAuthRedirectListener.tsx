"use client";


import { LocalizedText } from "../lib/i18n";
import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import {
  cleanBrowserSocialCallback,
  completeSocialLogin,
  isSocialAuthCallback,
  SOCIAL_AUTH_ERROR_EVENT,
  SOCIAL_AUTH_EVENT,
} from "@/lib/socialAuth";

function emitError(message: string) {
  window.dispatchEvent(
    new CustomEvent(SOCIAL_AUTH_ERROR_EVENT, { detail: { message } })
  );
}

export default function SocialAuthRedirectListener() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handledCallbacks = new Set<string>();
    let appUrlListener: PluginListenerHandle | undefined;
    let disposed = false;

    const handleUrl = async (url: string) => {
      if (
        disposed ||
        handledCallbacks.has(url) ||
        !isSocialAuthCallback(url)
      ) {
        return;
      }
      handledCallbacks.add(url);
      console.info("[Auth] Processing social sign-in callback.", url);

      try {
        await completeSocialLogin(url);
        cleanBrowserSocialCallback(url);
        window.dispatchEvent(new Event(SOCIAL_AUTH_EVENT));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "We couldn't complete the social sign-in. Please try again.";
        console.error("[Auth] Social sign-in callback failed.", error);
        setErrorMessage(message);
        emitError(message);
      }
    };

    // Web OAuth returns to the app URL. Handle it explicitly because this
    // project uses a static export for Capacitor packages and PKCE is enabled.
    void handleUrl(window.location.href);

    if (Capacitor.isNativePlatform()) {
      void App.addListener("appUrlOpen", ({ url }) => {
        console.info("[Auth] Native app URL opened.", url);
        void handleUrl(url);
      }).then((listener) => {
        if (disposed) {
          void listener.remove();
        } else {
          appUrlListener = listener;
        }
      });

      void App.getLaunchUrl().then((launchUrl) => {
        if (launchUrl?.url) {
          console.info("[Auth] Native app launch URL.", launchUrl.url);
          void handleUrl(launchUrl.url);
        }
      });
    }

    return () => {
      disposed = true;
      void appUrlListener?.remove();
    };
  }, []);

  if (!errorMessage) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-4 top-[calc(var(--app-safe-top)+1rem)] z-[200001] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-red-400/30 bg-[#25131a]/95 px-4 py-3 text-sm font-semibold text-red-100 shadow-2xl backdrop-blur"
    >
      <span className="material-symbols-outlined text-red-300" aria-hidden="true">
        error
      </span>
      <p className="min-w-0 flex-1">{errorMessage}</p>
      <button
        type="button"
        onClick={() => setErrorMessage(null)}
        className="rounded-lg px-2 py-1 text-xs font-bold text-red-100 transition hover:bg-white/10"
      >
        <LocalizedText id="UI_1548" fallback="Dismiss" /></button>
    </div>
  );
}
