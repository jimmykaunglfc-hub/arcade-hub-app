"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

// 👇 Ranking utilities
import { getHoursPlayed } from "../lib/rankingUtils";

import HomeTab from "../components/HomeTab";
import GamesTab from "../components/GamesTab";
import ChatTab from "../components/ChatTab";
import ShopTab from "../components/ShopTab";
import ProfileTab from "../components/ProfileTab";
import NotificationsCenter from "../components/NotificationsCenter";
import GlobalInviteListener from "../components/GlobalInviteListener";
import GlobalNotificationListener from "../components/GlobalNotificationListener";
import CampaignSplash from "../components/CampaignSplash";
import InAppBroadcastDialog from "../components/InAppBroadcastDialog";
import CompetitiveGameLaunch from "../components/CompetitiveGameLaunch";
import JoeYokeLogo from "../components/JoeYokeLogo";

// Game engines are intentionally loaded only after a player selects a game.
// This keeps Phaser, Matter, chess and their game UIs out of the launch bundle.
const GamePlayer = dynamic(() => import("../components/GamePlayer"), { ssr: false });
const GlitchDeck = dynamic(() => import("../components/games/GlitchDeck"), { ssr: false });
const Checkers = dynamic(() => import("../components/games/Checkers"), { ssr: false });
const Carrom = dynamic(() => import("../components/games/Carrom"), { ssr: false });
const NexusBreach = dynamic(() => import("../components/games/NexusBreach"), { ssr: false });
const LiarsDice = dynamic(() => import("../components/games/LiarsDice"), { ssr: false });
const NeuralDuel = dynamic(() => import("../components/games/NeuralDuel"), { ssr: false });
const BiometricOverride = dynamic(() => import("../components/games/BiometricOverride"), { ssr: false });
const ChessGame = dynamic(() => import("../components/games/ChessGame"), { ssr: false });
const SnookerGame = dynamic(() => import("../components/games/SnookerGame"), { ssr: false });
const TicTacToeGame = dynamic(() => import("../components/games/TicTacToeGame"), { ssr: false });
const UnoGame = dynamic(() => import("../components/games/UnoGame"), { ssr: false });
const CupPong = dynamic(() => import("../components/games/CupPong"), { ssr: false });
const FourInARow = dynamic(() => import("../components/games/FourInARow").then((mod) => mod.FourInARow), { ssr: false });
const Bingo = dynamic(() => import("../components/games/Bingo").then((mod) => mod.BingoGame), { ssr: false });
const PingPong = dynamic(() => import("../components/games/PingPong"), { ssr: false });
import AuthView from "../components/AuthView";
import { useTranslation } from "../lib/i18n";

