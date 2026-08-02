"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Settings,
  ShieldAlert,
  Wrench,
  Flame,
  UserPlus,
  Gift,
  Trophy,
  Mail,
  Save,
  RefreshCw,
  CheckCircle2,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";

export default function SiteSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // --- CONFIG FORM STATES ---
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [globalMultiplier, setGlobalMultiplier] = useState<number | "">(1.0);
  const [signupsEnabled, setSignupsEnabled] = useState(true);
  const [redemptionsEnabled, setRedemptionsEnabled] = useState(true);
  const [leaderboardsEnabled, setLeaderboardsEnabled] = useState(true);
  const [supportEmail, setSupportEmail] = useState("");
  const [profileEditCost, setProfileEditCost] = useState<number | "">(100);
  const [profileEditCurrency, setProfileEditCurrency] = useState<"points" | "gems">("points");

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("platform_config")
        .select("*")
        .eq("id", 1)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setMaintenanceMode(data.maintenance_mode ?? false);
        setMaintenanceMessage(data.maintenance_message || "");
        setGlobalMultiplier(data.global_point_multiplier ?? 1.0);
        setSignupsEnabled(data.signups_enabled ?? true);
        setRedemptionsEnabled(data.redemptions_enabled ?? true);
        setLeaderboardsEnabled(data.leaderboards_enabled ?? true);
        setSupportEmail(data.support_email || "");
        setProfileEditCost(data.profile_edit_cost ?? 100);
        setProfileEditCurrency(data.profile_edit_currency === "gems" ? "gems" : "points");
      }
    } catch (err: any) {
      console.error("Error fetching platform config:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      const updates = {
        id: 1,
        maintenance_mode: maintenanceMode,
        maintenance_message: maintenanceMessage.trim(),
        global_point_multiplier: globalMultiplier === "" ? 1.0 : Number(globalMultiplier),
        signups_enabled: signupsEnabled,
        redemptions_enabled: redemptionsEnabled,
        leaderboards_enabled: leaderboardsEnabled,
        support_email: supportEmail.trim(),
        profile_edit_cost: Math.max(0, Number(profileEditCost || 0)),
        profile_edit_currency: profileEditCurrency,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("platform_config")
        .upsert(updates);

      if (error) throw error;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert("Error saving settings: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">
        Loading Platform Controls...
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in relative pb-16">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
            Admin / Phase 4
          </p>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">
            Site Settings & Feature Toggles
          </h2>
          <p className="font-body text-xs text-neutral-400 mt-1">
            Configure system-wide operational parameters, economy multipliers, and feature switches.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={fetchConfig}
            className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white hover:border-white/20 transition-all shadow-lg group"
            title="Refresh Settings"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
          <button
            type="submit"
            form="platform-settings-form"
            disabled={saving}
            className="flex items-center gap-2 bg-[#CCFF00] px-6 py-2.5 rounded-xl text-xs font-black text-black hover:bg-[#b3e600] transition-all shadow-[0_0_20px_rgba(204,255,0,0.25)] active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </header>

      {/* SUCCESS NOTIFICATION BANNER */}
      {saveSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-3 text-emerald-400 text-xs font-bold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>Platform settings have been successfully updated and applied live!</span>
        </div>
      )}

      {/* MAINTENANCE MODE ALERT BANNER */}
      {maintenanceMode && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center gap-3 text-rose-400 text-xs font-bold animate-pulse">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>WARNING: Maintenance Mode is currently ACTIVE. Non-admin users are blocked from accessing arcade services.</span>
        </div>
      )}

      {/* FORM WRAPPER */}
      <form id="platform-settings-form" onSubmit={handleSaveConfig} className="space-y-6">
        
        {/* SECTION 1: MAINTENANCE CONTROL */}
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-white/5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-headline text-lg font-black text-white">System Operations & Maintenance</h3>
              <p className="text-xs text-neutral-400">Lock down the arcade for scheduled updates or emergency patches.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <div>
                <p className="text-xs font-bold text-white">Maintenance Mode Switch</p>
                <p className="text-[10px] text-neutral-500">Redirects regular players to a maintenance screen.</p>
              </div>
              <button
                type="button"
                onClick={() => setMaintenanceMode(!maintenanceMode)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all border ${
                  maintenanceMode
                    ? "bg-rose-500 text-white border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                    : "bg-white/5 text-neutral-400 border-white/10 hover:text-white"
                }`}
              >
                {maintenanceMode ? "Enabled (Lockdown)" : "Disabled (Online)"}
              </button>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                Maintenance Display Message
              </label>
              <textarea
                rows={3}
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="Message displayed to players on the maintenance overlay..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors resize-none"
              ></textarea>
            </div>
          </div>
        </div>

        {/* SECTION 2: ECONOMY & MULTIPLIERS */}
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-white/5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-headline text-lg font-black text-white">Global Economy & Multipliers</h3>
              <p className="text-xs text-neutral-400">Set platform-wide reward boosts for events and promotional weekends.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                Global Point Multiplier (e.g. 2.0 = Double Points)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="10.0"
                  value={globalMultiplier}
                  onChange={(e) => setGlobalMultiplier(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                />
                <span className="font-headline text-lg font-black text-[#CCFF00] bg-[#CCFF00]/10 border border-[#CCFF00]/20 px-4 py-2 rounded-xl shrink-0">
                  {globalMultiplier || 1.0}x PTS
                </span>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl text-xs text-neutral-400 leading-relaxed">
              <span className="text-white font-bold block mb-1 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Multiplier Effect
              </span>
              All point payouts from daily logins, tournaments, and reward rules will be automatically multiplied by this factor in real time.
            </div>
          </div>
        </div>

        {/* SECTION 3: FEATURE FLAGS */}
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-white/5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-headline text-lg font-black text-white">Platform Feature Flags</h3>
              <p className="text-xs text-neutral-400">Enable or disable specific user-facing subsystems on the fly.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* SIGNUPS TOGGLE */}
            <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                <button
                  type="button"
                  onClick={() => setSignupsEnabled(!signupsEnabled)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all border ${
                    signupsEnabled
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {signupsEnabled ? "Active" : "Disabled"}
                </button>
              </div>
              <div>
                <p className="font-bold text-white text-xs">New Player Registration</p>
                <p className="text-[10px] text-neutral-500 mt-1">Allow new accounts to sign up on Joe Yoke.</p>
              </div>
            </div>

            {/* REDEMPTIONS TOGGLE */}
            <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <Gift className="w-5 h-5 text-amber-400" />
                <button
                  type="button"
                  onClick={() => setRedemptionsEnabled(!redemptionsEnabled)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all border ${
                    redemptionsEnabled
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {redemptionsEnabled ? "Active" : "Disabled"}
                </button>
              </div>
              <div>
                <p className="font-bold text-white text-xs">Prize Store Redemptions</p>
                <p className="text-[10px] text-neutral-500 mt-1">Allow players to redeem points for store items.</p>
              </div>
            </div>

            {/* LEADERBOARDS TOGGLE */}
            <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <Trophy className="w-5 h-5 text-[#CCFF00]" />
                <button
                  type="button"
                  onClick={() => setLeaderboardsEnabled(!leaderboardsEnabled)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all border ${
                    leaderboardsEnabled
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {leaderboardsEnabled ? "Active" : "Disabled"}
                </button>
              </div>
              <div>
                <p className="font-bold text-white text-xs">Public Leaderboards</p>
                <p className="text-[10px] text-neutral-500 mt-1">Display top player ranks and high score standings.</p>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 4: PLATFORM METADATA */}
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-xl space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-white/5">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-headline text-lg font-black text-white">Support & Platform Contact</h3>
              <p className="text-xs text-neutral-400">Official contact points rendered in footers and help modals.</p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
              Primary Support Email
            </label>
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@joeyoke.com"
              className="w-full md:w-96 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors font-mono"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Profile edit cost after first free edit
              <input
                type="number"
                min="0"
                value={profileEditCost}
                onChange={(e) => setProfileEditCost(e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
              />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Profile edit currency
              <select value={profileEditCurrency} onChange={(e) => setProfileEditCurrency(e.target.value as "points" | "gems")} className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]">
                <option value="points">Points</option>
                <option value="gems">Gems</option>
              </select>
            </label>
          </div>
        </div>

      </form>
    </div>
  );
}
