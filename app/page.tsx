"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

// 👇 NEW: Import your ranking utilities
import { getRankTier, calculateKDA, getHoursPlayed } from "../lib/rankingUtils";

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
  
  const [activeTab, setActiveTab] = useState("Home"); 
  
  const [userPoints, setUserPoints] = useState<number>(0);
  const [userGems, setUserGems] = useState<number>(45);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  
  // State to hold the user's calculated rank and stats
  const [rankData, setRankData] = useState<any>(null);

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
        setRankData(null); // Clear rank data on logout
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
          // Re-fetch everything if profile updates (like after a game) to keep UI perfectly in sync
          fetchLiveBalance(myUserId);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(profileChannel); };
  }, [myUserId]);

  const fetchLiveBalance = async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select(`
        points, 
        last_login_claim, 
        mmr, 
        total_wins, 
        total_matches, 
        total_kills, 
        total_deaths, 
        total_assists, 
        total_playtime_seconds
      `)
      .eq("id", uid)
      .maybeSingle();

    if (data) {
      setUserPoints(data.points ?? 0);
      
      if (data.last_login_claim) {
        const lastClaim = new Date(data.last_login_claim).toDateString();
        const today = new Date().toDateString();
        setRewardClaimed(lastClaim === today);
      }

      // Calculate the derived stats
      const matches = data.total_matches ?? 0;
      const wins = data.total_wins ?? 0;
      const winRate = matches > 0 ? ((wins / matches) * 100).toFixed(1) : 0;

      // 👇 NEW: Placement Matches Logic
      const PLACEMENTS_NEEDED = 5;
      const isPlacing = matches < PLACEMENTS_NEEDED;

      setRankData({
        // If they haven't played 5 games, hide their rank. Otherwise, show their true tier!
        tier: isPlacing ? "Unranked" : getRankTier(data.mmr ?? 1000),
        percentile: null, // Placeholder: Can be hooked up to an advanced RPC later
        winRate: Number(winRate),
        kda: calculateKDA(data.total_kills ?? 0, data.total_deaths ?? 0, data.total_assists ?? 0),
        hoursPlayed: getHoursPlayed(data.total_playtime_seconds ?? 0)
      });
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
        
        {/* HEADER */}
        <header 
          className="fixed top-0 left-0 right-0 z-50 bg-background flex justify-between items-center px-5 h-[90px] transition-colors duration-300"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-[42px] h-[42px] rounded-full bg-primary text-on-primary flex items-center justify-center font-headline font-black text-sm shadow-sm">
              JY
            </div>
            
            <div className="flex flex-col">
              <h1 className="font-headline text-lg font-bold text-on-background leading-tight">Joe Yoke</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-center gap-1 bg-primary-container px-2.5 py-0.5 rounded-full">
                  <span className="material-symbols-outlined text-primary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                  <span className="text-on-background text-[11px] font-extrabold">{userPoints.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 bg-secondary-container px-2.5 py-0.5 rounded-full">
                  <span className="material-symbols-outlined text-secondary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>
                  <span className="text-on-background text-[11px] font-extrabold">{userGems}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button 
              onClick={toggleTheme}
              className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-on-surface hover:opacity-80 transition-opacity border border-surface-container-highest shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">{isDarkMode ? "light_mode" : "dark_mode"}</span>
            </button>
            <button className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-on-surface hover:opacity-80 transition-opacity border border-surface-container-highest shadow-sm">
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
                  onNavigate={(tab) => {
                    if (tab === "explore") setActiveTab("Explore");
                    if (tab === "store") setActiveTab("Store");
                  }}
                  rankData={rankData}
                />
              )}

              {activeTab === "Explore" && (
                <GamesTab 
                  rewardClaimed={rewardClaimed} 
                  setRewardClaimed={(status) => setRewardClaimed(status)}
                  currentPoints={userPoints}
                  userId={myUserId}
                  onPlay={(url) => setPlayingGame(url)} 
                />
              )}
              
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
              
              {activeTab === "Store" && <ShopTab userId={myUserId} />}
              
              {activeTab === "Profile" && (
                <ProfileTab isDarkMode={isDarkMode} onToggleTheme={toggleTheme} />
              )}
            </>
          )}
        </main>

        {/* BOTTOM NAVIGATION */}
        <nav className="fixed bottom-0 left-0 w-full z-50 bg-surface border-t border-surface-container-highest px-2 pb-safe pt-1 flex justify-around items-center h-[76px] transition-colors duration-300">
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
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[32px] h-[3px] bg-primary rounded-b-md"></div>
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