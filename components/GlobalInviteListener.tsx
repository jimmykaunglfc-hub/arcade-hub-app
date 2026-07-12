"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

interface InvitePayload {
  id: string;
  match_id: string;
  game_name: string;
  sender_username: string;
  sender_avatar: string;
}

export default function GlobalInviteListener({ onAccept }: { onAccept: (gameUrl: string, matchId: string) => void }) {
  const [incomingInvite, setIncomingInvite] = useState<InvitePayload | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // 1. Identify the current player
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id || null));
  }, []);

  // 2. Open the real-time WebSocket connection
  useEffect(() => {
    if (!myUserId) return;

    const channel = supabase.channel(`invites_for_${myUserId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'game_invites', 
        filter: `receiver_id=eq.${myUserId}` 
      }, async (payload) => {
        
        // Fetch the sender's profile information so we know who is challenging us!
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', payload.new.sender_id)
          .single();

        setIncomingInvite({
          id: payload.new.id,
          match_id: payload.new.match_id,
          game_name: payload.new.game_name,
          sender_username: profile?.username || "A Player",
          sender_avatar: profile?.avatar_url || "https://api.dicebear.com/7.x/bottts/svg?seed=fallback"
        });
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myUserId]);

  const handleAction = async (status: 'accepted' | 'declined') => {
    if (!incomingInvite) return;
    
    // Update the database so the sender knows our response
    await supabase.from('game_invites').update({ status }).eq('id', incomingInvite.id);
    
    if (status === 'accepted') {
      // Tell the main app router to launch the game and pass the match ID
      const gameUrl = incomingInvite.game_name === 'Neon Checkers' ? 'native://checkers' : 'native://glitch-deck';
      onAccept(gameUrl, incomingInvite.match_id);
    }
    
    setIncomingInvite(null); // Dismiss the toast
  };

  if (!incomingInvite) return null;

  // 3. The Glowing Notification UI
  return (
    <div className="fixed top-safe left-0 w-full z-[9999] px-4 pt-4 animate-fade-in">
      <div className="max-w-md mx-auto bg-gradient-to-r from-surface-variant/90 to-surface/90 backdrop-blur-xl border border-primary/40 rounded-[24px] p-4 shadow-[0_10px_40px_rgba(192,193,255,0.2)] flex flex-col gap-4">
        
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-black/40 border-2 border-primary overflow-hidden relative shadow-[0_0_15px_rgba(192,193,255,0.5)]">
            <Image src={incomingInvite.sender_avatar} alt="Sender" fill className="object-cover p-1" unoptimized />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
              Incoming Challenge
            </span>
            <h3 className="text-white font-black text-sm leading-tight mt-0.5">
              {incomingInvite.sender_username} invited you to play {incomingInvite.game_name}!
            </h3>
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={() => handleAction('declined')}
            className="flex-1 h-10 rounded-xl bg-surface-variant text-on-surface-variant font-black text-xs uppercase tracking-wider active:scale-95 transition-transform"
          >
            Decline
          </button>
          <button 
            onClick={() => handleAction('accepted')}
            className="flex-1 h-10 rounded-xl bg-primary text-on-primary font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(192,193,255,0.4)] active:scale-95 transition-transform"
          >
            Accept Match
          </button>
        </div>

      </div>
    </div>
  );
}