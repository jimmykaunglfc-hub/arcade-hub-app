"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface AuthViewProps {
  onAuthSuccess: () => void;
}

export default function AuthView({ onAuthSuccess }: AuthViewProps) {
  // We added a "verify" mode for the OTP screen
  const [mode, setMode] = useState<"signin" | "register" | "verify">("signin");
  
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // STEP 1: Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (mode === "register" && !username.trim()) {
        throw new Error("Network Handle is required for new accounts.");
      }

      // This sends the OTP to the user (works for both new and existing users)
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true, // Allows new users to be created on the fly
        }
      });

      if (error) throw error;

      // Switch UI to OTP entry mode
      setSuccessMsg("Signal sent! Check your email for the 6-digit access code.");
      setMode("verify");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to request access code.");
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: { session }, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'email'
      });

      if (error) throw error;

      // If they were registering, save their chosen username to their profile
      if (mode === "verify" && username && session?.user) {
        await supabase.from("profiles")
          .update({ username: username.trim() })
          .eq("id", session.user.id);
      }

      onAuthSuccess();
    } catch (err: any) {
      setErrorMsg("Invalid or expired code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      onAuthSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || "Guest login failed.");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-8">
      <div className="w-full max-w-sm bg-[#111c33]/80 backdrop-blur-xl border border-white/5 rounded-[32px] p-6 shadow-2xl relative overflow-hidden">
        
        {/* Top Gradient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-32 bg-indigo-500/20 blur-[50px] rounded-full pointer-events-none"></div>

        {/* --- HEADER --- */}
        <div className="flex flex-col items-center mb-8 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 shadow-sm">
            <span className="material-symbols-outlined text-white text-xl">
              {mode === "verify" ? "dialpad" : "admin_panel_settings"}
            </span>
          </div>
          <h2 className="font-headline text-xl font-black text-white tracking-wide uppercase">
            {mode === "verify" ? "Enter Security Code" : "Access Matrix"}
          </h2>
          <p className="font-body text-[10px] text-white/50 mt-1 tracking-wide text-center">
            {mode === "verify" 
              ? `Code sent to ${email}` 
              : "Initialize identity synchronization pipeline"}
          </p>
        </div>

        {/* --- TAB SWITCHER (Hide during OTP phase) --- */}
        {mode !== "verify" && (
          <div className="flex bg-black/40 rounded-xl p-1 mb-6 border border-white/5 relative z-10">
            <button
              onClick={() => { setMode("signin"); setErrorMsg(null); }}
              className={`flex-1 py-2 rounded-lg font-caps text-[10px] font-bold tracking-widest uppercase transition-all ${
                mode === "signin" 
                  ? "bg-white/10 text-white shadow-sm" 
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("register"); setErrorMsg(null); }}
              className={`flex-1 py-2 rounded-lg font-caps text-[10px] font-bold tracking-widest uppercase transition-all ${
                mode === "register" 
                  ? "bg-white/10 text-white shadow-sm" 
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              Register
            </button>
          </div>
        )}

        {/* --- MESSAGES --- */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold text-center tracking-wide relative z-10">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold text-center tracking-wide relative z-10">
            {successMsg}
          </div>
        )}

        {/* --- AUTH FORMS --- */}
        {mode === "verify" ? (
          /* OTP VERIFICATION FORM */
          <form onSubmit={handleVerifyOtp} className="space-y-4 relative z-10">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-1.5 ml-1">
                6-Digit Access Code
              </label>
              <input 
                type="text" 
                required 
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000" 
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-center tracking-[0.5em] font-mono text-xl text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading || otp.length < 6}
              className="w-full mt-2 gradient-pill-primary font-caps text-[11px] font-black uppercase tracking-widest py-3.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Enter Matrix"}
            </button>

            <button 
              type="button" 
              onClick={() => { setMode("signin"); setOtp(""); setErrorMsg(null); setSuccessMsg(null); }}
              className="w-full mt-2 py-2 text-[10px] font-bold text-white/40 hover:text-white uppercase tracking-widest transition-colors"
            >
              Back to Sign In
            </button>
          </form>
        ) : (
          /* EMAIL REQUEST FORM */
          <form onSubmit={handleRequestOtp} className="space-y-4 relative z-10">
            
            {mode === "register" && (
              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-1.5 ml-1">
                  Network Handle
                </label>
                <input 
                  type="text" 
                  required 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g., PlayerOne" 
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20"
                />
              </div>
            )}

            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-1.5 ml-1">
                Email Address
              </label>
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.com" 
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20"
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full mt-2 gradient-pill-primary font-caps text-[11px] font-black uppercase tracking-widest py-3.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg disabled:opacity-50"
            >
              {loading ? "Connecting..." : "Request Access Code"}
            </button>
          </form>
        )}

        {/* --- DIVIDER --- */}
        {mode !== "verify" && (
          <>
            <div className="flex items-center gap-3 my-6 opacity-60">
              <div className="flex-1 h-px bg-white/10"></div>
              <span className="font-caps text-[8px] font-bold tracking-widest text-white/50 uppercase">Or Connect Via</span>
              <div className="flex-1 h-px bg-white/10"></div>
            </div>

            {/* --- SOCIAL BUTTONS --- */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <button type="button" className="h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </button>
              <button type="button" className="h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="white" viewBox="0 0 24 24">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.19 2.31-.88 3.5-.84 1.5.05 2.76.62 3.54 1.69-3.23 1.98-2.65 6.31.5 7.62-.75 1.58-1.57 2.86-2.62 3.7zm-4.73-14.4c-.16-1.57.99-2.99 2.5-3.32.29 1.7-1.12 3.19-2.5 3.32z"/>
                </svg>
              </button>
              <button type="button" className="h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <svg className="w-4 h-4" fill="#1877F2" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </button>
            </div>

            {/* --- GUEST LOGIN --- */}
            <button 
              type="button" 
              onClick={handleGuestLogin}
              className="w-full py-3.5 rounded-xl bg-white/5 border border-white/10 font-caps text-[10px] font-bold text-white uppercase tracking-widest hover:bg-white/10 transition-colors"
            >
              Instant Guest Pass
            </button>
          </>
        )}

      </div>
    </div>
  );
}