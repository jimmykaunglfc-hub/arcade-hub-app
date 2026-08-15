"use client";




import { tr } from "../lib/i18n";
import { LocalizedText } from "../lib/i18n";
import { useState, useEffect, useLayoutEffect, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabaseClient";
import { markPerformance } from "../lib/performance";

// 👇 Ranking utilities
import { getHoursPlayed } from "../lib/rankingUtils";

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
const WordBoxGame = dynamic(() => import("../components/games/WordBoxGame"), { ssr: false });
const SudokuGame = dynamic(() => import("../components/games/SudokuGame"), { ssr: false });
const LudoGame = dynamic(() => import("../components/games/LudoGame"), { ssr: false });
const DominoesGame = dynamic(() => import("../components/games/DominoesGame"), { ssr: false });
const Game2048 = dynamic(() => import("../components/games/Game2048"), { ssr: false });
const BigTwoGame = dynamic(() => import("../components/games/BigTwoGame"), { ssr: false });
const ShanKoeMeeGame = dynamic(() => import("../components/games/ShanKoeMeeGame"), { ssr: false });
const BlockPuzzleGame = dynamic(() => import("../components/games/BlockPuzzleGame"), { ssr: false });
const MonopolyGame = dynamic(() => import("../components/games/Monopoly"), { ssr: false });
import { useTranslation } from "../lib/i18n";

const TabLoading = () => <div className="min-h-[260px] animate-pulse rounded-[24px] bg-surface-container/60" aria-label={tr("UI_0026", "Loading")} />;
// P2 startup features: defer their code, native bridge work, and realtime
// subscriptions until the shell has painted. They remain cached after load.
const CampaignSplash = dynamic(() => import("../components/CampaignSplash"), { ssr: false });
const InAppBroadcastDialog = dynamic(() => import("../components/InAppBroadcastDialog"), { ssr: false });
const GlobalInviteListener = dynamic(() => import("../components/GlobalInviteListener"), { ssr: false });
const GlobalNotificationListener = dynamic(() => import("../components/GlobalNotificationListener"), { ssr: false });
const CompetitiveGameLaunch = dynamic(() => import("../components/CompetitiveGameLaunch"), { ssr: false, loading: TabLoading });
const FourPlayerMatchLobby = dynamic(() => import("../components/FourPlayerMatchLobby"), { ssr: false, loading: TabLoading });
const AuthView = dynamic(() => import("../components/AuthView"), { ssr: false, loading: TabLoading });
// Tabs mount only when visited, keeping game, shop, chat, and profile code out
// of the launch bundle. Once visited, Next keeps their downloaded chunks cached.
const HomeTab = dynamic(() => import("../components/HomeTab"), { ssr: false, loading: TabLoading });
const GamesTab = dynamic(() => import("../components/GamesTab"), { ssr: false, loading: TabLoading });
const ChatTab = dynamic(() => import("../components/ChatTab"), { ssr: false, loading: TabLoading });
const ShopTab = dynamic(() => import("../components/ShopTab"), { ssr: false, loading: TabLoading });
const SpinTab = dynamic(() => import("../components/SpinTab"), { ssr: false, loading: TabLoading });
const ProfileTab = dynamic(() => import("../components/ProfileTab"), { ssr: false, loading: TabLoading });
const NotificationsCenter = dynamic(() => import("../components/NotificationsCenter"), { ssr: false, loading: TabLoading });

type ArenaGameProps = {
  onClose?: () => void;
  onResult?: (result: "Win" | "Loss" | "Draw") => void;
  roomId?: string;
  seat?: 1 | 2;
};

// Source handoffs for the new games are local-game engines. This adapter keeps
// their UI isolated while making them enter through the same Joe Yoke arena flow.
const withArenaLobby = (Game: ComponentType<any>) => {
  return function ArenaGame({ onClose, onResult, roomId, seat }: ArenaGameProps) {
    return <Game onClose={onClose} onResult={onResult} roomId={roomId} seat={seat} />;
  };
};

const WordBoxArenaGame = withArenaLobby(WordBoxGame);
const SudokuArenaGame = withArenaLobby(SudokuGame);
const LudoArenaGame = withArenaLobby(LudoGame);
const DominoesArenaGame = withArenaLobby(DominoesGame);
const Game2048ArenaGame = withArenaLobby(Game2048);
const BigTwoArenaGame = withArenaLobby(BigTwoGame);
const BlockPuzzleArenaGame = withArenaLobby(BlockPuzzleGame);

function BigTwoFourPlayerArena({ onClose, preloadedRoomId }: { onClose: () => void; preloadedRoomId?: string | null }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);
  if (!userId) return <div className="fixed inset-0 grid place-items-center bg-[#09090b] text-white"><LocalizedText id="UI_0043" fallback="Sign in to join Big Two matchmaking." /></div>;
  if (!roomId) return <FourPlayerMatchLobby gameKey="big-two" gameName={tr("UI_0156", "Big Two")} userId={userId} preloadedRoomId={preloadedRoomId} onStart={setRoomId} onCancel={onClose} />;
  return <BigTwoGame onClose={onClose} onPlayAgain={() => setRoomId(null)} roomId={roomId} />;
}

