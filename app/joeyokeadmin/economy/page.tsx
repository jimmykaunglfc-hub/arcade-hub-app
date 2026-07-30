"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ChevronDown, Coins, RefreshCw, Users } from "lucide-react";

type Ledger = {
  id: string;
  user_id: string;
  amount: number;
  balance_snapshot: number;
  mutation_type: string;
  description: string;
  created_at: string;
  profiles?: { username?: string; avatar_url?: string; email?: string };
};

export default function EconomyLedger() {
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [profiles, setProfiles] = useState<
    {
      id: string;
      points?: number;
      gems?: number;
      username?: string;
      avatar_url?: string;
      email?: string;
    }[]
  >([]);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    const [profileResult, ledgerResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, avatar_url, email, points, gems")
        .order("username"),
      supabase
        .from("financial_audit_logs")
        .select(
          "id, user_id, amount, balance_snapshot, mutation_type, description, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    setProfiles(profileResult.data || []);
    setLedger(ledgerResult.data || []);
    setError(profileResult.error?.message || ledgerResult.error?.message || "");
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const grouped = useMemo(
    () =>
      profiles
        .map((profile) => ({
          profile,
          activity: ledger.filter((entry) => entry.user_id === profile.id),
        }))
        .filter(
          (group) =>
            group.activity.length ||
            group.profile.points ||
            0 ||
            group.profile.gems ||
            0
        ),
    [profiles, ledger]
  );
  const totalPoints = profiles.reduce(
    (total, profile) => total + (profile.points || 0),
    0
  );
  const totalGems = profiles.reduce(
    (total, profile) => total + (profile.gems || 0),
    0
  );
  return (
    <div className="space-y-8 pb-12">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="font-headline text-3xl font-black text-white">
            Economy & Player Ledger
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Open a player to view their complete tracked point, gem, match,
            wheel, and purchase activity.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-xs font-bold text-white"
        >
          <RefreshCw className="w-4 h-4" />
          Sync
        </button>
      </header>
      {error && (
        <p className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-[#18181b] p-5">
          <Coins className="h-5 w-5 text-amber-400" />
          <p className="mt-3 text-[10px] font-bold uppercase text-neutral-500">
            Points in circulation
          </p>
          <b className="text-2xl text-white">{totalPoints.toLocaleString()}</b>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#18181b] p-5">
          <Coins className="h-5 w-5 text-violet-400" />
          <p className="mt-3 text-[10px] font-bold uppercase text-neutral-500">
            Gems in circulation
          </p>
          <b className="text-2xl text-white">{totalGems.toLocaleString()}</b>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#18181b] p-5">
          <Users className="h-5 w-5 text-[#CCFF00]" />
          <p className="mt-3 text-[10px] font-bold uppercase text-neutral-500">
            Wallets with activity
          </p>
          <b className="text-2xl text-white">{grouped.length}</b>
        </div>
      </div>
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#18181b]">
        <div className="border-b border-white/10 p-5 text-xs font-bold uppercase tracking-widest text-neutral-400">
          Player wallets
        </div>
        {loading ? (
          <p className="p-10 text-center text-xs text-neutral-500">
            Loading player ledger…
          </p>
        ) : (
          grouped.map(({ profile, activity }) => (
            <div
              key={profile.id}
              className="border-b border-white/5 last:border-0"
            >
              <button
                onClick={() =>
                  setOpenUser(openUser === profile.id ? null : profile.id)
                }
                className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-white/[0.02]"
              >
                <span className="flex items-center gap-3">
                  <img
                    src={
                      profile.avatar_url ||
                      "https://img.icons8.com/illustrations/xlarge/robot.png"
                    }
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <span>
                    <b className="block text-sm text-white">
                      {profile.username || "Unknown player"}
                    </b>
                    <span className="text-xs text-neutral-500">
                      {profile.email} · {activity.length} activities
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-5">
                  <span className="text-xs text-amber-400">
                    {(profile.points || 0).toLocaleString()} PTS
                  </span>
                  <span className="text-xs text-violet-400">
                    {(profile.gems || 0).toLocaleString()} gems
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-neutral-400 transition-transform ${
                      openUser === profile.id ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>
              {openUser === profile.id && (
                <div className="bg-black/20 px-5 pb-5">
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/5 text-neutral-400">
                        <tr>
                          <th className="p-3">When</th>
                          <th className="p-3">Activity</th>
                          <th className="p-3">Description</th>
                          <th className="p-3 text-right">Point change</th>
                          <th className="p-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {activity.map((entry) => (
                          <tr key={entry.id}>
                            <td className="p-3 text-neutral-500">
                              {new Date(entry.created_at).toLocaleString()}
                            </td>
                            <td className="p-3 font-bold capitalize text-white">
                              {entry.mutation_type.replaceAll("_", " ")}
                            </td>
                            <td className="p-3 text-neutral-400">
                              {entry.description}
                            </td>
                            <td
                              className={`p-3 text-right font-bold ${
                                entry.amount >= 0
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }`}
                            >
                              {entry.amount >= 0 ? "+" : ""}
                              {entry.amount}
                            </td>
                            <td className="p-3 text-right text-neutral-300">
                              {entry.balance_snapshot}
                            </td>
                          </tr>
                        ))}
                        {!activity.length && (
                          <tr>
                            <td
                              colSpan={5}
                              className="p-4 text-center text-neutral-500"
                            >
                              No tracked point activity.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
