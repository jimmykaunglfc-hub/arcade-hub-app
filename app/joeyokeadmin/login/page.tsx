"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";

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
      router.push("/"); // Middleware maps "/" on this subdomain to /joeyokeadmin
    } else {
      await supabase.auth.signOut();
      setErrorMsg("Unauthorized: Security clearance rejected.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#091428]">
      <div className="w-full max-w-sm p-8 bg-[#111c33] border border-white/10 rounded-2xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#c3f400] rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <span className="material-symbols-outlined text-3xl text-neutral-900 font-bold">admin_panel_settings</span>
          </div>
          <h1 className="text-xl font-black text-white uppercase tracking-widest">Control Core</h1>
          <p className="text-[10px] text-white/40 font-bold tracking-widest uppercase mt-1">Authorized Personnel Only</p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold rounded-lg text-center uppercase tracking-wider">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div>
            <label className="text-[9px] text-white/60 font-bold uppercase tracking-widest pl-1 mb-1 block">Admin Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#c3f400] transition-colors"
            />
          </div>
          <div>
            <label className="text-[9px] text-white/60 font-bold uppercase tracking-widest pl-1 mb-1 block">Master Passkey</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#c3f400] transition-colors"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-2 bg-[#c3f400] hover:bg-[#d4ff1a] text-neutral-900 font-black text-xs uppercase tracking-widest py-3 rounded-xl transition-colors active:scale-95 disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Initialize Session"}
          </button>
        </form>
      </div>
    </div>
  );
}