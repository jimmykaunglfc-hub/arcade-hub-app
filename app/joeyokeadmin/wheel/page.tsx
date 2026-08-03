"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Reward = {
  id: string;
  label: string;
  reward_type: "points" | "gems";
  reward_value: number;
  probability: number;
  display_order: number;
  is_active: boolean;
  wheel_color: string;
};
const blank = (): Omit<Reward, "id"> => ({
  label: "",
  reward_type: "points",
  reward_value: 100,
  probability: 1,
  display_order: 0,
  is_active: true,
  wheel_color: "#93df25",
});

export default function WheelRewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [draft, setDraft] = useState<Omit<Reward, "id">>(blank());
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("wheel_rewards")
      .select("*")
      .order("display_order");
    setRewards((data || []) as Reward[]);
    setError(loadError?.message || "");
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const percent = rewards
    .filter((r) => r.is_active)
    .reduce((total, reward) => total + Number(reward.probability || 0), 0);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const values = {
      ...draft,
      label: draft.label.trim(),
      probability: Number(draft.probability),
      reward_value: Number(draft.reward_value),
      display_order: Number(draft.display_order),
    };
    const query = editing
      ? supabase.from("wheel_rewards").update(values).eq("id", editing)
      : supabase.from("wheel_rewards").insert(values);
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setDraft(blank());
    setEditing(null);
    void load();
  };
  const edit = (reward: Reward) => {
    setEditing(reward.id);
    setDraft({
      label: reward.label,
      reward_type: reward.reward_type,
      reward_value: reward.reward_value,
      probability: reward.probability,
      display_order: reward.display_order,
      is_active: reward.is_active,
      wheel_color: reward.wheel_color || "#93df25",
    });
  };
  return (
    <div className="space-y-8 pb-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-headline text-3xl font-black text-white">
            Daily Wheel Rewards
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Configure the rewards and weighted probabilities used by the
            server-side daily spin.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-xl bg-white/5 px-4 py-2 text-xs font-bold text-white"
        >
          Refresh
        </button>
      </header>
      {error && (
        <p className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#18181b]">
          <div className="flex items-center justify-between border-b border-white/10 p-5">
            <h3 className="font-bold">Configured rewards</h3>
            <span
              className={`rounded-lg px-2 py-1 text-xs font-black ${
                percent > 0
                  ? "bg-[#CCFF00]/10 text-[#CCFF00]"
                  : "bg-rose-500/10 text-rose-300"
              }`}
            >
              {percent}% total weight
            </span>
          </div>
          {loading ? (
            <p className="p-8 text-center text-xs text-neutral-500">
              Loading rewards…
            </p>
          ) : (
            <div className="divide-y divide-white/5">
              {rewards.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-white">
                      <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: reward.wheel_color || "#93df25" }} />
                      {reward.label}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {reward.reward_value.toLocaleString()}{" "}
                      {reward.reward_type === "points" ? "PTS" : "GEMS"} ·{" "}
                      {reward.probability}% · position {reward.display_order} ·{" "}
                      {reward.is_active ? "Active" : "Hidden"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => edit(reward)}
                      className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        void supabase
                          .from("wheel_rewards")
                          .delete()
                          .eq("id", reward.id)
                          .then(load)
                      }
                      className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {!rewards.length && (
                <p className="p-8 text-center text-xs text-neutral-500">
                  Add rewards to activate the wheel.
                </p>
              )}
            </div>
          )}
        </section>
        <form
          onSubmit={save}
          className="space-y-4 rounded-3xl border border-white/10 bg-[#18181b] p-5"
        >
          <h3 className="font-bold text-white">
            {editing ? "Edit reward" : "Add reward"}
          </h3>
          <label className="block text-xs font-bold text-neutral-300">
            Reward label
            <input
              required
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="e.g. 250 PTS"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-neutral-300">
              Reward currency
              <select
                value={draft.reward_type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reward_type: e.target.value as Reward["reward_type"],
                  })
                }
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white"
              >
                <option value="points">Points</option>
                <option value="gems">Gems</option>
              </select>
            </label>
            <label className="block text-xs font-bold text-neutral-300">
              Reward amount
              <input
                required
                min="1"
                type="number"
                value={draft.reward_value}
                onChange={(e) =>
                  setDraft({ ...draft, reward_value: Number(e.target.value) })
                }
                placeholder="e.g. 100"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white"
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-neutral-300">
            Wheel segment color
            <span className="mt-1.5 flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3">
              <input
                type="color"
                value={draft.wheel_color}
                onChange={(e) => setDraft({ ...draft, wheel_color: e.target.value })}
                className="h-7 w-10 cursor-pointer border-0 bg-transparent p-0"
              />
              <span className="font-mono text-xs text-neutral-400">{draft.wheel_color}</span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-neutral-300">
              Probability weight
              <input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={draft.probability}
                onChange={(e) =>
                  setDraft({ ...draft, probability: Number(e.target.value) })
                }
                placeholder="e.g. 25"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white"
              />
            </label>
            <label className="block text-xs font-bold text-neutral-300">
              Wheel position
              <input
                required
                min="0"
                type="number"
                value={draft.display_order}
                onChange={(e) =>
                  setDraft({ ...draft, display_order: Number(e.target.value) })
                }
                placeholder="e.g. 1"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) =>
                setDraft({ ...draft, is_active: e.target.checked })
              }
            />{" "}
            Active and eligible to win
          </label>
          <div className="flex gap-2">
            <button
              disabled={saving}
              className="flex-1 rounded-xl bg-[#CCFF00] p-3 text-xs font-black text-black disabled:opacity-50"
            >
              {saving ? "Saving…" : editing ? "Save reward" : "Add reward"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setDraft(blank());
                }}
                className="rounded-xl bg-white/5 px-4 text-xs font-bold text-white"
              >
                Cancel
              </button>
            )}
          </div>
          <p className="text-[10px] leading-relaxed text-neutral-500">
            Probabilities are relative weights. For a percentage-style setup,
            make active rewards total 100.
          </p>
        </form>
      </div>
    </div>
  );
}
