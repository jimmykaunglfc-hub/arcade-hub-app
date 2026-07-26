"use client";

import { Package, Plus, Search, Tag, MoreVertical } from "lucide-react";

export default function StoreManagement() {
  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Admin / Store Management</p>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">Storefront Inventory</h2>
          <p className="font-body text-xs text-neutral-400 mt-2">Manage digital assets, cosmetics, and physical prize pools.</p>
        </div>
        <button className="flex items-center gap-2 bg-[#CCFF00] px-5 py-2.5 rounded-xl text-xs font-black text-black hover:bg-[#aadd00] transition-colors shadow-[0_0_15px_rgba(204,255,0,0.3)]">
          <Plus className="w-4 h-4" /> Inject New Item
        </button>
      </header>

      {/* FILTER BAR */}
      <div className="bg-[#18181b] border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row gap-4 justify-between items-center shadow-lg">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-[#CCFF00] transition-colors" />
          <input 
            type="text" 
            placeholder="Search inventory by name or SKU..." 
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select className="bg-white/5 border border-white/10 text-xs font-bold text-white px-4 py-2.5 rounded-xl focus:outline-none focus:border-[#CCFF00] w-full md:w-auto">
            <option className="bg-[#18181b]">All Categories</option>
            <option className="bg-[#18181b]">Digital Cosmetics</option>
            <option className="bg-[#18181b]">Physical Prizes</option>
            <option className="bg-[#18181b]">Token Packs</option>
          </select>
        </div>
      </div>

      {/* INVENTORY GRID (Empty State for now) */}
      <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-12 flex flex-col items-center justify-center text-center border-dashed">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-neutral-500" />
        </div>
        <h3 className="font-headline text-lg font-black text-white tracking-wide">No items found</h3>
        <p className="text-xs text-neutral-400 mt-2 max-w-sm">
          The storefront is currently empty. Inject a new item to populate the marketplace for your users.
        </p>
      </div>

    </div>
  );
}