"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Users, Coins, Gamepad2, Gift, RefreshCw } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Ledger = { amount: number; created_at: string };

export default function DashboardOverview() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    users: 0,
    points: 0,
    gamesToday: 0,
    pendingRedemptions: 0,
  });
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [profiles, audit, matches, redemptions] = await Promise.all([
      supabase.from("profiles").select("points"),
      supabase
        .from("financial_audit_logs")
        .select("amount, created_at")
        .gte("created_at", new Date(Date.now() - 6 * 86400000).toISOString()),
      supabase
        .from("match_history")
        .select("id", { count: "exact", head: true })
        .gte("created_at", start.toISOString()),
      supabase
        .from("redeem_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
    setError(
      profiles.error?.message ||
        audit.error?.message ||
        matches.error?.message ||
        redemptions.error?.message ||
        ""
    );
    setMetrics({
      users: profiles.data?.length || 0,
      points: (profiles.data || []).reduce(
        (sum, profile) => sum + (profile.points || 0),
        0
      ),
      gamesToday: matches.count || 0,
      pendingRedemptions: redemptions.count || 0,
    });
    setLedger(audit.data || []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const chartData = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(Date.now() - (6 - index) * 86400000);
        const key = date.toDateString();
        return {
          name: date.toLocaleDateString(undefined, { weekday: "short" }),
          volume: ledger
            .filter(
              (entry) => new Date(entry.created_at).toDateString() === key
            )
            .reduce((sum, entry) => sum + Math.abs(entry.amount), 0),
        };
      }),
    [ledger]
  );
  const cards = [
    {
      label: "Registered Players",
      value: metrics.users,
      icon: Users,
      color: "text-indigo-400",
    },
    {
      label: "Points in Circulation",
      value: metrics.points.toLocaleString(),
      icon: Coins,
      color: "text-amber-400",
    },
    {
      label: "Games Played Today",
      value: metrics.gamesToday,
      icon: Gamepad2,
      color: "text-emerald-400",
    },
    {
      label: "Pending Redemptions",
      value: metrics.pendingRedemptions,
      icon: Gift,
      color: "text-violet-400",
    },
  ];
  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            Admin / Live overview
          </p>
          <h2 className="font-headline text-3xl font-black text-white">
            Dashboard Overview
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Live platform data from player, match, redemption, and ledger
            records.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-xs font-bold text-white"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </header>
      {error && (
        <p className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300">
          Some live metrics could not load: {error}
        </p>
      )}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-3xl border border-white/10 bg-[#18181b] p-5"
            >
              <div className="flex justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  {card.label}
                </p>
                <Icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <p className="mt-5 text-3xl font-black text-white">
                {loading ? "—" : card.value}
              </p>
            </div>
          );
        })}
      </div>
      <section className="rounded-3xl border border-white/10 bg-[#18181b] p-6">
        <h3 className="font-headline text-lg font-black text-white">
          Ledger activity
        </h3>
        <p className="mb-6 text-xs text-neutral-400">
          Total point movement over the last seven days.
        </p>
        <div className="h-72">
          {loading ? (
            <p className="pt-20 text-center text-xs text-neutral-500">
              Loading live activity…
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="name" stroke="#737373" fontSize={11} />
                <YAxis stroke="#737373" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "#09090b",
                    border: "1px solid #ffffff20",
                    borderRadius: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="volume"
                  stroke="#CCFF00"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}
