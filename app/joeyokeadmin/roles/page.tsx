"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function RolesManager() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAdmins = async () => {
    setLoading(true);
    // Fetch ONLY profiles with admin or super_admin roles
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .in("role", ["admin", "super_admin"])
      .order("role", { ascending: false });

    if (data) setAdmins(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleGrantAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoteEmail.trim()) return;
    setActionLoading(true);

    // 1. Find the user by email
    const { data: targetUser, error: searchError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("email", promoteEmail.trim().toLowerCase())
      .single();

    if (!targetUser) {
      alert("Error: No player account found with that email. They must register in the arcade first.");
      setActionLoading(false);
      return;
    }

    if (targetUser.role !== "player") {
      alert("User is already an admin or super admin.");
      setActionLoading(false);
      return;
    }

    // 2. Promote them to 'admin'
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", targetUser.id);

    if (updateError) {
      alert("Failed to grant access: " + updateError.message);
    } else {
      setPromoteEmail("");
      fetchAdmins(); // Refresh the list
    }
    
    setActionLoading(false);
  };

  const handleRevokeAccess = async (userId: string, currentRole: string) => {
    if (currentRole === "super_admin") {
      alert("Security Protocol: You cannot demote a Super Admin from this interface.");
      return;
    }

    if (!confirm("Are you sure you want to revoke this user's admin clearance? They will be demoted to a standard player.")) return;

    const { error } = await supabase.from("profiles").update({ role: "player" }).eq("id", userId);
    
    if (error) {
      alert("Error revoking access: " + error.message);
    } else {
      fetchAdmins();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6">
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black text-neutral-900 dark:text-white">Access Management</h2>
          <p className="font-body text-xs text-neutral-500 dark:text-white/60 mt-1">Manage internal team clearances and backend portal access.</p>
        </div>
      </header>

      {/* GRANT ACCESS CARD */}
      <section className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/5 rounded-2xl p-6 shadow-sm max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-white/5 rounded-xl flex items-center justify-center text-indigo-600 dark:text-white shadow-sm">
            <span className="material-symbols-outlined">shield_person</span>
          </div>
          <div>
            <h3 className="font-headline text-sm font-bold text-neutral-900 dark:text-white">Grant Admin Clearance</h3>
            <p className="text-[10px] text-neutral-500 dark:text-white/40">Enter a registered player's email to upgrade them to an Admin node.</p>
          </div>
        </div>

        <form onSubmit={handleGrantAccess} className="flex gap-3">
          <input 
            type="email" 
            required
            value={promoteEmail}
            onChange={(e) => setPromoteEmail(e.target.value)}
            placeholder="Target Email Address..."
            className="flex-1 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-2 text-xs text-neutral-900 dark:text-white focus:outline-none focus:border-indigo-500 dark:focus:border-[#c3f400] transition-colors"
          />
          <button 
            type="submit" 
            disabled={actionLoading}
            className="bg-indigo-600 hover:bg-indigo-700 dark:bg-[#c3f400] dark:hover:bg-[#d4ff1a] text-white dark:text-neutral-900 font-bold text-[10px] uppercase tracking-widest px-6 rounded-xl transition-colors disabled:opacity-50"
          >
            {actionLoading ? "Processing..." : "Authorize"}
          </button>
        </form>
      </section>

      {/* ACTIVE ADMIN LIST */}
      <section className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-white/5">
          <h3 className="font-caps text-[10px] font-bold text-neutral-500 dark:text-white/60 uppercase tracking-widest">Authorized Backend Nodes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td className="px-6 py-8 text-center text-xs text-neutral-400">Scanning clearances...</td>
                </tr>
              ) : (
                admins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={admin.avatar_url || "https://img.icons8.com/illustrations/xlarge/robot.png"} alt="avatar" className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-white/10 p-0.5 object-cover" />
                        <div>
                          <p className="font-headline font-bold text-neutral-900 dark:text-white">{admin.username}</p>
                          <p className="text-[10px] text-neutral-500 dark:text-white/40">{admin.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${
                        admin.role === 'super_admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border border-purple-500/20' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-500/20'
                      }`}>
                        {admin.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {admin.role !== 'super_admin' && (
                        <button 
                          onClick={() => handleRevokeAccess(admin.id, admin.role)}
                          className="px-3 py-1.5 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg text-[9px] font-bold text-red-500 uppercase tracking-widest transition-colors"
                        >
                          Revoke Access
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}