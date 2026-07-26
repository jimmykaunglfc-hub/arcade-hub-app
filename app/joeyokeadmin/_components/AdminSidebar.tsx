"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Gamepad2,
  Coins,
  ShieldCheck,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/joeyokeadmin", icon: LayoutDashboard },
  { label: "User Management", href: "/joeyokeadmin/users", icon: Users },
  { label: "Game Catalog", href: "/joeyokeadmin/games", icon: Gamepad2 },
  { label: "Economy & Ledger", href: "/joeyokeadmin/economy", icon: Coins },
  { label: "Roles & Access", href: "/joeyokeadmin/roles", icon: ShieldCheck },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#18181b] border-r border-white/10 flex flex-col justify-between shrink-0 min-h-screen">
      <div>
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 bg-[#CCFF00] rounded-xl flex items-center justify-center font-black text-black text-lg">
            JY
          </div>
          <div>
            <h1 className="font-headline font-black text-sm text-white tracking-wider uppercase">
              Control Core
            </h1>
            <span className="text-[10px] font-bold text-[#CCFF00] tracking-widest uppercase block">
              Super Admin
            </span>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all ${
                  isActive
                    ? "bg-[#CCFF00] text-black shadow-[0_0_20px_rgba(204,255,0,0.2)]"
                    : "text-neutral-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-white/10">
        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Exit to Main App
        </Link>
      </div>
    </aside>
  );
}