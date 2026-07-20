"use client";

import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";

export default function GolfGame() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  const [isAiming, setIsAiming] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentDrag, setCurrentDrag] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === "undefined" || !sceneRef.current) return;

    const engine = Matter.Engine.create();
    engine.world.gravity.y = 0; 
    engine.world.gravity.x = 0;
    engineRef.current = engine;

    const render = Matter.Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: window.innerWidth > 800 ? 800 : window.innerWidth,
        height: window.innerHeight > 600 ? 600 : window.innerHeight - 150,
        wireframes: false,
        background: '#2d5a27', 
      }
    });
    renderRef.current = render;

    const ball = Matter.Bodies.circle(window.innerWidth / 2 || 400, 500, 10, {
      restitution: 0.8, 
      friction: 0.01,
      frictionAir: 0.03, 
      density: 0.04,
      render: { fillStyle: '#ffffff' }
    });
    ballRef.current = ball;

    const w = render.options.width || 800;
    const h = render.options.height || 600;

    const walls = [
      Matter.Bodies.rectangle(w/2, 0, w, 50, { isStatic: true, render: { fillStyle: '#1a3317' } }), 
      Matter.Bodies.rectangle(w/2, h, w, 50, { isStatic: true, render: { fillStyle: '#1a3317' } }), 
      Matter.Bodies.rectangle(w, h/2, 50, h, { isStatic: true, render: { fillStyle: '#1a3317' } }), 
      Matter.Bodies.rectangle(0, h/2, 50, h, { isStatic: true, render: { fillStyle: '#1a3317' } })  
    ];

    Matter.World.add(engine.world, [ball, ...walls]);
    Matter.Render.run(render);
    
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    return () => {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      if (render.canvas) render.canvas.remove();
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!ballRef.current) return;
    setIsAiming(true);
    const rect = sceneRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setCurrentDrag({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isAiming) return;
    const rect = sceneRef.current?.getBoundingClientRect();
    if (rect) setCurrentDrag({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handlePointerUp = () => {
    if (!isAiming || !ballRef.current) return;
    setIsAiming(false);
    const dx = dragStart.x - currentDrag.x;
    const dy = dragStart.y - currentDrag.y;
    Matter.Body.applyForce(ballRef.current, ballRef.current.position, {
      x: dx * 0.0005,
      y: dy * 0.0005
    });
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-black w-full h-full text-white">
      <div 
        ref={sceneRef} 
        className="rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 relative touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {isAiming && (
          <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-10">
            <line x1={dragStart.x} y1={dragStart.y} x2={currentDrag.x} y2={currentDrag.y} stroke="#c3f400" strokeWidth="4" strokeDasharray="8 8" />
            <circle cx={dragStart.x} cy={dragStart.y} r="15" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
          </svg>
        )}
      </div>
      <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mt-4 text-center">
        Drag backwards to aim and swing.
      </p>
    </div>
  );
}