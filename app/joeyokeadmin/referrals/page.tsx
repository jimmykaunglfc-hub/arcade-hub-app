"use client";

import { useEffect, useState } from "react";
import { Gift, RefreshCw, Save, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Invitee = { id: string; username: string; network_id: string; created_at: string; referrer?: { username?: string; network_id?: string } | null };

export default function ReferralRewardsPage() {
  const [inviterPoints, setInviterPoints] = useState(500);
  const [inviterGems, setInviterGems] = useState(10);
  const [newUserPoints, setNewUserPoints] = useState(100);
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const load = async () => {
    setLoading(true);
    const [{ data: config }, { data: referrals }] = await Promise.all([
      supabase.from("platform_config").select("referral_inviter_points, referral_inviter_gems, referral_new_user_points").eq("id", 1).maybeSingle(),
      supabase.from("profiles").select("id, username, network_id, created_at, referrer:referred_by(username, network_id)").not("referred_by", "is", null).order("created_at", { ascending: false }).limit(100),
    ]);
    if (config) { setInviterPoints(Number(config.referral_inviter_points ?? 500)); setInviterGems(Number(config.referral_inviter_gems ?? 10)); setNewUserPoints(Number(config.referral_new_user_points ?? 100)); }
    setInvitees((referrals || []) as Invitee[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("platform_config").upsert({ id: 1, referral_inviter_points: Math.max(0, inviterPoints), referral_inviter_gems: Math.max(0, inviterGems), referral_new_user_points: Math.max(0, newUserPoints), updated_at: new Date().toISOString() });
    setSaving(false); setNotice(error ? error.message : "Referral rewards saved and live.");
  };
  return <div className="space-y-7 pb-12"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-widest text-[#CCFF00]">Growth / Rewards</p><h1 className="font-headline text-3xl font-black text-white">Referral Rewards</h1><p className="mt-1 text-xs text-neutral-400">Control referral payouts and monitor every completed invitation.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-neutral-300"><RefreshCw className="h-4 w-4" /></button><button onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-xl bg-[#CCFF00] px-5 py-2.5 text-xs font-black text-black"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save rewards"}</button></div></header>{notice && <p className="rounded-xl bg-[#CCFF00]/10 p-3 text-xs font-bold text-[#CCFF00]">{notice}</p>}<section className="grid gap-4 md:grid-cols-3">{[["Inviter points", inviterPoints, setInviterPoints, "bolt"],["Inviter gems", inviterGems, setInviterGems, "diamond"],["New player points", newUserPoints, setNewUserPoints, "person_add"]].map(([label, value, setter, icon]) => <label key={label as string} className="rounded-3xl border border-white/10 bg-[#18181b] p-5"><span className="material-symbols-outlined text-[#CCFF00]">{icon as string}</span><span className="mt-3 block text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label as string}</span><input type="number" min="0" value={value as number} onChange={(e) => (setter as (n: number) => void)(Number(e.target.value))} className="mt-2 w-full bg-transparent text-3xl font-black text-white outline-none" /></label>)}</section><section className="overflow-hidden rounded-3xl border border-white/10 bg-[#18181b]"><div className="flex items-center justify-between border-b border-white/10 p-5"><span><h2 className="font-headline font-black text-white">Referral activity</h2><p className="mt-1 text-xs text-neutral-500">New users who applied a referral code.</p></span><span className="flex items-center gap-2 text-xs font-bold text-[#CCFF00]"><Users className="h-4 w-4" />{invitees.length} tracked</span></div>{loading ? <p className="p-10 text-center text-xs text-neutral-500">Loading referrals…</p> : invitees.length ? <div className="divide-y divide-white/5">{invitees.map((invitee) => <div key={invitee.id} className="flex items-center justify-between gap-4 p-4"><span><b className="block text-sm text-white">{invitee.username}</b><small className="text-xs text-neutral-500">{invitee.network_id} · joined {new Date(invitee.created_at).toLocaleDateString()}</small></span><span className="text-right text-xs"><b className="block text-[#CCFF00]">Invited by {invitee.referrer?.username || "Unknown"}</b><small className="text-neutral-500">{invitee.referrer?.network_id}</small></span></div>)}</div> : <div className="p-10 text-center text-xs text-neutral-500"><Gift className="mx-auto mb-3 h-6 w-6" />No referral rewards have been claimed yet.</div>}</section></div>;
}
