"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Gamepad2,
  Trophy,
  Store,
  Users,
  MessageSquare,
  Award,
  Medal,
  Coins,
  Gift,
  Megaphone,
  BellRing,
  BarChart3,
  ShieldCheck,
  Settings,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/joeyokeadmin", icon: LayoutDashboard },
  { label: "Game Catalog", href: "/joeyokeadmin/games", icon: Gamepad2 },
  { label: "Tournaments", href: "/joeyokeadmin/tournaments", icon: Trophy },
  { label: "Store Management", href: "/joeyokeadmin/store-management", icon: Store },
  { label: "User Management", href: "/joeyokeadmin/users", icon: Users },
  { label: "Community & Social", href: "/joeyokeadmin/community", icon: MessageSquare },
  { label: "Reward System", href: "/joeyokeadmin/rewards", icon: Award },
  { label: "Rank Badges", href: "/joeyokeadmin/badges", icon: Medal },
  { label: "Economy & Ledger", href: "/joeyokeadmin/economy", icon: Coins },
  { label: "Redeem Requests", href: "/joeyokeadmin/redeem-requests", icon: Gift },
  { label: "Ads & Banners", href: "/joeyokeadmin/ads", icon: Megaphone },
  { label: "Push Notifications", href: "/joeyokeadmin/push-notifications", icon: BellRing },
  { label: "Reports & Analytics", href: "/joeyokeadmin/reports", icon: BarChart3 },
  { label: "Roles & Access", href: "/joeyokeadmin/roles", icon: ShieldCheck },
  { label: "Configurations", href: "/joeyokeadmin/configurations", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#18181b] border-r border-white/10 flex flex-col justify-between shrink-0 h-screen sticky top-0">
      <div className="flex flex-col min-h-0 flex-1">
        {/* LOGO HEADER */}
        <div className="p-6 border-b border-white/10 flex items-center gap-3 shrink-0">
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

        {/* SCROLLABLE NAV LINKS */}
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto no-scrollbar">
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
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* FOOTER */}
      <div className="p-4 border-t border-white/10 shrink-0">
        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Exit to Main App
        </Link>
      </div>
    </aside>
  );
}