export default function GamePlayer({ 
  gameUrl, 
  onClose 
}: { 
  gameUrl: string; 
  onClose: () => void 
}) {
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-fade-in">
      {/* 🎮 Game Header Bar */}
      <div className="h-12 bg-surface/90 backdrop-blur-md flex items-center justify-between px-4 border-b border-white/10 pt-safe">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
          <span className="text-xs font-bold text-white tracking-widest uppercase">Playing</span>
        </div>
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center border border-white/10 active:scale-90 transition-transform"
        >
          <span className="material-symbols-outlined text-white text-sm font-bold">close</span>
        </button>
      </div>

      {/* 🕹️ The Game Iframe */}
      <div className="flex-1 w-full bg-black">
        <iframe 
          src={gameUrl}
          className="w-full h-full border-0"
          title="Game Player"
          allow="fullscreen; autoplay; gamepad"
        />
      </div>
    </div>
  );
}