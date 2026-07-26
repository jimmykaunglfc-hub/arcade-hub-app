"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  MessageSquare,
  Megaphone,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Bell,
  X,
  Sparkles,
  User,
  ShieldAlert,
  Info,
  Wrench,
  Trophy,
} from "lucide-react";

export default function CommunitySocialPage() {
  const [activeTab, setActiveTab] = useState<"reports" | "announcements">("reports");
  const [reports, setReports] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [mounted, setMounted] = useState(false);

  // --- MODAL STATES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [annTitle, setAnnTitle] = useState("");
  const [annMessage, setAnnMessage] = useState("");
  const [annType, setAnnType] = useState<"info" | "alert" | "maintenance" | "event">("info");

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reportsRes, annRes] = await Promise.all([
        supabase.from("community_reports").select("*").order("created_at", { ascending: false }),
        supabase.from("global_announcements").select("*").order("created_at", { ascending: false }),
      ]);

      if (reportsRes.data) setReports(reportsRes.data);
      if (annRes.data) setAnnouncements(annRes.data);
    } catch (err: any) {
      console.error("Error fetching community data:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- REPORT ACTIONS ---
  const handleUpdateReportStatus = async (id: string, newStatus: "resolved" | "dismissed") => {
    try {
      const { error } = await supabase
        .from("community_reports")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert("Error updating report status: " + err.message);
    }
  };

  // --- ANNOUNCEMENT ACTIONS ---
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annMessage.trim()) return alert("Title and message are required.");
    setCreating(true);

    try {
      const { error } = await supabase.from("global_announcements").insert({
        title: annTitle.trim(),
        message: annMessage.trim(),
        type: annType,
        is_active: true,
      });

      if (error) throw error;

      setIsModalOpen(false);
      setAnnTitle("");
      setAnnMessage("");
      setAnnType("info");
      fetchData();
    } catch (err: any) {
      alert("Error posting announcement: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAnnouncementActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("global_announcements")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert("Error toggling announcement: " + err.message);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm("Are you sure you want to delete this broadcast announcement?")) return;
    try {
      const { error } = await supabase.from("global_announcements").delete().eq("id", id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert("Error deleting announcement: " + err.message);
    }
  };

  // --- METRICS ---
  const pendingReportsCount = reports.filter((r) => r.status === "pending").length;
  const activeAnnouncementsCount = announcements.filter((a) => a.is_active).length;

  // --- FILTERED LISTS ---
  const filteredReports = reports.filter(
    (r) =>
      (r.reported_user_email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.reason || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.details || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAnnouncements = announcements.filter(
    (a) =>
      (a.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.message || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
            Admin / Phase 3
          </p>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">
            Community & Moderation
          </h2>
          <p className="font-body text-xs text-neutral-400 mt-1">
            Handle moderation flags, manage user reports, and broadcast live announcements.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchData}
            className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white hover:border-white/20 transition-all shadow-lg group"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
          {activeTab === "announcements" && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-[#CCFF00] px-5 py-2.5 rounded-xl text-xs font-black text-black hover:bg-[#b3e600] transition-all shadow-[0_0_20px_rgba(204,255,0,0.25)] active:scale-95"
            >
              <Plus className="w-4 h-4" /> Broadcast Announcement
            </button>
          )}
        </div>
      </header>

      {/* METRICS & TAB SWITCHER */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setActiveTab("reports")}
          className={`p-5 rounded-[20px] border text-left transition-all flex items-center justify-between ${
            activeTab === "reports"
              ? "bg-[#18181b] border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.1)]"
              : "bg-[#18181b]/50 border-white/5 opacity-70 hover:opacity-100"
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                Moderation Reports
              </p>
              <h3 className="font-headline text-xl font-black text-white">Player Reports</h3>
            </div>
          </div>
          <span className="font-headline text-2xl font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-xl">
            {pendingReportsCount} Pending
          </span>
        </button>

        <button
          onClick={() => setActiveTab("announcements")}
          className={`p-5 rounded-[20px] border text-left transition-all flex items-center justify-between ${
            activeTab === "announcements"
              ? "bg-[#18181b] border-[#CCFF00]/40 shadow-[0_0_20px_rgba(204,255,0,0.1)]"
              : "bg-[#18181b]/50 border-white/5 opacity-70 hover:opacity-100"
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center shrink-0">
              <Megaphone className="w-6 h-6 text-[#CCFF00]" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                System Communications
              </p>
              <h3 className="font-headline text-xl font-black text-white">Broadcast Banners</h3>
            </div>
          </div>
          <span className="font-headline text-2xl font-black text-[#CCFF00] bg-[#CCFF00]/10 border border-[#CCFF00]/20 px-3 py-1 rounded-xl">
            {activeAnnouncementsCount} Live
          </span>
        </button>
      </div>

      {/* SEARCH BAR */}
      <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-4 flex items-center shadow-xl">
        <div className="relative w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-[#CCFF00] transition-colors" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeTab === "reports"
                ? "Search reports by reported email, reason, or details..."
                : "Search announcements by title or content..."
            }
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
          />
        </div>
      </div>

      {/* TAB CONTENT: REPORTS */}
      {activeTab === "reports" && (
        <>
          {loading ? (
            <div className="py-20 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">
              Scanning Moderation Queue...
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-16 flex flex-col items-center justify-center text-center shadow-2xl">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="font-headline text-lg font-black text-white tracking-wide">
                All Clear! No Flagged Reports
              </h3>
              <p className="text-xs text-neutral-400 mt-2 max-w-sm leading-relaxed">
                There are currently no active community moderation flags matching your search.
              </p>
            </div>
          ) : (
            <div className="bg-[#18181b] border border-white/10 rounded-[24px] overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        Reported User
                      </th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        Reason
                      </th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        Details
                      </th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        Reported Date
                      </th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        Status
                      </th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs">
                    {filteredReports.map((req) => (
                      <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-4 font-bold text-white flex items-center gap-2">
                          <User className="w-4 h-4 text-rose-400" />
                          {req.reported_user_email || "Unknown User"}
                        </td>
                        <td className="p-4">
                          <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase">
                            {req.reason}
                          </span>
                        </td>
                        <td className="p-4 text-neutral-300 max-w-xs truncate">
                          {req.details || "No details provided."}
                        </td>
                        <td className="p-4 text-neutral-400 font-mono text-[11px]">
                          {new Date(req.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              req.status === "resolved"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : req.status === "dismissed"
                                ? "bg-neutral-500/10 text-neutral-400 border-neutral-500/20"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            }`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {req.status === "pending" ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleUpdateReportStatus(req.id, "resolved")}
                                className="bg-emerald-500 text-black px-3 py-1 rounded-lg font-bold text-[10px] hover:bg-emerald-400 transition-all flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Resolve
                              </button>
                              <button
                                onClick={() => handleUpdateReportStatus(req.id, "dismissed")}
                                className="bg-white/5 border border-white/10 text-neutral-400 px-3 py-1 rounded-lg font-bold text-[10px] hover:text-white transition-all flex items-center gap-1"
                              >
                                <XCircle className="w-3 h-3" /> Dismiss
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-neutral-500 font-mono">Completed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB CONTENT: ANNOUNCEMENTS */}
      {activeTab === "announcements" && (
        <>
          {loading ? (
            <div className="py-20 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">
              Loading Announcements...
            </div>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-16 flex flex-col items-center justify-center text-center shadow-2xl">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <Megaphone className="w-8 h-8 text-neutral-500" />
              </div>
              <h3 className="font-headline text-lg font-black text-white tracking-wide">
                No Broadcast Banners Active
              </h3>
              <p className="text-xs text-neutral-400 mt-2 max-w-sm leading-relaxed">
                Create a live announcement to display news, maintenance alerts, or prize updates directly to players.
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-6 bg-[#CCFF00] text-black text-xs font-black px-6 py-3 rounded-xl hover:bg-[#b3e600] transition-all shadow-[0_0_15px_rgba(204,255,0,0.2)]"
              >
                Create Announcement
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAnnouncements.map((item) => (
                <div
                  key={item.id}
                  className={`bg-[#18181b] border rounded-[24px] p-6 shadow-xl flex flex-col justify-between relative transition-all ${
                    item.is_active ? "border-white/10" : "border-white/5 opacity-50"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                          item.type === "alert"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : item.type === "maintenance"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : item.type === "event"
                            ? "bg-[#CCFF00]/10 text-[#CCFF00] border-[#CCFF00]/20"
                            : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                        }`}
                      >
                        {item.type === "alert" && <ShieldAlert className="w-3 h-3" />}
                        {item.type === "maintenance" && <Wrench className="w-3 h-3" />}
                        {item.type === "event" && <Trophy className="w-3 h-3" />}
                        {item.type === "info" && <Info className="w-3 h-3" />}
                        {item.type}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="font-headline text-base font-black text-white">{item.title}</h4>
                    <p className="font-body text-xs text-neutral-400 mt-2 leading-relaxed">
                      {item.message}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-4 mt-6 border-t border-white/5">
                    <button
                      onClick={() => handleToggleAnnouncementActive(item.id, item.is_active)}
                      className={`text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all ${
                        item.is_active
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                          : "bg-white/5 text-neutral-400 border-white/10 hover:text-white"
                      }`}
                    >
                      {item.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {item.is_active ? "Active Banner" : "Hidden Banner"}
                    </button>

                    <button
                      onClick={() => handleDeleteAnnouncement(item.id)}
                      className="p-2 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all"
                      title="Delete Announcement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* --- PORTALED BROADCAST ANNOUNCEMENT MODAL --- */}
      {isModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#18181b] border border-white/10 rounded-[28px] p-6 w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col my-auto">
            
            {/* HEADER */}
            <div className="flex justify-between items-center pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#CCFF00]" />
                <h3 className="font-headline text-lg font-black text-white">
                  Broadcast Banner
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
            <form id="announcement-form" onSubmit={handleCreateAnnouncement} className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 no-scrollbar">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Banner Category
                </label>
                <select
                  value={annType}
                  onChange={(e: any) => setAnnType(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] appearance-none cursor-pointer"
                >
                  <option value="info" className="bg-[#18181b]">General Info</option>
                  <option value="event" className="bg-[#18181b]">Tournament / Event</option>
                  <option value="maintenance" className="bg-[#18181b]">System Maintenance</option>
                  <option value="alert" className="bg-[#18181b]">Important Alert</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Headline Title
                </label>
                <input
                  type="text"
                  required
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="e.g., Weekend Tournament Registration Open!"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Message Content
                </label>
                <textarea
                  required
                  rows={4}
                  value={annMessage}
                  onChange={(e) => setAnnMessage(e.target.value)}
                  placeholder="Details broadcast to all online players..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors resize-none"
                ></textarea>
              </div>
            </form>

            {/* FOOTER */}
            <div className="pt-4 border-t border-white/10 shrink-0">
              <button
                type="submit"
                form="announcement-form"
                disabled={creating}
                className="w-full bg-[#CCFF00] text-black font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#b3e600] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(204,255,0,0.2)] active:scale-[0.98]"
              >
                {creating ? "Publishing..." : "Publish Broadcast"}
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
}