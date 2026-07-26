"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import { soundEngine } from "../../lib/soundManager";

// 🤖 Import the Bot Utility for Joe Yoke
import { getRandomBotOpponent } from "../../lib/botUtils";

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
  // 1. Detect bot mode synchronously
  const isBotMode = Boolean(opponent?.isBot || preloadedMatchId?.startsWith("bot_"));

  // 2. Initialize View State (Bypasses menu when preloadedMatchId exists)
  const [view, setView] = useState<"menu" | "host" | "play" | "searching" | "confirmed">(
    isBotMode || preloadedMatchId ? "play" : "menu"
  );
  
  const [localOpponent, setLocalOpponent] = useState<any>(opponent || null);
  const [matchId, setMatchId] = useState<string | null>(
    preloadedMatchId || (isBotMode ? `bot_match_${Date.now()}` : null)
  );

  const [joinInput, setJoinInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 🌐 MULTIPLAYER NETWORK STATES
  const [channel, setChannel] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);

  // 🃏 UNO GAME STATES
  const [players, setPlayers] = useState<PlayerConfig[]>([]);
  const [hands, setHands] = useState<Record<number, Card[]>>({});
  const [deck, setDeck] = useState<Card[]>([]);
  const [discardPile, setDiscardPile] = useState<Card[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<number>(0);
  const [direction, setDirection] = useState<number>(1);
  const [activeColor, setActiveColor] = useState<CardColor>("red");
  const [statusMsg, setStatusMsg] = useState("");
  const [unoCalled, setUnoCalled] = useState<Record<number, boolean>>({});

  const [pendingWild, setPendingWild] = useState<Card | null>(null);
  const [winnerTeam, setWinnerTeam] = useState<number | null>(null);
  const [winnerPlayer, setWinnerPlayer] = useState<PlayerConfig | null>(null);

  const [isProcessingTurn, setIsProcessingTurn] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(TURN_TIME_LIMIT);

  const showToastMessage = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setMyUserId(session.user.id);
    });
  }, []);

  // 📡 SUPABASE REALTIME SYNC HUB
  useEffect(() => {
    if (!matchId || !myUserId || localOpponent?.isBot || view === "searching" || view === "confirmed") return;

    const matchChannel = supabase.channel(`uno_match_${matchId}`, {
      config: { broadcast: { self: false }, presence: { key: myUserId } },
    });

    matchChannel
      .on("broadcast", { event: "game_sync" }, (payload) => {
        // Broadcast sync payload handler
      })
      .on("presence", { event: "sync" }, () => {
        const state = matchChannel.presenceState();
        const users = Object.keys(state);
        setOpponentConnected(users.length > 1);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await matchChannel.track({ online_at: new Date().toISOString() });
        }
      });

    setChannel(matchChannel);
    return () => {
      matchChannel.untrack();
      supabase.removeChannel(matchChannel);
    };
  }, [matchId, myUserId, localOpponent, view]);

  useEffect(() => {
    if (view === "host" && opponentConnected) {
      startModeGame("quick");
      setView("play");
    }
  }, [opponentConnected, view]);

  const startModeGame = useCallback((modeId: ModeId, forcedOpponent?: any) => {
    soundEngine.playSFX("click");
    const isSpecial = modeId === "2v2" || modeId === "4p";
    let initialDeck = generateDeck(isSpecial);

    const opp = forcedOpponent || localOpponent;
    const oppName = opp?.name || "Player 2";
    const oppAvatar = opp?.avatarIcon || "🤖";

    let config: PlayerConfig[] = [];
    if (modeId === "quick") {
      config = [
        { id: 0, name: "You", avatar: "😎", isBot: false, team: 1, position: "bottom" },
        { id: 1, name: oppName, avatar: oppAvatar, isBot: true, team: 2, position: "top" },
      ];
    } else {
      config = [
        { id: 0, name: "You", avatar: "😎", isBot: false, team: 1, position: "bottom" },
        { id: 1, name: "Manar", avatar: "👩", isBot: true, team: 2, position: "left" },
        { id: 2, name: "Teammate", avatar: "🧑", isBot: true, team: 1, position: "top" },
        { id: 3, name: oppName, avatar: oppAvatar, isBot: true, team: 2, position: "right" },
      ];
    }

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

    setPlayers(config);
    setHands(initialHands);
    setUnoCalled(initialUnoCalls);
    setDiscardPile([firstCard]);
    setDeck(initialDeck);
    setActiveColor(firstCard.color);
    setCurrentPlayer(0);
    setDirection(1);
    setWinnerTeam(null);
    setWinnerPlayer(null);
    setIsProcessingTurn(false);
    setStatusMsg("Your Turn!");
    setTimeLeft(TURN_TIME_LIMIT);
    setView("play");
  }, [localOpponent]);

  // 🎯 AUTO-INITIALIZE ARENA ON DIRECT PLAYLOAD
  useEffect(() => {
    if (view === "play" && players.length === 0) {
      startModeGame("quick");
    }
  }, [view, players.length, startModeGame]);

  // --- MATCHMAKING & ROUTING FLOWS ---
  const startOnlineMatchmaking = () => {
    soundEngine.playSFX("click");
    setView("searching");
    setTimeout(() => {
      setView(prev => {
        if (prev === "searching") {
          setLocalOpponent(getRandomBotOpponent());
          return "confirmed";
        }
        return prev;
      });
    }, 2800);
  };

  const enterBotMatch = () => {
    soundEngine.playSFX("click");
    setMatchId(`bot_match_${Date.now()}`);
    showToastMessage(`Playing against ${localOpponent?.name || 'Bot'}`);
    startModeGame("quick", localOpponent);
  };

  const handleExit = () => {
    soundEngine.playSFX("click");
    if (matchId) setMatchId(null);
    if (onClose) {
      onClose();
    } else {
      setView("menu");
    }
  };

  // --- UNO MECHANICS ---
  const getNextPlayerIndex = (fromIdx: number, step = 1, currentDir = direction, totalPlayers = players.length) => {
    let next = (fromIdx + step * currentDir) % totalPlayers;
    if (next < 0) next += totalPlayers;
    return next;
  };

  const drawCardForPlayer = (pId: number, count = 1) => {
    soundEngine.playSFX("card_flip");
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

    if ((hands[pId]?.length || 0) + count > 1) {
      setUnoCalled(prev => ({ ...prev, [pId]: false }));
    }
  };

  const canPlayCard = (card: Card) => {
    const topCard = discardPile[discardPile.length - 1];
    if (!topCard) return false;
    if (card.color === "wild") return true;
    if (card.color === activeColor) return true;
    if (card.value === topCard.value) return true;
    return false;
  };

  const handleCallUno = () => {
    soundEngine.playSFX("beep");
    setUnoCalled(prev => ({ ...prev, 0: true }));
    setStatusMsg("UNO! 📢");
  };

  const executePlay = (card: Card, pId: number, chosenColor?: CardColor) => {
    setIsProcessingTurn(true);
    const pConfig = players.find(p => p.id === pId)!;
    const remainingAfterPlay = (hands[pId]?.length || 0) - 1;

    // SFX Trigger for special cards or normal placement
    if (["draw2", "wild4", "skip", "reverse"].includes(card.value)) {
      soundEngine.playSFX("laser");
    } else {
      soundEngine.playSFX("card_flip");
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
        setStatusMsg("You forgot UNO! +2 Cards Penalty! ⚠️");
        drawCardForPlayer(pId, 2);
      }
    }
   
    setHands(prev => ({
      ...prev,
      [pId]: prev[pId].filter(c => c.id !== card.id)
    }));

    setDiscardPile(prev => [...prev, card]);
    setActiveColor(chosenColor || card.color);

    if (remainingAfterPlay === 0) {
      setWinnerPlayer(pConfig);
      setWinnerTeam(pConfig.team);
      setStatusMsg(`${pConfig.name} Wins!`);

      const isUserWin = pConfig.team === players[0]?.team;
      soundEngine.playSFX(isUserWin ? "victory" : "defeat");
      return;
    }

    let nextDir = direction;
    let nextP = getNextPlayerIndex(pId, 1, nextDir);

    if (card.value === "reverse") {
      if (players.length === 2) {
        nextP = pId;
      } else {
        nextDir = direction * -1;
        setDirection(nextDir);
        nextP = getNextPlayerIndex(pId, 1, nextDir);
      }
      setStatusMsg("Reverse!");
    } else if (card.value === "skip") {
      nextP = getNextPlayerIndex(pId, 2, nextDir);
      setStatusMsg(`${players[getNextPlayerIndex(pId, 1, nextDir)].name} Skipped!`);
    } else if (card.value === "draw2") {
      drawCardForPlayer(nextP, 2);
      const skippedP = nextP;
      nextP = getNextPlayerIndex(nextP, 1, nextDir);
      setStatusMsg(`${players[skippedP].name} draws +2!`);
    } else if (card.value === "wild4") {
      drawCardForPlayer(nextP, 4);
      const skippedP = nextP;
      nextP = getNextPlayerIndex(nextP, 1, nextDir);
      setStatusMsg(`${players[skippedP].name} draws +4!`);
    } else {
      const nextPlayerObj = players[nextP];
      setStatusMsg(nextPlayerObj.isBot ? `${nextPlayerObj.name} played card` : "Your Turn!");
    }

    setTimeout(() => {
      setCurrentPlayer(nextP);
      setIsProcessingTurn(false);
    }, 600);
  };

  // --- TIMER LOGIC ---
  useEffect(() => {
    if (view !== "play" || winnerTeam !== null) return;

    if (currentPlayer === 0) {
      setTimeLeft(TURN_TIME_LIMIT);

      const timerInterval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 0.2) {
            clearInterval(timerInterval);
            const myCards = hands[0] || [];
            const playable = myCards.filter((c) => canPlayCard(c));

            if (playable.length > 0) {
              const randomCard = playable[Math.floor(Math.random() * playable.length)];
              let chosenColor = randomCard.color;
              if (randomCard.color === "wild") {
                chosenColor = COLORS[Math.floor(Math.random() * COLORS.length)];
              }
              setPendingWild(null);
              executePlay(randomCard, 0, chosenColor);
            } else {
              drawCardForPlayer(0, 1);
              const nextP = getNextPlayerIndex(0, 1);
              setCurrentPlayer(nextP);
            }
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);

      return () => clearInterval(timerInterval);
    }
  }, [currentPlayer, view, winnerTeam, hands, activeColor, discardPile]);

  // --- HUMAN-LIKE BOT LOGIC ---
  useEffect(() => {
    if (view !== "play" || winnerTeam !== null) return;
    const currentPObj = players[currentPlayer];
    if (!currentPObj || !currentPObj.isBot) return;

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
        const nextP = getNextPlayerIndex(currentPObj.id, 1);
        setCurrentPlayer(nextP);
      }
    }, thinkingDelay);

    return () => clearTimeout(botTimer);
  }, [currentPlayer, hands, discardPile, activeColor, winnerTeam, view, players]);

  // --- UI RENDER HELPERS ---
  const getCardBg = (color: CardColor) => {
    switch(color) {
      case "red": return "bg-red-500 border-red-700";
      case "blue": return "bg-blue-500 border-blue-700";
      case "green": return "bg-green-500 border-green-700";
      case "yellow": return "bg-yellow-400 border-yellow-600";
      default: return "bg-slate-800 border-slate-950";
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
        <div className="w-[68px] h-[98px] rounded-lg bg-slate-950 border-2 border-slate-700 flex items-center justify-center shadow-2xl shrink-0 relative overflow-hidden">
           <div className="absolute inset-2 border-2 border-red-500/50 rounded-full rotate-45 opacity-60"></div>
           <span className="text-red-500 font-black italic -rotate-12 text-sm select-none drop-shadow">UNO</span>
        </div>
      );
    }

    return (
      <button
        onClick={onClick}
        disabled={!active || isProcessingTurn}
        className={`w-[68px] h-[98px] rounded-lg border-2 ${getCardBg(card.color)} flex flex-col items-center justify-center p-1 shadow-2xl shrink-0 relative overflow-hidden transform transition-all duration-300 ${
          active && !isProcessingTurn
            ? '-translate-y-8 z-30 ring-4 ring-amber-300 shadow-[0_0_22px_rgba(252,211,77,0.85)] scale-105 cursor-pointer hover:-translate-y-10 brightness-100'
            : 'brightness-75 cursor-not-allowed translate-y-0'
        } ${card.color === 'wild' ? 'bg-gradient-to-br from-red-500 via-blue-500 to-green-500' : ''}`}
      >
        <div className="absolute top-1 left-1 text-white font-black text-[10px] drop-shadow">{renderCardValue(card.value)}</div>
        <div className="w-10 h-13 bg-white rounded-full flex items-center justify-center shadow-inner transform -rotate-12">
           <span className={`font-black text-xl drop-shadow-sm ${card.color === 'yellow' ? 'text-yellow-500' : card.color === 'red' ? 'text-red-500' : card.color === 'blue' ? 'text-blue-500' : card.color === 'green' ? 'text-green-500' : 'text-slate-800'}`}>
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

  // LOBBY / MENU VIEW
  if (view === "menu") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center font-body text-white px-6 animate-fade-in">
        {toast && (
          <div className="absolute top-24 z-[300] bg-red-500/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl font-headline font-bold text-sm shadow-2xl animate-fade-in border border-red-400">
            {toast}
          </div>
        )}
        
        <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-6 shadow-2xl border border-white/5 flex flex-col relative overflow-hidden">
          
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
              <span className="material-symbols-outlined text-2xl text-neutral-300">style</span>
            </div>
            <div>
              <h1 className="font-headline font-black text-xl tracking-tight text-white">Uno Arena</h1>
              <p className="text-xs text-neutral-400 font-medium mt-0.5">Select engagement mode</p>
            </div>
          </div>

          <button onClick={startOnlineMatchmaking} className="group relative w-full bg-[#09090b] border border-white/10 hover:border-[#CCFF00]/50 rounded-[24px] p-5 mb-4 text-left transition-all hover:bg-white/5">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-[#CCFF00]/10 rounded-xl flex items-center justify-center text-[#CCFF00]">
                <span className="material-symbols-outlined text-xl">search</span>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="bg-[#CCFF00]/10 text-[#CCFF00] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">Popular</span>
                <div className="w-7 h-7 rounded-full bg-[#CCFF00] flex items-center justify-center text-black opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
                  <span className="material-symbols-outlined text-sm font-black">arrow_forward</span>
                </div>
              </div>
            </div>
            <h3 className="font-headline font-black text-lg text-white mb-1 group-hover:text-[#CCFF00] transition-colors">Find Online Match</h3>
            <p className="text-xs text-neutral-400 font-medium leading-relaxed">Ranked & casual global<br/>matchmaking</p>
          </button>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button onClick={() => { soundEngine.playSFX("click"); setMatchId(Math.random().toString(36).substring(2, 8).toUpperCase()); setView("host"); }} className="group bg-[#09090b] border border-white/10 hover:border-teal-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px]">
              <div className="flex justify-between items-start w-full">
                <div className="w-9 h-9 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-400">
                  <span className="material-symbols-outlined text-lg">dns</span>
                </div>
                <span className="bg-teal-500/10 text-teal-400 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">Private</span>
              </div>
              <div>
                <h3 className="font-headline font-bold text-sm text-white mb-0.5">Host Match</h3>
                <p className="text-[10px] text-neutral-400 font-medium">Create room code</p>
              </div>
            </button>

            <button onClick={() => startModeGame("quick")} className="group bg-[#09090b] border border-white/10 hover:border-pink-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px]">
              <div className="flex justify-between items-start w-full">
                <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center text-pink-400">
                  <span className="material-symbols-outlined text-lg">sports_esports</span>
                </div>
                <span className="bg-pink-500/10 text-pink-400 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">Offline</span>
              </div>
              <div>
                <h3 className="font-headline font-bold text-sm text-white mb-0.5">Pass & Play</h3>
                <p className="text-[10px] text-neutral-400 font-medium">Local device</p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full mb-6">
            <div className="relative flex-1 min-w-0 flex items-center bg-[#09090b] border border-white/10 rounded-2xl p-1.5">
              <div className="pl-3 pr-2 text-neutral-500 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">vpn_key</span>
              </div>
              <input
                type="text"
                placeholder="ENTER ROOM CODE..."
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                className="flex-1 min-w-0 bg-transparent text-sm font-headline font-bold text-white placeholder-neutral-600 focus:outline-none uppercase tracking-widest"
                maxLength={6}
              />
            </div>
            <button
              onClick={() => { if (joinInput.length >= 4) { soundEngine.playSFX("click"); setMatchId(joinInput.trim().toUpperCase()); setView("play"); } }}
              disabled={joinInput.length < 4}
              className="shrink-0 bg-[#18181b] hover:bg-white/10 disabled:opacity-50 text-white px-5 py-3.5 rounded-2xl font-headline font-bold text-xs tracking-wider transition-all border border-white/5"
            >
              Join
            </button>
          </div>

          <button onClick={handleExit} className="w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-headline text-[10px] font-bold tracking-widest uppercase">
            <span className="material-symbols-outlined text-sm">logout</span> EXIT ARENA
          </button>
        </div>
      </div>
    );
  }

  // LOCATING OPPONENT SCREEN
  if (view === "searching") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in font-body">
        <div className="relative w-32 h-32 flex items-center justify-center mb-8">
          <div className="absolute inset-0 border border-[#CCFF00]/30 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
          <div className="absolute inset-4 border border-[#CCFF00]/20 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }}></div>
          <div className="absolute inset-8 border border-[#CCFF00]/10 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }}></div>
          <div className="w-16 h-16 bg-[#CCFF00]/10 rounded-full flex items-center justify-center border border-[#CCFF00]/20 relative z-10">
            <span className="material-symbols-outlined text-3xl text-[#CCFF00]">search</span>
          </div>
        </div>
        <h2 className="font-headline font-black text-2xl text-white mb-2">Locating Opponent</h2>
        <p className="text-sm text-[#CCFF00] font-bold mb-12 animate-pulse">Searching global matchmaking pool...</p>
        <button onClick={() => { soundEngine.playSFX("click"); setView("menu"); }} className="bg-[#18181b] text-white px-8 py-3 rounded-full font-headline font-bold text-sm border border-white/10 hover:bg-white/10 transition-colors active:scale-95">
          Abort Search
        </button>
      </div>
    );
  }

  // MATCH CONFIRMED SCREEN
  if (view === "confirmed") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in font-body">
        <div className="bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[#CCFF00] px-4 py-1.5 rounded-full font-headline font-black text-xs tracking-widest mb-10 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">auto_awesome</span> MATCH CONFIRMED
        </div>
        
        <div className="flex items-center gap-6 mb-8 relative">
          <div className="w-20 h-20 bg-[#18181b] rounded-2xl border border-white/10 flex items-center justify-center rotate-[-5deg] shadow-2xl relative z-10">
            <span className="material-symbols-outlined text-4xl text-white opacity-50">person</span>
          </div>
          
          <div className="absolute left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#CCFF00] flex items-center justify-center z-20 shadow-[0_0_20px_rgba(204,255,0,0.4)]">
            <span className="material-symbols-outlined text-black text-sm font-black">close</span>
          </div>
          
          <div className="w-20 h-20 bg-indigo-500/20 rounded-2xl border border-indigo-500/30 flex items-center justify-center rotate-[5deg] shadow-2xl overflow-hidden relative z-10">
            <span className="material-symbols-outlined text-4xl text-indigo-400">
              {localOpponent?.avatarIcon || "person"}
            </span>
          </div>
        </div>

        <p className="text-[10px] text-neutral-500 font-bold tracking-widest uppercase mb-1">Opposing Player</p>
        <h2 className="font-headline font-black text-3xl text-white mb-2">{localOpponent?.name || "Player 2"}</h2>
        <p className="text-sm text-neutral-400 flex items-center gap-2 mb-12">
          <span className="w-2 h-2 rounded-full bg-[#CCFF00]"></span> Ranked • {localOpponent?.elo || 1200} ELO
        </p>

        <button onClick={enterBotMatch} className="w-full max-w-[280px] bg-[#CCFF00] hover:bg-[#b3e600] text-black py-4 rounded-2xl font-headline font-black text-lg flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-[0_0_30px_rgba(204,255,0,0.2)]">
          Enter Match <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    );
  }

  // HOST WAITING VIEW
  if (view === "host") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col font-body text-white">
        <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={handleExit} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
          <div className="text-center">
            <h2 className="font-headline font-black text-sm uppercase tracking-widest">Uno Room</h2>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              <span className="font-caps text-[9px] font-bold tracking-widest text-red-400">CONNECTING...</span>
            </div>
          </div>
          <div className="w-10 h-10"></div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-8 shadow-2xl border border-white/5 flex flex-col items-center text-center">
            <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 border-4 border-red-500/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-red-500 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h3 className="font-headline font-black text-xl tracking-tight mb-8">AWAITING OPPONENT</h3>
            <p className="font-caps text-[10px] font-bold tracking-[0.2em] text-neutral-500 mb-3 uppercase">Share This Room Code</p>
            
            <div className="w-full flex items-center justify-between bg-black/40 border border-white/10 rounded-2xl p-2 pl-6 mb-6">
              <span className="font-headline font-bold text-2xl tracking-[0.3em] text-red-400">{matchId}</span>
              <button
                onClick={() => { soundEngine.playSFX("click"); navigator.clipboard.writeText(matchId!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl transition-colors text-xs font-bold tracking-wider"
              >
                <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>

            <button onClick={handleExit} className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 rounded-2xl py-4 font-headline font-bold text-sm tracking-wide transition-all border border-white/5">
              CANCEL MATCH
            </button>
          </div>
        </div>
      </div>
    );
  }

  // GAMEPLAY ARENA
  const topPlayer = players.find(p => p.position === "top");
  const leftPlayer = players.find(p => p.position === "left");
  const rightPlayer = players.find(p => p.position === "right");
  const isTeammate = topPlayer && topPlayer.team === players[0]?.team && players[0]?.team > 0;
  const playerHand = hands[0] || [];
  const playerHasPlayableCard = playerHand.some(c => canPlayCard(c));
  const isUserVictory = winnerTeam === players[0]?.team;
  const isUserDrawRequired = currentPlayer === 0 && !playerHasPlayableCard && !isProcessingTurn;

  return (
    <div className="fixed inset-0 bg-[#0a111e] text-white flex flex-col font-sans overflow-hidden select-none z-[100]">
      {/* HEADER */}
      <div className="w-full h-12 bg-[#0d1626] border-b border-slate-800/80 flex items-center justify-between px-4 shrink-0 shadow-md relative z-30 pt-safe">
        <button onClick={handleExit} className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition">
           <span className="material-symbols-outlined text-sm">arrow_back</span>
        </button>
        <span className="font-extrabold text-sm tracking-widest text-red-500 italic">UNO <span className="text-white not-italic">MATRIX</span></span>
        <div className="w-8 flex items-center justify-center">
            {matchId && !localOpponent?.isBot && !opponentConnected && (
               <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            )}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between relative min-h-0 overflow-hidden p-2 bg-[#022c22]">
        {/* CASINO/GAME FELT TABLE BOARD CONTAINER */}
        <div className="absolute inset-2 rounded-[40px] border-[6px] border-[#064e3b] shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#065f46] via-[#047857] to-[#022c22] flex flex-col justify-between overflow-hidden">
          
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
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full border shadow-2xl backdrop-blur-md ${currentPlayer === topPlayer.id ? 'bg-blue-600/90 border-blue-400 ring-2 ring-blue-400 animate-pulse' : 'bg-slate-950/80 border-emerald-800'}`}>
                  <span className="text-base">{topPlayer.avatar}</span>
                  <span className="text-xs font-bold text-white">{topPlayer.name}</span>
                  <span className="bg-slate-900 text-amber-400 text-xs font-black px-2 py-0.5 rounded-full border border-slate-700">
                    {hands[topPlayer.id]?.length || 0}
                  </span>
              </div>
            </div>
          )}

          {/* MIDDLE TABLE AREA */}
          <div className="flex-1 min-h-0 flex items-center justify-between px-2 relative z-10">
             
              {/* LEFT OPPONENT */}
              {leftPlayer ? (
                <div className="flex flex-col items-center gap-2 relative">
                  <div className={`flex flex-col items-center px-2.5 py-1.5 rounded-2xl border shadow-2xl backdrop-blur-md ${currentPlayer === leftPlayer.id ? 'bg-blue-600/90 border-blue-400 ring-2 ring-blue-400 animate-pulse' : 'bg-slate-950/80 border-emerald-800'}`}>
                      <span className="text-xl">{leftPlayer.avatar}</span>
                      <span className="text-[10px] font-bold text-white max-w-[55px] truncate">{leftPlayer.name}</span>
                      <span className="bg-slate-900 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-slate-700 mt-1">
                        {hands[leftPlayer.id]?.length || 0}
                      </span>
                  </div>
                  <div className="flex flex-col -space-y-[64px] my-1">
                      {Array.from({ length: Math.min(hands[leftPlayer.id]?.length || 0, 7) }).map((_, i) => (
                        <div key={i} className="transform -rotate-90">
                          <CardComponent card={{} as Card} hidden={true} />
                        </div>
                      ))}
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
                            <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-2xl border border-amber-200 tracking-wider uppercase whitespace-nowrap">
                              Tap to Draw
                            </span>
                            <span className="text-amber-300 text-lg font-black leading-none drop-shadow-lg">👇</span>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            if (isUserDrawRequired) {
                              drawCardForPlayer(0, 1);
                              const nextP = getNextPlayerIndex(0, 1);
                              setCurrentPlayer(nextP);
                            }
                          }}
                          disabled={!isUserDrawRequired}
                          className={`relative group transform transition-all duration-300 ${
                            isUserDrawRequired ? 'hover:-translate-y-2 active:scale-95 cursor-pointer scale-105 opacity-100' : 'opacity-70 cursor-not-allowed scale-100'
                          }`}
                        >
                            <div className="absolute top-1 left-1 w-[68px] h-[98px] rounded-lg bg-slate-900 border border-slate-800 -z-10 shadow-md"></div>
                            <div className="absolute top-2 left-2 w-[68px] h-[98px] rounded-lg bg-slate-950 border border-slate-800 -z-20 shadow-md"></div>
                            <div className={`w-[68px] h-[98px] rounded-lg bg-slate-950 border-2 transition-all flex flex-col items-center justify-center shadow-2xl relative overflow-hidden ${
                              isUserDrawRequired ? 'border-amber-300 ring-4 ring-amber-400/80 shadow-[0_0_30px_rgba(251,191,36,0.9)] animate-pulse' : 'border-slate-700'
                            }`}>
                                <div className="absolute inset-2 border-2 border-red-500/50 rounded-full rotate-45 opacity-60"></div>
                                <span className="text-red-500 font-black italic -rotate-12 text-sm drop-shadow">UNO</span>
                            </div>
                        </button>
                      </div>

                      {/* DISCARD PILE */}
                      <div className="relative">
                          {discardPile.length > 0 && <CardComponent card={discardPile[discardPile.length - 1]} active={false} />}
                          <div className="absolute -inset-2.5 border-[3px] rounded-xl z-0 pointer-events-none transition-colors duration-500 shadow-xl"
                               style={{ borderColor: activeColor === 'red' ? '#ef4444' : activeColor === 'blue' ? '#3b82f6' : activeColor === 'green' ? '#22c55e' : activeColor === 'yellow' ? '#eab308' : '#334155' }}>
                          </div>
                      </div>
                  </div>

                  {statusMsg && (
                    <div className="mt-4 px-3.5 py-1 bg-slate-950/90 border border-emerald-700 text-amber-400 text-xs font-bold rounded-full shadow-2xl backdrop-blur-md">
                      {statusMsg}
                    </div>
                  )}
              </div>

              {/* RIGHT OPPONENT */}
              {rightPlayer ? (
                <div className="flex flex-col items-center gap-2 relative">
                  <div className={`flex flex-col items-center px-2.5 py-1.5 rounded-2xl border shadow-2xl backdrop-blur-md ${currentPlayer === rightPlayer.id ? 'bg-blue-600/90 border-blue-400 ring-2 ring-blue-400 animate-pulse' : 'bg-slate-950/80 border-emerald-800'}`}>
                      <span className="text-xl">{rightPlayer.avatar}</span>
                      <span className="text-[10px] font-bold text-white max-w-[55px] truncate">{rightPlayer.name}</span>
                      <span className="bg-slate-900 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-slate-700 mt-1">
                        {hands[rightPlayer.id]?.length || 0}
                      </span>
                  </div>
                  <div className="flex flex-col -space-y-[64px] my-1">
                      {Array.from({ length: Math.min(hands[rightPlayer.id]?.length || 0, 7) }).map((_, i) => (
                        <div key={i} className="transform rotate-90">
                          <CardComponent card={{} as Card} hidden={true} />
                        </div>
                      ))}
                  </div>
                </div>
              ) : <div className="w-16"></div>}
          </div>

          {/* BOTTOM: YOUR HAND & FLOATING UNO EMBLEM */}
          <div className="w-full flex flex-col relative z-20 shrink-0 pb-16">
             
             {/* YOUR AVATAR BADGE WITH INLINE COVER FILLING TIMER OVERLAY */}
             <div className="flex items-center justify-center mb-4">
                <div className={`relative flex items-center gap-2 px-3 py-1 rounded-full border shadow-2xl overflow-hidden backdrop-blur-md ${currentPlayer === 0 ? 'border-amber-300 ring-2 ring-amber-400/50' : 'bg-slate-950/80 border-emerald-800'}`}>
                   
                    {currentPlayer === 0 && (
                      <div
                        className="absolute inset-0 bg-blue-600 transition-all duration-100 ease-linear z-0"
                        style={{ width: `${(timeLeft / TURN_TIME_LIMIT) * 100}%` }}
                      />
                    )}
                    <div className="absolute inset-0 bg-slate-900 -z-10" />

                    <span className="text-sm relative z-10">😎</span>
                    <span className="text-xs font-bold text-white relative z-10">You</span>
                    <span className="bg-slate-900/90 text-amber-400 text-xs font-black px-2 py-0.5 rounded-full border border-slate-700/80 relative z-10 shadow-inner">
                      {playerHand.length}
                    </span>
                </div>
             </div>

             {/* YOUR HAND CARDS CONTAINER WITH WELL-SPACED FLOATING UNO BUTTON */}
             <div className="w-full px-2 pt-8 pb-4 flex justify-center items-center overflow-visible relative">
              
               {/* FLOATING UNO BUTTON */}
               <button
                  onClick={handleCallUno}
                  disabled={unoCalled[0] || playerHand.length !== 2}
                  className={`absolute right-2 -top-20 z-50 transform transition-all duration-300 ${
                    unoCalled[0] ? "scale-90 opacity-80" : playerHand.length === 2 ? "animate-bounce scale-110 active:scale-95 cursor-pointer" : "opacity-40 cursor-not-allowed scale-95"
                  }`}
               >
                  <div className={`w-20 h-14 rounded-[50%] flex items-center justify-center p-1.5 transform -rotate-12 transition-all shadow-2xl ${
                    unoCalled[0] ? "bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.9)]" : playerHand.length === 2 ? "bg-amber-300 shadow-[0_0_30px_rgba(250,204,21,1)]" : "bg-slate-800"
                  }`}>
                      <div className="w-full h-full rounded-[50%] bg-gradient-to-br from-red-500 via-red-600 to-red-800 border-2 border-white flex items-center justify-center relative overflow-hidden shadow-inner">
                         <div className="absolute inset-0 bg-white/25 -skew-y-12 transform -translate-y-2"></div>
                         <span className="font-black italic text-yellow-300 text-base tracking-tighter transform -rotate-6 drop-shadow-[0_2px_3px_rgba(0,0,0,0.95)]">
                           UNO
                         </span>
                      </div>
                  </div>
               </button>

               {/* DYNAMIC HAND CARDS */}
               <div className="flex items-end max-w-full justify-center">
                 {playerHand.map((card, idx) => {
                   const isPlayable = currentPlayer === 0 && canPlayCard(card);
                   return (
                     <div
                       key={card.id}
                       className={`${idx === 0 ? '' : getDynamicCardMargin(playerHand.length)} relative transition-all duration-300 ${
                         isPlayable && !isProcessingTurn ? 'z-30' : 'z-10'
                       }`}
                     >
                       <CardComponent
                          card={card}
                          active={isPlayable}
                          onClick={() => {
                            if (card.color === "wild") {
                              soundEngine.playSFX("click");
                              setPendingWild(card);
                            } else {
                              executePlay(card, 0);
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
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl flex flex-col items-center">
                    <h2 className="text-lg font-black text-white mb-4 uppercase tracking-widest">Select Color</h2>
                    <div className="grid grid-cols-2 gap-4">
                        {COLORS.map((c) => (
                          <button key={c} onClick={() => { soundEngine.playSFX("click"); executePlay(pendingWild, 0, c); setPendingWild(null); }} className={`w-16 h-16 rounded-xl border-2 shadow-lg transition-transform active:scale-95 ${getCardBg(c)}`}></button>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* GAME OVER / VICTORY MODAL */}
        {winnerTeam !== null && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 animate-fadeIn">
                <div className="flex flex-col items-center max-w-sm w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden text-center">
                   
                    <div className={`absolute -top-16 inset-x-0 h-40 rounded-full blur-3xl opacity-40 ${isUserVictory ? 'bg-amber-400' : 'bg-red-600'}`}></div>

                    {isUserVictory && (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden">
                         <div className="absolute top-4 left-6 text-xl animate-bounce">✨</div>
                         <div className="absolute top-8 right-8 text-2xl animate-pulse">🎉</div>
                         <div className="absolute bottom-12 left-8 text-lg animate-bounce">⭐</div>
                         <div className="absolute top-1/2 right-4 text-xl animate-pulse">🌟</div>
                      </div>
                    )}

                    <div className="relative mb-6">
                        <div className={`w-28 h-28 rounded-full border-4 flex items-center justify-center shadow-2xl relative z-10 ${
                          isUserVictory ? 'bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 border-amber-200 ring-8 ring-amber-400/30 animate-bounce' : 'bg-gradient-to-tr from-slate-800 to-slate-900 border-slate-700 ring-8 ring-slate-800/50'
                        }`}>
                            <span className="text-6xl drop-shadow-lg">
                              {isUserVictory ? "🏆" : "💔"}
                            </span>
                        </div>
                    </div>

                    <h1 className={`text-4xl font-black uppercase italic tracking-wider mb-2 drop-shadow-md ${
                      isUserVictory ? 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-green-300 to-emerald-500' : 'text-red-500'
                    }`}>
                        {isUserVictory ? "VICTORY!" : "GAME OVER"}
                    </h1>

                    <p className="text-slate-300 text-sm font-semibold mb-8 px-2">
                      {isUserVictory ? "Congratulations! You won the match." : `${winnerPlayer?.name || "Opponent"} won the match.`}
                    </p>

                    <button
                      onClick={handleExit}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black text-sm uppercase py-3.5 px-8 rounded-2xl shadow-xl transition-all active:scale-95 border border-blue-400/30 tracking-wider relative z-20"
                    >
                        Back to Lobby
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}