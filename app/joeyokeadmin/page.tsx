"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPoints: 0,
    activeMatches: 0,
  });

  useEffect(() => {
    const fetchSystemTelemetry = async () => {
      // Fetch Total Users
      const { count: userCount } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      
      // Fetch Economic Volume (Sum of all points in the system)
      const { data: pointData } = await supabase.from("profiles").select("points");
      const totalEconomy = pointData?.reduce((acc, row) => acc + (row.points || 0), 0) || 0;

      // Fetch Active Matches
      const { count: matchCount } = await supabase.from("game_sessions").select("*", { count: "exact", head: true }).eq("state", "active");

      setStats({
        totalUsers: userCount || 0,
        totalPoints: totalEconomy,
        activeMatches: matchCount || 0,
      });
    };

    fetchSystemTelemetry();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6">
      
      {/* HEADER */}
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-headline text-2xl font-black text-neutral-900 dark:text-white">System Telemetry</h2>
          <p className="font-body text-xs text-neutral-500 dark:text-on-surface-variant mt-1">Live metrics from the Joe Yoke production grid.</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 rounded-lg border border-emerald-200 dark:border-emerald-500/20 shadow-sm">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          <span className="font-caps text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">All Systems Operational</span>
        </div>
      </header>

      {/* KPI METRICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="bg-white dark:bg-surface-container-high p-6 rounded-[20px] border border-neutral-200 dark:border-white/10 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl">group</span></div>
          <h3 className="font-caps text-[10px] text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-widest mb-2 relative z-10">Registered Nodes</h3>
          <p className="font-headline text-3xl font-black text-indigo-600 dark:text-primary relative z-10">{stats.totalUsers.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-surface-container-high p-6 rounded-[20px] border border-neutral-200 dark:border-white/10 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl">account_balance</span></div>
          <h3 className="font-caps text-[10px] text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-widest mb-2 relative z-10">Global Economy (PTS)</h3>
          <p className="font-headline text-3xl font-black text-amber-500 dark:text-secondary relative z-10">{stats.totalPoints.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-surface-container-high p-6 rounded-[20px] border border-neutral-200 dark:border-white/10 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-6xl">sports_esports</span></div>
          <h3 className="font-caps text-[10px] text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-widest mb-2 relative z-10">Active Arenas</h3>
          <p className="font-headline text-3xl font-black text-emerald-500 relative z-10">{stats.activeMatches.toLocaleString()}</p>
        </div>

      </div>

      {/* QUICK ACTIONS SECTION */}
      <section className="mt-8">
        <h3 className="font-headline text-sm font-black text-neutral-900 dark:text-white uppercase mb-4">Command Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button className="bg-white dark:bg-surface-container-high p-5 rounded-[20px] border border-neutral-200 dark:border-white/10 shadow-sm flex items-center gap-4 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left group">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-primary-container/10 flex items-center justify-center text-indigo-600 dark:text-primary group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl">gavel</span>
            </div>
            <div>
              <h4 className="font-headline text-sm font-bold text-neutral-900 dark:text-white">Review Reports</h4>
              <p className="font-body text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">Check pending user flags and chat abuse.</p>
            </div>
          </button>
          
          <button className="bg-white dark:bg-surface-container-high p-5 rounded-[20px] border border-neutral-200 dark:border-white/10 shadow-sm flex items-center gap-4 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left group">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-primary-container/10 flex items-center justify-center text-indigo-600 dark:text-primary group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl">add_shopping_cart</span>
            </div>
            <div>
              <h4 className="font-headline text-sm font-bold text-neutral-900 dark:text-white">Inject Store Item</h4>
              <p className="font-body text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">Add new cosmetics or token packs to the shop.</p>
            </div>
          </button>
        </div>
      </section>

    </div>
  );
}