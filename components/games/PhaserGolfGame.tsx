"use client";

import { useEffect, useRef, useState } from 'react';
import * as Colyseus from 'colyseus.js';

// Updated interface to include Colyseus's built-in schema listener signature
interface ServerPlayer {
  userId: string;
  strokes: number;
  isReady: boolean;
  onChange: (callback: () => void) => void;
}

export default function PhaserGolfGame() {
  const gameRef = useRef<HTMLDivElement>(null);
  const gameInstance = useRef<any>(null);
  const roomRef = useRef<Colyseus.Room | null>(null);

  // --- React HUD States ---
  const [isConnected, setIsConnected] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<string>("");
  const [mySessionId, setMySessionId] = useState<string>("");
  const [playerScores, setPlayerScores] = useState<Map<string, number>>(new Map());
  const [matchStatus, setMatchStatus] = useState<string>("Waiting for players...");

  useEffect(() => {
    if (typeof window === 'undefined' || !gameRef.current || gameInstance.current) {
      return;
    }

    const initPhaser = async () => {
      const Phaser = await import('phaser');

      class GolfScene extends Phaser.Scene {
        client!: Colyseus.Client;
        aimLine!: Phaser.GameObjects.Graphics;
        playerBalls: Map<string, Phaser.GameObjects.Arc> = new Map();
        
        isAiming = false;
        dragStart = { x: 0, y: 0 };

        constructor() {
          super({ key: 'GolfScene' });
        }

        init() {
          this.client = new Colyseus.Client('ws://localhost:2567');
        }

        async create() {
          const width = this.cameras.main.width;
          const height = this.cameras.main.height;

          // 1. Mowed Grass Court Layout
          const graphics = this.add.graphics();
          graphics.fillStyle(0x386b2c, 1);
          graphics.fillRect(0, 0, width, height);
          graphics.fillStyle(0x315e26, 1);
          for (let i = 0; i < height; i += 80) {
            graphics.fillRect(0, i + 40, width, 40);
          }

          // 2. The Target Hole
          this.add.circle(width / 2, height * 0.15, 18, 0x1f2937);
          this.add.circle(width / 2, height * 0.15, 12, 0x030712);

          // 3. Aim Vector Graphic Renderer
          this.aimLine = this.add.graphics();

          // --- 4. SECURE MULTIPLAYER ENGINE SYNC ---
          try {
            const room = await this.client.joinOrCreate("golf_room", {
              userId: `Player_${Math.floor(Math.random() * 900) + 100}`
            });
            
            roomRef.current = room;
            setMySessionId(room.sessionId);
            setIsConnected(true);

            if (room.state.currentTurn) setCurrentTurn(room.state.currentTurn);

            // Player Spawn Listener
            room.state.players.onAdd((playerState: ServerPlayer, sessionId: string) => {
              const isLocal = sessionId === room.sessionId;
              const ballColor = isLocal ? 0xffffff : 0xfacc15;

              const ball = this.add.circle(width / 2, height * 0.85, 11, ballColor);
              ball.setStrokeStyle(2, 0x1e293b);
              
              this.physics.add.existing(ball);
              const body = ball.body as Phaser.Physics.Arcade.Body;
              body.setCollideWorldBounds(true);
              body.setBounce(0.65, 0.65);
              body.setDrag(0.96, 0.96);
              body.useDamping = true;

              this.playerBalls.set(sessionId, ball);

              // Update Scoreboards when a player state alters (e.g. Strokes updated)
              playerState.onChange(() => {
                setPlayerScores((prev) => {
                  const newScores = new Map(prev);
                  newScores.set(sessionId, playerState.strokes);
                  return newScores;
                });
              });
            });

            // Player Disconnect Cleanup
            room.state.players.onRemove((playerState: ServerPlayer, sessionId: string) => {
              const ball = this.playerBalls.get(sessionId);
              if (ball) {
                ball.destroy();
                this.playerBalls.delete(sessionId);
              }
              setPlayerScores((prev) => {
                const newScores = new Map(prev);
                newScores.delete(sessionId);
                return newScores;
              });
            });

            // Listen for Global State Changes
            room.onStateChange((state: any) => {
              if (state.currentTurn) setCurrentTurn(state.currentTurn);
              if (state.matchStatus) {
                setMatchStatus(state.matchStatus === "playing" ? "Match Live ⛳" : "Waiting for Opponent...");
              }
            });

            // Physics Trajectory Broadcast Receiver
            room.onMessage("ball_struck", (message: { sessionId: string, vx: number, vy: number }) => {
              const targetedBall = this.playerBalls.get(message.sessionId);
              if (targetedBall) {
                const body = targetedBall.body as Phaser.Physics.Arcade.Body;
                body.setVelocity(message.vx, message.vy);
              }
            });

          } catch (networkError) {
            console.error("Colyseus Engine Connection Failed:", networkError);
            setMatchStatus("Connection Failed ❌");
          }

          // --- 5. INTERACTIVE INPUT CONTROLS ---
          this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const room = roomRef.current;
            if (!room || room.state.currentTurn !== room.sessionId) return;

            const localBall = this.playerBalls.get(room.sessionId);
            if (!localBall) return;

            const body = localBall.body as Phaser.Physics.Arcade.Body;
            if (body.velocity.length() < 12) {
              body.setVelocity(0, 0); 
              this.isAiming = true;
              this.dragStart = { x: pointer.x, y: pointer.y };
            }
          });

          this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            const room = roomRef.current;
            if (!this.isAiming || !room) return;
            
            const localBall = this.playerBalls.get(room.sessionId);
            if (!localBall) return;

            this.aimLine.clear();
            const dx = this.dragStart.x - pointer.x;
            const dy = this.dragStart.y - pointer.y;
            
            const dist = Math.sqrt(dx * dx + dy * dy);
            let lineColor = 0x22c55e; 
            if (dist > 160) lineColor = 0xef4444; 
            else if (dist > 80) lineColor = 0xeab308; 

            this.aimLine.lineStyle(4, lineColor, 0.85);
            this.aimLine.beginPath();
            this.aimLine.moveTo(localBall.x, localBall.y);
            this.aimLine.lineTo(localBall.x + dx, localBall.y + dy);
            this.aimLine.strokePath();
          });

          this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            const room = roomRef.current;
            if (!this.isAiming || !room) return;
            this.isAiming = false;
            this.aimLine.clear();

            const dx = this.dragStart.x - pointer.x;
            const dy = this.dragStart.y - pointer.y;
            
            const powerMultiplier = 3.8;

            room.send("take_shot", {
              sessionId: room.sessionId,
              vx: dx * powerMultiplier,
              vy: dy * powerMultiplier
            });
          });
        }
        
        update() {
          this.playerBalls.forEach((ball) => {
            const body = ball.body as Phaser.Physics.Arcade.Body;
            if (body && body.velocity.length() > 0 && body.velocity.length() < 6) {
              body.setVelocity(0, 0);
            }
          });
        }
      }

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: window.innerWidth > 480 ? 420 : window.innerWidth - 20,
        height: 640,
        parent: gameRef.current,
        physics: {
          default: 'arcade',
          arcade: { gravity: { x: 0, y: 0 }, debug: false }
        },
        scene: [GolfScene],
        transparent: true,
      };

      gameInstance.current = new Phaser.Game(config);
    };

    initPhaser();

    return () => {
      if (roomRef.current) {
        roomRef.current.leave();
        roomRef.current = null;
      }
      if (gameInstance.current) {
        gameInstance.current.destroy(true);
        gameInstance.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full min-h-screen text-white bg-neutral-950 font-sans select-none">
      
      {/* Dynamic HUD Layout Dashboard */}
      <div className="w-full max-w-[420px] mb-3 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-xl">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {matchStatus}
          </span>
          <span className="text-xs text-neutral-400 bg-neutral-800 px-2 py-1 rounded-md font-mono">
            ID: {mySessionId ? mySessionId.slice(0, 5) : "---"}
          </span>
        </div>

        {/* Turn Warning Message */}
        <div className={`text-center py-2 px-3 rounded-xl font-medium transition-all ${
          currentTurn === mySessionId 
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
            : 'bg-neutral-800 text-neutral-400'
        }`}>
          {currentTurn === mySessionId ? "🟢 IT'S YOUR TURN - SWING!" : "⏳ Opponent's Turn - Waiting..."}
        </div>

        {/* Live Active Scores Grid */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          {Array.from(playerScores.entries()).map(([sid, strokes]) => (
            <div 
              key={sid} 
              className={`p-2 rounded-xl border text-sm transition-all ${
                sid === mySessionId 
                  ? 'bg-white/5 border-neutral-700 font-bold' 
                  : 'bg-transparent border-neutral-800 text-neutral-400'
              }`}
            >
              <div className="text-xs text-neutral-500 truncate">
                {sid === mySessionId ? "You (White Ball)" : "Opponent (Yellow)"}
              </div>
              <div className="text-lg mt-0.5">{strokes} Strokes</div>
            </div>
          ))}
        </div>
      </div>

      {/* Game Canvas Viewport */}
      <div className="relative rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.6)] border-4 border-neutral-900 bg-neutral-900">
        <div ref={gameRef} />
      </div>

    </div>
  );
}