"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

import GamesTab from "../components/GamesTab";
import LeaderboardTab from "../components/LeaderboardTab";
import ChatTab from "../components/ChatTab";
import ShopTab from "../components/ShopTab";
import ProfileTab from "../components/ProfileTab";
import GlobalInviteListener from "../components/GlobalInviteListener";

import GamePlayer from "../components/GamePlayer";
import GlitchDeck from "../components/games/GlitchDeck";
import Checkers from "../components/games/Checkers";
import AuthView from "../components/AuthView"; // 🛡️ Identity validation portal

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [activeTab, setActiveTab] = useState("Games");
  
  // 🎮 Core Engine States
  const [playingGame, setPlayingGame] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null); // 👈 Tracks incoming multiplayer room IDs

  // 📡 Watch and synchronize authentication states globally
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
        <span className="text-xs font-black text-primary uppercase tracking-widest animate-pulse">Syncing Session Matrix...</span>
      </div>
    );
  }

  return (
    <>
      {/* 🚀 INVISIBLE MULTIPLAYER INVITE LISTENER */}
      {session && (
        <GlobalInviteListener 
          onAccept={(gameUrl, matchId) => {
            setActiveMatchId(matchId);
            setPlayingGame(gameUrl);
          }} 
        />
      )}

      {/* 🚀 NATIVE RUNTIME FRAME INTERCEPTOR */}
      {playingGame === "native://glitch-deck" ? (
        <GlitchDeck onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://checkers" ? (
        <Checkers 
          onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} 
          preloadedMatchId={activeMatchId} // 👈 Passes the incoming invite ID directly to the engine
        />
      ) : playingGame ? (
        <GamePlayer gameUrl={playingGame} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : null}

      {/* Primary Workspace Viewport Container */}
      <div className={playingGame ? "hidden" : "block"}>
        <header className="fixed top-0 left-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4 h-20 pt-safe">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-primary/30 bg-surface">
              <Image 
                src="/joeyoke-logo.png" 
                alt="Joe Yoke Logo" 
                fill 
                className="object-cover p-1" 
                unoptimized 
              />
            </div>
            <span className="text-2xl font-extrabold tracking-tighter text-primary">JOE YOKE</span>
          </div>
        </header>

        <main className="pt-28 px-4 max-w-2xl mx-auto pb-28">
          {/* 🔐 Guard Layer: Intercept unauthorized users attempting to access secure sub-modules */}
          {!session && (activeTab === "Chat" || activeTab === "Shop" || activeTab === "Profile") ? (
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
              {activeTab === "Ranks" && <LeaderboardTab />}
              
              {/* 💬 Chat Tab now receives the teleport hook to launch games from DMs */}
              {activeTab === "Chat" && (
                <ChatTab onPlay={(url, matchId) => {
                  setActiveMatchId(matchId);
                  setPlayingGame(url);
                }} />
              )}
              
              {activeTab === "Shop" && <ShopTab />}
              {activeTab === "Profile" && <ProfileTab />}
            </>
          )}
        </main>

        {/* 🗺️ Professional 5-Tab Navigation System */}
        <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-between items-center h-20 pb-safe px-6 bg-surface/90 backdrop-blur-xl border-t border-white/10">
          {["Games", "Ranks", "Chat", "Shop", "Profile"].map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex flex-col items-center justify-center transition-all w-14 active:scale-90 ${
                  isActive ? "text-primary scale-105 font-bold" : "text-on-surface-variant opacity-70 hover:opacity-100"
                }`}
              >
                <span 
                  className="material-symbols-outlined text-[26px] transition-transform" 
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {tab === "Games" ? "sports_esports" 
                    : tab === "Ranks" ? "leaderboard" 
                    : tab === "Chat" ? "forum" 
                    : tab === "Shop" ? "storefront" 
                    : "person"}
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider mt-1">{tab}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}