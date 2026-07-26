"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import PointsResetSettings from "../_components/PointsResetSettings";
import {
  Award,
  Plus,
  Search,
  Edit2,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Coins,
  Sparkles,
  Zap,
  Calendar,
  Gamepad2,
  Trophy,
  Flame,
  UserPlus,
  X,
} from "lucide-react";

export default function RewardSystemPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [mounted, setMounted] = useState(false);

  // --- MODAL STATES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- FORM STATES ---
  const [formTitle, setFormTitle] = useState("");
  const [formTrigger, setFormTrigger] = useState<string>("daily_login");
  const [formPoints, setFormPoints] = useState<number | "">(100);
  const [formDesc, setFormDesc] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  useEffect(() => {
    setMounted(true);
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reward_rules")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setRules(data);
    } catch (err: any) {
      console.error("Error fetching reward rules:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- MODAL HANDLERS ---
  const openAddModal = () => {
    setEditingId(null);
    setFormTitle("");
    setFormTrigger("daily_login");
    setFormPoints(100);
    setFormDesc("");
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (rule: any) => {
    setEditingId(rule.id);
    setFormTitle(rule.title);
    setFormTrigger(rule.trigger_event);
    setFormPoints(rule.reward_points ?? 0);
    setFormDesc(rule.description || "");
    setFormIsActive(rule.is_active);
    setIsModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return alert("Rule title is required.");
    setSaving(true);

    try {
      const ruleData = {
        title: formTitle.trim(),
        trigger_event: formTrigger,
        reward_points: formPoints === "" ? 0 : Number(formPoints),
        description: formDesc.trim(),
        is_active: formIsActive,
      };

      if (editingId) {
        const { error } = await supabase
          .from("reward_rules")
          .update(ruleData)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reward_rules").insert(ruleData);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchRules();
    } catch (err: any) {
      alert("Error saving reward rule: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete the rule "${title}"?`)) return;
    try {
      const { error } = await supabase.from("reward_rules").delete().eq("id", id);
      if (error) throw error;
      fetchRules();
    } catch (err: any) {
      alert("Error deleting rule: " + err.message);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("reward_rules")
        .update({ is_active: !currentStatus })
        .eq("id", id);
      if (error) throw error;
      fetchRules();
    } catch (err: any) {
      alert("Error toggling status: " + err.message);
    }
  };

  const getTriggerBadge = (trigger: string) => {
    switch (trigger) {
      case "daily_login":
        return { label: "Daily Login", icon: Calendar, color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" };
      case "game_played":
        return { label: "Game Play", icon: Gamepad2, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
      case "tournament_win":
        return { label: "Tournament Win", icon: Trophy, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
      case "streak_7d":
        return { label: "7-Day Streak", icon: Flame, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" };
      case "referral":
        return { label: "Friend Referral", icon: UserPlus, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" };
      default:
        return { label: "Custom Trigger", icon: Zap, color: "text-[#CCFF00] bg-[#CCFF00]/10 border-[#CCFF00]/20" };
    }
  };

  const activeRulesCount = rules.filter((r) => r.is_active).length;
  const totalPotentialPoints = rules.reduce((acc, r) => acc + (r.reward_points || 0), 0);

  const filteredRules = rules.filter((rule) => {
    const matchesSearch =
      (rule.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rule.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent = eventFilter === "all" || rule.trigger_event === eventFilter;
    return matchesSearch && matchesEvent;
  });

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
            Admin / Reward System
          </p>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">
            Reward Rules & Triggers
          </h2>
          <p className="font-body text-xs text-neutral-400 mt-1">
            Configure point payout rules for daily logins, gameplay streaks, and achievements.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchRules}
            className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white hover:border-white/20 transition-all shadow-lg group"
            title="Refresh Rules"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-[#CCFF00] px-5 py-2.5 rounded-xl text-xs font-black text-black hover:bg-[#b3e600] transition-all shadow-[0_0_20px_rgba(204,255,0,0.25)] active:scale-95"
          >
            <Plus className="w-4 h-4" /> Add Reward Rule
          </button>
        </div>
      </header>

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Award className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Total Rules
            </p>
            <p className="font-headline text-2xl font-black text-white mt-0.5">
              {rules.length}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#CCFF00]/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-[#CCFF00]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Active Triggers
            </p>
            <p className="font-headline text-2xl font-black text-[#CCFF00] mt-0.5">
              {activeRulesCount}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-amber-500/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Coins className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Max Single Payout
            </p>
            <p className="font-headline text-2xl font-black text-amber-400 mt-0.5">
              {totalPotentialPoints.toLocaleString()} PTS
            </p>
          </div>
        </div>
      </div>

      {/* --- POINTS RESET SYSTEM CONTROL PANEL --- */}
      <section className="pt-2">
        <PointsResetSettings />
      </section>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-4 flex flex-col md:flex-row gap-4 justify-between items-center shadow-xl">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-[#CCFF00] transition-colors" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search rules by title or description..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
          />
        </div>

        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="bg-white/5 border border-white/10 text-xs font-bold text-white px-4 py-2.5 rounded-xl focus:outline-none focus:border-[#CCFF00] w-full md:w-auto appearance-none cursor-pointer"
        >
          <option value="all" className="bg-[#18181b]">All Event Triggers</option>
          <option value="daily_login" className="bg-[#18181b]">Daily Login</option>
          <option value="game_played" className="bg-[#18181b]">Game Play</option>
          <option value="tournament_win" className="bg-[#18181b]">Tournament Win</option>
          <option value="streak_7d" className="bg-[#18181b]">7-Day Streak</option>
          <option value="referral" className="bg-[#18181b]">Referral</option>
        </select>
      </div>

      {/* RULES GRID */}
      {loading ? (
        <div className="py-20 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">
          Loading Reward Engine Rules...
        </div>
      ) : filteredRules.length === 0 ? (
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Award className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="font-headline text-lg font-black text-white tracking-wide">
            No Reward Rules Found
          </h3>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm leading-relaxed">
            Create your first automated reward rule to start giving players points for login streaks and gameplay!
          </p>
          <button
            onClick={openAddModal}
            className="mt-6 bg-[#CCFF00] text-black text-xs font-black px-6 py-3 rounded-xl hover:bg-[#b3e600] transition-all shadow-[0_0_15px_rgba(204,255,0,0.2)]"
          >
            Create First Rule
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRules.map((rule) => {
            const badge = getTriggerBadge(rule.trigger_event);
            const Icon = badge.icon;

            return (
              <div
                key={rule.id}
                className={`bg-[#18181b] border rounded-[24px] overflow-hidden shadow-xl flex flex-col justify-between group relative transition-all ${
                  rule.is_active ? "border-white/10 hover:border-white/20" : "border-rose-500/20 opacity-60"
                }`}
              >
                {/* ACTION OVERLAY */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                  <button
                    onClick={() => handleToggleActive(rule.id, rule.is_active)}
                    className={`p-2 rounded-xl text-white shadow-lg transition-all ${
                      rule.is_active ? "bg-black/60 hover:bg-rose-500" : "bg-emerald-500 hover:bg-emerald-600"
                    }`}
                    title={rule.is_active ? "Deactivate Rule" : "Activate Rule"}
                  >
                    {rule.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEditModal(rule)}
                    className="p-2 bg-black/60 backdrop-blur-md text-white rounded-xl hover:bg-indigo-500 shadow-lg transition-all"
                    title="Edit Rule"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id, rule.title)}
                    className="p-2 bg-black/60 backdrop-blur-md text-white rounded-xl hover:bg-rose-500 shadow-lg transition-all"
                    title="Delete Rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* CARD BODY */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badge.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {badge.label}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-headline text-lg font-black text-white">{rule.title}</h3>
                    <p className="font-body text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                      {rule.description || "No specific details provided."}
                    </p>
                  </div>
                </div>

                {/* CARD FOOTER */}
                <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-400" /> Payout
                  </span>
                  <span className="font-headline text-lg font-black text-[#CCFF00] drop-shadow-[0_0_10px_rgba(204,255,0,0.15)]">
                    +{rule.reward_points.toLocaleString()} PTS
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- PORTALED ADD/EDIT RULE MODAL --- */}
      {isModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#18181b] border border-white/10 rounded-[28px] p-6 w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col my-auto">
            
            {/* MODAL HEADER */}
            <div className="flex justify-between items-center pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#CCFF00]" />
                <h3 className="font-headline text-lg font-black text-white">
                  {editingId ? "Edit Reward Rule" : "New Reward Rule"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* SCROLLABLE FORM */}
            <form id="reward-rule-form" onSubmit={handleSaveRule} className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 no-scrollbar">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Rule Name / Title
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g., Daily Streak Bonus"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Trigger Event
                </label>
                <select
                  value={formTrigger}
                  onChange={(e) => setFormTrigger(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] appearance-none cursor-pointer"
                >
                  <option value="daily_login" className="bg-[#18181b]">Daily Login</option>
                  <option value="game_played" className="bg-[#18181b]">Game Played</option>
                  <option value="tournament_win" className="bg-[#18181b]">Tournament Victory</option>
                  <option value="streak_7d" className="bg-[#18181b]">7-Day Consecutive Streak</option>
                  <option value="referral" className="bg-[#18181b]">Friend Referral</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Reward Points (PTS)
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={formPoints}
                  onChange={(e) => setFormPoints(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="100"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Explanation displayed to users when earning this reward..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors resize-none"
                ></textarea>
              </div>
            </form>

            {/* FOOTER */}
            <div className="pt-4 border-t border-white/10 shrink-0">
              <button
                type="submit"
                form="reward-rule-form"
                disabled={saving}
                className="w-full bg-[#CCFF00] text-black font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#b3e600] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(204,255,0,0.2)] active:scale-[0.98]"
              >
                {saving ? "Saving Rule..." : editingId ? "Save Changes" : "Create Reward Rule"}
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
}