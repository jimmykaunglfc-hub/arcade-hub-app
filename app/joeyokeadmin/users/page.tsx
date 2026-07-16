"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function UsersManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    // Fetch all profiles, ordered by who has the most points
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
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
      fetchUsers(); // Refresh table
    }
  };

  const handleToggleBan = async (userId: string, isCurrentlyBanned: boolean) => {
    const action = isCurrentlyBanned ? "UNBAN" : "BAN";
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    const { error } = await supabase.from("profiles").update({ is_banned: !isCurrentlyBanned }).eq("id", userId);
    if (error) {
      alert("Error updating ban status: " + error.message);
    } else {
      fetchUsers(); // Refresh table
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black text-neutral-900 dark:text-white">User Nodes</h2>
          <p className="font-body text-xs text-neutral-500 dark:text-white/60 mt-1">Manage player accounts, adjust balances, and enforce moderation.</p>
        </div>
        <button onClick={fetchUsers} className="flex items-center gap-2 bg-neutral-100 dark:bg-white/10 px-4 py-2 rounded-lg border border-neutral-200 dark:border-white/5 text-xs font-bold hover:bg-neutral-200 dark:hover:bg-white/20 transition-colors w-fit">
          <span className="material-symbols-outlined text-sm">refresh</span> Refresh List
        </button>
      </header>

      <div className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 dark:bg-white/5 border-b border-neutral-200 dark:border-white/5">
              <tr>
                <th className="px-6 py-4 font-caps text-[10px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Player</th>
                <th className="px-6 py-4 font-caps text-[10px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Role</th>
                <th className="px-6 py-4 font-caps text-[10px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Credits (PTS)</th>
                <th className="px-6 py-4 font-caps text-[10px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 font-caps text-[10px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-xs text-neutral-400">Loading network nodes...</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={user.avatar_url || "https://img.icons8.com/illustrations/xlarge/robot.png"} alt="avatar" className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-white/10 p-0.5 object-cover" />
                        <div>
                          <p className="font-headline font-bold text-neutral-900 dark:text-white">{user.username}</p>
                          <p className="text-[10px] text-neutral-500 dark:text-white/40">{user.email || "No Email"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider ${
                        user.role === 'super_admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400' :
                        user.role === 'admin' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                        'bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-white/60'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-amber-500">{user.points?.toLocaleString() || 0}</span>
                    </td>
                    <td className="px-6 py-4">
                      {user.is_banned ? (
                        <span className="flex items-center gap-1 text-[10px] text-red-500 font-bold uppercase"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Banned</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold uppercase"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleAdjustPoints(user.id, user.points)} className="p-1.5 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 rounded-lg text-neutral-600 dark:text-white/60 transition-colors" title="Edit Balance">
                          <span className="material-symbols-outlined text-[18px]">edit_square</span>
                        </button>
                        <button onClick={() => handleToggleBan(user.id, user.is_banned)} className="p-1.5 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg text-red-500 transition-colors" title={user.is_banned ? "Unban User" : "Ban User"}>
                          <span className="material-symbols-outlined text-[18px]">{user.is_banned ? "lock_open" : "gavel"}</span>
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