"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

import GamesTab from "../components/GamesTab";
import ChatTab from "../components/ChatTab";
import ProfileTab from "../components/ProfileTab";
import GamePlayer from "../components/GamePlayer";
import GlitchDeck from "../components/games/GlitchDeck";
import AuthView from "../components/AuthView"; // 🛡️ Imported new auth gateway view

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [activeTab, setActiveTab] = useState("Games");
  const [playingGame, setPlayingGame] = useState<string | null>(null);

  // 📡 Watch current authentication sessions instantly on framework mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setCheckingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="text-xs font-black text-primary uppercase tracking-widest animate-pulse">Syncing Cryptographic Session...</span>
      </div>
    );
  }

  return (
    <>
      {playingGame === "native://glitch-deck" ? (
        <GlitchDeck onClose={() => setPlayingGame(null)} />
      ) : playingGame ? (
        <GamePlayer gameUrl={playingGame} onClose={() => setPlayingGame(null)} />
      ) : null}

      <div className={playingGame ? "hidden" : "block"}>
        <header className="fixed top-0 left-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4 h-20 pt-safe">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-primary/30 bg-surface">
              <Image src="/joeyoke-logo.png" alt="Joe Yoke Logo" fill className="object-cover p-1" unoptimized />
            </div>
            <span className="text-2xl font-extrabold tracking-tighter text-primary">JOE YOKE</span>
          </div>
        </header>

        <main className="pt-28 px-4 max-w-2xl mx-auto pb-28">
          {/* 🔐 If user tries to open Chat or Profile without an account, intercept and present Auth View */}
          {!session && (activeTab === "Chat" || activeTab === "Profile") ? (
            <AuthView onAuthSuccess={() => setActiveTab(activeTab)} />
          ) : (
            <>
              {activeTab === "Games" && (
                <GamesTab 
                  rewardClaimed={rewardClaimed} 
                  setRewardClaimed={setRewardClaimed}
                  onPlay={(url) => setPlayingGame(url)} 
                />
              )}
              {activeTab === "Chat" && <ChatTab />}
              {activeTab === "Profile" && <ProfileTab />}
            </>
          )}
        </main>

        <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 pb-safe px-4 bg-surface/90 backdrop-blur-xl border-t border-white/10">
          {["Games", "Chat", "Profile"].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center justify-center transition-all active:scale-90 ${activeTab === tab ? "text-primary" : "text-on-surface-variant"}`}
            >
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: activeTab === tab ? "'FILL' 1" : "'FILL' 0" }}>
                {tab === "Games" ? "sports_esports" : tab === "Chat" ? "forum" : "person"}
              </span>
              <span className="text-[10px] font-bold mt-1">{tab}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}