"use client";

import { useEffect, useRef } from 'react';

export default function PhaserGolfGame() {
  const gameRef = useRef<HTMLDivElement>(null);
  const gameInstance = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !gameRef.current || gameInstance.current) {
      return;
    }

    const initPhaser = async () => {
      // Dynamically import Phaser so it only runs in the client browser
      const Phaser = await import('phaser');

      class GolfScene extends Phaser.Scene {
        ball!: Phaser.GameObjects.Arc;
        aimLine!: Phaser.GameObjects.Graphics;
        
        // Phaser internal state (Replaces React useState)
        isAiming = false;
        dragStart = { x: 0, y: 0 };

        constructor() {
          super({ key: 'GolfScene' });
        }

        create() {
          const width = this.cameras.main.width;
          const height = this.cameras.main.height;

          // 1. Premium Visuals Placeholder: Mowed Grass Pattern
          const graphics = this.add.graphics();
          graphics.fillStyle(0x4d8c39, 1);
          graphics.fillRect(0, 0, width, height);
          graphics.fillStyle(0x468034, 1);
          for (let i = 0; i < height; i += 80) {
            graphics.fillRect(0, i + 40, width, 40);
          }

          // 2. The Hole
          this.add.circle(width / 2, height * 0.15, 18, 0xe5e7eb); // Light Rim
          this.add.circle(width / 2, height * 0.15, 14, 0x111827); // Dark Center

          // 3. The Ball & Physics setup
          this.ball = this.add.circle(width / 2, height * 0.85, 10, 0xffffff);
          this.ball.setStrokeStyle(1, 0xcccccc);
          
          this.physics.add.existing(this.ball);
          const body = this.ball.body as Phaser.Physics.Arcade.Body;
          
          body.setCollideWorldBounds(true); // Bounce off the edges of the canvas
          body.setBounce(0.7, 0.7); // Bounciness factor
          body.setDrag(0.97, 0.97); // Friction/Grass resistance
          body.useDamping = true;   // Allows drag to act as a multiplier, smoothing the roll

          // 4. Aim Line Renderer
          this.aimLine = this.add.graphics();

          // --- 5. INPUT CONTROLS ---
          this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // Only allow aiming if the ball is basically stopped
            if (body.velocity.length() < 10) {
              body.setVelocity(0, 0); // Force complete stop
              this.isAiming = true;
              this.dragStart = { x: pointer.x, y: pointer.y };
            }
          });

          this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!this.isAiming) return;
            
            this.aimLine.clear();
            const dx = this.dragStart.x - pointer.x;
            const dy = this.dragStart.y - pointer.y;
            
            // Calculate aim color based on distance (Green -> Yellow -> Red)
            const dist = Math.sqrt(dx * dx + dy * dy);
            let lineColor = 0x33ff33; // Green
            if (dist > 150) lineColor = 0xff3333; // Red
            else if (dist > 80) lineColor = 0xffff33; // Yellow

            // Draw aiming line predicting the shot direction
            this.aimLine.lineStyle(4, lineColor, 0.8);
            this.aimLine.beginPath();
            this.aimLine.moveTo(this.ball.x, this.ball.y);
            this.aimLine.lineTo(this.ball.x + dx, this.ball.y + dy);
            this.aimLine.strokePath();
          });

          this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (!this.isAiming) return;
            this.isAiming = false;
            this.aimLine.clear(); // Hide line after shot

            const dx = this.dragStart.x - pointer.x;
            const dy = this.dragStart.y - pointer.y;
            
            // Apply velocity based on drag distance
            const powerMultiplier = 3.5;
            body.setVelocity(dx * powerMultiplier, dy * powerMultiplier);
          });
        }
        
        update() {
          // Physics Loop (Runs 60x per second)
          const body = this.ball.body as Phaser.Physics.Arcade.Body;
          
          // Micro-sliding prevention: Stop the ball completely if it's moving extremely slowly
          if (body.velocity.length() > 0 && body.velocity.length() < 5) {
            body.setVelocity(0, 0);
          }
        }
      }

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: window.innerWidth > 800 ? 800 : window.innerWidth,
        height: window.innerHeight > 600 ? 600 : window.innerHeight - 150,
        parent: gameRef.current,
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false 
          }
        },
        scene: [GolfScene],
        transparent: true,
      };

      gameInstance.current = new Phaser.Game(config);
    };

    initPhaser();

    return () => {
      if (gameInstance.current) {
        gameInstance.current.destroy(true);
        gameInstance.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full h-full text-white bg-black font-body">
      {/* Container matching mobile aesthetics */}
      <div 
        ref={gameRef} 
        className="rounded-3xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.8)] border-4 border-[#3c2a21]" 
      />
    </div>
  );
}