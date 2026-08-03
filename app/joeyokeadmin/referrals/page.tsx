"use client";

import { useEffect, useState } from "react";
import {
  Gift,
  Plus,
  RefreshCw,
  Save,
  ShoppingCart,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Invitee = {
  id: string;
  username: string;
  network_id: string;
  created_at: string;
  referrer?: { username?: string; network_id?: string } | null;
};

type Milestone = {
  id: string;
  invitee_target: number;
  reward_points: number;
  reward_gems: number;
};

type PurchaseRule = {
  id: string;
  minimum_purchase_amount: number;
  purchase_currency: string;
  reward_points: number;
  reward_gems: number;
};

const numberValue = (value: string) => Math.max(0, Number(value) || 0);

export default function ReferralRewardsPage() {
  const [inviterPoints, setInviterPoints] = useState(500);
  const [inviterGems, setInviterGems] = useState(10);
  const [newUserPoints, setNewUserPoints] = useState(100);
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [purchaseRules, setPurchaseRules] = useState<PurchaseRule[]>([]);
  const [milestoneDraft, setMilestoneDraft] = useState({ target: 5, points: 0, gems: 10 });
  const [purchaseDraft, setPurchaseDraft] = useState({ minimum: 5, points: 0, gems: 5 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: config }, { data: referrals }, { data: tierData }, { data: purchaseData }] =
      await Promise.all([
        supabase
          .from("platform_config")
          .select("referral_inviter_points, referral_inviter_gems, referral_new_user_points")
          .eq("id", 1)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, username, network_id, created_at, referrer:referred_by(username, network_id)")
          .not("referred_by", "is", null)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("referral_milestone_rules").select("*").order("invitee_target"),
        supabase.from("referral_purchase_rules").select("*").order("minimum_purchase_amount"),
      ]);

    if (config) {
      setInviterPoints(Number(config.referral_inviter_points ?? 500));
      setInviterGems(Number(config.referral_inviter_gems ?? 10));
      setNewUserPoints(Number(config.referral_new_user_points ?? 100));
    }
    setInvitees((referrals || []) as Invitee[]);
    setMilestones((tierData || []) as Milestone[]);
    setPurchaseRules((purchaseData || []) as PurchaseRule[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const saveBaseRewards = async () => {
    setSaving(true);
    const { error } = await supabase.from("platform_config").upsert({
      id: 1,
      referral_inviter_points: inviterPoints,
      referral_inviter_gems: inviterGems,
      referral_new_user_points: newUserPoints,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    setNotice(error ? error.message : "Base referral rewards saved and live.");
  };

  const addMilestone = async () => {
    if (milestoneDraft.target < 1 || (!milestoneDraft.points && !milestoneDraft.gems)) {
      setNotice("Set an invitee target and at least one reward.");
      return;
    }
    const { error } = await supabase.from("referral_milestone_rules").insert({
      invitee_target: milestoneDraft.target,
      reward_points: milestoneDraft.points,
      reward_gems: milestoneDraft.gems,
    });
    setNotice(error ? error.message : "Invitation reward tier added.");
    if (!error) void load();
  };

  const addPurchaseRule = async () => {
    if (purchaseDraft.minimum <= 0 || (!purchaseDraft.points && !purchaseDraft.gems)) {
      setNotice("Set a minimum purchase amount and at least one reward.");
      return;
    }
    const { error } = await supabase.from("referral_purchase_rules").insert({
      minimum_purchase_amount: purchaseDraft.minimum,
      purchase_currency: "USD",
      reward_points: purchaseDraft.points,
      reward_gems: purchaseDraft.gems,
    });
    setNotice(error ? error.message : "Purchase reward rule added.");
    if (!error) void load();
  };

  const removeRule = async (table: "referral_milestone_rules" | "referral_purchase_rules", id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    setNotice(error ? error.message : "Reward rule removed.");
    if (!error) void load();
  };

  return (
    <div className="space-y-7 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#CCFF00]">Growth / Rewards</p>
          <h1 className="font-headline text-3xl font-black text-white">Referral Rewards</h1>
          <p className="mt-1 text-xs text-neutral-400">Set base, milestone, and purchase rewards for referrers.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-neutral-300" aria-label="Refresh referral rewards">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={() => void saveBaseRewards()} disabled={saving} className="flex items-center gap-2 rounded-xl bg-[#CCFF00] px-5 py-2.5 text-xs font-black text-black disabled:opacity-60">
            <Save className="h-4 w-4" />{saving ? "Saving…" : "Save base rewards"}
          </button>
        </div>
      </header>

      {notice && <p className="rounded-xl bg-[#CCFF00]/10 p-3 text-xs font-bold text-[#CCFF00]">{notice}</p>}

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Inviter points", inviterPoints, setInviterPoints, "bolt"],
          ["Inviter gems", inviterGems, setInviterGems, "diamond"],
          ["New player points", newUserPoints, setNewUserPoints, "person_add"],
        ].map(([label, value, setter, icon]) => (
          <label key={label as string} className="rounded-3xl border border-white/10 bg-[#18181b] p-5">
            <span className="material-symbols-outlined text-[#CCFF00]">{icon as string}</span>
            <span className="mt-3 block text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label as string}</span>
            <input type="number" min="0" value={value as number} onChange={(event) => (setter as (next: number) => void)(numberValue(event.target.value))} className="mt-2 w-full bg-transparent text-3xl font-black text-white outline-none" />
          </label>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-[#18181b] p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#CCFF00]/10 text-[#CCFF00]"><Trophy className="h-5 w-5" /></span>
            <div><h2 className="font-headline font-black text-white">Invitation milestones</h2><p className="mt-1 text-xs text-neutral-500">Award once when an inviter reaches each invitee total.</p></div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <NumberField label="Invitees" value={milestoneDraft.target} onChange={(target) => setMilestoneDraft((draft) => ({ ...draft, target }))} min={1} />
            <NumberField label="Points" value={milestoneDraft.points} onChange={(points) => setMilestoneDraft((draft) => ({ ...draft, points }))} />
            <NumberField label="Gems" value={milestoneDraft.gems} onChange={(gems) => setMilestoneDraft((draft) => ({ ...draft, gems }))} />
          </div>
          <button onClick={() => void addMilestone()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#CCFF00] py-3 text-xs font-black text-black"><Plus className="h-4 w-4" />Add invitation tier</button>
          <RuleList empty="No invitation tiers yet." items={milestones} render={(rule) => <><span><b className="block text-sm text-white">{rule.invitee_target} invitees</b><small className="text-neutral-500">One-time reward</small></span><RewardLabel points={rule.reward_points} gems={rule.reward_gems} /></>} onDelete={(id) => void removeRule("referral_milestone_rules", id)} />
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#18181b] p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#CCFF00]/10 text-[#CCFF00]"><ShoppingCart className="h-5 w-5" /></span>
            <div><h2 className="font-headline font-black text-white">Invitee purchase rewards</h2><p className="mt-1 text-xs text-neutral-500">Reward the inviter when an invitee completes a qualifying purchase.</p></div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <NumberField label="Minimum USD" value={purchaseDraft.minimum} onChange={(minimum) => setPurchaseDraft((draft) => ({ ...draft, minimum }))} min={0.01} step="0.01" />
            <NumberField label="Points" value={purchaseDraft.points} onChange={(points) => setPurchaseDraft((draft) => ({ ...draft, points }))} />
            <NumberField label="Gems" value={purchaseDraft.gems} onChange={(gems) => setPurchaseDraft((draft) => ({ ...draft, gems }))} />
          </div>
          <button onClick={() => void addPurchaseRule()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#CCFF00] py-3 text-xs font-black text-black"><Plus className="h-4 w-4" />Add purchase rule</button>
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">Rewards are issued only after your verified payment or IAP webhook confirms the purchase.</p>
          <RuleList empty="No purchase reward rules yet." items={purchaseRules} render={(rule) => <><span><b className="block text-sm text-white">${Number(rule.minimum_purchase_amount).toFixed(2)}+ purchase</b><small className="uppercase text-neutral-500">{rule.purchase_currency}</small></span><RewardLabel points={rule.reward_points} gems={rule.reward_gems} /></>} onDelete={(id) => void removeRule("referral_purchase_rules", id)} />
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#18181b]">
        <div className="flex items-center justify-between border-b border-white/10 p-5"><span><h2 className="font-headline font-black text-white">Referral activity</h2><p className="mt-1 text-xs text-neutral-500">New users who applied a referral code.</p></span><span className="flex items-center gap-2 text-xs font-bold text-[#CCFF00]"><Users className="h-4 w-4" />{invitees.length} tracked</span></div>
        {loading ? <p className="p-10 text-center text-xs text-neutral-500">Loading referrals…</p> : invitees.length ? <div className="divide-y divide-white/5">{invitees.map((invitee) => <div key={invitee.id} className="flex items-center justify-between gap-4 p-4"><span><b className="block text-sm text-white">{invitee.username}</b><small className="text-xs text-neutral-500">{invitee.network_id} · joined {new Date(invitee.created_at).toLocaleDateString()}</small></span><span className="text-right text-xs"><b className="block text-[#CCFF00]">Invited by {invitee.referrer?.username || "Unknown"}</b><small className="text-neutral-500">{invitee.referrer?.network_id}</small></span></div>)}</div> : <div className="p-10 text-center text-xs text-neutral-500"><Gift className="mx-auto mb-3 h-6 w-6" />No referral rewards have been claimed yet.</div>}
      </section>
    </div>
  );
}

function NumberField({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number | string }) {
  return <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</span><input type="number" min={min} step={step} value={value} onChange={(event) => onChange(numberValue(event.target.value))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-[#CCFF00]" /></label>;
}

function RewardLabel({ points, gems }: { points: number; gems: number }) {
  return <span className="text-right text-xs font-bold text-[#CCFF00]">{points > 0 && <span className="block">{points.toLocaleString()} pts</span>}{gems > 0 && <span className="block">{gems.toLocaleString()} gems</span>}</span>;
}

function RuleList<T extends { id: string }>({ empty, items, render, onDelete }: { empty: string; items: T[]; render: (item: T) => React.ReactNode; onDelete: (id: string) => void }) {
  return <div className="mt-4 divide-y divide-white/5 rounded-2xl border border-white/5 bg-black/15">{items.length ? items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 p-3">{render(item)}<button onClick={() => onDelete(item.id)} className="rounded-lg p-2 text-neutral-500 transition hover:bg-red-500/10 hover:text-red-400" aria-label="Delete reward rule"><Trash2 className="h-4 w-4" /></button></div>) : <p className="p-4 text-center text-xs text-neutral-500">{empty}</p>}</div>;
}
