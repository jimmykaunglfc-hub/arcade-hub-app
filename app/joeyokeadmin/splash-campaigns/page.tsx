"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SplashCampaignsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [actionLabel, setActionLabel] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [seconds, setSeconds] = useState(5);
  const [everyLaunch, setEveryLaunch] = useState(false);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("splash_campaigns").select("*").order("created_at", { ascending: false });
    setItems(data || []);
  };
  useEffect(() => { void load(); }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("splash_campaigns").insert({
      title: title.trim(), message: message.trim(), image_url: imageUrl.trim() || null,
      action_label: actionLabel.trim() || null, action_url: actionUrl.trim() || null,
      display_seconds: seconds, show_every_launch: everyLaunch, is_active: active,
    });
    setSaving(false);
    if (error) return alert(error.message);
    setTitle(""); setMessage(""); setImageUrl(""); setActionLabel(""); setActionUrl(""); void load();
  };

  const toggle = async (item: any) => {
    await supabase.from("splash_campaigns").update({ is_active: !item.is_active, updated_at: new Date().toISOString() }).eq("id", item.id);
    void load();
  };

  return (
    <div className="space-y-8 pb-16">
      <header><p className="text-[10px] font-bold uppercase tracking-widest text-[#CCFF00]">Engagement</p><h1 className="font-headline text-3xl font-black text-white">Splash campaigns</h1><p className="mt-1 text-xs text-neutral-400">Create launch screens with skip timers and deep-link actions. Use tab:Store, tab:Explore, native://checkers, or a route such as /tournaments/id.</p></header>
      <form onSubmit={save} className="grid gap-4 rounded-[24px] border border-white/10 bg-[#18181b] p-6">
        <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Campaign title" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Optional image URL" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
        <div className="grid gap-4 sm:grid-cols-2"><input value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} placeholder="Action label, e.g. View store" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" /><input value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} placeholder="Deep link, e.g. tab:Store" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" /></div>
        <div className="flex flex-wrap items-center gap-5 text-xs text-neutral-300"><label>Skip timer <input type="number" min="0" max="30" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="ml-2 w-16 rounded-lg bg-white/10 p-2 text-white" /> sec</label><label><input type="checkbox" checked={everyLaunch} onChange={(e) => setEveryLaunch(e.target.checked)} /> Show every launch</label><label><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active now</label></div>
        <button disabled={saving} className="rounded-xl bg-[#CCFF00] px-5 py-3 text-xs font-black text-black disabled:opacity-50">{saving ? "Saving..." : "Create splash campaign"}</button>
      </form>
      <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#18181b]">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 border-b border-white/5 p-5"><div><p className="font-bold text-white">{item.title}</p><p className="mt-1 text-xs text-neutral-400">{item.display_seconds}s · {item.show_every_launch ? "Every launch" : "Once per device"} · {item.action_url || "No action"}</p></div><button onClick={() => void toggle(item)} className={item.is_active ? "rounded-xl bg-[#CCFF00] px-3 py-2 text-xs font-bold text-black" : "rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white"}>{item.is_active ? "Active" : "Inactive"}</button></div>)}</div>
    </div>
  );
}

