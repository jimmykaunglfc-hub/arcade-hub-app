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
import Carrom from "../components/games/Carrom";
import NexusBreach from "../components/games/NexusBreach"; 
import LiarsDice from "../components/games/LiarsDice"; 
import NeuralDuel from "../components/games/NeuralDuel"; 
import BiometricOverride from "../components/games/BiometricOverride"; 
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
      setSession(subscription ? session : null);
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
      <div className="fixed inset-0 bg-[#eef2f6] dark:bg-background flex items-center justify-center transition-colors">
        <span className="text-xs font-bold text-neutral-500 dark:text-on-surface-variant uppercase tracking-widest animate-pulse">
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
      ) : playingGame === "native://nexus-breach" ? (
        <NexusBreach 
          onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} 
        />
      ) : playingGame === "native://liars-dice" ? (
        <LiarsDice 
          onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} 
        />
      ) : playingGame === "native://neural-duel" ? (
        <NeuralDuel 
          onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} 
        />
      ) : playingGame === "native://biometric-override" ? (
        <BiometricOverride 
          onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} 
        />
      ) : playingGame ? (
        <GamePlayer gameUrl={playingGame} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : null}

      {/* 📱 STABILIZED APP SHELL */}
      <div className={playingGame ? "hidden" : "fixed inset-0 flex flex-col bg-[#eef2f6] dark:bg-background text-[#091428] dark:text-on-background font-body overflow-hidden animate-fade-in transition-colors duration-300"}>
        
        {/* PREMIUM COMPACT HEADER BLOCK */}
        <header className="fixed top-0 w-full z-50 bg-white/70 dark:bg-surface/60 backdrop-blur-xl border-b border-neutral-200/60 dark:border-white/10 flex justify-between items-end px-4 h-[68px] pb-2.5 shadow-sm transition-colors duration-300">
          
          {/* Top Left: Rounded Brand Identity Layout */}
          <div className="flex items-center gap-2">
             <div className="relative w-7 h-7 rounded-full bg-white dark:bg-surface-container-high border border-neutral-200 dark:border-white/10 overflow-hidden flex items-center justify-center shadow-sm">
               <Image 
                 src="/joeyoke-logo.png" 
                 alt="Joe Yoke Logo" 
                 fill
                 className="object-contain p-1"
                 unoptimized
               />
             </div>
             <span className="font-headline text-xs font-black tracking-widest text-[#091428] dark:text-primary uppercase">
               Joe Yoke
             </span>
          </div>

          {/* Top Right: Wallet Points Tray & Notification Bell */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border border-neutral-200 dark:border-white/5 bg-white/90 dark:bg-white/5 text-[#091428] dark:text-primary shadow-sm">
              <span className="material-symbols-outlined text-amber-500 dark:text-secondary text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>monetization_on</span>
              <span className="tracking-wide">1,500</span>
            </div>
            
            <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-neutral-200/50 dark:hover:bg-white/5 transition-colors text-neutral-400 dark:text-on-surface-variant">
              <span className="material-symbols-outlined text-lg">notifications</span>
            </button>
          </div>
        </header>

        {/* COMPACT VIEWPORT CONTAINER PORTAL */}
        <main className="flex-1 overflow-y-auto no-scrollbar pt-[80px] pb-[96px] px-4 md:px-6 space-y-4 max-w-xl mx-auto w-full z-10">
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

        {/* FROSTED BOTTOM NAVIGATION SHIELD */}
        <nav className="shrink-0 fixed bottom-0 left-0 w-full z-50 bg-white/80 dark:bg-surface/85 backdrop-blur-xl border-t border-neutral-200 dark:border-white/10 px-6 pb-safe pt-1.5 flex justify-between items-center h-[82px] shadow-lg transition-colors duration-300">
          {["Games", "Ranks", "Chat", "Shop", "Profile"].map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex flex-col items-center justify-center w-14 transition-all duration-300 active:scale-95 ${
                  isActive 
                    ? "text-indigo-600 dark:text-primary-container font-extrabold" 
                    : "text-neutral-400 dark:text-on-surface-variant hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <div className={`flex items-center justify-center w-12 h-9 rounded-full transition-all duration-300 ${isActive ? "bg-indigo-50 dark:bg-primary-container/10" : "bg-transparent"}`}>
                  <span 
                    className="material-symbols-outlined text-[24px]" 
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {tab === "Games" ? "sports_esports" 
                      : tab === "Ranks" ? "leaderboard" 
                      : tab === "Chat" ? "forum" 
                      : tab === "Shop" ? "storefront" 
                      : "person"}
                  </span>
                </div>
                <span className={`font-caps text-[9px] font-bold tracking-widest mt-1 transition-all duration-300 ${isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 h-0 overflow-hidden"}`}>
                  {tab}
                </span>
              </button>
            );
          })}
        </nav>

      </div>
    </>
  );
}