function LudoFourPlayerArena({ onClose, preloadedRoomId }: { onClose: () => void; preloadedRoomId?: string | null }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);
  if (!userId) return <div className="fixed inset-0 grid place-items-center bg-[#09090b] text-white"><LocalizedText id="UI_0044" fallback="Sign in to join Ludo matchmaking." /></div>;
  if (!roomId) return <FourPlayerMatchLobby gameKey="ludo" gameName={tr("UI_0157", "Ludo")} userId={userId} preloadedRoomId={preloadedRoomId} onStart={setRoomId} onCancel={onClose} />;
  return <LudoGame onClose={onClose} onPlayAgain={() => setRoomId(null)} roomId={roomId} />;
}

function ShanKoeMeeFourPlayerArena({ onClose, preloadedRoomId }: { onClose: () => void; preloadedRoomId?: string | null }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);
  if (!userId) return <div className="fixed inset-0 grid place-items-center bg-[#09090b] text-white"><LocalizedText id="UI_0024" fallback="Sign in to join Shan Koe Mee matchmaking." /></div>;
  if (!roomId) return <FourPlayerMatchLobby gameKey="shan-koe-mee" gameName={tr("UI_0158", "Shan Koe Mee")} userId={userId} preloadedRoomId={preloadedRoomId} onStart={setRoomId} onCancel={onClose} />;
  return <ShanKoeMeeGame onClose={onClose} onPlayAgain={() => setRoomId(null)} roomId={roomId} />;
}

function MonopolyFourPlayerArena({ onClose, preloadedRoomId }: { onClose: () => void; preloadedRoomId?: string | null }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); }, []);
  useEffect(() => {
    if (!userId || roomId || typeof window === "undefined") return;
    const savedRoomId = window.sessionStorage.getItem("joeyoke_active_monopoly_room");
    if (!savedRoomId) return;
    void supabase.rpc("get_matchmaking_room", { p_room_id: savedRoomId }).then(({ data }) => {
      const isStillAPlayer = Boolean(data?.players?.some((player: { user_id?: string | null }) => player.user_id === userId));
      if (data?.status === "playing" && isStillAPlayer) setRoomId(savedRoomId);
      else window.sessionStorage.removeItem("joeyoke_active_monopoly_room");
    });
  }, [roomId, userId]);
  if (!userId) return <div className="fixed inset-0 grid place-items-center bg-[#09090b] text-white"><LocalizedText id="UI_0025" fallback="Sign in to join Monopoly matchmaking." /></div>;
  if (!roomId) return <FourPlayerMatchLobby gameKey="monopoly" gameName={tr("UI_0155", "Monopoly")} userId={userId} preloadedRoomId={preloadedRoomId} onStart={setRoomId} onCancel={onClose} />;
  return <MonopolyGame userId={userId} roomId={roomId} onClose={onClose} />;
}

