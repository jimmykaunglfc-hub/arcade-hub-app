"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function EconomyLedger() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [economyStats, setEconomyStats] = useState({
    totalCirculation: 0,
    totalUsers: 0,
    recentVolume: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchEconomyData = async () => {
    setLoading(true);

    try {
      // 1. Fetch Economy Macro Stats (Sum of all user points)
      const { data: profiles } = await supabase.from("profiles").select("points");
      let circulation = 0;
      if (profiles) {
        circulation = profiles.reduce((acc, user) => acc + (user.points || 0), 0);
      }

      // 2. Fetch Transaction Ledger (joined with profiles for usernames)
      const { data: txData } = await supabase
        .from("transactions")
        .select(`
          *,
          profiles:user_id (username, avatar_url, email)
        `)
        .order("created_at", { ascending: false })
        .limit(100); // Fetch latest 100 transactions

      if (txData) {
        setTransactions(txData);
        // Calculate recent volume (absolute sum of last 100 txs)
        const volume = txData.reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
        
        setEconomyStats({
          totalCirculation: circulation,
          totalUsers: profiles?.length || 0,
          recentVolume: volume
        });
      }
    } catch (error) {
      console.error("Error fetching ledger data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEconomyData();
  }, []);

  const getTransactionIcon = (type: string) => {
    switch(type) {
      case 'daily_reward': return { icon: 'card_giftcard', color: 'text-indigo-500', bg: 'bg-indigo-500/10' };
      case 'match_fee': return { icon: 'sports_esports', color: 'text-amber-500', bg: 'bg-amber-500/10' };
      case 'shop_purchase': return { icon: 'shopping_cart', color: 'text-pink-500', bg: 'bg-pink-500/10' };
      case 'admin_adjustment': return { icon: 'admin_panel_settings', color: 'text-[#c3f400]', bg: 'bg-[#c3f400]/10' };
      default: return { icon: 'swap_horiz', color: 'text-neutral-500', bg: 'bg-neutral-500/10' };
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black text-neutral-900 dark:text-white">Economy Ledger</h2>
          <p className="font-body text-xs text-neutral-500 dark:text-white/60 mt-1">Monitor real-time point circulation and network transaction history.</p>
        </div>
        <button onClick={fetchEconomyData} className="flex items-center gap-2 bg-neutral-100 dark:bg-white/10 px-4 py-2 rounded-lg border border-neutral-200 dark:border-white/5 text-xs font-bold hover:bg-neutral-200 dark:hover:bg-white/20 transition-colors w-fit shadow-sm">
          <span className="material-symbols-outlined text-sm">sync</span> Sync Ledger
        </button>
      </header>

      {/* --- MACRO ECONOMY STATS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/5 rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
            <span className="material-symbols-outlined text-2xl">toll</span>
          </div>
          <div>
            <p className="font-caps text-[10px] font-bold text-neutral-500 dark:text-white/40 uppercase tracking-widest">Total Circulation</p>
            <h3 className="font-headline text-2xl font-black text-neutral-900 dark:text-white mt-1">
              {economyStats.totalCirculation.toLocaleString()} <span className="text-sm text-neutral-400">PTS</span>
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/5 rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
            <span className="material-symbols-outlined text-2xl">group</span>
          </div>
          <div>
            <p className="font-caps text-[10px] font-bold text-neutral-500 dark:text-white/40 uppercase tracking-widest">Active Wallets</p>
            <h3 className="font-headline text-2xl font-black text-neutral-900 dark:text-white mt-1">
              {economyStats.totalUsers.toLocaleString()}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/5 rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
            <span className="material-symbols-outlined text-2xl">monitoring</span>
          </div>
          <div>
            <p className="font-caps text-[10px] font-bold text-neutral-500 dark:text-white/40 uppercase tracking-widest">Recent Tx Volume</p>
            <h3 className="font-headline text-2xl font-black text-neutral-900 dark:text-white mt-1">
              {economyStats.recentVolume.toLocaleString()} <span className="text-sm text-neutral-400">PTS</span>
            </h3>
          </div>
        </div>
      </div>

      {/* --- TRANSACTION HISTORY TABLE --- */}
      <div className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm mt-6">
        <div className="p-4 border-b border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-white/5">
          <h3 className="font-caps text-[10px] font-bold text-neutral-500 dark:text-white/60 uppercase tracking-widest">Network Transaction Log (Latest 100)</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50/50 dark:bg-black/20 border-b border-neutral-200 dark:border-white/5">
              <tr>
                <th className="px-6 py-4 font-caps text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Timestamp</th>
                <th className="px-6 py-4 font-caps text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">User Node</th>
                <th className="px-6 py-4 font-caps text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Transaction Type</th>
                <th className="px-6 py-4 font-caps text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-xs font-bold text-neutral-400 uppercase tracking-widest animate-pulse">
                    Scanning Ledger Network...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-xs text-neutral-500">
                    No transactions recorded on the network yet.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const style = getTransactionIcon(tx.transaction_type);
                  const isPositive = tx.amount >= 0;
                  
                  return (
                    <tr key={tx.id} className="hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-[10px] text-neutral-500 dark:text-white/50">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img 
                            src={tx.profiles?.avatar_url || "https://img.icons8.com/illustrations/xlarge/robot.png"} 
                            alt="avatar" 
                            className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-white/10 p-0.5 object-cover" 
                          />
                          <div>
                            <p className="font-headline font-bold text-neutral-900 dark:text-white text-xs">
                              {tx.profiles?.username || "Unknown Node"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${style.bg} ${style.color}`}>
                            <span className="material-symbols-outlined text-[14px]">{style.icon}</span>
                          </div>
                          <div>
                            <p className="font-bold text-[10px] text-neutral-700 dark:text-white/80 uppercase tracking-wider">
                              {tx.transaction_type.replace('_', ' ')}
                            </p>
                            {tx.description && (
                              <p className="text-[9px] text-neutral-400 truncate max-w-[200px]">{tx.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-black text-sm ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                          {isPositive ? '+' : ''}{tx.amount.toLocaleString()} PTS
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}