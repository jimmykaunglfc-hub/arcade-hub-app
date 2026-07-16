"use client";

import { useState } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

interface AuthViewProps {
  onAuthSuccess: () => void;
}

export default function AuthView({ onAuthSuccess }: AuthViewProps) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: "error" | "success" } | null>(null);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setFeedbackMsg(null);

    try {
      if (authMode === "register") {
        if (!username.trim()) {
          setFeedbackMsg({ text: "Please provide a network handle tag.", type: "error" });
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
          options: { data: { username: username.trim() } }
        });

        if (error) throw error;
        setFeedbackMsg({ text: "Verification transmission sent! Check your inbox.", type: "success" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ 
          email: email.trim(), 
          password: password.trim() 
        });
        if (error) throw error;
        onAuthSuccess();
      }
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || "An authentication error occurred.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Handles Google, Apple, and Facebook single sign-on flows
  const triggerOAuthProvider = async (provider: "google" | "apple" | "facebook") => {
    setLoading(true);
    setFeedbackMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin }
      });
      if (error) throw error;
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || "OAuth handoff failure.", type: "error" });
      setLoading(false);
    }
  };

  // Implements single-tap automated guest account access
  const triggerGuestPassLogin = async () => {
    setLoading(true);
    setFeedbackMsg(null);
    const anonymousId = `guest_${Math.random().toString(36).substring(2, 11)}@joeyoke.local`;
    const ephemeralSecret = Math.random().toString(36).substring(2, 15) + "Pass!";

    try {
      const { error } = await supabase.auth.signUp({
        email: anonymousId,
        password: ephemeralSecret,
        options: { data: { username: `Guest_${Math.random().toString(36).substring(2, 6).toUpperCase()}` } }
      });
      if (error) throw error;
      onAuthSuccess();
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || "Guest allocation failure.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto my-4 p-6 bg-white/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10 backdrop-blur-xl rounded-[24px] shadow-sm animate-fade-in text-neutral-800 dark:text-on-background">
      
      {/* 🛡️ BRAND IDENTITY HEADER */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="relative w-14 h-14 rounded-2xl overflow-hidden border border-neutral-200 dark:border-white/10 bg-white dark:bg-surface-container-high shadow-sm mb-3 flex items-center justify-center transition-colors">
          <Image src="/joeyoke-logo.png" alt="Joe Yoke Logo" fill className="object-contain p-2" unoptimized />
        </div>
        <h2 className="font-headline text-lg font-black tracking-tight text-neutral-900 dark:text-white uppercase">
          Access Matrix
        </h2>
        <p className="font-body text-[10px] text-neutral-500 dark:text-on-surface-variant mt-0.5">
          Initialize identity synchronization pipeline
        </p>
      </div>

      {/* 🏷️ TOGGLE CONTROLS BAR */}
      <div className="bg-neutral-100 dark:bg-white/5 p-1 rounded-xl flex items-center mb-5 border border-neutral-200/50 dark:border-white/5 transition-colors">
        <button 
          onClick={() => { setAuthMode("login"); setFeedbackMsg(null); }}
          className={`flex-1 py-1.5 font-caps text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all ${
            authMode === "login" 
              ? "bg-white dark:bg-surface-container-high text-indigo-600 dark:text-primary shadow-sm" 
              : "text-neutral-400 dark:text-on-surface-variant hover:text-neutral-600 dark:hover:text-white"
          }`}
        >
          Sign In
        </button>
        <button 
          onClick={() => { setAuthMode("register"); setFeedbackMsg(null); }}
          className={`flex-1 py-1.5 font-caps text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all ${
            authMode === "register" 
              ? "bg-white dark:bg-surface-container-high text-indigo-600 dark:text-primary shadow-sm" 
              : "text-neutral-400 dark:text-on-surface-variant hover:text-neutral-600 dark:hover:text-white"
          }`}
        >
          Register
        </button>
      </div>

      {/* ⚠️ FEEDBACK MESSAGES */}
      {feedbackMsg && (
        <div className={`mb-4 p-3 rounded-xl text-[10px] font-bold border transition-colors ${
          feedbackMsg.type === "error" 
            ? "bg-red-50 dark:bg-red-500/10 text-red-500 border-red-200 dark:border-red-500/20" 
            : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
        }`}>
          {feedbackMsg.text}
        </div>
      )}

      {/* 📧 NATIVE FORM INPUT LAYOUTS */}
      <form onSubmit={handleEmailAuth} className="space-y-3">
        {authMode === "register" && (
          <div>
            <label className="font-caps text-[8px] font-bold tracking-widest text-neutral-400 dark:text-on-surface-variant uppercase block mb-1 px-1">
              Network Handle
            </label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              placeholder="e.g., PlayerOne"
              className="w-full bg-neutral-50 dark:bg-surface-container-high border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-2.5 font-body text-xs focus:outline-none focus:border-indigo-500 dark:focus:border-primary text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-on-surface-variant transition-colors"
            />
          </div>
        )}

        <div>
          <label className="font-caps text-[8px] font-bold tracking-widest text-neutral-400 dark:text-on-surface-variant uppercase block mb-1 px-1">
            Email Address
          </label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            placeholder="name@domain.com"
            className="w-full bg-neutral-50 dark:bg-surface-container-high border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-2.5 font-body text-xs focus:outline-none focus:border-indigo-500 dark:focus:border-primary text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-on-surface-variant transition-colors"
          />
        </div>

        <div>
          <label className="font-caps text-[8px] font-bold tracking-widest text-neutral-400 dark:text-on-surface-variant uppercase block mb-1 px-1">
            Security Passkey
          </label>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            placeholder="••••••••"
            className="w-full bg-neutral-50 dark:bg-surface-container-high border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-2.5 font-body text-xs focus:outline-none focus:border-indigo-500 dark:focus:border-primary text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-on-surface-variant transition-colors"
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full py-3 mt-4 gradient-pill-primary font-headline font-bold text-xs uppercase tracking-wider rounded-xl shadow-md active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? "Processing..." : authMode === "login" ? "Sign In To Account" : "Initialize Account"}
        </button>
      </form>

      {/* 🌐 MULTI-PROVIDER SOCIAL HUB SPLITTER */}
      <div className="relative flex items-center justify-center my-6">
        <div className="w-full border-t border-neutral-200 dark:border-white/5 transition-colors"></div>
        <span className="absolute bg-[#eef2f6] dark:bg-background px-3 font-caps text-[8px] font-bold text-neutral-400 dark:text-on-surface-variant uppercase tracking-widest transition-colors">
          Or Connect Via
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button 
          onClick={() => triggerOAuthProvider("google")} 
          disabled={loading}
          className="py-2.5 bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-white/10 transition-colors active:scale-95 shadow-sm"
        >
          <img src="https://img.icons8.com/color/24/google-logo.png" className="w-5 h-5 object-contain" alt="Google" />
        </button>
        <button 
          onClick={() => triggerOAuthProvider("apple")} 
          disabled={loading}
          className="py-2.5 bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-white/10 transition-colors active:scale-95 shadow-sm"
        >
          <img src="https://img.icons8.com/ios-filled/24/mac-os.png" className="w-5 h-5 object-contain dark:invert" alt="Apple" />
        </button>
        <button 
          onClick={() => triggerOAuthProvider("facebook")} 
          disabled={loading}
          className="py-2.5 bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-white/10 transition-colors active:scale-95 shadow-sm"
        >
          <img src="https://img.icons8.com/color/24/facebook-new.png" className="w-5 h-5 object-contain" alt="Facebook" />
        </button>
      </div>

      {/* 🚪 QUICK GUEST DECK ACCESS PASS */}
      <button 
        onClick={triggerGuestPassLogin}
        disabled={loading}
        className="w-full mt-5 py-2.5 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/50 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/5 text-neutral-600 dark:text-primary font-headline text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-sm"
      >
        Instant Guest Pass
      </button>

    </div>
  );
}