export default function Home() {
  const { t } = useTranslation();
  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [splashVisible, setSplashVisible] = useState(true);

  const [activeTab, setActiveTab] = useState("Home");

  const [userPoints, setUserPoints] = useState<number>(0);
  const [userGems, setUserGems] = useState<number>(0); // 💎 Initialized to 0 (dynamic)
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [rankData, setRankData] = useState<any>(null);

  const [playingGame, setPlayingGame] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

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
        void supabase.rpc("ensure_my_profile").then(() => fetchLiveBalance(session.user.id));
      }
      setCheckingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(subscription ? session : null);
      if (session?.user) {
        setMyUserId(session.user.id);
        void supabase.rpc("ensure_my_profile").then(() => fetchLiveBalance(session.user.id));
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

    const rankChannel = supabase
      .channel(`live_rank_${myUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_history",
          filter: `user_id=eq.${myUserId}`,
        },
        () => {
          fetchLiveBalance(myUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(rankChannel);
    };
  }, [myUserId]);

  useEffect(() => {
    if (!myUserId) { setUnreadNotificationCount(0); return; }
    const refreshUnreadNotifications = async () => {
      const { count } = await supabase.from("user_notifications").select("id", { count: "exact", head: true }).eq("user_id", myUserId).eq("is_read", false);
      setUnreadNotificationCount(count || 0);
    };
    refreshUnreadNotifications();
    const channel = supabase.channel(`notification-badge-${myUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${myUserId}` }, refreshUnreadNotifications)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myUserId, showNotifications]);

  useEffect(() => {
    if (!myUserId) return;
    const touchPresence = () => { void supabase.rpc("touch_chat_presence"); };
    touchPresence();
    const heartbeat = window.setInterval(touchPresence, 60000);
    return () => window.clearInterval(heartbeat);
  }, [myUserId]);

  const fetchLiveBalance = async (uid: string) => {
    const [{ data }, { data: ranking, error: rankingError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("points, gems")
        .eq("id", uid)
        .maybeSingle(),
      supabase.rpc("get_player_rank_summary"),
    ]);

    if (data) {
      setUserPoints(data.points ?? 0);
      setUserGems(data.gems ?? 0); // 💎 Fetch live gems from DB

      if (rankingError) {
        console.error("Failed to load player ranking:", rankingError.message);
      } else {
        const summary = Array.isArray(ranking) ? ranking[0] : ranking;
        if (summary) {
          setRankData({
            tier: summary.tier,
            percentile: summary.percentile,
            globalRank: summary.global_rank,
            winRate: Number(summary.win_rate ?? 0),
            gamesPlayed: Number(summary.matches ?? 0),
            playtime: getHoursPlayed(Number(summary.playtime_seconds ?? 0)),
            badgeIconUrl: summary.badge_icon_url ?? null,
          });
        }
      }
    }
  };

  const handleDeepLink = (actionUrl: string) => {
    const route = actionUrl.trim();
    if (!route) return;
    if (route.startsWith("native://")) { setPlayingGame(route); return; }
    const tab = route.replace(/^tab:/i, "").toLowerCase();
    const tabs: Record<string, string> = { home: "Home", explore: "Explore", store: "Store", chats: "Chats", chat: "Chats", profile: "Profile" };
    if (tabs[tab]) { setActiveTab(tabs[tab]); setShowNotifications(false); return; }
    if (route.startsWith("/")) window.location.assign(route);
    else if (/^https?:\/\//i.test(route)) window.open(route, "_blank", "noopener,noreferrer");
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
    return <CampaignSplash onAction={handleDeepLink} onVisibilityChange={setSplashVisible} />;
  }

  return (
    <>
      <CampaignSplash onAction={handleDeepLink} onVisibilityChange={setSplashVisible} />
      {session && !splashVisible && <InAppBroadcastDialog points={userPoints} gems={userGems} onAction={handleDeepLink} />}
      {session && !splashVisible && (
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
      ) : playingGame === "native://cup-pong" ? (
        <CompetitiveGameLaunch gameKey="cup-pong" gameTitle="Cup Pong" Game={CupPong} onClose={() => setPlayingGame(null)} />
      ) : playingGame === "native://four-in-a-row" ? (
        <CompetitiveGameLaunch gameKey="four-in-a-row" gameTitle="Four in a Row" Game={FourInARow} onClose={() => setPlayingGame(null)} />
      ) : playingGame === "native://bingo" ? (
        <CompetitiveGameLaunch gameKey="bingo" gameTitle="Bingo" Game={Bingo} onClose={() => setPlayingGame(null)} />
      ) : playingGame === "native://ping-pong" || playingGame === "native://table-tennis" ? (
        <CompetitiveGameLaunch gameKey="ping-pong" gameTitle="Ping Pong" Game={PingPong} onClose={() => setPlayingGame(null)} />
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
            : "fixed inset-0 flex flex-col w-full max-w-full bg-background text-on-background font-body overflow-hidden transition-colors duration-300"
        }
      >
        {/* HEADER */}
        <header
          className="fixed top-0 left-0 right-0 z-50 bg-background flex justify-between items-center px-5 transition-colors duration-300"
          style={{
            height: "calc(90px + env(safe-area-inset-top))",
            paddingTop: "env(safe-area-inset-top)",
          }}
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
              className="relative w-9 h-9 rounded-full bg-surface flex items-center justify-center text-on-surface hover:opacity-80 transition-opacity border border-surface-container-highest shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">
                notifications
              </span>
              {unreadNotificationCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[9px] font-black flex items-center justify-center">{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</span>}
            </button>
          </div>
        </header>

        {/* MAIN CONTENT AREA */}
        <main
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden no-scrollbar px-5 w-full z-10"
          style={{
            paddingTop: "calc(100px + env(safe-area-inset-top))",
            paddingBottom: "calc(100px + env(safe-area-inset-bottom))",
          }}
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
                  onOpenShop={() => setActiveTab("Store")}
                />
              )}
            </>
          )}
        </main>

        {/* BOTTOM NAVIGATION */}
        <nav
          data-bottom-nav
          className="fixed bottom-0 left-0 w-full z-50 bg-surface border-t border-surface-container-highest px-2 pt-1 flex justify-around items-center transition-colors duration-300"
          style={{
            height: "calc(76px + env(safe-area-inset-bottom))",
            paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
          }}
        >
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
