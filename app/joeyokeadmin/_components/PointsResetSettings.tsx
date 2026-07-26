"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface ResetConfig {
  schedule: "weekly" | "monthly" | "quarterly" | "manual";
  enabled: boolean;
}

export default function PointsResetSettings() {
  const [config, setConfig] = useState<ResetConfig>({ schedule: "monthly", enabled: true });
  const [lastResetAt, setLastResetAt] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["points_reset_config", "last_points_reset_at"]);

    if (data) {
      data.forEach((row) => {
        if (row.key === "points_reset_config") setConfig(row.value);
        if (row.key === "last_points_reset_at") setLastResetAt(row.value);
      });
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("system_settings")
      .upsert({ key: "points_reset_config", value: config, updated_at: new Date().toISOString() });

    setIsSaving(false);
    setMessage(error ? "Failed to save configuration." : "Settings updated successfully.");
  };

  const handleManualReset = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to reset ALL user points to 0? This action cannot be undone."
    );
    if (!confirmed) return;

    setIsResetting(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc("reset_all_user_points");
      if (error) throw error;

      setLastResetAt(data.reset_at);
      setMessage(`Successfully reset points for ${data.affected_users} users!`);
    } catch (err: any) {
      setMessage(`Reset failed: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="w-full max-w-xl bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl text-white">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <span className="material-symbols-outlined text-xl">restart_alt</span>
        </div>
        <div>
          <h2 className="text-lg font-black uppercase font-headline">User Points Reset System</h2>
          <p className="text-xs text-neutral-400">Configure recurring point cycles or wipe test data</p>
        </div>
      </div>

      {/* STATUS & LAST RUN */}
      <div className="bg-[#09090b] border border-white/5 rounded-xl p-4 mb-6 flex justify-between items-center">
        <div>
          <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest block">Last Execution</span>
          <span className="text-sm font-mono font-bold text-neutral-200">
            {lastResetAt ? new Date(lastResetAt).toLocaleString() : "Never"}
          </span>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
          config.enabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-neutral-800 text-neutral-400"
        }`}>
          {config.enabled ? "Auto-Reset Active" : "Disabled"}
        </span>
      </div>

      {/* SCHEDULE SETTINGS */}
      <div className="space-y-4 mb-6">
        <div className="flex justify-between items-center">
          <label className="text-xs font-bold text-neutral-300">Enable Automated Resets</label>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="w-4 h-4 accent-[#CCFF00] cursor-pointer"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-neutral-300 block mb-1">Recurring Interval</label>
          <select
            value={config.schedule}
            onChange={(e) => setConfig({ ...config, schedule: e.target.value as any })}
            className="w-full bg-[#09090b] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#CCFF00]"
          >
            <option value="weekly">Every Week (Sunday at 00:00 UTC)</option>
            <option value="monthly">Every Month (1st day at 00:00 UTC)</option>
            <option value="quarterly">Every Quarter (First day of Quarter)</option>
            <option value="manual">Manual Execution Only</option>
          </select>
        </div>

        <button
          onClick={handleSaveConfig}
          disabled={isSaving}
          className="w-full bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase tracking-wider py-2.5 rounded-xl transition-all border border-white/10 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Reset Schedule"}
        </button>
      </div>

      <hr className="border-white/5 my-6" />

      {/* EMERGENCY MANUAL TRIGGER */}
      <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-4">
        <h3 className="text-xs font-black text-rose-400 uppercase tracking-wider mb-1">Immediate Point Wipe</h3>
        <p className="text-[11px] text-neutral-400 mb-3">
          Instantly set all user points back to 0. Use this when clearing test accounts.
        </p>
        <button
          onClick={handleManualReset}
          disabled={isResetting}
          className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-transform active:scale-95 disabled:opacity-50 shadow-lg shadow-rose-950/30"
        >
          {isResetting ? "Resetting Points..." : "Reset All User Points To 0 Now"}
        </button>
      </div>

      {message && (
        <div className="mt-4 p-3 bg-[#09090b] border border-white/10 rounded-xl text-center text-xs font-bold text-[#CCFF00]">
          {message}
        </div>
      )}
    </div>
  );
}