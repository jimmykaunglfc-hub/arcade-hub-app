"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname(); 

  const isLoginPage = pathname === "/login";

  useEffect(() => {
    // If they are on the login page, don't run the security boot loop
    if (isLoginPage) {
      setLoading(false);
      setIsAuthorized(true);
      return;
    }

    const verifyAdminAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push("/login"); 
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile && (profile.role === "admin" || profile.role === "super_admin")) {
        setIsAuthorized(true);
      } else {
        router.push("/login"); 
      }
      setLoading(false);
    };

    verifyAdminAccess();
  }, [router, isLoginPage]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#eef2f6] dark:bg-[#091428] flex items-center justify-center transition-colors">
        <span className="text-xs font-bold text-neutral-500 dark:text-white/50 uppercase tracking-widest animate-pulse">
          Verifying Clearance...
        </span>
      </div>
    );
  }

  if (!isAuthorized) return null;

  // Render a clean screen with no sidebar for the login page
  if (isLoginPage) {
    return <main className="min-h-screen bg-[#091428]">{children}</main>;
  }

  const navItems = [
    { id: "dashboard", path: "/joeyokeadmin", icon: "dashboard", label: "Overview" },
    { id: "users", path: "/joeyokeadmin/users", icon: "group", label: "User Nodes" },
    { id: "economy", path: "/joeyokeadmin/economy", icon: "account_balance", label: "Economy Ledger" },
    { id: "games", path: "/joeyokeadmin/games", icon: "sports_esports", label: "Game Catalog" },
    { id: "reports", path: "/joeyokeadmin/reports", icon: "flag", label: "Moderation" },
  ];

  return (
    <div className="min-h-screen bg-[#eef2f6] dark:bg-[#091428] text-neutral-900 dark:text-white font-body flex transition-colors duration-300">
      <aside className="w-64 bg-white dark:bg-[#111c33] border-r border-neutral-200 dark:border-white/5 hidden md:flex flex-col transition-colors duration-300">
        <div className="p-6 border-b border-neutral-200 dark:border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#c3f400] rounded-lg flex items-center justify-center text-neutral-900 shadow-md">
            <span className="material-symbols-outlined text-lg font-bold">admin_panel_settings</span>
          </div>
          <div>
            <h1 className="font-headline text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">Control Core</h1>
            <p className="font-caps text-[8px] text-neutral-400 dark:text-white/40 font-bold uppercase tracking-widest mt-0.5">Joe Yoke OS</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link 
                key={item.id} 
                href={item.path}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                  isActive 
                    ? "bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white font-bold" 
                    : "text-neutral-500 dark:text-white/50 hover:bg-neutral-50 dark:hover:bg-white/5 hover:text-neutral-800 dark:hover:text-white/80"
                }`}
              >
                <span className={`material-symbols-outlined text-lg ${isActive ? "font-bold" : ""}`}>{item.icon}</span>
                <span className="font-headline text-xs tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-neutral-200 dark:border-white/5">
          <button 
            onClick={() => window.location.href = "https://app.joeyoke.com"} 
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-neutral-100 dark:bg-white/5 rounded-xl font-headline text-xs font-bold text-neutral-600 dark:text-white/60 hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">exit_to_app</span>
            Exit to Arcade
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {children}
      </main>
    </div>
  );
}