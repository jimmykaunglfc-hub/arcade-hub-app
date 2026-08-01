"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface AuthViewProps {
  onAuthSuccess: () => void;
}

type AuthStage = "email" | "verify";
type SocialProvider = "google" | "apple" | "telegram";

const providerDetails: Record<SocialProvider, { label: string; icon: string }> = {
  google: { label: "Continue with Google", icon: "G" },
  apple: { label: "Continue with Apple", icon: "\uf8ff" },
  telegram: { label: "Continue with Telegram", icon: "➤" },
};

export default function AuthView({ onAuthSuccess }: AuthViewProps) {
  const [stage, setStage] = useState<AuthStage>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | "email" | "verify" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const clearFeedback = () => setErrorMsg(null);

  const handleRequestOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadingProvider("email");
    clearFeedback();

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
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
      const { error } = await supabase.auth.signInWithOAuth({
        // Telegram must be configured in Supabase as a custom OIDC provider named "telegram".
        provider: provider === "telegram" ? "custom:telegram" : provider,
        options: { redirectTo: window.location.origin },
      });

      if (error) throw error;
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

  return (
    <section className="flex-1 flex items-center justify-center py-6">
      <div className="relative w-full max-w-sm overflow-hidden rounded-[30px] border border-white/10 bg-[#101a31]/95 p-5 shadow-[0_28px_80px_rgba(0,0,0,0.42)] sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(86,112,255,0.24),transparent_70%)]" />

        <div className="relative z-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-primary shadow-[0_0_30px_rgba(204,255,0,0.10)]">
            <span className="material-symbols-outlined text-[27px]" aria-hidden="true">
              {stage === "verify" ? "dialpad" : "shield_lock"}
            </span>
          </div>
          <p className="font-caps text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Joe Yoke account</p>
          <h2 className="mt-2 font-headline text-2xl font-black tracking-tight text-white">
            {stage === "verify" ? "Check your inbox" : "Play with your account"}
          </h2>
          <p className="mx-auto mt-2 max-w-[270px] text-xs leading-5 text-white/55">
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
              <span className="mb-2 block font-caps text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Access code</span>
              <input
                autoComplete="one-time-code"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                required
                value={otp}
                className="w-full rounded-2xl border border-white/10 bg-[#080d1b] px-4 py-3.5 text-center font-mono text-2xl font-bold tracking-[0.42em] text-white outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/15 placeholder:text-white/20"
              />
            </label>
            <button
              type="submit"
              disabled={loadingProvider === "verify" || otp.length !== 6}
              className="w-full rounded-2xl bg-primary py-3.5 font-headline text-sm font-black text-on-primary transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loadingProvider === "verify" ? "Verifying…" : "Verify & continue"}
            </button>
            <button type="button" onClick={returnToEmail} disabled={isBusy} className="w-full py-1 text-xs font-semibold text-white/50 transition hover:text-white disabled:opacity-50">
              Use a different email
            </button>
          </form>
        ) : (
          <div className="relative z-10 mt-7">
            <form onSubmit={handleRequestOtp} className="space-y-3">
              <label className="block text-left">
                <span className="mb-2 block font-caps text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Email address</span>
                <input
                  autoComplete="email"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                  className="w-full rounded-2xl border border-white/10 bg-[#080d1b] px-4 py-3.5 text-sm text-white outline-none transition focus:border-primary/70 focus:ring-2 focus:ring-primary/15 placeholder:text-white/25"
                />
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
              {(Object.keys(providerDetails) as SocialProvider[]).map((provider) => {
                const { icon, label } = providerDetails[provider];
                const isLoading = loadingProvider === provider;
                return (
                  <button
                    key={provider}
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleSocialLogin(provider)}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3.5 font-headline text-sm font-bold text-white transition hover:border-white/25 hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
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
          </div>
        )}
      </div>
    </section>
  );
}
