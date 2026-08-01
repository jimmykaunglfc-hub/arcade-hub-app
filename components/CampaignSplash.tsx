"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type SplashCampaign = {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  action_label: string | null;
  action_url: string | null;
  display_seconds: number;
  show_every_launch: boolean;
};

export default function CampaignSplash({ onAction }: { onAction: (actionUrl: string) => void }) {
  const [campaign, setCampaign] = useState<SplashCampaign | null>(null);
  const [remaining, setRemaining] = useState(0);
  const dismissed = useRef(false);

  useEffect(() => {
    let active = true;
    const loadCampaign = async () => {
      const { data } = await supabase.from("splash_campaigns").select("id, title, message, image_url, action_label, action_url, display_seconds, show_every_launch").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!active || !data) return;
      const stored = localStorage.getItem("joeyoke_splash_campaign");
      if (!data.show_every_launch && stored === data.id) return;
      setCampaign(data as SplashCampaign);
      setRemaining(Math.max(0, Number(data.display_seconds) || 0));
    };
    void loadCampaign();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!campaign || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [campaign, remaining]);

  const dismiss = () => {
    if (!campaign || dismissed.current) return;
    dismissed.current = true;
    localStorage.setItem("joeyoke_splash_campaign", campaign.id);
    setCampaign(null);
  };
  const canSkip = remaining === 0;
  const progress = useMemo(() => !campaign || campaign.display_seconds <= 0 ? 100 : Math.min(100, ((campaign.display_seconds - remaining) / campaign.display_seconds) * 100), [campaign, remaining]);
  if (!campaign) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-end bg-black/75 p-4 backdrop-blur-md sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={campaign.title}>
      <section className="w-full max-w-sm overflow-hidden rounded-[32px] border border-surface-container-highest bg-surface shadow-[0_24px_90px_rgba(0,0,0,0.50)]">
        {campaign.image_url ? <img src={campaign.image_url} alt="" className="h-40 w-full object-cover" /> : <div className="flex h-28 items-center justify-center bg-[radial-gradient(circle_at_50%_0%,rgba(204,255,0,0.22),transparent_65%)]"><span className="material-symbols-outlined text-4xl text-primary">auto_awesome</span></div>}
        <div className="p-6">
          <div className="mb-3 flex items-center justify-between gap-3"><span className="rounded-full bg-primary-container px-3 py-1 font-caps text-[10px] font-black uppercase tracking-[0.16em] text-primary-fg">Live update</span><span className="font-mono text-xs font-bold text-on-surface-variant">{canSkip ? "Ready" : `\${remaining}s`}</span></div>
          <h2 className="font-headline text-2xl font-black tracking-tight text-on-surface">{campaign.title}</h2>
          {campaign.message && <p className="mt-2 text-sm leading-6 text-on-surface-variant">{campaign.message}</p>}
          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-surface-container-highest"><div className="h-full rounded-full bg-primary transition-all duration-1000" style={{ width: `\${progress}%` }} /></div>
          <div className="mt-5 grid gap-2">
            {campaign.action_url && campaign.action_label && <button type="button" onClick={() => { const actionUrl = campaign.action_url || ""; dismiss(); onAction(actionUrl); }} className="rounded-2xl bg-primary px-4 py-3.5 font-headline text-sm font-black text-on-primary transition active:scale-[0.98]">{campaign.action_label}</button>}
            <button type="button" disabled={!canSkip} onClick={dismiss} className="rounded-2xl border border-surface-container-highest px-4 py-3 text-xs font-bold text-on-surface-variant transition hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-45">{canSkip ? "Skip" : `Skip in \${remaining}s`}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

