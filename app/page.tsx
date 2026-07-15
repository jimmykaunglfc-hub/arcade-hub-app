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
      <div className="fixed inset-0 bg-background flex items-center justify-center transition-colors">
        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest animate-pulse">
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

      {/* 📱 NATIVE APP WRAPPER */}
      <div className={playingGame ? "hidden" : "flex flex-col bg-background text-on-background min-h-screen font-body overflow-x-hidden"}>
        
        {/* TOP HEADER OVERHAUL */}
        <header className="fixed top-0 w-full z-50 bg-surface/60 backdrop-blur-xl border-b border-white/10 flex justify-between items-center px-container-padding h-[80px] pt-safe-area-top shadow-md">
          
          {/* Left Side: Clean Profile Avatar Action Circle */}
          <div 
            className="relative w-10 h-10 rounded-full border border-white/20 flex-shrink-0 cursor-pointer"
            onClick={() => setActiveTab("Profile")}
          >
             <div className="w-full h-full bg-surface-container-high rounded-full flex items-center justify-center text-on-surface-variant overflow-hidden">
               <span className="material-symbols-outlined text-xl">person</span>
             </div>
             <div className="absolute -bottom-1 -right-1 bg-surface-tint text-on-primary-container font-stat-pill text-[9px] font-bold px-1.5 py-0.5 rounded-sm border border-surface">
               1
             </div>
          </div>

          {/* Absolute Center: 3D App Logo Inline With Game Title */}
          <div className="flex items-center justify-center gap-2">
            <div className="relative w-7 h-7 overflow-hidden rounded-md">
              <Image 
                src="/joeyoke-logo.png" 
                alt="Joe Yoke Logo" 
                fill
                className="object-contain"
                unoptimized
              />
            </div>
            <span className="font-headline text-base font-extrabold tracking-widest text-primary uppercase pt-0.5">
              Joe Yoke
            </span>
          </div>

          {/* Trailing Right Side: Notifications */}
          <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors scale-95 active:duration-150 text-on-surface-variant flex-shrink-0">
            <span className="material-symbols-outlined">notifications</span>
          </button>
        </header>

        {/* Dynamic App Content Portal */}
        <main className="pt-[100px] pb-[120px] px-4 md:px-8 space-y-section-margin max-w-xl mx-auto w-full">
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

        {/* FIXED BOTTOM NAV BAR (Frosted Glassmorphism) */}
        <nav className="fixed bottom-0 w-full z-50 glass-panel bg-surface/80 border-t border-white/10 px-6 pb-safe pt-2 flex justify-between items-center h-[85px]">
          {["Games", "Ranks", "Chat", "Shop", "Profile"].map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex flex-col items-center justify-center w-14 transition-all duration-300 active:scale-95 ${
                  isActive 
                    ? "text-primary-container" 
                    : "text-on-surface-variant hover:text-white"
                }`}
              >
                <div className={`flex items-center justify-center w-12 h-10 rounded-full transition-all duration-300 ${isActive ? "bg-primary-container/10" : "bg-transparent"}`}>
                  <span 
                    className="material-symbols-outlined text-[26px]" 
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