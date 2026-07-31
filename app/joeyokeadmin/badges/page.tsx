"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  Medal,
  Award,
  Trophy,
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
  Shield,
  X,
  Palette,
  Layers,
  CheckCircle2,
} from "lucide-react";

export default function RankBadgesPage() {
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [mounted, setMounted] = useState(false);

  // --- MODAL STATES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- FORM STATES (Supports empty strings for smooth backspacing) ---
  const [formName, setFormName] = useState("");
  const [formMinPoints, setFormMinPoints] = useState<number | "">(500);
  const [formTierLevel, setFormTierLevel] = useState<number | "">(1);
  const [formColorHex, setFormColorHex] = useState("#CCFF00");
  const [formDesc, setFormDesc] = useState("");
  const [formIconUrl, setFormIconUrl] = useState("");
  const [formRankKey, setFormRankKey] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  useEffect(() => {
    setMounted(true);
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("rank_badges")
        .select("*")
        .order("tier_level", { ascending: true });

      if (error) throw error;
      if (data) setBadges(data);
    } catch (err: any) {
      console.error("Error fetching rank badges:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- MODAL HANDLERS ---
  const openAddModal = () => {
    setEditingId(null);
    setFormName("");
    setFormMinPoints(1000);
    setFormTierLevel(badges.length + 1);
    setFormColorHex("#CCFF00");
    setFormDesc("");
    setFormIconUrl("");
    setFormRankKey("");
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (badge: any) => {
    setEditingId(badge.id);
    setFormName(badge.name);
    setFormMinPoints(badge.min_points ?? 0);
    setFormTierLevel(badge.tier_level ?? 1);
    setFormColorHex(badge.color_hex || "#CCFF00");
    setFormDesc(badge.description || "");
    setFormIconUrl(badge.icon_url || "");
    setFormRankKey(badge.rank_key || "");
    setFormIsActive(badge.is_active);
    setIsModalOpen(true);
  };

  const handleSaveBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return alert("Badge name is required.");
    setSaving(true);

    try {
      const badgeData = {
        name: formName.trim(),
        min_points: formMinPoints === "" ? 0 : Number(formMinPoints),
        tier_level: formTierLevel === "" ? 1 : Number(formTierLevel),
        color_hex: formColorHex,
        description: formDesc.trim(),
        icon_url: formIconUrl.trim(),
        rank_key: formRankKey || null,
        is_active: formIsActive,
      };

      if (editingId) {
        const { error } = await supabase
          .from("rank_badges")
          .update(badgeData)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rank_badges").insert(badgeData);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchBadges();
    } catch (err: any) {
      alert("Error saving badge: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBadge = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the rank badge "${name}"?`)) return;
    try {
      const { error } = await supabase.from("rank_badges").delete().eq("id", id);
      if (error) throw error;
      fetchBadges();
    } catch (err: any) {
      alert("Error deleting badge: " + err.message);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("rank_badges")
        .update({ is_active: !currentStatus })
        .eq("id", id);
      if (error) throw error;
      fetchBadges();
    } catch (err: any) {
      alert("Error toggling badge status: " + err.message);
    }
  };

  // --- METRICS ---
  const activeBadgesCount = badges.filter((b) => b.is_active).length;
  const highestThreshold = badges.reduce((max, b) => (b.min_points > max ? b.min_points : max), 0);

  // --- FILTERED BADGES ---
  const filteredBadges = badges.filter(
    (b) =>
      (b.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
            Admin / Progression
          </p>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">
            Rank Badges & Tiers
          </h2>
          <p className="font-body text-xs text-neutral-400 mt-1">
            Define player progression tiers, unlock thresholds, and rank badging aesthetics.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchBadges}
            className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white hover:border-white/20 transition-all shadow-lg group"
            title="Refresh Badges"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-[#CCFF00] px-5 py-2.5 rounded-xl text-xs font-black text-black hover:bg-[#b3e600] transition-all shadow-[0_0_20px_rgba(204,255,0,0.25)] active:scale-95"
          >
            <Plus className="w-4 h-4" /> Create Rank Badge
          </button>
        </div>
      </header>

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Total Rank Tiers
            </p>
            <p className="font-headline text-2xl font-black text-white mt-0.5">
              {badges.length}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#CCFF00]/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center shrink-0">
            <Medal className="w-6 h-6 text-[#CCFF00]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Active Badges
            </p>
            <p className="font-headline text-2xl font-black text-[#CCFF00] mt-0.5">
              {activeBadgesCount}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-amber-500/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Max Level Threshold
            </p>
            <p className="font-headline text-2xl font-black text-amber-400 mt-0.5">
              {highestThreshold.toLocaleString()} PTS
            </p>
          </div>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-4 flex items-center shadow-xl">
        <div className="relative w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-[#CCFF00] transition-colors" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search rank badges by title or description..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
          />
        </div>
      </div>

      {/* BADGES LADDER GRID */}
      {loading ? (
        <div className="py-20 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">
          Loading Rank Progression System...
        </div>
      ) : filteredBadges.length === 0 ? (
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Medal className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="font-headline text-lg font-black text-white tracking-wide">
            No Rank Badges Configured
          </h3>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm leading-relaxed">
            Create progression badges to motivate players as they accumulate points in the arcade.
          </p>
          <button
            onClick={openAddModal}
            className="mt-6 bg-[#CCFF00] text-black text-xs font-black px-6 py-3 rounded-xl hover:bg-[#b3e600] transition-all shadow-[0_0_15px_rgba(204,255,0,0.2)]"
          >
            Create First Badge
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBadges.map((badge) => (
            <div
              key={badge.id}
              className={`bg-[#18181b] border rounded-[24px] overflow-hidden shadow-xl flex flex-col justify-between group relative transition-all ${
                badge.is_active ? "border-white/10 hover:border-white/20" : "border-rose-500/20 opacity-60"
              }`}
            >
              {/* TOP ACTIONS */}
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                <button
                  onClick={() => handleToggleActive(badge.id, badge.is_active)}
                  className={`p-2 rounded-xl text-white shadow-lg transition-all ${
                    badge.is_active ? "bg-black/60 hover:bg-rose-500" : "bg-emerald-500 hover:bg-emerald-600"
                  }`}
                  title={badge.is_active ? "Deactivate Badge" : "Activate Badge"}
                >
                  {badge.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => openEditModal(badge)}
                  className="p-2 bg-black/60 backdrop-blur-md text-white rounded-xl hover:bg-indigo-500 shadow-lg transition-all"
                  title="Edit Badge"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteBadge(badge.id, badge.name)}
                  className="p-2 bg-black/60 backdrop-blur-md text-white rounded-xl hover:bg-rose-500 shadow-lg transition-all"
                  title="Delete Badge"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* CARD CONTENT */}
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  {/* BADGE PREVIEW ICON */}
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border border-white/20 shadow-lg overflow-hidden"
                    style={{ backgroundColor: `${badge.color_hex}15`, borderColor: badge.color_hex }}
                  >
                    {badge.icon_url ? (
                      <img src={badge.icon_url} alt={badge.name} className="w-8 h-8 object-contain" />
                    ) : (
                      <Medal className="w-7 h-7" style={{ color: badge.color_hex }} />
                    )}
                  </div>

                  <div>
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-neutral-500 block">
                      Tier Level {badge.tier_level}
                    </span>
                    <h3 className="font-headline text-lg font-black text-white">{badge.name}</h3>
                  </div>
                </div>

                <p className="font-body text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                  {badge.description || "No unlock criteria summary provided."}
                </p>
              </div>

              {/* CARD FOOTER */}
              <div className="p-6 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-amber-400" /> Unlock Req.
                </span>
                <span className="font-headline text-base font-black text-white">
                  {badge.min_points.toLocaleString()} PTS
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- PORTALED ADD/EDIT BADGE MODAL --- */}
      {isModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#18181b] border border-white/10 rounded-[28px] p-6 w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col my-auto">
            
            {/* HEADER */}
            <div className="flex justify-between items-center pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#CCFF00]" />
                <h3 className="font-headline text-lg font-black text-white">
                  {editingId ? "Edit Rank Badge" : "Create Rank Badge"}
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

            {/* FORM */}
            <form id="rank-badge-form" onSubmit={handleSaveBadge} className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 no-scrollbar">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Badge Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Cyber Titan"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                    Tier Order Level
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formTierLevel}
                    onChange={(e) => setFormTierLevel(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                  />
                </div>

                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                    Points Needed
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formMinPoints}
                    onChange={(e) => setFormMinPoints(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Badge Accent Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formColorHex}
                    onChange={(e) => setFormColorHex(e.target.value)}
                    className="w-10 h-10 rounded-xl border-none cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={formColorHex}
                    onChange={(e) => setFormColorHex(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#CCFF00]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Season Rank (optional)
                </label>
                <select
                  value={formRankKey}
                  onChange={(e) => setFormRankKey(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                >
                  <option value="">Not a season-rank badge</option>
                  {['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'].map((rank) => (
                    <option key={rank} value={rank}>{rank[0].toUpperCase() + rank.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Custom Icon URL (Optional)
                </label>
                <input
                  type="url"
                  value={formIconUrl}
                  onChange={(e) => setFormIconUrl(e.target.value)}
                  placeholder="https://... (PNG / SVG)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="e.g., Awarded to players reaching 10,000 arcade points."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors resize-none"
                ></textarea>
              </div>
            </form>

            {/* FOOTER */}
            <div className="pt-4 border-t border-white/10 shrink-0">
              <button
                type="submit"
                form="rank-badge-form"
                disabled={saving}
                className="w-full bg-[#CCFF00] text-black font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#b3e600] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(204,255,0,0.2)] active:scale-[0.98]"
              >
                {saving ? "Saving Badge..." : editingId ? "Save Changes" : "Create Rank Badge"}
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
