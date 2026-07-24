"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

import HomeTab from "../components/HomeTab"; 
import GamesTab from "../components/GamesTab";
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
import ChessGame from "../components/games/ChessGame"; 
import SnookerGame from "../components/games/SnookerGame";
import AuthView from "../components/AuthView";

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  
  // Set "Home" as the default active tab. Updated names to match mockups.
  const [activeTab, setActiveTab] = useState("Home"); 
  
  // Real-Time Point Engine States
  const [userPoints, setUserPoints] = useState<number>(0);
  const [userGems, setUserGems] = useState<number>(45); // Placeholder for Gems based on mockup
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [playingGame, setPlayingGame] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    // Check local storage for theme preference
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
      if (session?.user) {
        setMyUserId(session.user.id);
        fetchLiveBalance(session.user.id);
      }
      setCheckingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(subscription ? session : null);
      if (session?.user) {
        setMyUserId(session.user.id);
        fetchLiveBalance(session.user.id);
      } else {
        setMyUserId(null);
        setUserPoints(0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!myUserId) return;

    const profileChannel = supabase.channel(`live_wallet_${myUserId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${myUserId}` },
        (payload: any) => {
          if (payload.new && typeof payload.new.points === "number") {
            setUserPoints(payload.new.points);
            
            if (payload.new.last_login_claim) {
              const lastClaim = new Date(payload.new.last_login_claim).toDateString();
              const today = new Date().toDateString();
              setRewardClaimed(lastClaim === today);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(profileChannel); };
  }, [myUserId]);

  const fetchLiveBalance = async (uid: string) => {
    const { data } = await supabase.from("profiles").select("points, last_login_claim").eq("id", uid).maybeSingle();
    if (data) {
      setUserPoints(data.points ?? 0);
      if (data.last_login_claim) {
        const lastClaim = new Date(data.last_login_claim).toDateString();
        const today = new Date().toDateString();
        setRewardClaimed(lastClaim === today);
      }
    }
  };

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
      <div className="fixed inset-0 bg-background flex items-center justify-center transition-colors duration-300">
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
      ) : playingGame === "native://chess" ? (
        <ChessGame onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} preloadedMatchId={activeMatchId} />
      ) : playingGame === "native://checkers" ? (
        <Checkers onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} preloadedMatchId={activeMatchId} />
      ) : playingGame === "native://carrom" ? (
        <Carrom onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} preloadedMatchId={activeMatchId} />
      ) : playingGame === "native://snooker" ? (
        <SnookerGame onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} preloadedMatchId={activeMatchId} />
      ) : playingGame === "native://nexus-breach" ? (
        <NexusBreach onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://liars-dice" ? (
        <LiarsDice onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://neural-duel" ? (
        <NeuralDuel onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://biometric-override" ? (
        <BiometricOverride onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame ? (
        <GamePlayer gameUrl={playingGame} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : null}

      {/* 📱 SOLID APP SHELL */}
      <div className={playingGame ? "hidden" : "fixed inset-0 flex flex-col bg-background text-on-background font-body overflow-hidden transition-colors duration-300"}>
        
        {/* NEW HIGH-CONTRAST HEADER */}
        <header 
          className="fixed top-0 left-0 right-0 z-50 bg-background flex justify-between items-center px-5 h-[90px] transition-colors duration-300"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center gap-3">
            {/* User Avatar Circle */}
            <div className="w-[42px] h-[42px] rounded-full bg-primary text-on-primary flex items-center justify-center font-headline font-black text-sm">
              JY
            </div>
            
            <div className="flex flex-col">
              <h1 className="font-headline text-lg font-bold text-on-background leading-tight">Joe Yoke</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {/* Points Pill (Green) */}
                <div className="flex items-center gap-1 bg-surface px-2 py-0.5 rounded-md shadow-sm border border-surface-container-highest">
                  <span className="material-symbols-outlined text-primary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                  <span className="text-primary text-[11px] font-bold">{userPoints.toLocaleString()}</span>
                </div>
                {/* Gems Pill (Purple) */}
                <div className="flex items-center gap-1 bg-surface px-2 py-0.5 rounded-md shadow-sm border border-surface-container-highest">
                  <span className="material-symbols-outlined text-secondary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>
                  <span className="text-secondary text-[11px] font-bold">{userGems}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button 
              onClick={toggleTheme}
              className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors border border-surface-container-highest shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">{isDarkMode ? "light_mode" : "dark_mode"}</span>
            </button>
            <button className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors border border-surface-container-highest shadow-sm">
              <span className="material-symbols-outlined text-[18px]">notifications</span>
            </button>
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <main 
          className="flex-1 overflow-y-auto no-scrollbar pb-[100px] px-5 w-full z-10"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 100px)' }}
        >
          {!session && (activeTab === "Chats" || activeTab === "Store" || activeTab === "Profile") ? (
            <AuthView onAuthSuccess={() => setActiveTab(activeTab)} />
          ) : (
            <>
              {activeTab === "Home" && (
                <HomeTab 
                  currentPoints={userPoints}
                  userId={myUserId}
                  onPlay={(url) => setPlayingGame(url)} 
                />
              )}

              {/* Mapped "Explore" to GamesTab */}
              {activeTab === "Explore" && (
                <GamesTab 
                  rewardClaimed={rewardClaimed} 
                  setRewardClaimed={(status) => setRewardClaimed(status)}
                  currentPoints={userPoints}
                  userId={myUserId}
                  onPlay={(url) => setPlayingGame(url)} 
                />
              )}
              
              {/* Mapped "Chats" to ChatTab */}
              {activeTab === "Chats" && (
                <ChatTab 
                  currentPoints={userPoints}
                  userId={myUserId}
                  onPlay={(url, matchId) => {
                    setActiveMatchId(matchId);
                    setPlayingGame(url);
                  }} 
                />
              )}
              
              {/* Mapped "Store" to ShopTab */}
              {activeTab === "Store" && <ShopTab userId={myUserId} />}
              
              {activeTab === "Profile" && (
                <ProfileTab isDarkMode={isDarkMode} onToggleTheme={toggleTheme} />
              )}
            </>
          )}
        </main>

        {/* NEW SOLID BOTTOM NAVIGATION */}
        <nav className="fixed bottom-0 left-0 w-full z-50 bg-background border-t border-surface-container-high px-2 pb-safe pt-1 flex justify-around items-center h-[76px] transition-colors duration-300">
          {[
            { id: "Home", icon: "home" },
            { id: "Explore", icon: "explore" }, 
            { id: "Store", icon: "local_mall" },
            { id: "Chats", icon: "chat_bubble" },
            { id: "Profile", icon: "person" }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex flex-col items-center justify-center w-16 h-full transition-all"
              >
                {/* Active Top Line Indicator */}
                {isActive && (
                  <div className="absolute top-[-5px] left-1/2 -translate-x-1/2 w-[30px] h-[3px] bg-primary rounded-b-md"></div>
                )}
                
                <span className={`material-symbols-outlined mt-1 text-[24px] ${isActive ? "text-primary" : "text-on-surface-variant"}`} style={{ fontVariationSettings: isActive ? "'FILL' 0" : "'FILL' 0" }}>
                  {tab.icon}
                </span>
                <span className={`text-[10px] font-bold mt-1 tracking-wide ${isActive ? "text-primary" : "text-on-surface-variant"}`}>
                  {tab.id}
                </span>
              </button>
            );
          })}
        </nav>

      </div>
    </>
  );
}