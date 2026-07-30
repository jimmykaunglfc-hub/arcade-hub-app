"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  Edit3,
  Trash2,
  RefreshCw,
  Search,
  Check,
  X,
  Lock,
  Sparkles,
  KeyRound,
  Mail,
  User,
  Sliders,
  CheckSquare,
  Square,
} from "lucide-react";

// Modules list matching your sidebar structure
const ALL_MODULES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "games", label: "Game Catalog" },
  { id: "tournaments", label: "Tournaments" },
  { id: "store", label: "Store Management" },
  { id: "users", label: "User Management" },
  { id: "community", label: "Community & Social" },
  { id: "rewards", label: "Reward System" },
  { id: "wheel", label: "Wheel Rewards" },
  { id: "badges", label: "Rank Badges" },
  { id: "economy", label: "Economy & Ledger" },
  { id: "redeem", label: "Redeem Requests" },
  { id: "ads", label: "Ads & Banners" },
  { id: "notifications", label: "Push Notifications" },
  { id: "analytics", label: "Reports & Analytics" },
  { id: "roles", label: "Roles & Access" },
  { id: "configurations", label: "Configurations" },
];

export default function RolesAccessPage() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [mounted, setMounted] = useState(false);

  // --- MODAL STATES ---
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // --- FORM STATES ---
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formRole, setFormRole] = useState<"admin" | "super_admin">("admin");
  const [selectedModules, setSelectedModules] = useState<string[]>(
    ALL_MODULES.map((m) => m.id)
  );

  useEffect(() => {
    setMounted(true);
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("role", ["admin", "super_admin"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setAdmins(data);
    } catch (err: any) {
      console.error("Error fetching admin nodes:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- PERMISSION TOGGLE HELPERS ---
  const toggleModulePermission = (moduleId: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const selectAllModules = () =>
    setSelectedModules(ALL_MODULES.map((m) => m.id));
  const deselectAllModules = () => setSelectedModules([]);

  // --- HANDLERS ---
  const openCreateModal = () => {
    setFormEmail("");
    setFormPassword("");
    setFormDisplayName("");
    setFormRole("admin");
    setSelectedModules(ALL_MODULES.map((m) => m.id));
    setIsCreateModalOpen(true);
  };

  const openEditModal = (admin: any) => {
    setSelectedAdmin(admin);
    setFormDisplayName(admin.display_name || "");
    setFormRole(admin.role);
    setSelectedModules(admin.allowed_modules || ALL_MODULES.map((m) => m.id));
    setIsEditModalOpen(true);
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim() || !formPassword) {
      return alert("Email and Password are required.");
    }
    setSaving(true);

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formEmail.trim(),
          password: formPassword,
          displayName: formDisplayName.trim(),
          role: formRole,
          allowedModules: selectedModules,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create account.");

      setIsCreateModalOpen(false);
      fetchAdmins();
    } catch (err: any) {
      alert("Error creating admin account: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAdminPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdmin) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: formDisplayName.trim(),
          role: formRole,
          allowed_modules: selectedModules,
        })
        .eq("id", selectedAdmin.id);

      if (error) throw error;

      setIsEditModalOpen(false);
      fetchAdmins();
    } catch (err: any) {
      alert("Error updating permissions: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeAdmin = async (id: string, email: string) => {
    if (
      !confirm(`Are you sure you want to revoke admin clearance for ${email}?`)
    )
      return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: "user", allowed_modules: [] })
        .eq("id", id);

      if (error) throw error;
      fetchAdmins();
    } catch (err: any) {
      alert("Error revoking admin clearance: " + err.message);
    }
  };

  const filteredAdmins = admins.filter(
    (a) =>
      (a.display_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in relative pb-16">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">
            Access Management
          </h2>
          <p className="font-body text-xs text-neutral-400 mt-1">
            Manage internal team clearances, account credentials, and backend
            portal permissions.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchAdmins}
            className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white hover:border-white/20 transition-all shadow-lg group"
            title="Refresh List"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-[#CCFF00] px-5 py-2.5 rounded-xl text-xs font-black text-black hover:bg-[#b3e600] transition-all shadow-[0_0_20px_rgba(204,255,0,0.25)] active:scale-95"
          >
            <UserPlus className="w-4 h-4" /> Create Admin Account
          </button>
        </div>
      </header>

      {/* SEARCH BAR */}
      <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-4 flex items-center shadow-xl">
        <div className="relative w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-[#CCFF00] transition-colors" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search active backend nodes by name or email..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
          />
        </div>
      </div>

      {/* AUTHORIZED BACKEND NODES LIST */}
      <div className="bg-[#18181b] border border-white/10 rounded-[24px] overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/10 bg-white/[0.02]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Authorized Backend Nodes ({filteredAdmins.length})
          </p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">
            Querying Authorization Registry...
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            No authorized team accounts found matching your search.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredAdmins.map((admin) => {
              const allowedCount = (admin.allowed_modules || []).length;
              const totalCount = ALL_MODULES.length;

              return (
                <div
                  key={admin.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  {/* ADMIN PROFILE INFO */}
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center font-black text-white text-sm overflow-hidden shrink-0">
                      {admin.avatar_url ? (
                        <img
                          src={admin.avatar_url}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        (admin.display_name || admin.email || "A")
                          .slice(0, 2)
                          .toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white text-sm">
                          {admin.display_name || "Unnamed Admin"}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${
                            admin.role === "super_admin"
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                              : "bg-[#CCFF00]/10 text-[#CCFF00] border-[#CCFF00]/20"
                          }`}
                        >
                          {admin.role === "super_admin" ? (
                            <ShieldAlert className="w-3 h-3 text-purple-400" />
                          ) : (
                            <ShieldCheck className="w-3 h-3 text-[#CCFF00]" />
                          )}
                          {admin.role === "super_admin"
                            ? "SUPER ADMIN"
                            : "ADMIN"}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 font-mono mt-0.5">
                        {admin.email}
                      </p>
                    </div>
                  </div>

                  {/* MODULE PERMISSION METRIC & ACTIONS */}
                  <div className="flex items-center gap-4 ml-auto md:ml-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        Access Scope
                      </p>
                      <p className="text-xs font-mono font-bold text-neutral-300">
                        {admin.role === "super_admin" ? (
                          <span className="text-purple-400">
                            Full System Unlocked
                          </span>
                        ) : (
                          `${allowedCount} / ${totalCount} Modules`
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(admin)}
                        className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl text-xs font-bold text-neutral-300 hover:text-white hover:border-[#CCFF00] hover:bg-[#CCFF00]/10 transition-all flex items-center gap-1.5"
                      >
                        <Sliders className="w-3.5 h-3.5 text-[#CCFF00]" />{" "}
                        Permissions
                      </button>

                      {admin.role !== "super_admin" && (
                        <button
                          onClick={() =>
                            handleRevokeAdmin(admin.id, admin.email)
                          }
                          className="bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl text-rose-400 hover:bg-rose-500 hover:text-white transition-all"
                          title="Revoke Admin Access"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- CREATE ADMIN ACCOUNT MODAL --- */}
      {isCreateModalOpen &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-[#18181b] border border-white/10 rounded-[28px] p-6 w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col my-auto">
              <div className="flex justify-between items-center pb-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#CCFF00]" />
                  <h3 className="font-headline text-lg font-black text-white">
                    Create Admin Account
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                id="create-admin-form"
                onSubmit={handleCreateAdmin}
                className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 no-scrollbar"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formDisplayName}
                      onChange={(e) => setFormDisplayName(e.target.value)}
                      placeholder="e.g. Alex Operator"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Clearance Role
                    </label>
                    <select
                      value={formRole}
                      onChange={(e: any) => setFormRole(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] appearance-none cursor-pointer"
                    >
                      <option value="admin" className="bg-[#18181b]">
                        Admin (Custom Scope)
                      </option>
                      <option value="super_admin" className="bg-[#18181b]">
                        Super Admin (Unrestricted)
                      </option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Email / Login Username
                    </label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="operator@joeyoke.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Initial Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                    />
                  </div>
                </div>

                {/* MODULE ACCESS SELECTION */}
                {formRole === "admin" && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#CCFF00]">
                        Module Permissions Scope
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={selectAllModules}
                          className="text-[10px] font-bold text-neutral-400 hover:text-white underline"
                        >
                          Select All
                        </button>
                        <span className="text-neutral-600">•</span>
                        <button
                          type="button"
                          onClick={deselectAllModules}
                          className="text-[10px] font-bold text-neutral-400 hover:text-white underline"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-white/[0.02] p-3.5 rounded-2xl border border-white/5 max-h-52 overflow-y-auto no-scrollbar">
                      {ALL_MODULES.map((mod) => {
                        const isChecked = selectedModules.includes(mod.id);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => toggleModulePermission(mod.id)}
                            className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold border transition-all text-left ${
                              isChecked
                                ? "bg-[#CCFF00]/10 border-[#CCFF00]/30 text-[#CCFF00]"
                                : "bg-white/5 border-white/5 text-neutral-500 hover:text-neutral-300"
                            }`}
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 shrink-0 text-[#CCFF00]" />
                            ) : (
                              <Square className="w-4 h-4 shrink-0 text-neutral-600" />
                            )}
                            <span className="truncate">{mod.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </form>

              <div className="pt-4 border-t border-white/10 shrink-0">
                <button
                  type="submit"
                  form="create-admin-form"
                  disabled={saving}
                  className="w-full bg-[#CCFF00] text-black font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#b3e600] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(204,255,0,0.2)] active:scale-[0.98]"
                >
                  {saving ? "Provisioning Account..." : "Create Team Account"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* --- EDIT ADMIN PERMISSIONS MODAL --- */}
      {isEditModalOpen &&
        mounted &&
        selectedAdmin &&
        createPortal(
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-[#18181b] border border-white/10 rounded-[28px] p-6 w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col my-auto">
              <div className="flex justify-between items-center pb-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-[#CCFF00]" />
                  <h3 className="font-headline text-lg font-black text-white">
                    Edit Access Scope
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                id="edit-admin-form"
                onSubmit={handleUpdateAdminPermissions}
                className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 no-scrollbar"
              >
                <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-black text-white">
                    {(selectedAdmin.display_name || selectedAdmin.email || "A")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white text-xs truncate">
                      {selectedAdmin.display_name || "Unnamed Admin"}
                    </p>
                    <p className="text-[10px] text-neutral-400 font-mono truncate">
                      {selectedAdmin.email}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formDisplayName}
                      onChange={(e) => setFormDisplayName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Role Tier
                    </label>
                    <select
                      value={formRole}
                      onChange={(e: any) => setFormRole(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] appearance-none cursor-pointer"
                    >
                      <option value="admin" className="bg-[#18181b]">
                        Admin (Custom Scope)
                      </option>
                      <option value="super_admin" className="bg-[#18181b]">
                        Super Admin (Unrestricted)
                      </option>
                    </select>
                  </div>
                </div>

                {formRole === "admin" && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#CCFF00]">
                        Allowed System Modules
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={selectAllModules}
                          className="text-[10px] font-bold text-neutral-400 hover:text-white underline"
                        >
                          Select All
                        </button>
                        <span className="text-neutral-600">•</span>
                        <button
                          type="button"
                          onClick={deselectAllModules}
                          className="text-[10px] font-bold text-neutral-400 hover:text-white underline"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-white/[0.02] p-3.5 rounded-2xl border border-white/5 max-h-52 overflow-y-auto no-scrollbar">
                      {ALL_MODULES.map((mod) => {
                        const isChecked = selectedModules.includes(mod.id);
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => toggleModulePermission(mod.id)}
                            className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold border transition-all text-left ${
                              isChecked
                                ? "bg-[#CCFF00]/10 border-[#CCFF00]/30 text-[#CCFF00]"
                                : "bg-white/5 border-white/5 text-neutral-500 hover:text-neutral-300"
                            }`}
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 shrink-0 text-[#CCFF00]" />
                            ) : (
                              <Square className="w-4 h-4 shrink-0 text-neutral-600" />
                            )}
                            <span className="truncate">{mod.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </form>

              <div className="pt-4 border-t border-white/10 shrink-0">
                <button
                  type="submit"
                  form="edit-admin-form"
                  disabled={saving}
                  className="w-full bg-[#CCFF00] text-black font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#b3e600] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(204,255,0,0.2)] active:scale-[0.98]"
                >
                  {saving
                    ? "Applying Permissions..."
                    : "Save Module Permissions"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
