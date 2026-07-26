"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Shield, ShieldAlert, ShieldCheck, UserMinus } from "lucide-react";

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
    <div className="space-y-8 animate-fade-in">
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black text-white tracking-tight">Access Management</h2>
          <p className="font-body text-xs text-neutral-400 mt-1">Manage internal team clearances and backend portal access.</p>
        </div>
      </header>

      {/* GRANT ACCESS CARD */}
      <section className="bg-[#18181b] border border-white/10 rounded-[24px] p-8 shadow-2xl max-w-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
          <Shield className="w-32 h-32 text-[#CCFF00]" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-[#CCFF00]/10 border border-[#CCFF00]/20 rounded-2xl flex items-center justify-center text-[#CCFF00] shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-headline text-base font-black text-white tracking-wide">Grant Admin Clearance</h3>
              <p className="text-[10px] text-neutral-400 mt-1">Enter a registered player's email to upgrade them to an Admin node.</p>
            </div>
          </div>

          <form onSubmit={handleGrantAccess} className="flex gap-4">
            <input 
              type="email" 
              required
              value={promoteEmail}
              onChange={(e) => setPromoteEmail(e.target.value)}
              placeholder="Target Email Address..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
            />
            <button 
              type="submit" 
              disabled={actionLoading}
              className="bg-[#CCFF00] hover:bg-[#b3e600] text-black font-black text-xs uppercase tracking-widest px-8 rounded-xl transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(204,255,0,0.2)]"
            >
              {actionLoading ? "Processing..." : "Authorize"}
            </button>
          </form>
        </div>
      </section>

      {/* ACTIVE ADMIN LIST */}
      <section className="bg-[#18181b] border border-white/10 rounded-[24px] overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-white/10 bg-white/[0.02]">
          <h3 className="font-headline text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Authorized Backend Nodes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td className="px-6 py-12 text-center text-xs font-bold text-neutral-500 uppercase tracking-widest animate-pulse">
                    Scanning clearances...
                  </td>
                </tr>
              ) : (
                admins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <img 
                          src={admin.avatar_url || "https://img.icons8.com/illustrations/xlarge/robot.png"} 
                          alt="avatar" 
                          className="w-10 h-10 rounded-full bg-white/5 p-0.5 object-cover border border-white/10" 
                        />
                        <div>
                          <p className="font-headline font-bold text-white tracking-wide">{admin.username}</p>
                          <p className="text-[10px] text-neutral-500 mt-0.5">{admin.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border flex w-fit items-center gap-2 ${
                        admin.role === 'super_admin' 
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                      }`}>
                        {admin.role === 'super_admin' && <ShieldAlert className="w-3 h-3" />}
                        {admin.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {admin.role !== 'super_admin' && (
                        <button 
                          onClick={() => handleRevokeAccess(admin.id, admin.role)}
                          className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-transparent hover:border-rose-500/20 rounded-xl text-[9px] font-bold text-rose-400 uppercase tracking-widest transition-all flex items-center gap-2 ml-auto opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        >
                          <UserMinus className="w-3.5 h-3.5" /> Revoke
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