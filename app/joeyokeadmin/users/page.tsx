"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  Users,
  Search,
  Filter,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Coins,
  Diamond,
  Ban,
  UserCheck,
  Edit3,
  RefreshCw,
  X,
  Sparkles,
  Plus,
  Minus,
  CheckCircle2,
} from "lucide-react";

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mounted, setMounted] = useState(false);

  // --- MODAL STATES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // --- FORM EDIT STATES ---
  const [editRole, setEditRole] = useState("user");
  const [editIsBanned, setEditIsBanned] = useState(false);
  const [currencyType, setCurrencyType] = useState<"points" | "gems">("points");
  const [balanceDelta, setBalanceDelta] = useState<number | "">("");
  const [deltaType, setDeltaType] = useState<"add" | "deduct">("add");

  useEffect(() => {
    setMounted(true);
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setUsers(data);
    } catch (err: any) {
      console.error("Error fetching users:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- MODAL HANDLERS ---
  const openManageModal = (user: any) => {
    setSelectedUser(user);
    setEditRole(user.role || "user");
    setEditIsBanned(user.is_banned || false);
    setCurrencyType("points");
    setBalanceDelta("");
    setDeltaType("add");
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSaving(true);

    try {
      const updates: any = {
        role: editRole,
        is_banned: editIsBanned,
      };

      // Process Currency Adjustments
      if (balanceDelta !== "" && Number(balanceDelta) > 0) {
        const delta = Number(balanceDelta);
        const currentBalance = selectedUser[currencyType] || 0;
        
        updates[currencyType] = deltaType === "add" 
          ? currentBalance + delta 
          : Math.max(0, currentBalance - delta);
      }

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", selectedUser.id);

      if (error) throw error;

      setIsModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      alert("Error updating user: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- METRICS ---
  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === "admin" || u.role === "super_admin").length;
  const bannedCount = users.filter((u) => u.is_banned).length;
  const totalPointsCirculating = users.reduce((acc, u) => acc + (u.points || 0), 0);
  const totalGemsCirculating = users.reduce((acc, u) => acc + (u.gems || 0), 0);

  // --- FILTERED USERS ---
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      (user.display_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.id || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "banned" && user.is_banned) ||
      (statusFilter === "active" && !user.is_banned);

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
            Admin / Phase 3
          </p>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">
            User Management
          </h2>
          <p className="font-body text-xs text-neutral-400 mt-1">
            Manage player accounts, permissions, point balances, and access control.
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white hover:border-white/20 transition-all shadow-lg group self-start md:self-auto"
          title="Refresh Users"
        >
          <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
        </button>
      </header>

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Total Players
            </p>
            <p className="font-headline text-2xl font-black text-white mt-0.5">
              {totalUsers}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#CCFF00]/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-[#CCFF00]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Staff / Admins
            </p>
            <p className="font-headline text-2xl font-black text-[#CCFF00] mt-0.5">
              {adminCount}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-rose-500/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <Ban className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Banned Accounts
            </p>
            <p className="font-headline text-2xl font-black text-rose-400 mt-0.5">
              {bannedCount}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-amber-500/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Coins className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Circulating Points
            </p>
            <p className="font-headline text-2xl font-black text-amber-400 mt-0.5">
              {totalPointsCirculating.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-purple-500/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
            <Diamond className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Circulating Gems
            </p>
            <p className="font-headline text-2xl font-black text-purple-400 mt-0.5">
              {totalGemsCirculating.toLocaleString()}
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
            placeholder="Search by name, email, or user ID..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-white/5 border border-white/10 text-xs font-bold text-white px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#CCFF00] appearance-none cursor-pointer"
          >
            <option value="all" className="bg-[#18181b]">All Roles</option>
            <option value="user" className="bg-[#18181b]">Players Only</option>
            <option value="admin" className="bg-[#18181b]">Admins</option>
            <option value="super_admin" className="bg-[#18181b]">Super Admins</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 text-xs font-bold text-white px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#CCFF00] appearance-none cursor-pointer"
          >
            <option value="all" className="bg-[#18181b]">All Statuses</option>
            <option value="active" className="bg-[#18181b]">Active</option>
            <option value="banned" className="bg-[#18181b]">Banned</option>
          </select>
        </div>
      </div>

      {/* USERS TABLE */}
      {loading ? (
        <div className="py-20 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">
          Loading User Directory...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="font-headline text-lg font-black text-white tracking-wide">
            No Users Found
          </h3>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm leading-relaxed">
            No player profiles matched your current search and filter settings.
          </p>
        </div>
      ) : (
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    User Profile
                  </th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Role
                  </th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Points
                  </th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Gems
                  </th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Status
                  </th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={`hover:bg-white/[0.02] transition-colors ${
                      user.is_banned ? "opacity-60 bg-rose-500/[0.02]" : ""
                    }`}
                  >
                    {/* AVATAR + NAME */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 font-black text-white text-xs">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            (user.display_name || user.email || "U").slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-white flex items-center gap-1.5">
                            {user.display_name || "Unnamed Player"}
                          </p>
                          <p className="text-[10px] font-mono text-neutral-400">
                            {user.email || user.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* ROLE BADGE */}
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          user.role === "super_admin"
                            ? "bg-[#CCFF00]/10 text-[#CCFF00] border-[#CCFF00]/20"
                            : user.role === "admin"
                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                            : "bg-white/5 text-neutral-400 border-white/10"
                        }`}
                      >
                        {user.role === "super_admin" && <ShieldAlert className="w-3 h-3 text-[#CCFF00]" />}
                        {user.role === "admin" && <ShieldCheck className="w-3 h-3 text-indigo-400" />}
                        {user.role || "user"}
                      </span>
                    </td>

                    {/* POINTS */}
                    <td className="p-4">
                      <span className="font-headline font-black text-amber-400 flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5" />
                        {(user.points || 0).toLocaleString()} PTS
                      </span>
                    </td>

                    {/* GEMS */}
                    <td className="p-4">
                      <span className="font-headline font-black text-purple-400 flex items-center gap-1">
                        <Diamond className="w-3.5 h-3.5" />
                        {(user.gems || 0).toLocaleString()} GEMS
                      </span>
                    </td>

                    {/* STATUS */}
                    <td className="p-4">
                      {user.is_banned ? (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-bold text-[10px] uppercase bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                          <Ban className="w-3 h-3" /> Banned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[10px] uppercase bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                          <UserCheck className="w-3 h-3" /> Active
                        </span>
                      )}
                    </td>

                    {/* ACTIONS */}
                    <td className="p-4 text-right">
                      <button
                        onClick={() => openManageModal(user)}
                        className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl font-bold text-[11px] text-neutral-300 hover:text-white hover:border-[#CCFF00] hover:bg-[#CCFF00]/10 transition-all flex items-center gap-1.5 ml-auto"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- PORTALED MANAGE USER MODAL --- */}
      {isModalOpen && mounted && selectedUser && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#18181b] border border-white/10 rounded-[28px] p-6 w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col my-auto">
            
            {/* MODAL HEADER */}
            <div className="flex justify-between items-center pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#CCFF00]" />
                <h3 className="font-headline text-lg font-black text-white">
                  Manage Account
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

            {/* FORM BODY */}
            <form id="user-manage-form" onSubmit={handleSaveUser} className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 no-scrollbar">
              
              {/* USER INFO SUMMARY */}
              <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-black text-white">
                  {(selectedUser.display_name || selectedUser.email || "U").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white text-xs truncate">{selectedUser.display_name || "Unnamed Player"}</p>
                  <p className="text-[10px] text-neutral-400 font-mono truncate">{selectedUser.email || selectedUser.id}</p>
                </div>
              </div>

              {/* ROLE SELECTION */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Assigned Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] appearance-none cursor-pointer"
                >
                  <option value="user" className="bg-[#18181b]">Player (User)</option>
                  <option value="admin" className="bg-[#18181b]">Admin</option>
                  <option value="super_admin" className="bg-[#18181b]">Super Admin</option>
                </select>
              </div>

              {/* MANUAL BALANCE ADJUSTMENT */}
              <div className="space-y-3 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center justify-between">
                  <span>Adjust Balance</span>
                  <span className={currencyType === "points" ? "text-amber-400 font-mono" : "text-purple-400 font-mono"}>
                    Current: {(selectedUser[currencyType] || 0).toLocaleString()} {currencyType === "points" ? "PTS" : "GEMS"}
                  </span>
                </label>

                {/* Currency Toggle */}
                <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => { setCurrencyType("points"); setBalanceDelta(""); }}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      currencyType === "points" ? "bg-[#18181b] text-amber-400 shadow-md" : "text-neutral-500 hover:text-white"
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" /> Points
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCurrencyType("gems"); setBalanceDelta(""); }}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      currencyType === "gems" ? "bg-[#18181b] text-purple-400 shadow-md" : "text-neutral-500 hover:text-white"
                    }`}
                  >
                    <Diamond className="w-3.5 h-3.5" /> Gems
                  </button>
                </div>

                <div className="flex gap-2">
                  <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setDeltaType("add")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${
                        deltaType === "add" ? "bg-emerald-500 text-black" : "text-neutral-500 hover:text-white"
                      }`}
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeltaType("deduct")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${
                        deltaType === "deduct" ? "bg-rose-500 text-white" : "text-neutral-500 hover:text-white"
                      }`}
                    >
                      <Minus className="w-3 h-3" /> Deduct
                    </button>
                  </div>

                  <input
                    type="number"
                    min="1"
                    value={balanceDelta}
                    onChange={(e) => setBalanceDelta(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="Amount..."
                    className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                  />
                </div>
              </div>

              {/* BAN / UNBAN TOGGLE */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/5 mt-2">
                <div>
                  <p className="text-xs font-bold text-white">Account Suspension</p>
                  <p className="text-[10px] text-neutral-500">Block player from logging in or using store.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditIsBanned(!editIsBanned)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase border transition-all ${
                    editIsBanned
                      ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  }`}
                >
                  {editIsBanned ? "Suspended (Banned)" : "Active"}
                </button>
              </div>

            </form>

            {/* MODAL FOOTER */}
            <div className="pt-4 border-t border-white/10 shrink-0">
              <button
                type="submit"
                form="user-manage-form"
                disabled={saving}
                className="w-full bg-[#CCFF00] text-black font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#b3e600] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(204,255,0,0.2)] active:scale-[0.98]"
              >
                {saving ? "Saving Changes..." : "Apply Account Changes"}
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
}