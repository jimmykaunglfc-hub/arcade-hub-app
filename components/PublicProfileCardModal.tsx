"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

type PublicCard = { username: string; avatar_url: string | null; card_background_url: string | null; avatar_frame_url: string | null };

export default function PublicProfileCardModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [card, setCard] = useState<PublicCard | null>(null);
  useEffect(() => { void supabase.rpc("get_public_profile_card", { target_user_id: userId }).single().then(({ data }) => setCard((data as PublicCard | null) || null)); }, [userId]);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-white/20 bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="relative min-h-[280px] p-6 text-center text-white" style={{ backgroundImage: card?.card_background_url ? `linear-gradient(rgb(15 23 42 / .5), rgb(15 23 42 / .7)), url(${card.card_background_url})` : "linear-gradient(135deg,#13213c,#0b1020)", backgroundSize: "cover", backgroundPosition: "center" }}>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-black/30 p-2"><span className="material-symbols-outlined">close</span></button>
        <div className="relative mx-auto mt-5 h-24 w-24">
          <Image src={card?.avatar_url || "/logo-dark.jpeg"} alt="" fill className="rounded-full object-cover" unoptimized />
          {card?.avatar_frame_url && <Image src={card.avatar_frame_url} alt="" fill className="pointer-events-none scale-[1.2] object-contain" unoptimized />}
        </div>
        <h2 className="mt-5 font-headline text-2xl font-black">{card?.username || "Loading…"}</h2>
        <p className="mt-2 text-xs font-bold uppercase tracking-widest text-white/75">Player profile</p>
      </div>
      <p className="p-4 text-center text-xs text-on-surface-variant">This public view only shows the player’s equipped profile cosmetics.</p>
    </div>
  </div>;
}
