"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { 
  RefreshCw, 
  Coins, 
  Users, 
  TrendingUp, 
  Gift, 
  Gamepad2, 
  ShoppingCart, 
  ShieldAlert, 
  ArrowRightLeft 
} from "lucide-react";

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
      // 1. Fetch Economy Macro Stats
      const { data: profiles } = await supabase.from("profiles").select("points");
      let circulation = 0;
      if (profiles) {
        circulation = profiles.reduce((acc, user) => acc + (user.points || 0), 0);
      }

      // 2. Fetch Transaction Ledger
      const { data: txData } = await supabase
        .from("transactions")
        .select(`
          *,
          profiles:user_id (username, avatar_url, email)
        `)
        .order("created_at", { ascending: false })
        .limit(100); 

      if (txData) {
        setTransactions(txData);
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

  const getTransactionStyle = (type: string) => {
    switch(type) {
      case 'daily_reward': return { Icon: Gift, color: 'text-indigo-400', border: 'border-indigo-500/20', bg: 'bg-indigo-500/10' };
      case 'match_fee': return { Icon: Gamepad2, color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/10' };
      case 'shop_purchase': return { Icon: ShoppingCart, color: 'text-pink-400', border: 'border-pink-500/20', bg: 'bg-pink-500/10' };
      case 'admin_adjustment': return { Icon: ShieldAlert, color: 'text-[#CCFF00]', border: 'border-[#CCFF00]/20', bg: 'bg-[#CCFF00]/10' };
      default: return { Icon: ArrowRightLeft, color: 'text-neutral-400', border: 'border-white/10', bg: 'bg-white/5' };
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black text-white tracking-tight">Economy Ledger</h2>
          <p className="font-body text-xs text-neutral-400 mt-1">Monitor real-time point circulation and network transaction history.</p>
        </div>
        <button 
          onClick={fetchEconomyData} 
          className="flex items-center gap-2 bg-[#18181b] px-5 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-white hover:bg-white/5 hover:border-white/20 transition-all w-fit shadow-lg group"
        >
          <RefreshCw className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" /> Sync Ledger
        </button>
      </header>

      {/* --- MACRO ECONOMY STATS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-2xl flex items-center gap-5 hover:border-white/20 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <p className="font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Total Circulation</p>
            <h3 className="font-headline text-3xl font-black text-white mt-1 tracking-tight">
              {economyStats.totalCirculation.toLocaleString()} <span className="text-sm text-amber-500 font-bold">PTS</span>
            </h3>
          </div>
        </div>

        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-2xl flex items-center gap-5 hover:border-white/20 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Active Wallets</p>
            <h3 className="font-headline text-3xl font-black text-white mt-1 tracking-tight">
              {economyStats.totalUsers.toLocaleString()}
            </h3>
          </div>
        </div>

        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-6 shadow-2xl flex items-center gap-5 hover:border-white/20 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center text-[#CCFF00] shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Recent Tx Volume</p>
            <h3 className="font-headline text-3xl font-black text-white mt-1 tracking-tight">
              {economyStats.recentVolume.toLocaleString()} <span className="text-sm text-[#CCFF00] font-bold">PTS</span>
            </h3>
          </div>
        </div>
      </div>

      {/* --- TRANSACTION HISTORY TABLE --- */}
      <div className="bg-[#18181b] border border-white/10 rounded-[24px] overflow-hidden shadow-2xl mt-8">
        <div className="p-5 border-b border-white/10 bg-white/[0.02]">
          <h3 className="font-headline text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Network Transaction Log (Latest 100)</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/20 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Timestamp</th>
                <th className="px-6 py-4 font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">User Node</th>
                <th className="px-6 py-4 font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Transaction Type</th>
                <th className="px-6 py-4 font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-xs font-bold text-neutral-500 uppercase tracking-widest animate-pulse">
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
                  const style = getTransactionStyle(tx.transaction_type);
                  const isPositive = tx.amount >= 0;
                  const Icon = style.Icon;
                  
                  return (
                    <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-[10px] font-mono text-neutral-500">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <img 
                            src={tx.profiles?.avatar_url || "https://img.icons8.com/illustrations/xlarge/robot.png"} 
                            alt="avatar" 
                            className="w-8 h-8 rounded-full bg-white/5 p-0.5 object-cover border border-white/10" 
                          />
                          <div>
                            <p className="font-headline font-bold text-white text-xs tracking-wide">
                              {tx.profiles?.username || "Unknown Node"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${style.bg} ${style.border} ${style.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-headline font-bold text-[10px] text-white uppercase tracking-wider">
                              {tx.transaction_type.replace('_', ' ')}
                            </p>
                            {tx.description && (
                              <p className="text-[10px] text-neutral-500 truncate max-w-[250px] mt-0.5">{tx.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-headline font-black text-sm tracking-wide ${isPositive ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.2)]' : 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.2)]'}`}>
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