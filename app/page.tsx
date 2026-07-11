"use client";

import { useState } from "react";
import Image from "next/image";

import GamesTab from "../components/GamesTab";
import ChatTab from "../components/ChatTab";
import ProfileTab from "../components/ProfileTab";
import GamePlayer from "../components/GamePlayer";
import GlitchDeck from "../components/games/GlitchDeck"; // 🚀 Imported native game engine file

export default function Home() {
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [activeTab, setActiveTab] = useState("Games");
  
  // Tracks if a game is open (can be a web URL or a native identifier like "native://glitch-deck")
  const [playingGame, setPlayingGame] = useState<string | null>(null);

  return (
    <>
      {/* 🚀 LAUNCH ENGINE INTERCEPTOR: Intercepts native component keys or handles standard web frame routes */}
      {playingGame === "native://glitch-deck" ? (
        <GlitchDeck onClose={() => setPlayingGame(null)} />
      ) : playingGame ? (
        <GamePlayer gameUrl={playingGame} onClose={() => setPlayingGame(null)} />
      ) : null}

      {/* Hide the primary layout context if any app module layer is executing */}
      <div className={playingGame ? "hidden" : "block"}>
        <header className="fixed top-0 left-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4 h-20 pt-safe">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-primary/30">
              <Image src="https://i.pravatar.cc/150?img=11" alt="Avatar" fill className="object-cover" unoptimized />
            </div>
            {/* 🏷️ Branded App Header Label */}
            <span className="text-2xl font-extrabold tracking-tighter text-primary">JOE YOKE</span>
          </div>
        </header>

        <main className="pt-28 px-4 max-w-2xl mx-auto pb-28">
          {activeTab === "Games" && (
            <GamesTab 
              rewardClaimed={rewardClaimed} 
              setRewardClaimed={setRewardClaimed}
              onPlay={(url) => setPlayingGame(url)} 
            />
          )}
          {activeTab === "Chat" && <ChatTab />}
          {activeTab === "Profile" && <ProfileTab />}
        </main>

        <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-20 pb-safe px-4 bg-surface/90 backdrop-blur-xl border-t border-white/10">
          {["Games", "Chat", "Profile"].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center justify-center transition-all active:scale-90 ${activeTab === tab ? "text-primary" : "text-on-surface-variant"}`}
            >
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: activeTab === tab ? "'FILL' 1" : "'FILL' 0" }}>
                {tab === "Games" ? "sports_esports" : tab === "Chat" ? "forum" : "person"}
              </span>
              <span className="text-[10px] font-bold mt-1">{tab}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}