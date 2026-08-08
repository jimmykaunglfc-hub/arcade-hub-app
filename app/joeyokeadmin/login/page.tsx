"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { 
  Fingerprint, 
  Mail, 
  KeyRound, 
  Loader2, 
  ShieldAlert 
} from "lucide-react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    // Verify they are actually an admin before letting them proceed
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profile && (profile.role === "admin" || profile.role === "super_admin")) {
      router.replace("/joeyokeadmin");
    } else {
      await supabase.auth.signOut();
      setErrorMsg("Unauthorized: Security clearance rejected.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden selection:bg-[#CCFF00] selection:text-black">
      
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#CCFF00]/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-sm p-8 bg-[#18181b]/80 backdrop-blur-xl border border-white/10 rounded-[24px] shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-500">
        
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#CCFF00]/10 border border-[#CCFF00]/20 rounded-2xl flex items-center justify-center shadow-[0_0_15px_rgba(204,255,0,0.15)] mb-5 relative group">
            <div className="absolute inset-0 rounded-2xl bg-[#CCFF00]/20 animate-ping opacity-20"></div>
            <Fingerprint className="w-8 h-8 text-[#CCFF00]" />
          </div>
          <h1 className="font-headline text-2xl font-black text-white uppercase tracking-[0.2em] text-center">Control Core</h1>
          <p className="text-[9px] text-neutral-500 font-bold tracking-[0.3em] uppercase mt-2">Authorized Personnel Only</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold rounded-xl flex items-start gap-3 uppercase tracking-widest animate-in slide-in-from-top-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest pl-1">Admin Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="node@joeyoke.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest pl-1">Master Passkey</label>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-4 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-black text-xs uppercase tracking-[0.2em] py-4 rounded-xl transition-all active:scale-95 disabled:opacity-50 shadow-[0_0_15px_rgba(204,255,0,0.2)] flex justify-center items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              "Initialize Session"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
