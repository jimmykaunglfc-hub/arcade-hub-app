import Image from "next/image";

export default function ChatTab() {
  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Online Friends Horizontal Scroll */}
      <section>
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4 opacity-70">Online Friends</h3>
        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer">
              <div className="relative w-16 h-16 rounded-full border-2 border-surface-variant p-0.5">
                <div className="w-full h-full rounded-full overflow-hidden bg-surface-variant">
                  <Image src={`https://i.pravatar.cc/150?img=${i * 10}`} alt="Friend" fill className="object-cover" unoptimized />
                </div>
                <div className="absolute bottom-0 right-0 w-4 h-4 bg-secondary rounded-full border-2 border-black"></div>
              </div>
              <span className="text-xs font-bold text-on-surface-variant">Player {i}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Messages List */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider opacity-70">Recent Messages</h3>
          <button className="material-symbols-outlined text-primary text-xl">edit_square</button>
        </div>
        
        <div className="space-y-1">
          <div className="flex items-center gap-4 p-3 rounded-2xl bg-surface-variant/50 border border-white/5 cursor-pointer active:scale-[0.98] transition-transform">
            <div className="relative w-14 h-14 rounded-full overflow-hidden bg-surface-variant flex-shrink-0">
              <Image src="https://i.pravatar.cc/150?img=44" alt="User" fill className="object-cover" unoptimized />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-sm font-bold text-white truncate">The Gaming Squad</h4>
                <span className="text-[10px] text-primary font-bold">2m ago</span>
              </div>
              <p className="text-xs text-white font-medium truncate">Are we playing Star Strike tonight or what?</p>
            </div>
            <div className="w-3 h-3 bg-primary rounded-full shadow-[0_0_10px_rgba(192,193,255,0.8)]"></div>
          </div>

          <div className="flex items-center gap-4 p-3 rounded-2xl hover:bg-surface-variant/30 transition-colors cursor-pointer active:scale-[0.98]">
            <div className="relative w-14 h-14 rounded-full overflow-hidden bg-surface-variant flex-shrink-0">
              <Image src="https://i.pravatar.cc/150?img=12" alt="User" fill className="object-cover" unoptimized />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-sm font-bold text-white truncate">Alex_ProGamer</h4>
                <span className="text-[10px] text-on-surface-variant">1h ago</span>
              </div>
              <p className="text-xs text-on-surface-variant truncate">GGs man, that last round was crazy.</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}