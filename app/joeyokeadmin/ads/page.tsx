"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  Megaphone,
  Plus,
  Search,
  Edit2,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink,
  Sparkles,
  MousePointerClick,
  BarChart3,
  TrendingUp,
  X,
  Layout,
  Image as ImageIcon,
} from "lucide-react";

export default function AdsManagementPage() {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [placementFilter, setPlacementFilter] = useState("all");
  const [mounted, setMounted] = useState(false);

  // --- MODAL STATES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- FORM STATES ---
  const [formTitle, setFormTitle] = useState("");
  const [formPlacement, setFormPlacement] = useState("homepage_hero");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formTargetUrl, setFormTargetUrl] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  useEffect(() => {
    setMounted(true);
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ad_banners")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setBanners(data);
    } catch (err: any) {
      console.error("Error fetching ad banners:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- MODAL HANDLERS ---
  const openAddModal = () => {
    setEditingId(null);
    setFormTitle("");
    setFormPlacement("homepage_hero");
    setFormImageUrl("");
    setFormTargetUrl("");
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (banner: any) => {
    setEditingId(banner.id);
    setFormTitle(banner.title);
    setFormPlacement(banner.placement);
    setFormImageUrl(banner.image_url || "");
    setFormTargetUrl(banner.target_url || "");
    setFormIsActive(banner.is_active);
    setIsModalOpen(true);
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formImageUrl.trim()) {
      return alert("Title and Image URL are required.");
    }
    setSaving(true);

    try {
      const bannerData = {
        title: formTitle.trim(),
        placement: formPlacement,
        image_url: formImageUrl.trim(),
        target_url: formTargetUrl.trim() || null,
        is_active: formIsActive,
      };

      if (editingId) {
        const { error } = await supabase
          .from("ad_banners")
          .update(bannerData)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ad_banners").insert(bannerData);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchBanners();
    } catch (err: any) {
      alert("Error saving ad banner: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBanner = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete the ad banner "${title}"?`)) return;
    try {
      const { error } = await supabase.from("ad_banners").delete().eq("id", id);
      if (error) throw error;
      fetchBanners();
    } catch (err: any) {
      alert("Error deleting banner: " + err.message);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("ad_banners")
        .update({ is_active: !currentStatus })
        .eq("id", id);
      if (error) throw error;
      fetchBanners();
    } catch (err: any) {
      alert("Error toggling banner status: " + err.message);
    }
  };

  // --- PLACEMENT BADGE HELPER ---
  const getPlacementBadge = (placement: string) => {
    switch (placement) {
      case "homepage_hero":
        return { label: "Hero Banner", color: "text-[#CCFF00] bg-[#CCFF00]/10 border-[#CCFF00]/20" };
      case "arcade_sidebar":
        return { label: "Arcade Sidebar", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" };
      case "game_over_interstitial":
        return { label: "Game Over Interstitial", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
      case "footer_banner":
        return { label: "Footer Banner", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" };
      default:
        return { label: placement, color: "text-neutral-400 bg-white/5 border-white/10" };
    }
  };

  // --- METRICS ---
  const activeBannersCount = banners.filter((b) => b.is_active).length;
  const totalImpressions = banners.reduce((acc, b) => acc + (b.impressions || 0), 0);
  const totalClicks = banners.reduce((acc, b) => acc + (b.clicks || 0), 0);
  const averageCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";

  // --- FILTERED BANNERS ---
  const filteredBanners = banners.filter((banner) => {
    const matchesSearch =
      (banner.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (banner.target_url || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlacement = placementFilter === "all" || banner.placement === placementFilter;
    return matchesSearch && matchesPlacement;
  });

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
            Admin / Phase 4
          </p>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">
            Ads & Banner Campaigns
          </h2>
          <p className="font-body text-xs text-neutral-400 mt-1">
            Manage sponsored ads, promo placements, target links, and impression analytics.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchBanners}
            className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white hover:border-white/20 transition-all shadow-lg group"
            title="Refresh Ads"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-[#CCFF00] px-5 py-2.5 rounded-xl text-xs font-black text-black hover:bg-[#b3e600] transition-all shadow-[0_0_20px_rgba(204,255,0,0.25)] active:scale-95"
          >
            <Plus className="w-4 h-4" /> New Ad Campaign
          </button>
        </div>
      </header>

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Megaphone className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Active Campaigns
            </p>
            <p className="font-headline text-2xl font-black text-white mt-0.5">
              {activeBannersCount} / {banners.length}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#CCFF00]/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center shrink-0">
            <BarChart3 className="w-6 h-6 text-[#CCFF00]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Total Impressions
            </p>
            <p className="font-headline text-2xl font-black text-[#CCFF00] mt-0.5">
              {totalImpressions.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-cyan-500/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <MousePointerClick className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Total Ad Clicks
            </p>
            <p className="font-headline text-2xl font-black text-cyan-400 mt-0.5">
              {totalClicks.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-amber-500/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Avg Click-Through (CTR)
            </p>
            <p className="font-headline text-2xl font-black text-amber-400 mt-0.5">
              {averageCTR}%
            </p>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-4 flex flex-col md:flex-row gap-4 justify-between items-center shadow-xl">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-[#CCFF00] transition-colors" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search campaigns by title or target URL..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
          />
        </div>

        <select
          value={placementFilter}
          onChange={(e) => setPlacementFilter(e.target.value)}
          className="bg-white/5 border border-white/10 text-xs font-bold text-white px-4 py-2.5 rounded-xl focus:outline-none focus:border-[#CCFF00] w-full md:w-auto appearance-none cursor-pointer"
        >
          <option value="all" className="bg-[#18181b]">All Placements</option>
          <option value="homepage_hero" className="bg-[#18181b]">Homepage Hero</option>
          <option value="arcade_sidebar" className="bg-[#18181b]">Arcade Sidebar</option>
          <option value="game_over_interstitial" className="bg-[#18181b]">Game Over Interstitial</option>
          <option value="footer_banner" className="bg-[#18181b]">Footer Banner</option>
        </select>
      </div>

      {/* ADS GRID */}
      {loading ? (
        <div className="py-20 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">
          Loading Ad Campaigns...
        </div>
      ) : filteredBanners.length === 0 ? (
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Megaphone className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="font-headline text-lg font-black text-white tracking-wide">
            No Ad Campaigns Active
          </h3>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm leading-relaxed">
            Create promotional banners or sponsor ads to start serving impressions across the arcade.
          </p>
          <button
            onClick={openAddModal}
            className="mt-6 bg-[#CCFF00] text-black text-xs font-black px-6 py-3 rounded-xl hover:bg-[#b3e600] transition-all shadow-[0_0_15px_rgba(204,255,0,0.2)]"
          >
            Create First Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredBanners.map((banner) => {
            const badge = getPlacementBadge(banner.placement);
            const ctr = banner.impressions > 0 ? ((banner.clicks / banner.impressions) * 100).toFixed(1) : "0.0";

            return (
              <div
                key={banner.id}
                className={`bg-[#18181b] border rounded-[24px] overflow-hidden shadow-xl flex flex-col justify-between group relative transition-all ${
                  banner.is_active ? "border-white/10 hover:border-white/20" : "border-rose-500/20 opacity-60"
                }`}
              >
                {/* ACTION BUTTONS OVERLAY */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                  <button
                    onClick={() => handleToggleActive(banner.id, banner.is_active)}
                    className={`p-2 rounded-xl text-white shadow-lg transition-all ${
                      banner.is_active ? "bg-black/60 hover:bg-rose-500" : "bg-emerald-500 hover:bg-emerald-600"
                    }`}
                    title={banner.is_active ? "Pause Campaign" : "Activate Campaign"}
                  >
                    {banner.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEditModal(banner)}
                    className="p-2 bg-black/60 backdrop-blur-md text-white rounded-xl hover:bg-indigo-500 shadow-lg transition-all"
                    title="Edit Campaign"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteBanner(banner.id, banner.title)}
                    className="p-2 bg-black/60 backdrop-blur-md text-white rounded-xl hover:bg-rose-500 shadow-lg transition-all"
                    title="Delete Campaign"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* BANNER PREVIEW & DETAILS */}
                <div>
                  <div className="h-44 bg-black/40 border-b border-white/5 relative overflow-hidden flex items-center justify-center">
                    {banner.image_url ? (
                      <img
                        src={banner.image_url}
                        alt={banner.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <ImageIcon className="w-10 h-10 text-neutral-600" />
                    )}
                    <span
                      className={`absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border backdrop-blur-md ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="p-6 space-y-3">
                    <h3 className="font-headline text-lg font-black text-white">{banner.title}</h3>
                    {banner.target_url && (
                      <a
                        href={banner.target_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-neutral-400 hover:text-[#CCFF00] font-mono flex items-center gap-1.5 truncate transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{banner.target_url}</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* CAMPAIGN METRICS FOOTER */}
                <div className="p-6 bg-white/[0.02] border-t border-white/5 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[9px] font-bold uppercase text-neutral-500">Impressions</p>
                    <p className="font-headline text-base font-black text-white mt-0.5">
                      {(banner.impressions || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase text-neutral-500">Clicks</p>
                    <p className="font-headline text-base font-black text-cyan-400 mt-0.5">
                      {(banner.clicks || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase text-neutral-500">CTR</p>
                    <p className="font-headline text-base font-black text-[#CCFF00] mt-0.5">
                      {ctr}%
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- PORTALED ADD/EDIT MODAL --- */}
      {isModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#18181b] border border-white/10 rounded-[28px] p-6 w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col my-auto">
            
            {/* HEADER */}
            <div className="flex justify-between items-center pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#CCFF00]" />
                <h3 className="font-headline text-lg font-black text-white">
                  {editingId ? "Edit Ad Campaign" : "New Ad Campaign"}
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
            <form id="ad-banner-form" onSubmit={handleSaveBanner} className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 no-scrollbar">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Campaign Title
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g., Summer VIP Pass Sponsorship"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Ad Placement Zone
                </label>
                <select
                  value={formPlacement}
                  onChange={(e) => setFormPlacement(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] appearance-none cursor-pointer"
                >
                  <option value="homepage_hero" className="bg-[#18181b]">Homepage Hero</option>
                  <option value="arcade_sidebar" className="bg-[#18181b]">Arcade Sidebar</option>
                  <option value="game_over_interstitial" className="bg-[#18181b]">Game Over Interstitial</option>
                  <option value="footer_banner" className="bg-[#18181b]">Footer Banner</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Banner Image URL
                </label>
                <input
                  type="url"
                  required
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  placeholder="https://... (1200x400 PNG/JPG recommended)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Target Click URL (Optional)
                </label>
                <input
                  type="url"
                  value={formTargetUrl}
                  onChange={(e) => setFormTargetUrl(e.target.value)}
                  placeholder="https://sponsor-website.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                />
              </div>
            </form>

            {/* FOOTER */}
            <div className="pt-4 border-t border-white/10 shrink-0">
              <button
                type="submit"
                form="ad-banner-form"
                disabled={saving}
                className="w-full bg-[#CCFF00] text-black font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#b3e600] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(204,255,0,0.2)] active:scale-[0.98]"
              >
                {saving ? "Saving Campaign..." : editingId ? "Save Changes" : "Deploy Ad Campaign"}
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
}