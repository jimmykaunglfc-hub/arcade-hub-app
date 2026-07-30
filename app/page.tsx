"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

// 👇 Ranking utilities
import { getRankTier, getHoursPlayed } from "../lib/rankingUtils";

import HomeTab from "../components/HomeTab";
import GamesTab from "../components/GamesTab";
import ChatTab from "../components/ChatTab";
import ShopTab from "../components/ShopTab";
import ProfileTab from "../components/ProfileTab";
import NotificationsCenter from "../components/NotificationsCenter";
import GlobalInviteListener from "../components/GlobalInviteListener";
import GlobalNotificationListener from "../components/GlobalNotificationListener";
import JoeYokeLogo from "../components/JoeYokeLogo";

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
import TicTacToeGame from "../components/games/TicTacToeGame";
import UnoGame from "../components/games/UnoGame";
import AuthView from "../components/AuthView";
import { useTranslation } from "../lib/i18n";

export default function Home() {
  const { t } = useTranslation();
  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState("Home");

  const [userPoints, setUserPoints] = useState<number>(0);
  const [userGems, setUserGems] = useState<number>(0); // 💎 Initialized to 0 (dynamic)
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [rankData, setRankData] = useState<any>(null);

  const [playingGame, setPlayingGame] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const savedLaunch = sessionStorage.getItem("tournament_match_launch");
    if (!savedLaunch) return;
    sessionStorage.removeItem("tournament_match_launch");
    try {
      const { game, matchId } = JSON.parse(savedLaunch);
      const slug = String(game)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setActiveMatchId(matchId || null);
      setPlayingGame(`native://${slug}`);
    } catch {
      // Ignore a malformed one-time tournament launch request.
    }
  }, []);

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(subscription ? session : null);
      if (session?.user) {
        setMyUserId(session.user.id);
        fetchLiveBalance(session.user.id);
      } else {
        setMyUserId(null);
        setUserPoints(0);
        setUserGems(0);
        setRankData(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!myUserId) return;

    const profileChannel = supabase
      .channel(`live_wallet_${myUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${myUserId}`,
        },
        () => {
          fetchLiveBalance(myUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [myUserId]);

  const fetchLiveBalance = async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select(
        `
        points, 
        gems,
        mmr, 
        total_wins, 
        total_matches, 
        total_kills, 
        total_deaths, 
        total_assists, 
        total_playtime_seconds
      `
      )
      .eq("id", uid)
      .maybeSingle();

    if (data) {
      setUserPoints(data.points ?? 0);
      setUserGems(data.gems ?? 0); // 💎 Fetch live gems from DB

      const matches = data.total_matches ?? 0;
      const wins = data.total_wins ?? 0;
      const winRate = matches > 0 ? ((wins / matches) * 100).toFixed(1) : 0;

      const PLACEMENTS_NEEDED = 5;
      const isPlacing = matches < PLACEMENTS_NEEDED;

      setRankData({
        tier: isPlacing ? "Unranked" : getRankTier(data.mmr ?? 1000),
        percentile: null,
        winRate: Number(winRate),
        gamesPlayed: matches,
        playtime: getHoursPlayed(data.total_playtime_seconds ?? 0),
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
        <>
          <GlobalInviteListener
            onAccept={(gameUrl, matchId) => {
              setActiveMatchId(matchId);
              setPlayingGame(gameUrl);
            }}
          />
          <GlobalNotificationListener userId={session.user.id} />
        </>
      )}

      {/* 🎮 NATIVE ENGINE ROUTER */}
      {playingGame === "native://glitch-deck" ? (
        <GlitchDeck
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
        />
      ) : playingGame === "native://chess" ? (
        <ChessGame
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={activeMatchId}
        />
      ) : playingGame === "native://tictactoe" ||
        playingGame === "native://tic-tac-toe" ? (
        <TicTacToeGame
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={activeMatchId}
        />
      ) : playingGame === "native://uno" ? (
        <UnoGame
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={activeMatchId}
        />
      ) : playingGame === "native://checkers" ? (
        <Checkers
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={activeMatchId}
        />
      ) : playingGame === "native://carrom" ? (
        <Carrom
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={activeMatchId}
        />
      ) : playingGame === "native://snooker" ? (
        <SnookerGame
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={activeMatchId}
        />
      ) : playingGame === "native://nexus-breach" ? (
        <NexusBreach
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
        />
      ) : playingGame === "native://liars-dice" ? (
        <LiarsDice
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
        />
      ) : playingGame === "native://neural-duel" ? (
        <NeuralDuel
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
        />
      ) : playingGame === "native://biometric-override" ? (
        <BiometricOverride
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
        />
      ) : playingGame ? (
        <GamePlayer
          gameUrl={playingGame}
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
        />
      ) : null}

      {/* 📱 SOLID APP SHELL */}
      <div
        className={
          playingGame
            ? "hidden"
            : "fixed inset-0 flex flex-col bg-background text-on-background font-body overflow-hidden transition-colors duration-300"
        }
      >
        {/* HEADER */}
        <header
          className="fixed top-0 left-0 right-0 z-50 bg-background flex justify-between items-center px-5 h-[90px] transition-colors duration-300"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex items-center gap-3">
            <JoeYokeLogo className="w-[42px] h-[42px]" />

            <div className="flex flex-col">
              <h1 className="font-headline text-lg font-bold text-on-background leading-tight">
                Joe Yoke
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-center gap-1 bg-primary-container px-2.5 py-0.5 rounded-full">
                  <span
                    className="material-symbols-outlined text-primary text-[14px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    bolt
                  </span>
                  <span className="text-on-background text-[11px] font-extrabold">
                    {userPoints.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-secondary-container px-2.5 py-0.5 rounded-full">
                  <span
                    className="material-symbols-outlined text-secondary text-[14px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    diamond
                  </span>
                  <span className="text-on-background text-[11px] font-extrabold">
                    {userGems.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-on-surface hover:opacity-80 transition-opacity border border-surface-container-highest shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">
                {isDarkMode ? "light_mode" : "dark_mode"}
              </span>
            </button>
            <button
              onClick={() => setShowNotifications(true)}
              aria-label="Open notifications"
              className="w-9 h-9 rounded-full bg-surface flex items-center justify-center text-on-surface hover:opacity-80 transition-opacity border border-surface-container-highest shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">
                notifications
              </span>
            </button>
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <main
          className="flex-1 overflow-y-auto no-scrollbar pb-[100px] px-5 w-full z-10"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 100px)" }}
        >
          {showNotifications ? (
            <>
              <button
                onClick={() => setShowNotifications(false)}
                className="mb-4 text-xs font-bold text-primary flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">
                  arrow_back
                </span>
                Back
              </button>
              <NotificationsCenter
                userId={myUserId}
                points={userPoints}
                gems={userGems}
              />
            </>
          ) : !session &&
            (activeTab === "Chats" ||
              activeTab === "Store" ||
              activeTab === "Profile") ? (
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
                  onPointsUpdated={() => fetchLiveBalance(myUserId!)}
                />
              )}

              {activeTab === "Explore" && (
                <GamesTab
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
                <ProfileTab
                  isDarkMode={isDarkMode}
                  onToggleTheme={toggleTheme}
                />
              )}
            </>
          )}
        </main>

        {/* BOTTOM NAVIGATION */}
        <nav className="fixed bottom-0 left-0 w-full z-50 bg-surface border-t border-surface-container-highest px-2 pb-safe pt-1 flex justify-around items-center h-[76px] transition-colors duration-300">
          {[
            { id: "Home", label: t("home"), icon: "home" },
            { id: "Explore", label: t("explore"), icon: "explore" },
            { id: "Store", label: t("store"), icon: "local_mall" },
            { id: "Chats", label: t("chats"), icon: "chat_bubble" },
            { id: "Profile", label: t("profile"), icon: "person" },
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
                <span
                  className={`material-symbols-outlined mt-1 text-[24px] ${
                    isActive ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {tab.icon}
                </span>
                <span
                  className={`text-[10px] font-bold mt-1 tracking-wide ${
                    isActive ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
