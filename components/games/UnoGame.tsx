"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { soundEngine } from "../../lib/soundManager";
import { processGameEntry, recordMatchResult } from "../../lib/matchManager";
import MatchmakingModal from "../MatchmakingModal";
import GameEngagementMenu from "../GameEngagementMenu";

// 🛍️ NEW: Live Database Cosmetic Hook
import { useEquippedCosmetic } from "../../lib/cosmeticsUtils";

interface UnoGameProps {
  onClose?: () => void;
  preloadedMatchId?: string | null;
  opponent?: { name: string; isBot: boolean } | null;
}

type CardColor = "red" | "blue" | "green" | "yellow" | "wild";
type CardValue = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "skip" | "reverse" | "draw2" | "wild" | "wild4";

interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

type ModeId = "quick" | "ranked" | "2v2" | "4p";

interface PlayerConfig {
  id: number;
  name: string;
  avatar: string;
  isBot: boolean;
  team: number;
  position: "bottom" | "left" | "top" | "right";
}

const COLORS: CardColor[] = ["red", "blue", "green", "yellow"];
const EMOJIS = ["👍", "😂", "🔥", "😡", "😭", "🤯"];
const TURN_TIME_LIMIT = 15;

const generateDeck = (includeExtraSpecial = false): Card[] => {
  const deck: Card[] = [];
  let idCounter = 0;

  COLORS.forEach((color) => {
    deck.push({ id: `c_${idCounter++}`, color, value: "0" });
    for (let i = 1; i <= 9; i++) {
      deck.push({ id: `c_${idCounter++}`, color, value: i.toString() as CardValue });
      deck.push({ id: `c_${idCounter++}`, color, value: i.toString() as CardValue });
    }
    ["skip", "reverse", "draw2"].forEach((val) => {
      deck.push({ id: `c_${idCounter++}`, color, value: val as CardValue });
      deck.push({ id: `c_${idCounter++}`, color, value: val as CardValue });
    });
  });

  const wildCount = includeExtraSpecial ? 6 : 4;
  for (let i = 0; i < wildCount; i++) {
    deck.push({ id: `c_${idCounter++}`, color: "wild", value: "wild" });
    deck.push({ id: `c_${idCounter++}`, color: "wild", value: "wild4" });
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

export default function UnoGame({ onClose, preloadedMatchId, opponent }: UnoGameProps) {
  // 🛍️ LIVE DATABASE COSMETICS ENGINE SYNC
  const { modifiers } = useEquippedCosmetic("uno");
  const isNeonDeck = !!modifiers;

  // 💰 DYNAMIC POINTS & ENTRY FEE SYSTEM
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [entryFee, setEntryFee] = useState<number>(100);
  const [showNoPointsModal, setShowNoPointsModal] = useState(false);

  // 🌐 MATCHMAKING MODAL STATES
  const [showMatchmaker, setShowMatchmaker] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<{ matchId: string; role: number; isBot: boolean } | null>(null);

  const isBotMode = Boolean(opponent?.isBot || preloadedMatchId?.startsWith("bot_"));

  const myRole = pendingMatch?.role || 1;

  const [view, setView] = useState<"menu" | "host" | "play" | "searching" | "confirmed">(
    isBotMode || preloadedMatchId ? "play" : "menu"
  );
  
  const [localOpponent, setLocalOpponent] = useState<any>(opponent || null);
  const [matchId, setMatchId] = useState<string | null>(
    preloadedMatchId || (isBotMode ? `bot_match_${Date.now()}` : null)
  );
  const [historyMatchId, setHistoryMatchId] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 🌐 MULTIPLAYER NETWORK STATES
  const [channel, setChannel] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);

  // 🎭 REACTIONS
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; role: number }[]>([]);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);

  // 🃏 UNO GAME STATES
  const [players, setPlayers] = useState<PlayerConfig[]>([]);
  const [hands, setHands] = useState<Record<number, Card[]>>({});
  const [deck, setDeck] = useState<Card[]>([]);
  const [discardPile, setDiscardPile] = useState<Card[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<number>(1);
  const [direction, setDirection] = useState<number>(1);
  const [activeColor, setActiveColor] = useState<CardColor>("red");
  const [statusMsg, setStatusMsg] = useState("");
  const [unoCalled, setUnoCalled] = useState<Record<number, boolean>>({});

  const [pendingWild, setPendingWild] = useState<Card | null>(null);
  const [winnerTeam, setWinnerTeam] = useState<number | null>(null);
  const [winnerPlayer, setWinnerPlayer] = useState<PlayerConfig | null>(null);

  const [isProcessingTurn, setIsProcessingTurn] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(TURN_TIME_LIMIT);

  // 🎯 COMPONENT-LEVEL VICTORY CHECK
  const isUserVictory = winnerTeam !== null && winnerTeam === players.find(p => p.id === myRole)?.team;

  const showToastMessage = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const fetchGameData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setMyUserId(user.id);
        const { data: profile } = await supabase.from("profiles").select("points").eq("id", user.id).single();
        if (profile) setUserPoints(profile.points ?? 0);
      }
      const { data: gameData } = await supabase.from("games").select("entry_fee").ilike("title", "Uno").single();
      if (gameData && typeof gameData.entry_fee === "number") setEntryFee(gameData.entry_fee);
    };
    fetchGameData();
  }, []);

  const checkPointsAndDeduct = async (): Promise<boolean> => {
    const result = await processGameEntry({ gameTitle: "Uno", entryFee, opponentName: localOpponent?.name || "Online Opponent" });
    if (!result.success) {
      if (result.error === "INSUFFICIENT_POINTS") { soundEngine.playSFX("defeat"); setShowNoPointsModal(true); }
      return false;
    }
    if (result.updatedPoints !== undefined) setUserPoints(result.updatedPoints);
    if (result.matchId) setHistoryMatchId(result.matchId);
    return true;
  };

  useEffect(() => {
    if (winnerTeam === null) return;
    const saveMatch = async () => {
      try {
        await recordMatchResult({
          game_id: "uno",
          game_title: "Uno",
          opponent_name: localOpponent?.name || opponent?.name || "Online Opponent",
          result: isUserVictory ? "Win" : "Loss",
          points_change: isUserVictory ? entryFee * 2 : 0
        });
      } catch (error) { console.error("Failed to save match data:", error); }
    };
    saveMatch();
  }, [winnerTeam, isUserVictory, entryFee, localOpponent, opponent]);

  useEffect(() => {
    if (!matchId || !myUserId || localOpponent?.isBot || view === "searching" || view === "confirmed") return;

    const matchChannel = supabase.channel(`uno_match_${matchId}`, {
      config: { broadcast: { self: false }, presence: { key: myUserId } },
    });

    matchChannel
      .on("broadcast", { event: "game_sync" }, (payload) => {
        if (myRole === 2) {
          const state = payload.payload;
          setHands(state.hands);
          setDiscardPile(state.discardPile);
          setDeck(state.deck);
          setActiveColor(state.activeColor);
          setCurrentPlayer(state.currentPlayer);
          setDirection(state.direction);
          setUnoCalled(state.unoCalled);
          setStatusMsg(state.statusMsg);
          setWinnerTeam(state.winnerTeam);
          setWinnerPlayer(state.winnerPlayer);
          setIsProcessingTurn(state.isProcessingTurn);
        }
      })
      .on("broadcast", { event: "player_action" }, (payload) => {
        if (myRole === 1) {
          const { action, card, color, pId, count } = payload.payload;
          if (action === "play") executePlay(card, pId, color);
          if (action === "draw") {
            drawCardForPlayer(pId, count);
            setCurrentPlayer(getNextPlayerId(pId, 1));
          }
          if (action === "uno") {
            setUnoCalled(prev => ({ ...prev, [pId]: true }));
            setStatusMsg(`UNO! 📢`);
          }
        }
      })
      .on("broadcast", { event: "emoji" }, (payload) => {
        const { emoji, role } = payload.payload;
        const newEmoji = { id: Date.now() + Math.random(), emoji, role };
        setFloatingEmojis((prev) => [...prev, newEmoji]);
        setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id)), 2500);
      })
      .on("presence", { event: "sync" }, () => {
        const state = matchChannel.presenceState();
        setOpponentConnected(Object.keys(state).length > 1);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await matchChannel.track({ online_at: new Date().toISOString() });
      });

    setChannel(matchChannel);
    return () => {
      matchChannel.untrack();
      supabase.removeChannel(matchChannel);
    };
  }, [matchId, myUserId, localOpponent, view, myRole]);

  useEffect(() => {
    if (channel && myRole === 1 && view === "play" && !localOpponent?.isBot && opponentConnected) {
      channel.send({
        type: "broadcast",
        event: "game_sync",
        payload: { hands, discardPile, deck, activeColor, currentPlayer, direction, unoCalled, statusMsg, winnerTeam, winnerPlayer, isProcessingTurn }
      });
    }
  }, [hands, discardPile, deck, activeColor, currentPlayer, direction, unoCalled, statusMsg, winnerTeam, winnerPlayer, isProcessingTurn, channel, myRole, view, localOpponent, opponentConnected]);

  const startModeGame = useCallback((modeId: ModeId, forcedOpponent?: any) => {
    soundEngine.playSFX("click");
    const opp = forcedOpponent || localOpponent;
    const oppRole = myRole === 1 ? 2 : 1;
    const isBot = opp?.isBot || (!pendingMatch && modeId === "quick");

    const config: PlayerConfig[] = [
      { id: myRole, name: "You", avatar: "😎", isBot: false, team: myRole, position: "bottom" },
      { id: oppRole, name: opp?.name || "Player 2", avatar: opp?.avatarIcon || "🤖", isBot: isBot, team: oppRole, position: "top" },
    ];
    setPlayers(config);
    setView("play");

    if (myRole === 2 && !isBot) {
      setStatusMsg("Waiting for Host...");
      return;
    }

    let initialDeck = generateDeck(modeId === "2v2" || modeId === "4p");
    const initialHands: Record<number, Card[]> = {};
    const initialUnoCalls: Record<number, boolean> = {};

    config.forEach(p => {
      initialHands[p.id] = initialDeck.splice(0, 7);
      initialUnoCalls[p.id] = false;
    });

    let firstCard = initialDeck.shift()!;
    while (firstCard.color === "wild" || ["skip", "reverse", "draw2"].includes(firstCard.value)) {
      initialDeck.push(firstCard);
      firstCard = initialDeck.shift()!;
    }

    setHands(initialHands);
    setUnoCalled(initialUnoCalls);
    setDiscardPile([firstCard]);
    setDeck(initialDeck);
    setActiveColor(firstCard.color);
    setCurrentPlayer(1);
    setDirection(1);
    setWinnerTeam(null);
    setWinnerPlayer(null);
    setIsProcessingTurn(false);
    setStatusMsg("Your Turn!");
    setTimeLeft(TURN_TIME_LIMIT);
  }, [localOpponent, myRole, pendingMatch]);

  useEffect(() => {
    if (view === "host" && opponentConnected) {
      startModeGame("quick");
    }
  }, [opponentConnected, view, startModeGame]);

  useEffect(() => {
    if (view === "play" && players.length === 0) startModeGame("quick");
  }, [view, players.length, startModeGame]);

  const startOnlineMatchmaking = async () => {
    soundEngine.playSFX("click");
    if (await checkPointsAndDeduct()) setShowMatchmaker(true);
  };
  const hostMatch = async () => {
    soundEngine.playSFX("click");
    if (await checkPointsAndDeduct()) { setMatchId(Math.random().toString(36).substring(2, 8).toUpperCase()); setView("host"); }
  };
  const joinMatch = async () => {
    if (joinInput.length < 4) return;
    soundEngine.playSFX("click");
    if (await checkPointsAndDeduct()) { setMatchId(joinInput.trim().toUpperCase()); setView("play"); }
  };
  const enterBotMatch = () => {
    soundEngine.playSFX("click");
    setMatchId(`bot_match_${Date.now()}`);
    showToastMessage(`Playing against ${localOpponent?.name || 'Bot'}`);
    startModeGame("quick", localOpponent);
  };
  const enterConfirmedMatch = () => {
    soundEngine.playSFX("click");
    if (pendingMatch) {
      setMatchId(pendingMatch.matchId);
      startModeGame("quick", localOpponent);
    } else enterBotMatch();
  };

  const sendEmoji = (emoji: string) => {
    soundEngine.playSFX("click");
    setShowEmojiMenu(false);
    if (channel && matchId) {
      channel.send({ type: "broadcast", event: "emoji", payload: { emoji, role: myRole } });
    } else {
      const newEmoji = { id: Date.now(), emoji, role: myRole };
      setFloatingEmojis((prev) => [...prev, newEmoji]);
      setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id)), 2500);
    }
  };

  const handleExit = () => {
    soundEngine.playSFX("click");
    if (matchId) setMatchId(null);
    if (onClose) onClose();
    else setView("menu");
  };

  const getNextPlayerId = (currentPId: number, step = 1, currentDir = direction) => {
    const currentIndex = players.findIndex(p => p.id === currentPId);
    if (currentIndex === -1) return currentPId;
    let nextIndex = (currentIndex + step * currentDir) % players.length;
    if (nextIndex < 0) nextIndex += players.length;
    return players[nextIndex].id;
  };

  const drawCardForPlayer = (pId: number, count = 1) => {
    soundEngine.playSFX("card_flip");
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) window.navigator.vibrate(30);
    
    if (deck.length < count) {
      const newDeck = [...discardPile.slice(0, discardPile.length - 1)];
      for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
      }
      setDeck(newDeck);
      setDiscardPile([discardPile[discardPile.length - 1]]);
      return;
    }
    const drawn = deck.slice(0, count);
    setDeck(prev => prev.slice(count));
    setHands(prev => ({ ...prev, [pId]: [...(prev[pId] || []), ...drawn] }));
    if ((hands[pId]?.length || 0) + count > 1) setUnoCalled(prev => ({ ...prev, [pId]: false }));
  };

  const canPlayCard = (card: Card) => {
    const topCard = discardPile[discardPile.length - 1];
    if (!topCard) return false;
    if (card.color === "wild" || card.color === activeColor || card.value === topCard.value) return true;
    return false;
  };

  const handleCallUno = () => {
    soundEngine.playSFX("beep");
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) window.navigator.vibrate([50, 50, 100]);
    
    if (myRole === 2 && !localOpponent?.isBot) {
      channel?.send({ type: "broadcast", event: "player_action", payload: { action: "uno", pId: 2 } });
    } else {
      setUnoCalled(prev => ({ ...prev, [myRole]: true }));
      setStatusMsg("UNO! 📢");
    }
  };

  const executePlay = (card: Card, pId: number, chosenColor?: CardColor) => {
    setIsProcessingTurn(true);
    const pConfig = players.find(p => p.id === pId)!;
    const remainingAfterPlay = (hands[pId]?.length || 0) - 1;

    if (["draw2", "wild4", "skip", "reverse"].includes(card.value)) {
      soundEngine.playSFX("laser");
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) window.navigator.vibrate([100, 50, 100]);
    } else {
      soundEngine.playSFX("card_flip");
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) window.navigator.vibrate(30);
    }

    if (remainingAfterPlay === 1 && !unoCalled[pId]) {
      if (pConfig.isBot) {
        if (Math.random() < 0.9) {
          soundEngine.playSFX("beep");
          setUnoCalled(prev => ({ ...prev, [pId]: true }));
          setStatusMsg(`${pConfig.name} called UNO! 📢`);
        } else {
          setStatusMsg(`${pConfig.name} forgot UNO! +2 Cards!`);
          drawCardForPlayer(pId, 2);
        }
      } else {
        setStatusMsg(`${pConfig.name === "You" ? "You" : pConfig.name} forgot UNO! +2 Cards! ⚠️`);
        drawCardForPlayer(pId, 2);
      }
    }
   
    setHands(prev => ({ ...prev, [pId]: prev[pId].filter(c => c.id !== card.id) }));
    setDiscardPile(prev => [...prev, card]);
    setActiveColor(chosenColor || card.color);

    if (remainingAfterPlay === 0) {
      setWinnerPlayer(pConfig);
      setWinnerTeam(pConfig.team);
      setStatusMsg(`${pConfig.name} Wins!`);
      const isUserWin = pConfig.team === players.find(p => p.id === myRole)?.team;
      soundEngine.playSFX(isUserWin ? "victory" : "defeat");
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(isUserWin ? [200, 100, 200] : [300, 100, 300]);
      }
      return;
    }

    let nextDir = direction;
    let nextPId = getNextPlayerId(pId, 1, nextDir);

    if (card.value === "reverse") {
      if (players.length === 2) nextPId = pId;
      else { nextDir = direction * -1; setDirection(nextDir); nextPId = getNextPlayerId(pId, 1, nextDir); }
      setStatusMsg("Reverse!");
    } else if (card.value === "skip") {
      nextPId = getNextPlayerId(pId, 2, nextDir);
      setStatusMsg(`${players.find(p => p.id === getNextPlayerId(pId, 1, nextDir))?.name} Skipped!`);
    } else if (card.value === "draw2") {
      drawCardForPlayer(nextPId, 2);
      const skippedP = nextPId;
      nextPId = getNextPlayerId(nextPId, 1, nextDir);
      setStatusMsg(`${players.find(p => p.id === skippedP)?.name} draws +2!`);
    } else if (card.value === "wild4") {
      drawCardForPlayer(nextPId, 4);
      const skippedP = nextPId;
      nextPId = getNextPlayerId(nextPId, 1, nextDir);
      setStatusMsg(`${players.find(p => p.id === skippedP)?.name} draws +4!`);
    } else {
      const nextPlayerObj = players.find(p => p.id === nextPId);
      setStatusMsg(nextPlayerObj?.id === myRole ? "Your Turn!" : `${nextPlayerObj?.name} played card`);
    }

    setTimeout(() => { setCurrentPlayer(nextPId); setIsProcessingTurn(false); }, 600);
  };

  const handleCardPlay = (card: Card, color?: CardColor) => {
    if (myRole === 2 && !localOpponent?.isBot) {
      channel?.send({ type: "broadcast", event: "player_action", payload: { action: "play", card, color, pId: 2 } });
    } else {
      executePlay(card, myRole, color);
    }
  };

  useEffect(() => {
    if (view !== "play" || winnerTeam !== null) return;
    setTimeLeft(TURN_TIME_LIMIT);

    const timerInterval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          if (currentPlayer === myRole) {
            const myCards = hands[myRole] || [];
            const playable = myCards.filter((c) => canPlayCard(c));
            if (playable.length > 0) {
              const randomCard = playable[Math.floor(Math.random() * playable.length)];
              let chosenColor = randomCard.color === "wild" ? COLORS[Math.floor(Math.random() * COLORS.length)] : randomCard.color;
              setPendingWild(null);
              handleCardPlay(randomCard, chosenColor);
            } else {
              if (myRole === 2 && !localOpponent?.isBot) channel?.send({ type: "broadcast", event: "player_action", payload: { action: "draw", count: 1, pId: 2 } });
              else { drawCardForPlayer(myRole, 1); setCurrentPlayer(getNextPlayerId(myRole, 1)); }
            }
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerInterval);
  }, [currentPlayer, view, winnerTeam, hands, activeColor, discardPile, myRole, localOpponent, channel]);

  useEffect(() => {
    if (view !== "play" || winnerTeam !== null) return;
    const currentPObj = players.find(p => p.id === currentPlayer);
    if (!currentPObj || !currentPObj.isBot) return;

    if (myRole !== 1 && !localOpponent?.isBot) return; 

    const thinkingDelay = Math.floor(Math.random() * 2000) + 1500;
    const botTimer = setTimeout(() => {
      const botCards = hands[currentPObj.id] || [];
      const playable = botCards.filter(c => canPlayCard(c));

      if (playable.length > 0) {
        let cardToPlay = playable.find(c => c.color !== "wild") || playable[0];
        let chosenColor = cardToPlay.color;

        if (cardToPlay.color === "wild") {
          const colors = botCards.map(c => c.color).filter(c => c !== "wild");
          chosenColor = colors.length > 0
            ? (colors.sort((a,b) => colors.filter(v=>v===a).length - colors.filter(v=>v===b).length).pop() as CardColor)
            : COLORS[Math.floor(Math.random() * COLORS.length)];
        }
        executePlay(cardToPlay, currentPObj.id, chosenColor);
      } else {
        drawCardForPlayer(currentPObj.id, 1);
        setCurrentPlayer(getNextPlayerId(currentPObj.id, 1));
      }
    }, thinkingDelay);

    return () => clearTimeout(botTimer);
  }, [currentPlayer, hands, discardPile, activeColor, winnerTeam, view, players, myRole, localOpponent]);

  const getCardBg = (color: CardColor) => {
    switch(color) {
      case "red": return "bg-rose-600 border-rose-800";
      case "blue": return "bg-[#003B46] border-cyan-800";
      case "green": return "bg-emerald-600 border-emerald-800";
      case "yellow": return "bg-[#F4D03F] border-amber-600";
      default: return "bg-[#18181b] border-white/10";
    }
  };

  const renderCardValue = (value: CardValue) => {
    if (value === "skip") return "⊘";
    if (value === "reverse") return "⟲";
    if (value === "draw2") return "+2";
    if (value === "wild") return "W";
    if (value === "wild4") return "+4";
    return value;
  };

  const CardComponent = ({ card, hidden = false, onClick, active = false }: { card: Card, hidden?: boolean, onClick?: () => void, active?: boolean }) => {
    if (hidden) {
      return (
        <div className={`w-[68px] h-[98px] rounded-xl border-2 flex items-center justify-center shadow-2xl shrink-0 relative overflow-hidden select-none ${
          isNeonDeck ? "bg-[#09090b] border-[#CCFF00]/40" : "bg-[#18181b] border-white/10"
        }`}>
           <div className="absolute inset-2 border-2 border-rose-500/50 rounded-full rotate-45 opacity-60 pointer-events-none"></div>
           <span className="text-rose-500 font-headline font-black italic -rotate-12 text-sm select-none drop-shadow pointer-events-none">UNO</span>
        </div>
      );
    }
    return (
      <button
        onClick={onClick}
        disabled={!active || isProcessingTurn}
        className={`w-[68px] h-[98px] rounded-xl border-2 ${getCardBg(card.color)} flex flex-col items-center justify-center p-1 shadow-2xl shrink-0 relative overflow-hidden touch-manipulation select-none transition-transform duration-200 ${
          active && !isProcessingTurn
            ? '-translate-y-6 z-30 ring-4 ring-[#CCFF00] shadow-[0_0_22px_rgba(204,255,0,0.85)] active:scale-95 cursor-pointer brightness-100'
            : 'brightness-75 cursor-not-allowed translate-y-0'
        } ${card.color === 'wild' ? 'bg-gradient-to-br from-rose-600 via-cyan-600 to-emerald-600' : ''}`}
      >
        <div className="absolute top-1 left-1 text-white font-black text-[10px] drop-shadow pointer-events-none">{renderCardValue(card.value)}</div>
        <div className="w-10 h-13 bg-white rounded-full flex items-center justify-center shadow-inner transform -rotate-12 pointer-events-none">
           <span className={`font-headline font-black text-xl drop-shadow-sm ${
             card.color === 'yellow' ? 'text-amber-500' : card.color === 'red' ? 'text-rose-600' : card.color === 'blue' ? 'text-cyan-600' : card.color === 'green' ? 'text-emerald-600' : 'text-neutral-800'
           }`}>
             {renderCardValue(card.value)}
           </span>
        </div>
      </button>
    );
  };

  const getDynamicCardMargin = (totalCards: number) => {
    if (totalCards <= 4) return "-ml-2";
    if (totalCards <= 6) return "-ml-6";
    if (totalCards <= 8) return "-ml-9";
    if (totalCards <= 11) return "-ml-11";
    if (totalCards <= 14) return "-ml-12";
    return "-ml-[52px]";
  };

  if (view === "menu") return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center font-sans text-white px-6 animate-fade-in select-none">
        {showNoPointsModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-6 animate-fade-in touch-none">
            <div className="bg-[#18181b] border border-rose-500/30 rounded-[28px] p-6 w-full max-w-[340px] shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-rose-400">monetization_on</span>
              </div>
              <h3 className="font-headline font-black text-xl text-white uppercase tracking-tight mb-1">Insufficient Points</h3>
              <p className="text-xs text-neutral-400 font-medium leading-relaxed mb-4">You need <span className="text-[#CCFF00] font-bold">{entryFee} PTS</span> to play an online Uno match.</p>
              <div className="w-full space-y-2">
                <button onClick={() => { soundEngine.playSFX("click"); handleExit(); }} className="w-full bg-[#CCFF00] hover:bg-[#b3e600] text-black font-headline font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-1.5 touch-manipulation">
                  Visit Store / Buy Points
                </button>
                <button onClick={() => setShowNoPointsModal(false)} className="w-full bg-white/5 hover:bg-white/10 text-neutral-400 font-headline font-bold text-xs uppercase tracking-wider py-2.5 rounded-xl transition-all border border-white/5 touch-manipulation">
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {showMatchmaker && (
          <MatchmakingModal
            gameKey="uno"
            gameName="Uno Arena"
            userId={myUserId || ""}
            onMatchFound={(matchData) => {
              setShowMatchmaker(false);
              setLocalOpponent(matchData.opponent);
              setPendingMatch({ matchId: matchData.matchId || `bot_match_${Date.now()}`, role: (matchData.role as number) || 1, isBot: matchData.opponent.isBot || false });
              setView("confirmed");
            }}
            onCancel={() => { soundEngine.playSFX("click"); setShowMatchmaker(false); }}
          />
        )}

        {toast && <div className="absolute top-24 z-[300] bg-rose-500/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl font-headline font-bold text-sm shadow-2xl animate-fade-in border border-rose-400">{toast}</div>}
        
        <GameEngagementMenu gameName="Uno Arena" entryFee={entryFee} onOnline={startOnlineMatchmaking} onHost={hostMatch} onLocal={() => startModeGame("quick")} onExit={handleExit} roomCode={joinInput} setRoomCode={setJoinInput} onJoin={joinMatch} />
        {/*
        <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-6 shadow-2xl border border-white/5 flex flex-col relative overflow-hidden">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10"><span className="material-symbols-outlined text-2xl text-neutral-300">style</span></div>
            <div><h1 className="font-headline font-black text-xl tracking-tight text-white">Uno Arena</h1><p className="text-xs text-neutral-400 font-medium mt-0.5">Select engagement mode</p></div>
          </div>
          <button onClick={startOnlineMatchmaking} className="group relative w-full bg-[#09090b] border border-white/10 hover:border-[#CCFF00]/50 rounded-[24px] p-5 mb-4 text-left transition-all hover:bg-white/5 touch-manipulation">
            <h3 className="font-headline font-black text-lg text-white mb-1 group-hover:text-[#CCFF00] transition-colors">Find Online Match</h3>
            <p className="text-xs text-neutral-400 font-medium leading-relaxed">Ranked & casual global<br/>matchmaking</p>
          </button>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button onClick={hostMatch} className="group bg-[#09090b] border border-white/10 hover:border-teal-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px] touch-manipulation">
              <div><h3 className="font-headline font-bold text-sm text-white mb-0.5">Host Match</h3><p className="text-[10px] text-neutral-400 font-medium">Create room code</p></div>
            </button>
            <button onClick={() => startModeGame("quick")} className="group bg-[#09090b] border border-white/10 hover:border-pink-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px] touch-manipulation">
              <div><h3 className="font-headline font-bold text-sm text-white mb-0.5">Pass & Play</h3><p className="text-[10px] text-neutral-400 font-medium">Local device</p></div>
            </button>
          </div>
          <div className="flex items-center gap-2 w-full mb-6">
            <div className="relative flex-1 min-w-0 flex items-center bg-[#09090b] border border-white/10 rounded-2xl p-1.5">
              <input type="text" placeholder="ENTER ROOM CODE..." value={joinInput} onChange={(e) => setJoinInput(e.target.value.toUpperCase())} className="flex-1 min-w-0 bg-transparent text-sm font-headline font-bold text-white placeholder-neutral-600 focus:outline-none uppercase tracking-widest pl-3" maxLength={6} />
            </div>
            <button onClick={joinMatch} disabled={joinInput.length < 4} className="shrink-0 bg-[#18181b] hover:bg-white/10 disabled:opacity-50 text-white px-5 py-3.5 rounded-2xl font-headline font-bold text-xs tracking-wider transition-all border border-white/5 touch-manipulation">Join</button>
          </div>
          <button onClick={handleExit} className="w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-headline text-[10px] font-bold tracking-widest uppercase touch-manipulation">EXIT ARENA</button>
        </div>*/}
      </div>
  );

  if (view === "confirmed") return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in font-sans select-none">
        <h2 className="font-headline font-black text-3xl text-white mb-2">{localOpponent?.name || "Player 2"}</h2>
        <button onClick={enterConfirmedMatch} className="w-full max-w-[280px] bg-[#CCFF00] hover:bg-[#b3e600] text-black py-4 rounded-2xl font-headline font-black text-lg flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-[0_0_30px_rgba(204,255,0,0.2)] touch-manipulation">
          Enter Match
        </button>
      </div>
  );

  if (view === "host") return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col font-sans text-white select-none items-center justify-center">
         <span className="font-headline font-bold text-2xl tracking-[0.3em] text-rose-400">{matchId}</span>
         <button onClick={handleExit} className="mt-8 bg-white/5 text-neutral-300 rounded-2xl py-4 px-8 font-headline font-bold text-sm tracking-wide border border-white/5">CANCEL MATCH</button>
      </div>
  );

  const topPlayer = players.find(p => p.position === "top");
  const leftPlayer = players.find(p => p.position === "left");
  const rightPlayer = players.find(p => p.position === "right");
  const isTeammate = topPlayer && topPlayer.team === players.find(p => p.id === myRole)?.team && (players.find(p => p.id === myRole)?.team || 0) > 0;
  
  const playerHand = hands[myRole] || [];
  const playerHasPlayableCard = playerHand.some(c => canPlayCard(c));
  const isUserDrawRequired = currentPlayer === myRole && !playerHasPlayableCard && !isProcessingTurn;

  return (
    <div className="fixed inset-0 bg-[#09090b] text-white flex flex-col font-sans overflow-hidden select-none z-[100]">
      {/* FLOATING EMOJI LAYER */}
      {floatingEmojis.map((em) => (
        <div key={em.id} className={`absolute z-50 text-4xl animate-float-up pointer-events-none bottom-10 ${em.role === myRole ? 'right-10' : 'left-10'}`}>
          {em.emoji}
        </div>
      ))}

      {/* HEADER */}
      <div className="w-full min-h-12 h-auto pb-2 bg-[#18181b] border-b border-white/10 flex items-center justify-between px-4 shrink-0 shadow-md relative z-30 pt-safe">
        <button onClick={handleExit} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition touch-manipulation">
           <span className="material-symbols-outlined text-sm">arrow_back</span>
        </button>
        <span className="font-headline font-black text-sm tracking-widest text-rose-500 italic uppercase">UNO <span className="text-white not-italic">MATRIX</span></span>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => { soundEngine.playSFX("click"); setShowEmojiMenu(!showEmojiMenu); }} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-300 active:scale-90 transition shadow-sm hover:bg-white/10 touch-manipulation">
              <span className="material-symbols-outlined text-sm">add_reaction</span>
            </button>
            {showEmojiMenu && (
              <div className="absolute top-10 right-0 bg-[#18181b] border border-white/10 p-2 rounded-2xl shadow-2xl flex gap-1 z-50">
                {EMOJIS.map((em) => <button key={em} onClick={() => sendEmoji(em)} className="text-xl hover:scale-125 transition-transform p-1 touch-manipulation">{em}</button>)}
              </div>
            )}
          </div>
          <div className="w-8 flex items-center justify-center">
              {matchId && !localOpponent?.isBot && !opponentConnected && (
                 <span className="w-2 h-2 rounded-full bg-[#CCFF00] animate-pulse"></span>
              )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between relative min-h-0 overflow-hidden p-2 bg-[#09090b]">
        {/* CASINO TABLE BOARD */}
        <div className={`absolute inset-2 rounded-[40px] border-[6px] shadow-2xl flex flex-col justify-between overflow-hidden ${
          isNeonDeck ? "border-[#CCFF00]/30 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#18181b] via-[#09090b] to-black" : "border-[#064e3b] bg-[#022c22]"
        }`}>
          
          {/* TOP PLAYER */}
          {topPlayer && (
            <div className="w-full pt-2 flex flex-col items-center relative z-20 px-4">
              <div className="flex justify-center max-w-full overflow-hidden mb-1">
                {isTeammate ? (
                  (hands[topPlayer.id] || []).map((card, idx) => (
                    <div key={card.id} className={`${idx === 0 ? '' : getDynamicCardMargin((hands[topPlayer.id] || []).length)} relative transition-all`}>
                      <CardComponent card={card} hidden={false} active={false} />
                    </div>
                  ))
                ) : (
                  Array.from({ length: hands[topPlayer.id]?.length || 0 }).map((_, i) => (
                    <div key={i} className={`${i === 0 ? '' : getDynamicCardMargin(hands[topPlayer.id]?.length || 0)} transform rotate-180 transition-all`}>
                      <CardComponent card={{} as Card} hidden={true} />
                    </div>
                  ))
                )}
              </div>
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full border shadow-2xl backdrop-blur-md ${currentPlayer === topPlayer.id ? 'bg-[#CCFF00] border-[#CCFF00] text-black ring-2 ring-[#CCFF00] animate-pulse' : 'bg-[#18181b] border-white/10'}`}>
                  <span className="text-base">{topPlayer.avatar}</span>
                  <span className="text-xs font-bold">{topPlayer.name}</span>
                  <span className="bg-black/60 text-[#CCFF00] text-xs font-black px-2 py-0.5 rounded-full border border-white/10">{hands[topPlayer.id]?.length || 0}</span>
              </div>
            </div>
          )}

          {/* MIDDLE TABLE AREA */}
          <div className="flex-1 min-h-0 flex items-center justify-between px-2 relative z-10">
              {leftPlayer ? (
                <div className="flex flex-col items-center gap-2 relative">
                  <div className={`flex flex-col items-center px-2.5 py-1.5 rounded-2xl border shadow-2xl backdrop-blur-md ${currentPlayer === leftPlayer.id ? 'bg-[#CCFF00] border-[#CCFF00] text-black ring-2 ring-[#CCFF00] animate-pulse' : 'bg-[#18181b] border-white/10'}`}>
                      <span className="text-xl">{leftPlayer.avatar}</span>
                      <span className="text-[10px] font-bold max-w-[55px] truncate">{leftPlayer.name}</span>
                      <span className="bg-black/60 text-[#CCFF00] text-[10px] font-black px-2 py-0.5 rounded-full border border-white/10 mt-1">{hands[leftPlayer.id]?.length || 0}</span>
                  </div>
                  <div className="flex flex-col -space-y-[64px] my-1">
                      {Array.from({ length: Math.min(hands[leftPlayer.id]?.length || 0, 7) }).map((_, i) => (<div key={i} className="transform -rotate-90"><CardComponent card={{} as Card} hidden={true} /></div>))}
                  </div>
                </div>
              ) : <div className="w-16"></div>}

              {/* CENTER DISCARD PILE & DRAW DECK */}
              <div className="flex flex-col items-center justify-center relative">
                  <div className="flex items-center justify-center gap-6 z-10">
                      {/* --- DRAW DECK --- */}
                      <div className="flex flex-col items-center relative">
                        {isUserDrawRequired && (
                          <div className="absolute -top-11 flex flex-col items-center z-30 animate-bounce pointer-events-none">
                            <span className="bg-[#CCFF00] text-black text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-2xl border border-[#CCFF00] tracking-wider uppercase whitespace-nowrap">Tap to Draw</span>
                            <span className="text-[#CCFF00] text-lg font-black leading-none drop-shadow-lg">👇</span>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            if (isUserDrawRequired) {
                              if (myRole === 2 && !localOpponent?.isBot) channel?.send({ type: "broadcast", event: "player_action", payload: { action: "draw", count: 1, pId: 2 } });
                              else { drawCardForPlayer(myRole, 1); setCurrentPlayer(getNextPlayerId(myRole, 1)); }
                            }
                          }}
                          disabled={!isUserDrawRequired}
                          className={`relative group transform transition-all duration-300 touch-manipulation ${isUserDrawRequired ? 'hover:-translate-y-2 active:scale-95 cursor-pointer scale-105 opacity-100' : 'opacity-70 cursor-not-allowed scale-100'}`}
                        >
                            <div className="absolute top-1 left-1 w-[68px] h-[98px] rounded-xl bg-[#18181b] border border-white/10 -z-10 shadow-md"></div>
                            <div className={`w-[68px] h-[98px] rounded-xl bg-[#09090b] border-2 transition-all flex flex-col items-center justify-center shadow-2xl relative overflow-hidden ${
                              isUserDrawRequired ? 'border-[#CCFF00] ring-4 ring-[#CCFF00]/80 shadow-[0_0_30px_rgba(204,255,0,0.9)] animate-pulse' : 'border-white/10'
                            }`}>
                                <div className="absolute inset-2 border-2 border-rose-500/50 rounded-full rotate-45 opacity-60"></div>
                                <span className="text-rose-500 font-headline font-black italic -rotate-12 text-sm drop-shadow">UNO</span>
                            </div>
                        </button>
                      </div>

                      {/* DISCARD PILE */}
                      <div className="relative">
                          {discardPile.length > 0 && <CardComponent card={discardPile[discardPile.length - 1]} active={false} />}
                          <div className="absolute -inset-2.5 border-[3px] rounded-2xl z-0 pointer-events-none transition-colors duration-500 shadow-xl"
                               style={{ borderColor: activeColor === 'red' ? '#e11d48' : activeColor === 'blue' ? '#0891b2' : activeColor === 'green' ? '#059669' : activeColor === 'yellow' ? '#d97706' : '#52525b' }}>
                          </div>
                      </div>
                  </div>

                  {statusMsg && (
                    <div className="mt-4 px-3.5 py-1 bg-[#18181b]/90 border border-white/10 text-[#CCFF00] text-xs font-bold rounded-full shadow-2xl backdrop-blur-md uppercase tracking-wider">{statusMsg}</div>
                  )}
              </div>

              {rightPlayer ? (
                <div className="flex flex-col items-center gap-2 relative">
                  <div className={`flex flex-col items-center px-2.5 py-1.5 rounded-2xl border shadow-2xl backdrop-blur-md ${currentPlayer === rightPlayer.id ? 'bg-[#CCFF00] border-[#CCFF00] text-black ring-2 ring-[#CCFF00] animate-pulse' : 'bg-[#18181b] border-white/10'}`}>
                      <span className="text-xl">{rightPlayer.avatar}</span>
                      <span className="text-[10px] font-bold max-w-[55px] truncate">{rightPlayer.name}</span>
                      <span className="bg-black/60 text-[#CCFF00] text-[10px] font-black px-2 py-0.5 rounded-full border border-white/10 mt-1">{hands[rightPlayer.id]?.length || 0}</span>
                  </div>
                  <div className="flex flex-col -space-y-[64px] my-1">
                      {Array.from({ length: Math.min(hands[rightPlayer.id]?.length || 0, 7) }).map((_, i) => (<div key={i} className="transform rotate-90"><CardComponent card={{} as Card} hidden={true} /></div>))}
                  </div>
                </div>
              ) : <div className="w-16"></div>}
          </div>

          {/* BOTTOM: YOUR HAND */}
          <div className="w-full flex flex-col relative z-20 shrink-0 pb-16">
             <div className="flex items-center justify-center mb-4">
                <div className={`relative flex items-center gap-2 px-3 py-1 rounded-full border shadow-2xl overflow-hidden backdrop-blur-md ${currentPlayer === myRole ? 'border-[#CCFF00] ring-2 ring-[#CCFF00]/50' : 'bg-[#18181b] border-white/10'}`}>
                    {currentPlayer === myRole && (
                      <div className="absolute inset-0 bg-cyan-600 transition-all duration-1000 linear z-0" style={{ width: `${(timeLeft / TURN_TIME_LIMIT) * 100}%` }} />
                    )}
                    <div className="absolute inset-0 bg-[#18181b] -z-10" />
                    <span className="text-sm relative z-10">😎</span>
                    <span className="text-xs font-bold text-white relative z-10">You</span>
                    <span className="bg-black/80 text-[#CCFF00] text-xs font-black px-2 py-0.5 rounded-full border border-white/10 relative z-10 shadow-inner">{playerHand.length}</span>
                </div>
             </div>

             <div className="w-full px-2 pt-8 pb-4 flex justify-center items-center overflow-visible relative">
               <button
                  onClick={handleCallUno}
                  disabled={unoCalled[myRole] || playerHand.length !== 2}
                  className={`absolute right-2 -top-20 z-50 transform transition-all duration-300 touch-manipulation ${
                    unoCalled[myRole] ? "scale-90 opacity-80" : playerHand.length === 2 ? "animate-bounce scale-110 active:scale-95 cursor-pointer" : "opacity-40 cursor-not-allowed scale-95"
                  }`}
               >
                  <div className={`w-20 h-14 rounded-[50%] flex items-center justify-center p-1.5 transform -rotate-12 transition-all shadow-2xl ${
                    unoCalled[myRole] ? "bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.9)]" : playerHand.length === 2 ? "bg-[#CCFF00] shadow-[0_0_30px_rgba(204,255,0,1)]" : "bg-[#18181b]"
                  }`}>
                      <div className="w-full h-full rounded-[50%] bg-gradient-to-br from-rose-500 via-rose-600 to-rose-800 border-2 border-white flex items-center justify-center relative overflow-hidden shadow-inner">
                         <span className="font-headline font-black italic text-amber-300 text-base tracking-tighter transform -rotate-6 drop-shadow-[0_2px_3px_rgba(0,0,0,0.95)]">UNO</span>
                      </div>
                  </div>
               </button>

               <div className="flex items-end max-w-full justify-center">
                 {playerHand.map((card, idx) => {
                   const isPlayable = currentPlayer === myRole && canPlayCard(card);
                   return (
                     <div key={card.id} className={`${idx === 0 ? '' : getDynamicCardMargin(playerHand.length)} relative transition-all duration-200 ${isPlayable && !isProcessingTurn ? 'z-30' : 'z-10'}`}>
                       <CardComponent
                          card={card}
                          active={isPlayable}
                          onClick={() => {
                            if (card.color === "wild") {
                              soundEngine.playSFX("click");
                              setPendingWild(card);
                            } else {
                              handleCardPlay(card);
                            }
                          }}
                       />
                     </div>
                   );
                 })}
               </div>
             </div>
          </div>
        </div>

        {/* WILD COLOR PICKER MODAL */}
        {pendingWild && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in touch-none">
                <div className="bg-[#18181b] border border-white/10 p-6 rounded-3xl shadow-2xl flex flex-col items-center">
                    <h2 className="text-sm font-headline font-black text-white mb-4 uppercase tracking-widest">Select Target Color</h2>
                    <div className="grid grid-cols-2 gap-4">
                        {COLORS.map((c) => (
                          <button key={c} onClick={() => { soundEngine.playSFX("click"); handleCardPlay(pendingWild, c); setPendingWild(null); }} className={`w-16 h-16 rounded-2xl border-2 shadow-lg transition-transform active:scale-95 touch-manipulation ${getCardBg(c)}`}></button>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* GAME OVER MODAL */}
        {winnerTeam !== null && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 animate-fade-in touch-none">
                <div className="flex flex-col items-center max-w-sm w-full bg-[#18181b] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden text-center">
                    <div className={`absolute -top-16 inset-x-0 h-40 rounded-full blur-3xl opacity-30 ${isUserVictory ? 'bg-[#CCFF00]' : 'bg-rose-600'}`}></div>
                    <div className="relative mb-6">
                        <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center shadow-2xl relative z-10 ${isUserVictory ? 'bg-gradient-to-tr from-[#CCFF00] to-emerald-400 border-[#CCFF00] ring-8 ring-[#CCFF00]/20 animate-bounce' : 'bg-gradient-to-tr from-rose-950 to-black border-rose-600 ring-8 ring-rose-600/20'}`}>
                            <span className="material-symbols-outlined text-5xl text-black font-black">{isUserVictory ? "emoji_events" : "heart_broken"}</span>
                        </div>
                    </div>
                    <h1 className={`text-3xl font-headline font-black uppercase italic tracking-wider mb-2 drop-shadow-md ${isUserVictory ? 'text-[#CCFF00]' : 'text-rose-500'}`}>{isUserVictory ? "VICTORY!" : "GAME OVER"}</h1>
                    <p className="text-neutral-400 text-xs font-semibold mb-8 px-2">{isUserVictory ? "Incredible card strategy!" : `${winnerPlayer?.name || "Opponent"} cleared their hand first.`}</p>
                    <button onClick={handleExit} className="w-full bg-[#CCFF00] hover:bg-[#b3e600] text-black font-headline font-black text-xs uppercase py-4 px-8 rounded-2xl shadow-xl transition-all active:scale-95 tracking-wider relative z-20 touch-manipulation">Back to Lobby</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
