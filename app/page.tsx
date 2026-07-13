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
import Carrom from "../components/games/Carrom"; // 👈 Added Carrom Import
import AuthView from "../components/AuthView";

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [activeTab, setActiveTab] = useState("Games");
  
  const [playingGame, setPlayingGame] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const cachedTheme = localStorage.getItem("app_theme");
    if (cachedTheme === "light") {
      setIsDarkMode(false);
      document.documentElement.classList.remove("dark");
    } else {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setCheckingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

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
      <div className="fixed inset-0 bg-neutral-100 dark:bg-neutral-950 flex items-center justify-center transition-colors">
        <span className="text-xs font-bold text-neutral-400 dark:text-neutral-600 uppercase tracking-widest animate-pulse">
          Syncing Session Matrix...
        </span>
      </div>
    );
  }

  return (
    <>
      {session && (
        <GlobalInviteListener 
          onAccept={(gameUrl, matchId) => {
            setActiveMatchId(matchId);
            setPlayingGame(gameUrl);
          }} 
        />
      )}

      {/* 🎮 NATIVE ENGINE ROUTER */}
      {playingGame === "native://glitch-deck" ? (
        <GlitchDeck onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://checkers" ? (
        <Checkers 
          onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} 
          preloadedMatchId={activeMatchId} 
        />
      ) : playingGame === "native://carrom" ? (
        <Carrom 
          onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} 
          preloadedMatchId={activeMatchId} 
        />
      ) : playingGame ? (
        <GamePlayer gameUrl={playingGame} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : null}

      {/* 📱 NATIVE APP WRAPPER */}
      <div className={playingGame ? "hidden" : "fixed inset-0 flex flex-col bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors overflow-hidden"}>
        
        <header className="shrink-0 w-full z-40 bg-white/90 dark:bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-900 flex items-center justify-between px-6 h-20 pt-safe transition-colors">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 flex items-center justify-center transition-colors">
              <Image 
                src="/joeyoke-logo.png" 
                alt="Joe Yoke Logo" 
                fill 
                className="object-contain invert dark:invert-0 transition-all duration-300" 
                unoptimized 
              />
            </div>
            <span className="text-lg font-black tracking-tight text-neutral-900 dark:text-white uppercase">
              JOE YOKE
            </span>
          </div>
        </header>

        <main className="flex-1 w-full max-w-xl mx-auto overflow-y-auto no-scrollbar px-4 pt-6 pb-6 relative">
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

        <nav className="shrink-0 w-full z-40 flex justify-between items-center h-20 pb-safe px-6 bg-white/95 dark:bg-neutral-950/95 backdrop-blur-xl border-t border-neutral-200 dark:border-neutral-900 transition-colors">
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