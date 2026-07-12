"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Image from "next/image";

export default function AuthView({ onAuthSuccess }: { onAuthSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"credentials" | "otp">("credentials"); // credentials -> otp tracking
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ✉️ Trigger Email OTP Send (Handles both SignUp and Login seamlessly)
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true, // Automatically registers if account doesn't exist
      },
    });

    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
    } else {
      setSuccessMessage("One-Time Password (OTP) dispatched to your inbox!");
      setStep("otp");
    }
  };

  // 🔑 Verify the token code entered by user
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;

    setLoading(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otpCode.trim(),
      type: "email",
    });

    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
    } else {
      onAuthSuccess();
    }
  };

  // 🌐 OAuth SSO Pipelines
  const handleSSOLogin = async (provider: "google" | "apple") => {
    setLoading(true);
    setErrorMessage(null);
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: {
        redirectTo: window.location.origin, // Returns right back to your localhost or custom domain
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-gradient-to-b from-surface-variant/20 to-surface rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden p-6 md:p-8 animate-fade-in my-8">
      
      {/* Dynamic Header */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-primary/30 bg-surface shadow-lg mb-4 flex items-center justify-center">
          <Image src="/joeyoke-logo.png" alt="Joe Yoke Logo" fill className="object-cover p-2" unoptimized />
        </div>
        <h2 className="text-xl font-black text-white tracking-tight">Access JOE YOKE Matrix</h2>
        <p className="text-xs text-on-surface-variant/60 mt-1">Initialize identity synchronization pipeline</p>
      </div>

      {/* Alert Notices */}
      {errorMessage && (
        <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-medium">
          ⚠️ {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3.5 bg-secondary/10 border border-secondary/20 rounded-xl text-xs text-secondary font-medium animate-pulse">
          ✨ {successMessage}
        </div>
      )}

      {/* STEP A: Email Gateway Form */}
      {step === "credentials" && (
        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label className="block text-[10px] text-primary font-black uppercase tracking-wider mb-1.5 pl-1">
              Email Address
            </label>
            <input
              type="email"
              required
              disabled={loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.com"
              className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white placeholder-on-surface-variant/40 focus:outline-none focus:border-primary/40 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-primary text-on-primary font-bold rounded-xl flex items-center justify-center text-xs tracking-wider uppercase shadow-[0_4px_12px_rgba(192,193,255,0.15)] active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? "Processing..." : "Transmit OTP Access Code"}
          </button>
        </form>
      )}

      {/* STEP B: OTP Token Entry Form */}
      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label className="block text-[10px] text-secondary font-black uppercase tracking-wider mb-1.5 pl-1">
              Enter 6-Digit Verification Passkey
            </label>
            <input
              type="text"
              required
              maxLength={6}
              disabled={loading}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="000000"
              className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-center text-lg font-black tracking-[0.75em] text-white placeholder-on-surface-variant/20 focus:outline-none focus:border-secondary/40 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-secondary text-on-secondary font-bold rounded-xl flex items-center justify-center text-xs tracking-wider uppercase shadow-md active:scale-95 transition-all"
          >
            {loading ? "Validating..." : "Confirm Identity Code"}
          </button>

          <button
            type="button"
            onClick={() => setStep("credentials")}
            className="w-full text-center text-[10px] text-on-surface-variant font-bold hover:text-white transition-colors pt-2"
          >
            Modify email destination address
          </button>
        </form>
      )}

      {/* SSO Splitter Line */}
      <div className="relative flex py-5 items-center">
        <div className="flex-grow border-t border-white/5"></div>
        <span className="flex-shrink mx-4 text-[9px] text-on-surface-variant/40 font-black tracking-widest uppercase">Secure Third Party Identity Single Sign-On</span>
        <div className="flex-grow border-t border-white/5"></div>
      </div>

      {/* Social SSO Buttons Array */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleSSOLogin("google")}
          disabled={loading}
          className="h-10 bg-surface-variant/40 hover:bg-surface-variant/60 border border-white/5 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-98"
        >
          <svg className="w-4 h-4 fill-white opacity-80" viewBox="0 0 24 24">
            <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.986 0-.746-.08-1.32-.176-1.884H12.24z"/>
          </svg>
          <span className="text-[10px] font-bold text-white tracking-wide">Google SSO</span>
        </button>

        <button
          type="button"
          onClick={() => handleSSOLogin("apple")}
          disabled={loading}
          className="h-10 bg-surface-variant/40 hover:bg-surface-variant/60 border border-white/5 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-98"
        >
          <svg className="w-4 h-4 fill-white opacity-80" viewBox="0 0 24 24">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.64.74-1.2 1.88-1.05 3 .12.01.24.02.36.02.95 0 2.12-.64 2.64-1.46z"/>
          </svg>
          <span className="text-[10px] font-bold text-white tracking-wide">Apple ID</span>
        </button>
      </div>

    </div>
  );
}