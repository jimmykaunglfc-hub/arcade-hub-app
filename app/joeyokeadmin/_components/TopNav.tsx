"use client";

import { Search, Bell, MessageSquare } from "lucide-react";

export function TopNav() {
  return (
    <header className="h-20 border-b border-white/10 bg-[#09090b]/90 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-40 shrink-0">
      
      {/* Global Search */}
      <div className="flex-1 max-w-xl relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-[#CCFF00] transition-colors" />
        <input 
          type="text" 
          placeholder="Search users, games, orders..." 
          className="w-full bg-white/5 border border-white/10 rounded-full pl-11 pr-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all shadow-inner"
        />
      </div>

      {/* Quick Actions & Profile */}
      <div className="flex items-center gap-2 ml-4">
        <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-neutral-400 hover:text-white transition-all relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span>
        </button>
        
        <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 text-neutral-400 hover:text-white transition-all">
          <MessageSquare className="w-4 h-4" />
        </button>
        
        <div className="w-px h-6 bg-white/10 mx-2"></div>
        
        <button className="flex items-center gap-3 hover:bg-white/5 p-1.5 rounded-full pr-4 transition-all border border-transparent hover:border-white/10">
          <div className="w-8 h-8 rounded-full bg-white/5 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
            <img src="https://img.icons8.com/illustrations/xlarge/robot.png" alt="Admin" className="w-full h-full object-cover p-0.5" />
          </div>
          <div className="text-left hidden md:block">
            <p className="text-[10px] font-bold text-white uppercase tracking-wider">Super Admin</p>
            <p className="text-[9px] text-neutral-500 font-mono">ID: 0x8F...2A</p>
          </div>
        </button>
      </div>
    </header>
  );
}