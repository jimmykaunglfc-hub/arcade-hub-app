"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const verifyAdminAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push("/"); // Kick to main app if not logged in
        return;
      }

      // Check the user's role in the database
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile && (profile.role === "admin" || profile.role === "super_admin")) {
        setIsAuthorized(true);
      } else {
        router.push("/"); // Kick back to arcade if they are just a 'player'
      }
      setLoading(false);
    };

    verifyAdminAccess();
  }, [router]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#eef2f6] dark:bg-background flex items-center justify-center transition-colors">
        <span className="text-xs font-bold text-neutral-500 dark:text-on-surface-variant uppercase tracking-widest animate-pulse">
          Verifying Clearance...
        </span>
      </div>
    );
  }

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-[#eef2f6] dark:bg-background text-[#091428] dark:text-white font-body flex transition-colors duration-300">
      {/* 🛡️ ADMIN SIDEBAR */}
      <aside className="w-64 bg-white dark:bg-surface-container-high border-r border-neutral-200 dark:border-white/10 hidden md:flex flex-col transition-colors duration-300">
        <div className="p-6 border-b border-neutral-200 dark:border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 dark:bg-primary-container rounded-lg flex items-center justify-center text-white dark:text-neutral-900 shadow-md">
            <span className="material-symbols-outlined text-lg">admin_panel_settings</span>
          </div>
          <div>
            <h1 className="font-headline text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-primary">Control Core</h1>
            <p className="font-caps text-[8px] text-neutral-400 dark:text-on-surface-variant font-bold uppercase tracking-widest mt-0.5">Joe Yoke OS</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {[
            { id: "dashboard", icon: "dashboard", label: "Overview" },
            { id: "users", icon: "group", label: "User Nodes" },
            { id: "economy", icon: "account_balance", label: "Economy Ledger" },
            { id: "games", icon: "sports_esports", label: "Game Catalog" },
            { id: "reports", icon: "flag", label: "Moderation" },
          ].map((item) => (
            <button key={item.id} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors text-neutral-600 dark:text-neutral-300 hover:text-indigo-600 dark:hover:text-primary">
              <span className="material-symbols-outlined text-lg">{item.icon}</span>
              <span className="font-headline text-xs font-bold">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-neutral-200 dark:border-white/10">
          <button onClick={() => router.push("/")} className="w-full flex items-center justify-center gap-2 py-2.5 bg-neutral-100 dark:bg-white/5 rounded-xl font-headline text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-sm">exit_to_app</span>
            Exit to Arcade
          </button>
        </div>
      </aside>

      {/* 🖥️ MAIN ADMIN CONTENT PORTAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {children}
      </main>
    </div>
  );
}