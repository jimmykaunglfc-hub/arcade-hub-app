"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { 
  ShieldAlert, 
  RefreshCw, 
  Flag, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Clock,
  Eye,
  AlertTriangle
} from "lucide-react";

type ReportStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed';

export default function ModerationReports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReportStatus | 'all'>('pending');

  const fetchReports = async () => {
    setLoading(true);

    try {
      let query = supabase
        .from("user_reports")
        .select(`
          *,
          reporter:reporter_id (username, avatar_url),
          reported:reported_id (username, avatar_url)
        `)
        .order("created_at", { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      if (data) setReports(data);
    } catch (error) {
      console.error("Error fetching reports:", error);
      // Failsafe empty state if the table isn't created yet
      setReports([]); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [filter]);

  const handleUpdateStatus = async (id: string, newStatus: ReportStatus) => {
    try {
      const { error } = await supabase
        .from("user_reports")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;
      
      // Remove from list if it no longer matches the current filter, or refresh
      if (filter !== 'all' && filter !== newStatus) {
        setReports(reports.filter(r => r.id !== id));
      } else {
        fetchReports();
      }
    } catch (error: any) {
      alert("Failed to update report: " + error.message);
    }
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'pending': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'investigating': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'resolved': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'dismissed': return 'bg-white/5 text-neutral-400 border-white/10';
      default: return 'bg-white/5 text-neutral-400 border-white/10';
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            Moderation Desk
          </h2>
          <p className="font-body text-xs text-neutral-400 mt-1">Review user flags, chat abuse reports, and support tickets.</p>
        </div>
        <button 
          onClick={fetchReports} 
          className="flex items-center gap-2 bg-[#18181b] px-5 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-white hover:bg-white/5 hover:border-white/20 transition-all w-fit shadow-lg group"
        >
          <RefreshCw className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" /> Refresh Feed
        </button>
      </header>

      {/* --- FILTER TABS --- */}
      <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
        {(['pending', 'investigating', 'resolved', 'dismissed', 'all'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap border ${
              filter === status 
                ? 'bg-[#CCFF00] text-black border-[#CCFF00] shadow-[0_0_15px_rgba(204,255,0,0.2)]' 
                : 'bg-[#18181b] text-neutral-400 border-white/10 hover:bg-white/5 hover:text-white'
            }`}
          >
            {status} {status === 'pending' && filter !== 'pending' && reports.length > 0 && `(${reports.length})`}
          </button>
        ))}
      </div>

      {/* --- REPORTS FEED --- */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
          <Search className="w-8 h-8 text-neutral-600 animate-pulse" />
          <p className="text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">Scanning Network Nodes...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] py-20 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h3 className="font-headline text-lg font-black text-white">Network Secure</h3>
          <p className="text-xs text-neutral-500 mt-2 max-w-sm">No {filter !== 'all' ? filter : ''} reports found in the system. The arcade is currently operating within safety parameters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {reports.map((report) => (
            <div key={report.id} className="bg-[#18181b] border border-white/10 rounded-[24px] overflow-hidden shadow-2xl group hover:border-white/20 transition-colors">
              
              <div className="p-5 border-b border-white/10 bg-white/[0.02] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border flex items-center gap-2 ${getStatusStyle(report.status)}`}>
                    {report.status === 'pending' && <Clock className="w-3 h-3" />}
                    {report.status === 'investigating' && <Eye className="w-3 h-3" />}
                    {report.status === 'resolved' && <CheckCircle2 className="w-3 h-3" />}
                    {report.status === 'dismissed' && <XCircle className="w-3 h-3" />}
                    {report.status}
                  </div>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {new Date(report.created_at).toLocaleString()}
                  </span>
                </div>
                
                <div className="flex gap-2">
                  <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <Flag className="w-3 h-3" /> {report.reason}
                  </span>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Users Involved */}
                <div className="md:col-span-4 space-y-6">
                  <div>
                    <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Reported Entity (Target)</p>
                    <div className="flex items-center gap-3 bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl">
                      <img 
                        src={report.reported?.avatar_url || "https://img.icons8.com/illustrations/xlarge/robot.png"} 
                        alt="reported" 
                        className="w-10 h-10 rounded-full border border-rose-500/30 object-cover" 
                      />
                      <div>
                        <p className="font-headline font-bold text-white tracking-wide">{report.reported?.username || "Unknown"}</p>
                        <p className="text-[10px] text-neutral-500 font-mono mt-0.5">ID: {report.reported_id.substring(0,8)}...</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Reporting Node</p>
                    <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-3 rounded-xl">
                      <img 
                        src={report.reporter?.avatar_url || "https://img.icons8.com/illustrations/xlarge/robot.png"} 
                        alt="reporter" 
                        className="w-8 h-8 rounded-full border border-white/20 object-cover opacity-70" 
                      />
                      <div>
                        <p className="font-headline font-bold text-neutral-300 tracking-wide">{report.reporter?.username || "Unknown"}</p>
                        <p className="text-[9px] text-neutral-500 font-mono mt-0.5">ID: {report.reporter_id.substring(0,8)}...</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Report Details & Actions */}
                <div className="md:col-span-8 flex flex-col h-full">
                  <div className="flex-1">
                    <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Incident Description</p>
                    <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-sm text-neutral-300 leading-relaxed min-h-[100px]">
                      {report.description || <span className="text-neutral-600 italic">No additional context provided by the reporter.</span>}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-6 flex flex-wrap items-center gap-3 pt-4 border-t border-white/10">
                    {report.status !== 'investigating' && report.status === 'pending' && (
                      <button 
                        onClick={() => handleUpdateStatus(report.id, 'investigating')}
                        className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 font-bold text-[10px] uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all flex items-center gap-2"
                      >
                        <Eye className="w-3.5 h-3.5" /> Start Investigation
                      </button>
                    )}
                    
                    {report.status !== 'resolved' && (
                      <button 
                        onClick={() => handleUpdateStatus(report.id, 'resolved')}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-bold text-[10px] uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved
                      </button>
                    )}
                    
                    {report.status !== 'dismissed' && (
                      <button 
                        onClick={() => handleUpdateStatus(report.id, 'dismissed')}
                        className="bg-white/5 hover:bg-rose-500/10 text-neutral-400 hover:text-rose-400 border border-transparent hover:border-rose-500/20 font-bold text-[10px] uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all flex items-center gap-2"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Dismiss False Flag
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}