export default function Home() {
  const { t } = useTranslation();
  const [session, setSession] = useState<any>(null);
  const [splashVisible, setSplashVisible] = useState(false);
  const [deferredStartupReady, setDeferredStartupReady] = useState(false);

  const [activeTab, setActiveTab] = useState("Home");

  const [userPoints, setUserPoints] = useState<number>(0);
  const [userGems, setUserGems] = useState<number>(0); // 💎 Initialized to 0 (dynamic)
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [rankData, setRankData] = useState<any>(null);

  const [playingGame, setPlayingGameState] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [gameReturn, setGameReturn] = useState<{
    gameUrl: string;
    matchId: string | null;
    expiresAt: number;
  } | null>(null);
  const [gameReturnSeconds, setGameReturnSeconds] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [gameDetailsFullscreen, setGameDetailsFullscreen] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  // Do not unmount a game immediately when a player taps its back/close
  // button. Keeping the mounted game hidden for 30 seconds preserves its
  // in-memory board, physics, and realtime state on H5 and Capacitor builds.
  const setPlayingGame = (nextGame: string | null) => {
    if (nextGame === null && playingGame) {
      const expiresAt = Date.now() + 30_000;
      setGameReturn({ gameUrl: playingGame, matchId: activeMatchId, expiresAt });
      setGameReturnSeconds(30);
      return;
    }
    setGameReturn(null);
    setGameReturnSeconds(0);
    if (nextGame) markPerformance(`game-selected:${nextGame.replace(/^native:\/\//, "")}`);
    setPlayingGameState(nextGame);
  };

  const resumeGame = () => {
    if (!gameReturn) return;
    setActiveMatchId(gameReturn.matchId);
    setGameReturn(null);
    setGameReturnSeconds(0);
  };

  const endSuspendedGame = () => {
    setGameReturn(null);
    setGameReturnSeconds(0);
    setPlayingGameState(null);
    setActiveMatchId(null);
  };

  useEffect(() => {
    if (!gameReturn) return;
    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((gameReturn.expiresAt - Date.now()) / 1000));
      setGameReturnSeconds(seconds);
      if (seconds === 0) endSuspendedGame();
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [gameReturn]);

  const gameMatchId = gameReturn?.matchId ?? activeMatchId;
  const pausedGameName = (gameReturn?.gameUrl ?? "game")
    .replace(/^native:\/\//, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  // Safari also supports the CSS feature used by WKWebView, so CSS alone
  // cannot tell an H5 browser from the native iOS package. Only Capacitor iOS
  // needs the 44px fallback for a transparent, overlaying status bar.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("capacitor-ios", Capacitor.getPlatform() === "ios");
    return () => root.classList.remove("capacitor-ios");
  }, []);

  useEffect(() => {
    const savedLaunch = sessionStorage.getItem("tournament_match_launch");
    if (!savedLaunch) return;
    sessionStorage.removeItem("tournament_match_launch");
    try {
      const { game, matchId, tournamentMatchId } = JSON.parse(savedLaunch);
      const slug = String(game)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setActiveMatchId(matchId || null);
      if (tournamentMatchId) {
        sessionStorage.setItem(
          "joeyoke_active_tournament_match",
          JSON.stringify({ id: tournamentMatchId, game })
        );
      }
      setPlayingGame(`native://${slug}`);
    } catch {
      // Ignore a malformed one-time tournament launch request.
    }
  }, []);

  // Browsers block ambient audio until the first tap. The source is opt-in so
  // development and production never request a missing or unlicensed asset.
  useEffect(() => {
    const source = process.env.NEXT_PUBLIC_APP_BGM_URL;
    if (!source) return;
    const beginAudio = () => {
      void import("../lib/soundManager").then(({ soundEngine }) => {
        soundEngine.restorePreference();
        soundEngine.startBGM(source, 0.22);
      });
      window.removeEventListener("pointerdown", beginAudio);
    };
    window.addEventListener("pointerdown", beginAudio, { once: true });
    return () => window.removeEventListener("pointerdown", beginAudio);
  }, []);

  useEffect(() => {
    markPerformance("shell-mounted");
    const onFirstPaint = window.requestAnimationFrame(() => markPerformance("shell-painted"));
    const idleCallback = window.requestIdleCallback?.(
      () => {
        markPerformance("deferred-startup");
        setDeferredStartupReady(true);
      },
      { timeout: 1200 },
    );
    const fallbackTimer = idleCallback === undefined
      ? window.setTimeout(() => {
        markPerformance("deferred-startup");
        setDeferredStartupReady(true);
      }, 300)
      : undefined;
    return () => {
      window.cancelAnimationFrame(onFirstPaint);
      if (idleCallback !== undefined) window.cancelIdleCallback?.(idleCallback);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    };
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
      markPerformance("session-restored");
      if (session?.user) {
        setMyUserId(session.user.id);
        void supabase.rpc("ensure_my_profile").then(() => fetchLiveBalance(session.user.id));
      }
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
    const restoreFreshApp = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", restoreFreshApp);
    return () => window.removeEventListener("pageshow", restoreFreshApp);
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
    const tabs: Record<string, string> = { home: "Home", explore: "Explore", store: "Store", spin: "Spin", chats: "Chats", chat: "Chats", profile: "Profile" };
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

  return (
    <>
      {deferredStartupReady && <CampaignSplash onAction={handleDeepLink} onVisibilityChange={setSplashVisible} />}
      {deferredStartupReady && session && !splashVisible && <InAppBroadcastDialog points={userPoints} gems={userGems} onAction={handleDeepLink} />}
      {deferredStartupReady && session && !splashVisible && (
        <>
          <GlobalInviteListener
            userId={session.user.id}
            onAccept={(gameUrl, matchId) => {
              setActiveMatchId(matchId);
              setPlayingGame(gameUrl);
            }}
          />
          <GlobalNotificationListener userId={session.user.id} onPushAction={handleDeepLink} />
        </>
      )}

      {/* 🎮 NATIVE ENGINE ROUTER */}
      <div className={gameReturn ? "invisible pointer-events-none" : undefined}>
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
          preloadedMatchId={gameMatchId}
        />
      ) : playingGame === "native://tictactoe" ||
        playingGame === "native://tic-tac-toe" ? (
        <TicTacToeGame
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={gameMatchId}
        />
      ) : playingGame === "native://uno" ? (
        <UnoGame
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={gameMatchId}
        />
      ) : playingGame === "native://checkers" ? (
        <Checkers
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={gameMatchId}
        />
      ) : playingGame === "native://carrom" ? (
        <Carrom
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={gameMatchId}
        />
      ) : playingGame === "native://snooker" ? (
        <SnookerGame
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
          preloadedMatchId={gameMatchId}
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
        <CompetitiveGameLaunch gameKey="cup-pong" gameTitle={tr("UI_1482", "Cup Pong")} Game={CupPong} onClose={() => setPlayingGame(null)} />
      ) : playingGame === "native://four-in-a-row" ? (
        <CompetitiveGameLaunch gameKey="four-in-a-row" gameTitle={tr("UI_1483", "Four in a Row")} Game={FourInARow} preloadedRoomId={gameMatchId} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://bingo" ? (
        <CompetitiveGameLaunch gameKey="bingo" gameTitle={tr("UI_1484", "Bingo")} Game={Bingo} preloadedRoomId={gameMatchId} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://ping-pong" || playingGame === "native://table-tennis" ? (
        <CompetitiveGameLaunch gameKey="ping-pong" gameTitle={tr("UI_1485", "Ping Pong")} Game={PingPong} allowLocal={false} preloadedRoomId={gameMatchId} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://wordbox" || playingGame === "native://word-box" ? (
        <WordBoxGame onClose={() => setPlayingGame(null)} />
      ) : playingGame === "native://sudoku" ? (
        <SudokuGame onClose={() => setPlayingGame(null)} />
      ) : playingGame === "native://ludo" ? (
        <LudoFourPlayerArena preloadedRoomId={gameMatchId} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://shan-koe-mee" ? (
        <ShanKoeMeeFourPlayerArena preloadedRoomId={gameMatchId} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://monopoly" ? (
        <MonopolyFourPlayerArena preloadedRoomId={gameMatchId} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://dominoes" ? (
        <CompetitiveGameLaunch gameKey="dominoes" gameTitle={tr("UI_1488", "Dominoes")} Game={DominoesArenaGame} preloadedRoomId={gameMatchId} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://2048" ? (
        <Game2048 onClose={() => setPlayingGame(null)} />
      ) : playingGame === "native://big-two" ? (
        <BigTwoFourPlayerArena preloadedRoomId={gameMatchId} onClose={() => { setPlayingGame(null); setActiveMatchId(null); }} />
      ) : playingGame === "native://block-puzzle" ? (
        <BlockPuzzleGame onClose={() => setPlayingGame(null)} />
      ) : playingGame ? (
        <GamePlayer
          gameUrl={playingGame}
          matchId={gameMatchId}
          onClose={() => {
            setPlayingGame(null);
            setActiveMatchId(null);
          }}
        />
      ) : null}
      </div>

      {/* 📱 SOLID APP SHELL */}
      <div
        className={
          playingGame && !gameReturn
            ? "hidden"
            : "fixed inset-0 flex flex-col w-full max-w-full bg-background text-on-background font-body overflow-hidden transition-colors duration-300"
        }
      >
        {gameReturn && (
          <aside className="fixed inset-x-4 top-[calc(var(--app-safe-top)+0.75rem)] z-[100002] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-primary/35 bg-surface px-3 py-3 shadow-2xl backdrop-blur-xl">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-container text-primary">
              <span className="material-symbols-outlined block leading-none">sports_esports</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-on-surface">{pausedGameName} <LocalizedText id="UI_0027" fallback={tr("UI_0027", "is still open")} /></p>
              <p className="text-[11px] text-on-surface-variant"><LocalizedText id="UI_0028" fallback={tr("UI_0028", "Return within")} />{gameReturnSeconds}<LocalizedText id="UI_0029" fallback={tr("UI_0029", "s to continue where you left off.")} /></p>
            </div>
            <button type="button" onClick={resumeGame} className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-black text-on-primary active:scale-95"><LocalizedText id="UI_0030" fallback={tr("UI_0030", "Return")} /></button>
            <button type="button" onClick={endSuspendedGame} aria-label={tr("UI_0031", "End game")} className="grid size-8 shrink-0 place-items-center rounded-lg text-on-surface-variant active:bg-surface-container-high"><span className="material-symbols-outlined text-lg">close</span></button>
          </aside>
        )}
        {/* HEADER */}
        {activeTab !== "Spin" && !chatFullscreen && !gameDetailsFullscreen && <header
          className="fixed top-0 left-0 right-0 z-[100001] bg-background flex justify-between items-center px-5 transition-colors duration-300"
          style={{
            height: "calc(90px + var(--app-safe-top))",
            paddingTop: "var(--app-safe-top)",
          }}
        >
          <div className="flex items-center gap-3">
            <JoeYokeLogo className="w-[42px] h-[42px]" />

            <div className="flex flex-col">
              <h1 className="font-headline text-lg font-bold text-on-background leading-tight">
                <LocalizedText id="UI_0003" fallback={tr("UI_0003", "Joe Yoke")} /></h1>
              <div className="flex items-center gap-2 mt-0.5">
                <button onClick={() => setActiveTab("Store")} aria-label={tr("UI_0033", "Buy points")} className="flex items-center gap-1 bg-primary-container px-2.5 py-0.5 rounded-full transition-transform active:scale-95">
                  <span
                    className="material-symbols-outlined text-primary text-[14px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    bolt
                  </span>
                  <span className="text-on-background text-[11px] font-extrabold">
                    {userPoints.toLocaleString()}
                  </span>
                </button>
                <button onClick={() => setActiveTab("Store")} aria-label={tr("UI_0034", "Buy gems")} className="flex items-center gap-1 bg-secondary-container px-2.5 py-0.5 rounded-full transition-transform active:scale-95">
                  <span
                    className="material-symbols-outlined text-secondary text-[14px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    diamond
                  </span>
                  <span className="text-on-background text-[11px] font-extrabold">
                    {userGems.toLocaleString()}
                  </span>
                </button>
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
              aria-label={tr("UI_0035", "Open notifications")}
              className="relative w-9 h-9 rounded-full bg-surface flex items-center justify-center text-on-surface hover:opacity-80 transition-opacity border border-surface-container-highest shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">
                notifications
              </span>
              {unreadNotificationCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[9px] font-black flex items-center justify-center">{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</span>}
            </button>
          </div>
        </header>}

        {/* MAIN CONTENT AREA */}
        <main
          className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto no-scrollbar px-5 w-full z-10"
          style={{
            // Explore starts exactly at the 90px header boundary so its sticky
            // category control touches the navbar instead of inheriting the
            // generic 10px content gutter used by the other tabs.
            paddingTop: chatFullscreen || gameDetailsFullscreen ? "0" : activeTab === "Spin" ? "var(--app-safe-top)" : activeTab === "Explore" ? "calc(90px + var(--app-safe-top))" : "calc(100px + var(--app-safe-top))",
            paddingBottom: "calc(100px + env(safe-area-inset-bottom))",
          }}
        >
          {!showNotifications && !session &&
            (activeTab === "Chats" ||
              activeTab === "Store" ||
              activeTab === "Spin" ||
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
                    if (tab === "spin") setActiveTab("Spin");
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
                  onGameDetailsChange={setGameDetailsFullscreen}
                />
              )}

              {activeTab === "Chats" && (
                <ChatTab
                  currentPoints={userPoints}
                  userId={myUserId}
                  onChatOpenChange={setChatFullscreen}
                  onPlay={(url, matchId) => {
                    setActiveMatchId(matchId);
                    setPlayingGame(url);
                  }}
                />
              )}

              {activeTab === "Store" && <ShopTab userId={myUserId} onWalletUpdated={() => myUserId && fetchLiveBalance(myUserId)} />}

              {activeTab === "Spin" && <SpinTab userId={myUserId} onBack={() => setActiveTab("Home")} onWalletUpdated={() => myUserId && fetchLiveBalance(myUserId)} />}

              {activeTab === "Profile" && (
                <ProfileTab
                  isDarkMode={isDarkMode}
                  onToggleTheme={toggleTheme}
                  onPlayFavorite={(title) => {
                    const slug = title.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                    setPlayingGame(`native://${slug}`);
                  }}
                />
              )}
            </>
          )}
        </main>

        {showNotifications && (
          <div
            className="fixed inset-0 z-[100000] flex h-[100dvh] w-screen min-h-0 flex-col bg-background"
            style={{
              paddingTop: "calc(90px + var(--app-safe-top))",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            <div className="min-h-0 flex-1 px-5">
              <NotificationsCenter
                userId={myUserId}
                points={userPoints}
                gems={userGems}
                onBack={() => setShowNotifications(false)}
              />
            </div>
          </div>
        )}

        {/* Notifications are a full-screen destination, so navigation cannot cover actions. */}
        {!showNotifications && activeTab !== "Spin" && !chatFullscreen && !gameDetailsFullscreen && (
        <nav
          data-bottom-nav
          className="fixed bottom-0 left-0 w-full z-50 bg-surface border-t border-surface-container-highest px-2 pt-1 flex justify-around items-center transition-colors duration-300"
          style={{
            height: "calc(76px + env(safe-area-inset-bottom))",
            paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
          }}
        >
          {[
            { id: tr("UI_0039", "Home"), label: t("UI_0039"), icon: "home" },
            { id: tr("UI_0040", "Explore"), label: t("UI_0040"), icon: "explore" },
            { id: tr("UI_0037", "Store"), label: t("UI_0037"), icon: "local_mall" },
            { id: tr("UI_0036", "Chats"), label: t("UI_0036"), icon: "chat_bubble" },
            { id: tr("UI_0038", "Profile"), label: t("UI_0038"), icon: "person" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setChatFullscreen(false); setGameDetailsFullscreen(false); setActiveTab(tab.id); }}
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
        )}
      </div>
    </>
  );
}
