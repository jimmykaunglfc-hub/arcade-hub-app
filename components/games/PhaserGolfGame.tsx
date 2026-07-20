"use client";

import { useEffect, useRef, useState } from 'react';
import * as Colyseus from 'colyseus.js';

interface ServerPlayer {
  userId: string;
  strokes: number;
  isReady: boolean;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  isBallMoving: boolean;
  onChange: (callback: () => void) => void;
}

interface HazardState {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
  const [currentHole, setCurrentHole] = useState<number>(1);

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
        
        // Hazard Groups
        sandTraps!: Phaser.Physics.Arcade.StaticGroup;
        lakes!: Phaser.Physics.Arcade.StaticGroup;
        
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

          // 1. Mowed Fairway Ground Layout
          const graphics = this.add.graphics();
          graphics.fillStyle(0x386b2c, 1);
          graphics.fillRect(0, 0, width, height);
          graphics.fillStyle(0x315e26, 1);
          for (let i = 0; i < height; i += 80) {
            graphics.fillRect(0, i + 40, width, 40);
          }

          // 2. Initialize Map Hazard Groups
          this.sandTraps = this.physics.add.staticGroup();
          this.lakes = this.physics.add.staticGroup();

          // 3. Target Cup (Hole)
          this.add.circle(width / 2, height * 0.15, 18, 0x1f2937);
          this.add.circle(width / 2, height * 0.15, 12, 0x030712);

          // 4. Aim Vector Tracer Component
          this.aimLine = this.add.graphics();

          // --- 5. NETWORK ENGINE HANDSHAKE ---
          try {
            const room = await this.client.joinOrCreate("golf_room", {
              userId: `Player_${Math.floor(Math.random() * 900) + 100}`
            });
            
            roomRef.current = room;
            setMySessionId(room.sessionId);
            setIsConnected(true);

            if (room.state.currentTurn) setCurrentTurn(room.state.currentTurn);
            if (room.state.currentHole) setCurrentHole(room.state.currentHole);

            // Dynamically Render Server Authoritative Hazards if populated
            if (room.state.hazards && room.state.hazards.length > 0) {
              room.state.hazards.forEach((hazard: HazardState) => {
                if (hazard.type === "sand") {
                  const sand = this.add.ellipse(hazard.x, hazard.y, hazard.width, hazard.height, 0xddb892);
                  this.sandTraps.add(sand);
                } else if (hazard.type === "lake") {
                  const lake = this.add.ellipse(hazard.x, hazard.y, hazard.width, hazard.height, 0x4cc9f0);
                  this.lakes.add(lake);
                }
              });
            } else {
              // Procedural Local Fallback Map Layout if server hazards array starts blank
              const fallbackSand = this.add.ellipse(width * 0.75, height * 0.45, 130, 80, 0xddb892);
              this.sandTraps.add(fallbackSand);

              const fallbackLake = this.add.ellipse(width * 0.25, height * 0.35, 140, 90, 0x4cc9f0);
              this.lakes.add(fallbackLake);
            }

            // Individual Player Spawning Routine
            room.state.players.onAdd((playerState: ServerPlayer, sessionId: string) => {
              const isLocal = sessionId === room.sessionId;
              const ballColor = isLocal ? 0xffffff : 0xfacc15;

              // Read coordinates dynamically from server schema default settings
              const spawnX = playerState.x || width / 2;
              const spawnY = playerState.y || height * 0.85;

              const ball = this.add.circle(spawnX, spawnY, 11, ballColor);
              ball.setStrokeStyle(2, 0x1e293b);
              
              this.physics.add.existing(ball);
              const body = ball.body as Phaser.Physics.Arcade.Body;
              body.setCollideWorldBounds(true);
              body.setBounce(0.65, 0.65);
              body.setDrag(0.96, 0.96);
              body.useDamping = true;

              this.playerBalls.set(sessionId, ball);

              // Surface Interaction Physics Overlaps
              this.physics.add.overlap(ball, this.sandTraps, () => {
                body.setDrag(0.72, 0.72); // Heavy drag friction reduction inside bunker zones
              });

              this.physics.add.overlap(ball, this.lakes, () => {
                // Prevent continuous triggers during reset phase
                if (body.enable === false) return;
                
                body.setVelocity(0, 0);
                body.enable = false;

                // Play Water Splash Fade Out
                this.tweens.add({
                  targets: ball,
                  scale: 0,
                  alpha: 0.3,
                  duration: 250,
                  onComplete: () => {
                    ball.setPosition(width / 2, height * 0.85);
                    ball.scale = 1;
                    ball.alpha = 1;
                    body.enable = true;

                    // Emit authoritative penalty count change payload
                    if (isLocal) {
                      room.send("water_hazard_penalty", { sessionId });
                    }
                  }
                });
              });

              // Track Server State Updates (Strokes, Position Corrections)
              playerState.onChange(() => {
                setPlayerScores((prev) => {
                  const newScores = new Map(prev);
                  newScores.set(sessionId, playerState.strokes);
                  return newScores;
                });

                // Server Position Correction Sync (Reconciliation Fallback)
                if (!isLocal && playerState.isBallMoving === false) {
                  ball.setPosition(playerState.x, playerState.y);
                }
              });
            });

            // Handle Room Disconnection
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

            // Handle Global Context States
            room.onStateChange((state: any) => {
              if (state.currentTurn) setCurrentTurn(state.currentTurn);
              if (state.currentHole) setCurrentHole(state.currentHole);
              if (state.matchStatus) {
                setMatchStatus(state.matchStatus === "playing" ? "Match Live ⛳" : "Waiting for Opponent...");
              }
            });

            // Live Action Impulse Event Listeners
            room.onMessage("ball_struck", (message: { sessionId: string, vx: number, vy: number }) => {
              const targetedBall = this.playerBalls.get(message.sessionId);
              if (targetedBall) {
                const body = targetedBall.body as Phaser.Physics.Arcade.Body;
                body.setVelocity(message.vx, message.vy);
              }
            });

          } catch (networkError) {
            console.error("Colyseus Connection Interrupted:", networkError);
            setMatchStatus("Connection Failed ❌");
          }

