"use client";

import { FormEvent, useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabaseClient";
import {
  beginSocialLogin,
  SOCIAL_AUTH_ERROR_EVENT,
  SOCIAL_AUTH_EVENT,
  type SocialLoginProvider,
} from "@/lib/socialAuth";

interface AuthViewProps {
  onAuthSuccess: () => void;
  onCancel?: () => void;
  dialogTitleId?: string;
}

type AuthStage = "email" | "verify";
type SocialProvider = "google" | "apple" | "telegram";
const MIN_OTP_LENGTH = 6;
const MAX_OTP_LENGTH = 6;

const providerDetails: Record<SocialProvider, { label: string; icon: string }> = {
  google: { label: "Continue with Google", icon: "G" },
  apple: { label: "Continue with Apple", icon: "\uf8ff" },
  telegram: { label: "Continue with Telegram", icon: "➤" },
};

function canUseAppleSignIn() {
  // Apple sign-in is intentionally offered only in the iOS package and on
  // Apple mobile browsers. It must not be shown in Android packages, where
  // Google, email, and Telegram remain the supported sign-in choices.
  if (Capacitor.getPlatform() === "ios") return true;
  if (typeof navigator === "undefined") return false;

  const appleMobileBrowser = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const iPadDesktopUserAgent =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return appleMobileBrowser || iPadDesktopUserAgent;
}

export default function AuthView({ onAuthSuccess, onCancel, dialogTitleId }: AuthViewProps) {
  const [stage, setStage] = useState<AuthStage>("email");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [otp, setOtp] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | "email" | "verify" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const clearFeedback = () => setErrorMsg(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code?.trim()) setReferralCode(code.trim().toUpperCase());
  }, []);

  useEffect(() => {
    const handleSuccess = () => {
      setLoadingProvider(null);
      clearFeedback();
      onAuthSuccess();
    };
    const handleError = (event: Event) => {
      const message =
        event instanceof CustomEvent && typeof event.detail?.message === "string"
          ? event.detail.message
          : "We couldn't complete the social sign-in. Please try again.";
      setErrorMsg(message);
      setLoadingProvider(null);
    };

    window.addEventListener(SOCIAL_AUTH_EVENT, handleSuccess);
    window.addEventListener(SOCIAL_AUTH_ERROR_EVENT, handleError);
    return () => {
      window.removeEventListener(SOCIAL_AUTH_EVENT, handleSuccess);
      window.removeEventListener(SOCIAL_AUTH_ERROR_EVENT, handleError);
    };
  }, [onAuthSuccess]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener: { remove: () => Promise<void> } | undefined;

    void Browser.addListener("browserFinished", () => {
      setLoadingProvider((current) =>
        current === "google" || current === "apple" ? null : current
      );
    }).then((handle) => {
      listener = handle;
    });

    return () => {
      void listener?.remove();
    };
  }, []);

  const handleRequestOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadingProvider("email");
    clearFeedback();

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          // This reaches the new-auth-user database trigger, so a referral is
          // recorded and rewarded even if the app is closed before OTP entry.
          data: referralCode.trim()
            ? { referral_code: referralCode.trim().toUpperCase() }
            : undefined,
        },
      });

      if (error) throw error;
      setStage("verify");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "We couldn't send a code. Please try again.");
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleVerifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadingProvider("verify");
    clearFeedback();

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: "email",
      });

      if (error) throw error;
      if (data.session) {
        const { error: profileError } = await supabase.rpc("ensure_my_profile");
        if (profileError) throw profileError;
        if (referralCode.trim()) {
          // Fresh OTP accounts are credited by the signup trigger. Existing
          // accounts still use the RPC, but never receive a duplicate reward.
          const { data: referralProfile, error: referralProfileError } = await supabase
            .from("profiles")
            .select("referred_by")
            .eq("id", data.session.user.id)
            .maybeSingle();
          if (referralProfileError) throw referralProfileError;
          if (!referralProfile?.referred_by) {
            const { error: referralError } = await supabase.rpc("apply_referral_code", { p_referral_code: referralCode.trim() });
            if (referralError) throw referralError;
          }
        }
      }
      onAuthSuccess();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "That code is invalid or has expired. Request a new one and try again.");
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleSocialLogin = async (provider: SocialProvider) => {
    setLoadingProvider(provider);
    clearFeedback();

    try {
      await beginSocialLogin(
        // Telegram remains available only when its custom OIDC provider is
        // configured in Supabase. Google and Apple are first-class providers.
        (provider === "telegram" ? "custom:telegram" : provider) as SocialLoginProvider,
        referralCode
      );
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : `We couldn't start ${providerDetails[provider].label.toLowerCase()}. Please try again.`
      );
      setLoadingProvider(null);
    }
  };

  const returnToEmail = () => {
    setStage("email");
    setOtp("");
    clearFeedback();
  };

  const isBusy = loadingProvider !== null;
  const availableProviders = (Object.keys(providerDetails) as SocialProvider[])
    .filter((provider) => provider !== "apple" || canUseAppleSignIn());

  return (
    <section className="flex-1 flex items-center justify-center py-6">
      <div className="relative w-full max-w-sm overflow-hidden rounded-[30px] border border-surface-container-highest bg-surface p-5 text-on-surface shadow-[0_28px_80px_rgba(0,0,0,0.22)] sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(86,112,255,0.24),transparent_70%)]" />

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel sign in"
            className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full border border-surface-container-highest bg-surface-container text-on-surface-variant transition hover:text-on-surface active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}

        <div className="relative z-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-primary shadow-[0_0_30px_rgba(204,255,0,0.10)]">
            <span className="material-symbols-outlined text-[27px]" aria-hidden="true">
              {stage === "verify" ? "dialpad" : "shield_lock"}
            </span>
          </div>
          <p className="font-caps text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Joe Yoke account</p>
          <h2 id={dialogTitleId} className="mt-2 font-headline text-2xl font-black tracking-tight text-on-surface">
            {stage === "verify" ? "Check your inbox" : "Play with your account"}
          </h2>
          <p className="mx-auto mt-2 max-w-[270px] text-xs leading-5 text-on-surface-variant">
            {stage === "verify"
              ? `Enter the 6-digit code sent to ${email}.`
              : "Sign in once to keep your progress, rewards, and game history in sync."}
          </p>
        </div>

        {errorMsg && (
          <div role="alert" className="relative z-10 mt-5 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2.5 text-center text-xs font-semibold text-red-300">
            {errorMsg}
          </div>
        )}

        {stage === "verify" ? (
          <form onSubmit={handleVerifyOtp} className="relative z-10 mt-7 space-y-4">
            <label className="block text-left">
              <span className="mb-2 block font-caps text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">Access code</span>
              <input
                autoComplete="one-time-code"
                autoFocus
                inputMode="numeric"
                maxLength={MAX_OTP_LENGTH}
                minLength={MIN_OTP_LENGTH}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                placeholder="6-digit code"
                required
                value={otp}
                className="w-full rounded-2xl border border-surface-container-highest bg-background px-4 py-3.5 text-center font-mono text-2xl font-bold tracking-[0.42em] text-on-surface outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/15 placeholder:text-on-surface-variant"
              />
            </label>
            <button
              type="submit"
              disabled={loadingProvider === "verify" || otp.length < MIN_OTP_LENGTH}
              className="w-full rounded-2xl bg-primary py-3.5 font-headline text-sm font-black text-on-primary transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loadingProvider === "verify" ? "Verifying…" : "Verify & continue"}
            </button>
            <button type="button" onClick={returnToEmail} disabled={isBusy} className="w-full py-1 text-xs font-semibold text-on-surface-variant transition hover:text-on-surface disabled:opacity-50">
              Use a different email
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isBusy}
                className="w-full py-1 text-xs font-semibold text-on-surface-variant transition hover:text-on-surface disabled:opacity-50"
              >
                Not now
              </button>
            )}
          </form>
        ) : (
          <div className="relative z-10 mt-7">
            <form onSubmit={handleRequestOtp} className="space-y-3">
              <label className="block text-left">
                <span className="mb-2 block font-caps text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">Email address</span>
                <input
                  autoComplete="email"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                  className="w-full rounded-2xl border border-surface-container-highest bg-background px-4 py-3.5 text-sm text-on-surface outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/15 placeholder:text-on-surface-variant"
                />
              </label>
              <label className="block text-left">
                <span className="mb-2 block font-caps text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">Referral code <span className="normal-case tracking-normal">(optional)</span></span>
                <input value={referralCode} onChange={(event) => setReferralCode(event.target.value)} placeholder="Friend's referral code" className="w-full rounded-xl border border-surface-container-highest bg-background px-4 py-3 text-sm text-on-surface outline-none focus:border-primary" />
              </label>
              <button
                type="submit"
                disabled={isBusy}
                className="w-full rounded-2xl bg-primary py-3.5 font-headline text-sm font-black text-on-primary transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loadingProvider === "email" ? "Sending code…" : "Continue with email"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-white/10" />
              <span className="font-caps text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-2.5">
              {availableProviders.map((provider) => {
                const { icon, label } = providerDetails[provider];
                const isLoading = loadingProvider === provider;
                return (
                  <button
                    key={provider}
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleSocialLogin(provider)}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl border border-surface-container-highest bg-surface-container px-4 py-3.5 font-headline text-sm font-bold text-on-surface transition hover:bg-surface-variant active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className={provider === "apple" ? "text-xl leading-none" : provider === "telegram" ? "text-base leading-none text-[#2AABEE]" : "text-base leading-none font-black text-[#4285F4]"} aria-hidden="true">
                      {icon}
                    </span>
                    {isLoading ? "Connecting…" : label}
                  </button>
                );
              })}
            </div>

            <p className="mt-5 text-center text-[11px] leading-4 text-white/35">
              New here? Your account is created automatically the first time you continue.
            </p>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isBusy}
                className="mt-4 w-full py-2 text-xs font-semibold text-on-surface-variant transition hover:text-on-surface disabled:opacity-50"
              >
                Not now
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
