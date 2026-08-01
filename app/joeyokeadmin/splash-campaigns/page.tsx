"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SplashCampaignsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
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
    let uploadedImageUrl: string | null = null;
    if (imageFile) {
      const extension = imageFile.name.split(".").pop() || "jpg";
      const path = "campaigns/" + crypto.randomUUID() + "." + extension;
      const { error: uploadError } = await supabase.storage.from("splash-campaigns").upload(path, imageFile, { upsert: false, contentType: imageFile.type });
      if (uploadError) { setSaving(false); alert(uploadError.message); return; }
      const { data: publicUrl } = supabase.storage.from("splash-campaigns").getPublicUrl(path);
      uploadedImageUrl = publicUrl.publicUrl;
    }
    const { error } = await supabase.from("splash_campaigns").insert({
      title: title.trim(), message: message.trim(), image_url: uploadedImageUrl,
      action_label: actionLabel.trim() || null, action_url: actionUrl.trim() || null,
      display_seconds: seconds, show_every_launch: everyLaunch, is_active: active,
    });
    setSaving(false);
    if (error) return alert(error.message);
    setTitle(""); setMessage(""); setImageFile(null); setActionLabel(""); setActionUrl(""); void load();
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
        <label className="rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-neutral-300">Campaign image <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="ml-3 text-xs" /> {imageFile?.name || "No file selected"}</label>
        <div className="grid gap-4 sm:grid-cols-2"><input value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} placeholder="Action label, e.g. View store" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" /><select value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"><option value="">No action</option><optgroup label="App tabs"><option value="tab:Home">Home</option><option value="tab:Explore">Explore</option><option value="tab:Store">Store</option><option value="tab:Chats">Chats</option><option value="tab:Profile">Profile</option></optgroup><optgroup label="Games"><option value="native://checkers">Checkers</option><option value="native://carrom">Carrom</option><option value="native://chess">Chess</option><option value="native://snooker">Snooker</option><option value="native://pool">Pool</option><option value="native://uno">UNO</option><option value="native://tictactoe">Tic-Tac-Toe</option><option value="native://glitch-deck">Glitch Deck</option></optgroup><optgroup label="Dedicated pages & features"><option value="/tournaments">Tournaments</option><option value="tab:Home">Daily rewards</option><option value="tab:Store">Cosmetics shop</option><option value="tab:Explore">Game catalogue</option></optgroup></select></div>
        <div className="flex flex-wrap items-center gap-5 text-xs text-neutral-300"><label>Skip timer <input type="number" min="0" max="30" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="ml-2 w-16 rounded-lg bg-white/10 p-2 text-white" /> sec</label><label><input type="checkbox" checked={everyLaunch} onChange={(e) => setEveryLaunch(e.target.checked)} /> Show every launch</label><label><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active now</label></div>
        <button disabled={saving} className="rounded-xl bg-[#CCFF00] px-5 py-3 text-xs font-black text-black disabled:opacity-50">{saving ? "Saving..." : "Create splash campaign"}</button>
      </form>
      <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#18181b]">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 border-b border-white/5 p-5"><div><p className="font-bold text-white">{item.title}</p><p className="mt-1 text-xs text-neutral-400">{item.display_seconds}s · {item.show_every_launch ? "Every launch" : "Once per device"} · {item.action_url || "No action"}</p></div><button onClick={() => void toggle(item)} className={item.is_active ? "rounded-xl bg-[#CCFF00] px-3 py-2 text-xs font-bold text-black" : "rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white"}>{item.is_active ? "Active" : "Inactive"}</button></div>)}</div>
    </div>
  );
}

