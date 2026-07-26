"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RefreshCw, Edit2, ShieldAlert, ShieldCheck } from "lucide-react";

export default function UsersManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    // Fetch ONLY profiles matching the player role, sorted by balance weight
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "player")
      .order("points", { ascending: false });

    if (data) setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAdjustPoints = async (userId: string, currentPoints: number) => {
    const amountStr = prompt(`Enter new point balance for user (Current: ${currentPoints}):`);
    if (!amountStr) return;
    
    const newPoints = parseInt(amountStr, 10);
    if (isNaN(newPoints) || newPoints < 0) {
      alert("Invalid amount. Points must be a positive number.");
      return;
    }

    const { error } = await supabase.from("profiles").update({ points: newPoints }).eq("id", userId);
    if (error) {
      alert("Error updating points: " + error.message);
    } else {
      fetchUsers(); // Refresh table state
    }
  };

  const handleToggleBan = async (userId: string, isCurrentlyBanned: boolean) => {
    const action = isCurrentlyBanned ? "UNBAN" : "BAN";
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    const { error } = await supabase.from("profiles").update({ is_banned: !isCurrentlyBanned }).eq("id", userId);
    if (error) {
      alert("Error updating ban status: " + error.message);
    } else {
      fetchUsers(); // Refresh table state
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black text-white tracking-tight">User Nodes</h2>
          <p className="font-body text-xs text-neutral-400 mt-1">
            Manage player accounts, adjust balances, and enforce moderation.
          </p>
        </div>
        <button 
          onClick={fetchUsers} 
          className="flex items-center gap-2 bg-[#18181b] px-5 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-white hover:bg-white/5 hover:border-white/20 transition-all w-fit shadow-lg group"
        >
          <RefreshCw className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" /> 
          Refresh Grid
        </button>
      </header>

      {/* DATA TABLE */}
      <div className="bg-[#18181b] border border-white/10 rounded-[24px] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.02]">
              <tr>
                <th className="px-6 py-5 font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Player</th>
                <th className="px-6 py-5 font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Role</th>
                <th className="px-6 py-5 font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Credits (PTS)</th>
                <th className="px-6 py-5 font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-5 font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest animate-pulse">
                      Loading network nodes...
                    </span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-xs text-neutral-500">
                    No standard player accounts recorded in database.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <img 
                          src={user.avatar_url || "https://img.icons8.com/illustrations/xlarge/robot.png"} 
                          alt="avatar" 
                          className="w-10 h-10 rounded-full bg-white/5 p-0.5 object-cover border border-white/10" 
                        />
                        <div>
                          <p className="font-headline font-bold text-white tracking-wide">{user.username}</p>
                          <p className="text-[10px] text-neutral-500 mt-0.5">{user.email || "No Email"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest bg-white/5 text-neutral-400 border border-white/5">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-headline font-black text-[#CCFF00] tracking-wide drop-shadow-[0_0_10px_rgba(204,255,0,0.1)]">
                        {user.points?.toLocaleString() || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.is_banned ? (
                        <span className="flex items-center gap-2 text-[10px] text-rose-500 font-bold uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span> 
                          Banned
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span> 
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleAdjustPoints(user.id, user.points)} 
                          className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-neutral-400 hover:text-white transition-all border border-transparent hover:border-white/10" 
                          title="Edit Balance"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleToggleBan(user.id, user.is_banned)} 
                          className={`p-2 rounded-xl transition-all border ${
                            user.is_banned 
                              ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20" 
                              : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20"
                          }`}
                          title={user.is_banned ? "Unban User" : "Ban User"}
                        >
                          {user.is_banned ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}