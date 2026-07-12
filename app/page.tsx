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
import AuthView from "../components/AuthView";

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [activeTab, setActiveTab] = useState("Games");
  
  // 🎮 Core Game Routing State Matrix
  const [playingGame, setPlayingGame] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  // 🌓 THEME HUB CORE STATE
  const [isDarkMode, setIsDarkMode] = useState(true);

  // 📡 Initial configuration lifecycle hook
  useEffect(() => {
    // 1. Synchronize system or cached visual theme parameters
    const cachedTheme = localStorage.getItem("app_theme");
    if (cachedTheme === "light") {
      setIsDarkMode(false);
      document.documentElement.classList.remove("dark");
    } else {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    }

    // 2. Synchronize current authentication state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setCheckingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 🌓 Premium Minimalist Toggle Engine
  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("app_theme", "light");
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("app_theme", "dark");
      setIsDarkMode(true);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center transition-colors">
        <span className="text-xs font-bold text-neutral-400 dark:text-neutral-600 uppercase tracking-widest animate-pulse">
          Syncing Session Matrix...
        </span>
      </div>
    );
  }

  return (
    <>
      {/* 🚀 BACKGROUND REALTIME INVITE ROUTER */}
      {session && (
        <GlobalInviteListener 
          onAccept={(gameUrl, matchId) => {
            setActiveMatchId(matchId);
            setPlayingGame(gameUrl);
          }} 
        />
      )}

      {/* 🚀 NATIVE RUNTIME LOBBY FRAME INTERCEPTOR */}
      {playingGame === "native://glitch-deck" ? (
        <GlitchDeck onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://checkers" ? (
        <Checkers 
          onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} 
          preloadedMatchId={activeMatchId} 
        />
      ) : playingGame ? (
        <GamePlayer gameUrl={playingGame} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : null}

      {/* Primary Minimal Workspace Viewport */}
      <div className={playingGame ? "hidden" : "block min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors"}>
        
        {/* 💳 STICKY ULTRA-PREMIUM NAVIGATION BANNER */}
        <header className="fixed top-0 left-0 w-full z-50 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-900 flex items-center justify-between px-6 h-20 pt-safe transition-colors">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center transition-colors">
              <Image 
                src="/joeyoke-logo.png" 
                alt="Joe Yoke Logo" 
                fill 
                className="object-cover p-1.5" 
                unoptimized 
              />
            </div>
            <span className="text-base font-black tracking-tight text-neutral-900 dark:text-white uppercase">
              JOE YOKE
            </span>
          </div>
        </header>

        {/* 📱 CENTRAL STRUCTURAL WORKSPACE CONTAINER */}
        <main className="pt-28 px-4 max-w-xl mx-auto pb-28">
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
              
              {/* 💬 Chat updates dynamically from in-feed room challenges */}
              {activeTab === "Chat" && (
                <ChatTab onPlay={(url, matchId) => {
                  setActiveMatchId(matchId);
                  setPlayingGame(url);
                }} />
              )}
              
              {activeTab === "Shop" && <ShopTab />}
              
              {activeTab === "Profile" && (
                <ProfileTab 
                  isDarkMode={isDarkMode}
                  onToggleTheme={toggleTheme}
                />
              )}
            </>
          )}
        </main>

        {/* 🗺️ MINIMALIST CORE CONTROL DECK NAVIGATION */}
        <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-between items-center h-20 pb-safe px-6 bg-white/90 dark:bg-neutral-950/90 backdrop-blur-xl border-t border-neutral-200 dark:border-neutral-900 transition-colors">
          {["Games", "Ranks", "Chat", "Shop", "Profile"].map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex flex-col items-center justify-center transition-all w-14 active:scale-95 ${
                  isActive 
                    ? "text-indigo-600 dark:text-indigo-400 font-bold" 
                    : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
                }`}
              >
                <span 
                  className="material-symbols-outlined text-[24px] transition-transform" 
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {tab === "Games" ? "sports_esports" 
                    : tab === "Ranks" ? "leaderboard" 
                    : tab === "Chat" ? "forum" 
                    : tab === "Shop" ? "storefront" 
                    : "person"}
                </span>
                <span className="text-[9px] font-bold tracking-tight mt-1">{tab}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}