          // --- 6. DRAG MECHANICS Aiming Rig ---
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
          // Physics Engine Frame Loop Update
          this.playerBalls.forEach((ball) => {
            const body = ball.body as Phaser.Physics.Arcade.Body;
            if (!body) return;

            // Restore Standard Fairway Friction Drag if the ball left the sand
            if (!this.physics.overlap(ball, this.sandTraps)) {
              body.setDrag(0.96, 0.96);
            }

            // Absolute Zero Cutoff Damping
            if (body.velocity.length() > 0 && body.velocity.length() < 6) {
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
      
      {/* Modern Golf Scorecard HUD overlay */}
      <div className="w-full max-w-[420px] mb-3 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-xl">
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-neutral-800">
          <div>
            <h2 className="text-sm font-bold text-neutral-200 tracking-wide uppercase">Hole {currentHole}</h2>
            <p className="text-xs text-neutral-500">Par 3 • Hazards Active</p>
          </div>
          <span className="text-xs text-neutral-400 bg-neutral-800 px-2 py-1 rounded-md font-mono">
            Room: {mySessionId ? mySessionId.slice(0, 5) : "---"}
          </span>
        </div>

        <div className="flex items-center justify-between mb-3 gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {matchStatus}
          </span>
          
          <div className={`text-xs px-2.5 py-1 rounded-lg font-bold tracking-wide ${
            currentTurn === mySessionId 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : 'bg-neutral-800 text-neutral-500'
          }`}>
            {currentTurn === mySessionId ? "🟢 YOUR TURN" : "⏳ OPPONENT'S TURN"}
          </div>
        </div>

        {/* Live Active Score Grid */}
        <div className="grid grid-cols-2 gap-2 text-center">
          {Array.from(playerScores.entries()).map(([sid, strokes]) => (
            <div 
              key={sid} 
              className={`p-2.5 rounded-xl border text-sm transition-all ${
                sid === mySessionId 
                  ? 'bg-neutral-800/50 border-neutral-700 font-bold' 
                  : 'bg-transparent border-neutral-800 text-neutral-400'
              }`}
            >
              <div className="text-xs text-neutral-500 truncate flex items-center justify-center gap-1">
                <span className={`h-2 w-2 rounded-full ${sid === mySessionId ? 'bg-white' : 'bg-yellow-400'}`} />
                {sid === mySessionId ? "You (White)" : "Opponent (Yellow)"}
              </div>
              <div className="text-lg mt-0.5">{strokes} Strokes</div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Phaser Window Viewport */}
      <div className="relative rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.7)] border-4 border-neutral-900 bg-neutral-900">
        <div ref={gameRef} />
      </div>

    </div>
  );
}