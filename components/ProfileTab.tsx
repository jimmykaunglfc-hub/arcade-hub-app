import Image from "next/image";

export default function ProfileTab() {
  return (
    <div className="space-y-6 animate-fade-in pb-6">
      {/* 👤 Header Section: Avatar & Identity */}
      <section className="flex flex-col items-center pt-4">
        <div className="relative w-28 h-28 rounded-full p-1 bg-gradient-to-tr from-primary to-secondary mb-4 shadow-[0_0_30px_rgba(192,193,255,0.3)]">
          <div className="w-full h-full rounded-full overflow-hidden border-4 border-black relative bg-surface-variant">
            <Image src="https://i.pravatar.cc/150?img=11" alt="Profile" fill className="object-cover" unoptimized />
          </div>
          {/* Level Badge */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-black border border-primary text-primary text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg">
            Lvl 24
          </div>
        </div>
        <h2 className="text-2xl font-black text-white mt-1">Alex_ProGamer</h2>
        <p className="text-xs text-secondary font-bold tracking-widest uppercase mt-1">Arcade Legend</p>
      </section>

      {/* 📊 Quick Stats Grid */}
      <section className="grid grid-cols-3 gap-3">
        <div className="bg-surface-variant/60 border border-white/5 rounded-2xl p-3 flex flex-col items-center justify-center shadow-inner">
          <span className="material-symbols-outlined text-secondary mb-1 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
          <span className="text-xl font-black text-white">142</span>
          <span className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">Wins</span>
        </div>
        <div className="bg-surface-variant/60 border border-white/5 rounded-2xl p-3 flex flex-col items-center justify-center shadow-inner">
          <span className="material-symbols-outlined text-primary mb-1 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
          <span className="text-xl font-black text-white">68%</span>
          <span className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">Win Rate</span>
        </div>
        <div className="bg-surface-variant/60 border border-white/5 rounded-2xl p-3 flex flex-col items-center justify-center shadow-inner">
          <span className="material-symbols-outlined text-[#ffd700] mb-1 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>toll</span>
          <span className="text-xl font-black text-white">12.5k</span>
          <span className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">Credits</span>
        </div>
      </section>

      {/* 📈 XP Progress Bar */}
      <section className="bg-surface-variant/40 rounded-2xl p-4 border border-white/5">
        <div className="flex justify-between items-end mb-3">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Next Level</span>
          <span className="text-[10px] text-primary font-bold">1,250 <span className="text-on-surface-variant">/ 2,000 XP</span></span>
        </div>
        <div className="h-3 w-full bg-black rounded-full overflow-hidden border border-white/5 relative">
          <div className="absolute top-0 left-0 h-full w-[62%] bg-gradient-to-r from-primary to-secondary rounded-full shadow-[0_0_15px_rgba(74,225,118,0.6)]"></div>
        </div>
      </section>

      {/* 🏅 Achievements & Badges */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider opacity-70">Achievements</h3>
          <button className="text-primary text-[10px] font-bold uppercase tracking-wider hover:underline">View All</button>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
          {[
            { icon: 'local_fire_department', color: 'text-orange-500', bg: 'bg-orange-500/20', border: 'border-orange-500/30', name: 'Hot Streak' },
            { icon: 'military_tech', color: 'text-purple-400', bg: 'bg-purple-400/20', border: 'border-purple-400/30', name: 'Veteran' },
            { icon: 'star', color: 'text-yellow-400', bg: 'bg-yellow-400/20', border: 'border-yellow-400/30', name: 'All Star' },
            { icon: 'sports_motorsports', color: 'text-blue-400', bg: 'bg-blue-400/20', border: 'border-blue-400/30', name: 'Speedster' },
          ].map((badge, i) => (
            <div key={i} className="flex flex-col items-center gap-2 min-w-[72px] flex-shrink-0 cursor-pointer group">
              <div className={`w-16 h-16 rounded-2xl ${badge.bg} border ${badge.border} flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 group-active:scale-95`}>
                <span className={`material-symbols-outlined ${badge.color} text-3xl drop-shadow-md`} style={{ fontVariationSettings: "'FILL' 1" }}>
                  {badge.icon}
                </span>
              </div>
              <span className="text-[10px] font-bold text-on-surface-variant text-center">{badge.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ⚙️ Action Buttons */}
      <section className="space-y-3 pt-2">
         <button className="w-full bg-surface-variant/80 py-4 rounded-xl border border-white/10 text-sm font-bold text-white hover:bg-surface-variant transition-colors flex items-center justify-center gap-3 active:scale-[0.98]">
            <span className="material-symbols-outlined text-lg">settings</span> Account Settings
         </button>
         <button className="w-full bg-red-500/10 py-4 rounded-xl border border-red-500/20 text-sm font-bold text-red-400 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-3 active:scale-[0.98]">
            <span className="material-symbols-outlined text-lg">logout</span> Log Out
         </button>
      </section>
    </div>
  );
}