"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ProfileTab() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 📡 Dynamically fetch user metadata block on layout mounting
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    fetchUser();
  }, []);

  // 🚪 Gracefully terminate active session state
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // Next.js automatically responds to onAuthStateChange inside app/page.tsx, instantly flipping the view back to the login screen.
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest">Compiling Profile Matrix...</span>
      </div>
    );
  }

  // Fallback state in case access checks fail
  if (!user) return null;

  // Clean layout helper for account age tracking
  const formatJoinedDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString([], {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Generate a distinct avatar asset tied permanently to their unique account ID string
  const userAvatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`;

  return (
    <div className="w-full bg-gradient-to-b from-surface-variant/20 to-surface rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden p-6 animate-fade-in">
      
      {/* 👤 HERO ACCOUNT PANEL CARD */}
      <div className="flex flex-col items-center text-center pb-6 border-b border-white/5">
        <div className="relative w-20 h-20 rounded-[1.5rem] bg-primary/10 border border-primary/30 flex items-center justify-center shadow-lg overflow-hidden mb-4">
          <img 
            src={userAvatarUrl} 
            alt="Secure Identity Vector node" 
            className="w-full h-full object-cover p-1" 
          />
        </div>
        <h3 className="text-sm font-black text-white tracking-tight break-all max-w-full px-4">
          {user.email}
        </h3>
        <span className="text-[9px] text-primary font-extrabold uppercase tracking-widest mt-1.5 px-2.5 py-1 bg-primary/10 rounded-full border border-primary/20">
          Verified Player Node
        </span>
      </div>

      {/* 📊 CORE SECURITY & METADATA DETAILS MATRIX */}
      <div className="py-6 space-y-4">
        <div>
          <label className="block text-[9px] text-on-surface-variant/40 font-black uppercase tracking-wider mb-1.5 pl-1">
            System Network Identifier (UID)
          </label>
          <div className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-[11px] font-mono text-on-surface-variant break-all select-all">
            {user.id}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-variant/30 border border-white/5 p-3.5 rounded-xl">
            <span className="block text-[8px] text-on-surface-variant/40 font-black uppercase tracking-wider">
              Identity Genesis
            </span>
            <span className="block text-xs font-bold text-white mt-1">
              {formatJoinedDate(user.created_at)}
            </span>
          </div>

          <div className="bg-surface-variant/30 border border-white/5 p-3.5 rounded-xl">
            <span className="block text-[8px] text-on-surface-variant/40 font-black uppercase tracking-wider">
              Encryption Protocol
            </span>
            <span className="block text-xs font-bold text-secondary mt-1">
              Supabase JWT
            </span>
          </div>
        </div>
      </div>

      {/* 🛑 DESTRUCTIVE OPERATIONS LAYER */}
      <div className="pt-2 border-t border-white/5 space-y-3">
        <button
          onClick={handleSignOut}
          className="w-full h-11 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold rounded-xl flex items-center justify-center gap-2 text-xs tracking-wider uppercase active:scale-98 transition-all"
        >
          <span className="material-symbols-outlined text-sm font-bold">logout</span>
          Terminate Identity Session
        </button>
      </div>

    </div>
  );
}