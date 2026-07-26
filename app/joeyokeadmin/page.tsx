"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Users, Coins, Gamepad2, AlertTriangle, Store, Activity } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPoints: 0,
    activeMatches: 0,
  });

  useEffect(() => {
    const fetchSystemTelemetry = async () => {
      // Fetch Total Users
      const { count: userCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      
      // Fetch Economic Volume (Sum of all points in the system)
      const { data: pointData } = await supabase
        .from("profiles")
        .select("points");
      const totalEconomy = pointData?.reduce((acc, row) => acc + (row.points || 0), 0) || 0;

      // Fetch Active Matches
      const { count: matchCount } = await supabase
        .from("game_sessions")
        .select("*", { count: "exact", head: true })
        .eq("state", "active");

      setStats({
        totalUsers: userCount || 0,
        totalPoints: totalEconomy,
        activeMatches: matchCount || 0,
      });
    };

    fetchSystemTelemetry();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* HEADER */}
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-headline text-2xl font-black text-white tracking-tight">System Telemetry</h2>
          <p className="font-body text-xs text-neutral-400 mt-1">Live metrics from the Joe Yoke production grid.</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 shadow-sm">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]"></span>
          <span className="font-headline text-[10px] font-black text-emerald-400 uppercase tracking-widest">
            All Systems Operational
          </span>
        </div>
      </header>

      {/* KPI METRICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Node Metric */}
        <div className="bg-[#18181b] p-6 rounded-[24px] border border-white/10 shadow-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Users className="w-24 h-24 text-white" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 mb-6">
              <Activity className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-headline text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">
                Registered Nodes
              </h3>
              <p className="font-headline text-4xl font-black text-white tracking-tight">
                {stats.totalUsers.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Economy Metric */}
        <div className="bg-[#18181b] p-6 rounded-[24px] border border-white/10 shadow-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Coins className="w-24 h-24 text-[#CCFF00]" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="w-10 h-10 bg-[#CCFF00]/10 rounded-xl flex items-center justify-center border border-[#CCFF00]/20 mb-6">
              <Coins className="w-5 h-5 text-[#CCFF00]" />
            </div>
            <div>
              <h3 className="font-headline text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">
                Global Economy (PTS)
              </h3>
              <p className="font-headline text-4xl font-black text-[#CCFF00] tracking-tight drop-shadow-[0_0_15px_rgba(204,255,0,0.2)]">
                {stats.totalPoints.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Match Metric */}
        <div className="bg-[#18181b] p-6 rounded-[24px] border border-white/10 shadow-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Gamepad2 className="w-24 h-24 text-rose-500" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center border border-rose-500/20 mb-6">
              <Gamepad2 className="w-5 h-5 text-rose-500" />
            </div>
            <div>
              <h3 className="font-headline text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-1">
                Active Arenas
              </h3>
              <p className="font-headline text-4xl font-black text-rose-400 tracking-tight">
                {stats.activeMatches.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* QUICK ACTIONS SECTION */}
      <section className="pt-4">
        <h3 className="font-headline text-xs font-black text-white uppercase tracking-widest mb-4">
          Command Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <button className="bg-[#18181b] p-5 rounded-[24px] border border-white/5 shadow-lg flex items-center gap-5 hover:bg-white/[0.02] hover:border-white/20 transition-all text-left group">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 group-hover:scale-105 transition-transform shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-headline text-sm font-black text-white tracking-wide">Review Reports</h4>
              <p className="font-body text-xs text-neutral-400 mt-1 leading-relaxed">
                Check pending user flags and chat abuse.
              </p>
            </div>
          </button>
          
          <button className="bg-[#18181b] p-5 rounded-[24px] border border-white/5 shadow-lg flex items-center gap-5 hover:bg-white/[0.02] hover:border-white/20 transition-all text-left group">
            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:scale-105 transition-transform shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-headline text-sm font-black text-white tracking-wide">Inject Store Item</h4>
              <p className="font-body text-xs text-neutral-400 mt-1 leading-relaxed">
                Add new cosmetics or token packs to the shop.
              </p>
            </div>
          </button>

        </div>
      </section>

    </div>
  );
}