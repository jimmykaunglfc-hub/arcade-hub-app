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

export default function CampaignSplash({ onAction, onVisibilityChange }: { onAction: (actionUrl: string) => void; onVisibilityChange: (visible: boolean) => void }) {
  const [campaign, setCampaign] = useState<SplashCampaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const dismissed = useRef(false);

  useEffect(() => {
    let active = true;
    const loadCampaign = async () => {
      // A splash is a launch-only experience. Navigation back to this route must
      // never make it appear again, including for anonymous players.
      if (sessionStorage.getItem("joeyoke_campaign_splash_seen")) {
        onVisibilityChange(false);
        setIsLoading(false);
        return;
      }
      sessionStorage.setItem("joeyoke_campaign_splash_seen", "1");
      const { data } = await supabase.from("splash_campaigns").select("id, title, message, image_url, action_label, action_url, display_seconds, show_every_launch").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!active) return;
      setIsLoading(false);
      if (!data) { onVisibilityChange(false); return; }
      setCampaign(data as SplashCampaign);
      setRemaining(Math.max(0, Number(data.display_seconds) || 0));
      onVisibilityChange(true);
    };
    void loadCampaign();
    return () => { active = false; };
  }, [onVisibilityChange]);

  useEffect(() => {
    if (!campaign || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [campaign, remaining]);

  useEffect(() => {
    if (!campaign || remaining > 0 || dismissed.current) return;
    dismissed.current = true;
    setCampaign(null);
    onVisibilityChange(false);
  }, [campaign, remaining, onVisibilityChange]);

  const dismiss = () => {
    if (!campaign || dismissed.current) return;
    dismissed.current = true;
    setCampaign(null);
    onVisibilityChange(false);
  };
  const canSkip = remaining === 0;
  const progress = useMemo(() => !campaign || campaign.display_seconds <= 0 ? 100 : Math.min(100, ((campaign.display_seconds - remaining) / campaign.display_seconds) * 100), [campaign, remaining]);
  // Do not hold the app behind a network request when there is no campaign.
  if (!campaign) return null;

  return (
    <div className="fixed inset-0 z-[500] min-h-[100dvh] overflow-hidden bg-[#070b13]" role="dialog" aria-modal="true" aria-label={campaign.title}>
      {campaign.image_url && <img src={campaign.image_url} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,8,14,0.26)_0%,rgba(4,8,14,0.34)_38%,rgba(4,8,14,0.94)_100%)]" />
      <div
        className="relative flex h-[100dvh] min-h-[100dvh] w-full flex-col px-6"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex h-12 shrink-0 justify-end">
          <button type="button" onClick={dismiss} className="rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs font-bold text-white/80 backdrop-blur-md">
            {canSkip ? "Skip" : `Skip ${remaining}s`}
          </button>
        </div>

        <main className="flex flex-1 flex-col items-center justify-center pb-4 text-center">
          {!campaign.image_url && (
            <div className="mb-8 flex h-28 w-28 items-center justify-center rounded-[28px] border border-white/10 bg-surface/80 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
              <span className="material-symbols-outlined text-5xl text-primary">auto_awesome</span>
            </div>
          )}
          <span className="rounded-full bg-primary-container px-3 py-1 font-caps text-[10px] font-black uppercase tracking-[0.18em] text-primary-fg">Live update</span>
          <h2 className="mt-5 font-headline text-3xl font-black tracking-tight text-on-surface">{campaign.title}</h2>
          {campaign.message && <p className="mt-3 max-w-sm text-base leading-7 text-on-surface-variant">{campaign.message}</p>}
        </main>

        <footer className="w-full shrink-0">
          <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-primary transition-all duration-1000" style={{ width: progress + "%" }} /></div>
          {campaign.action_url && campaign.action_label ? (
            <button type="button" onClick={() => { const actionUrl = campaign.action_url || ""; dismiss(); onAction(actionUrl); }} className="w-full rounded-2xl bg-primary px-5 py-4 font-headline text-base font-black text-on-primary shadow-[0_10px_32px_rgba(204,255,0,0.20)] transition active:scale-[0.98]">
              {campaign.action_label}
            </button>
          ) : (
            <button type="button" onClick={dismiss} className="w-full rounded-2xl border border-surface-container-highest bg-surface/70 px-5 py-4 font-headline text-base font-black text-on-surface transition active:scale-[0.98]">Continue</button>
          )}
        </footer>
      </div>
    </div>
  );
}
