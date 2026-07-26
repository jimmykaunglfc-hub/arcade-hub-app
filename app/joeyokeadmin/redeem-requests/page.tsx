"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Gift,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  Coins,
  AlertCircle,
  User,
  Filter,
  Check,
  RotateCcw,
} from "lucide-react";

export default function RedeemRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("store_redemptions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setRequests(data);
    } catch (err: any) {
      console.error("Error fetching redemption requests:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // --- ACTIONS ---
  const handleFulfill = async (id: string) => {
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from("store_redemptions")
        .update({ status: "fulfilled" })
        .eq("id", id);

      if (error) throw error;
      fetchRequests();
    } catch (err: any) {
      alert("Error fulfilling request: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectAndRefund = async (request: any) => {
    if (
      !confirm(
        `Are you sure you want to reject this request? ${request.points_spent} PTS will be refunded to the user.`
      )
    )
      return;

    setProcessingId(request.id);
    try {
      // 1. Mark request as rejected
      const { error: statusError } = await supabase
        .from("store_redemptions")
        .update({ status: "rejected" })
        .eq("id", request.id);

      if (statusError) throw statusError;

      // 2. Refund points to user profile
      const { data: profile, error: fetchErr } = await supabase
        .from("profiles")
        .select("points")
        .eq("id", request.user_id)
        .single();

      if (!fetchErr && profile) {
        await supabase
          .from("profiles")
          .update({ points: (profile.points || 0) + request.points_spent })
          .eq("id", request.user_id);
      }

      fetchRequests();
    } catch (err: any) {
      alert("Error rejecting request: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // --- METRICS ---
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const fulfilledCount = requests.filter((r) => r.status === "fulfilled").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;
  const totalPointsRedeemed = requests
    .filter((r) => r.status === "fulfilled")
    .reduce((acc, r) => acc + (r.points_spent || 0), 0);

  // --- FILTERED DATA ---
  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      (req.item_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.user_email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.user_id || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">
            Admin / Economy & Store
          </p>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">
            Redeem Requests
          </h2>
          <p className="font-body text-xs text-neutral-400 mt-1">
            Process player prize redemptions, issue digital assets, or refund points.
          </p>
        </div>
        <button
          onClick={fetchRequests}
          className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white hover:border-white/20 transition-all shadow-lg group self-start md:self-auto"
          title="Refresh List"
        >
          <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
        </button>
      </header>

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#18181b] border border-amber-500/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Pending Queue
            </p>
            <p className="font-headline text-2xl font-black text-amber-400 mt-0.5">
              {pendingCount}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-emerald-500/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Fulfilled
            </p>
            <p className="font-headline text-2xl font-black text-emerald-400 mt-0.5">
              {fulfilledCount}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-rose-500/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <XCircle className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Rejected / Refunded
            </p>
            <p className="font-headline text-2xl font-black text-rose-400 mt-0.5">
              {rejectedCount}
            </p>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#CCFF00]/20 rounded-[20px] p-5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center shrink-0">
            <Coins className="w-6 h-6 text-[#CCFF00]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
              Total Points Issued
            </p>
            <p className="font-headline text-2xl font-black text-[#CCFF00] mt-0.5">
              {totalPointsRedeemed.toLocaleString()}
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
            placeholder="Search by player email, item name, or ID..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-neutral-500 shrink-0" />
          <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl w-full md:w-auto">
            {["pending", "fulfilled", "rejected", "all"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all capitalize flex-1 md:flex-none ${
                  statusFilter === status
                    ? "bg-[#CCFF00] text-black shadow-md"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* REDEMPTION REQUESTS TABLE */}
      {loading ? (
        <div className="py-20 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">
          Fetching Store Redemptions...
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Gift className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="font-headline text-lg font-black text-white tracking-wide">
            No Redeem Requests Found
          </h3>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm leading-relaxed">
            {searchTerm || statusFilter !== "pending"
              ? "No redemption claims matched your filter criteria."
              : "There are currently no pending redemption claims from players."}
          </p>
        </div>
      ) : (
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Player / User ID
                  </th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Claimed Item
                  </th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Cost
                  </th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Date & Time
                  </th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Status
                  </th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500 text-right">
                    Fulfillment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {filteredRequests.map((req) => (
                  <tr
                    key={req.id}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* PLAYER */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-neutral-400" />
                        </div>
                        <div>
                          <p className="font-bold text-white">
                            {req.user_email || "Anonymous Player"}
                          </p>
                          <p className="text-[10px] font-mono text-neutral-500">
                            {req.user_id ? `${req.user_id.slice(0, 8)}...` : "N/A"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* CLAIMED ITEM */}
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Gift className="w-4 h-4 text-[#CCFF00]" />
                        <span className="font-bold text-white">{req.item_name}</span>
                      </div>
                    </td>

                    {/* COST */}
                    <td className="p-4">
                      <span className="font-headline font-black text-[#CCFF00]">
                        {req.points_spent?.toLocaleString()} PTS
                      </span>
                    </td>

                    {/* DATE */}
                    <td className="p-4 text-neutral-400 font-mono text-[11px]">
                      {new Date(req.created_at).toLocaleString()}
                    </td>

                    {/* STATUS */}
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          req.status === "fulfilled"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : req.status === "rejected"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}
                      >
                        {req.status === "fulfilled" && <Check className="w-3 h-3" />}
                        {req.status === "rejected" && <RotateCcw className="w-3 h-3" />}
                        {req.status === "pending" && <Clock className="w-3 h-3" />}
                        {req.status}
                      </span>
                    </td>

                    {/* ACTIONS */}
                    <td className="p-4 text-right">
                      {req.status === "pending" ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleFulfill(req.id)}
                            disabled={processingId === req.id}
                            className="bg-emerald-500 text-black px-3 py-1.5 rounded-lg font-bold text-[11px] hover:bg-emerald-400 transition-all flex items-center gap-1 shadow-md disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Fulfill
                          </button>
                          <button
                            onClick={() => handleRejectAndRefund(req)}
                            disabled={processingId === req.id}
                            className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-lg font-bold text-[11px] hover:bg-rose-500/20 transition-all flex items-center gap-1 disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject & Refund
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-neutral-500 font-mono">
                          Completed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}