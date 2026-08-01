"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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
  Sparkles,
  BellRing,
  BarChart3,
  ShieldCheck,
  Settings,
  CircleHelp,
  CircleDollarSign,
  LogOut,
  Loader2,
} from "lucide-react";

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/joeyokeadmin",
    icon: LayoutDashboard,
  },
  {
    id: "games",
    label: "Game Catalog",
    href: "/joeyokeadmin/games",
    icon: Gamepad2,
  },
  {
    id: "tournaments",
    label: "Tournaments",
    href: "/joeyokeadmin/tournaments",
    icon: Trophy,
  },
  {
    id: "store",
    label: "Store Management",
    href: "/joeyokeadmin/store-management",
    icon: Store,
  },
  {
    id: "users",
    label: "User Management",
    href: "/joeyokeadmin/users",
    icon: Users,
  },
  {
    id: "community",
    label: "Community & Social",
    href: "/joeyokeadmin/community",
    icon: MessageSquare,
  },
  {
    id: "rewards",
    label: "Reward System",
    href: "/joeyokeadmin/rewards",
    icon: Award,
  },
  {
    id: "wheel",
    label: "Wheel Rewards",
    href: "/joeyokeadmin/wheel",
    icon: CircleDollarSign,
  },
  {
    id: "badges",
    label: "Rank Badges",
    href: "/joeyokeadmin/badges",
    icon: Medal,
  },
  {
    id: "economy",
    label: "Economy & Ledger",
    href: "/joeyokeadmin/economy",
    icon: Coins,
  },
  {
    id: "redeem",
    label: "Redeem Requests",
    href: "/joeyokeadmin/redeem-requests",
    icon: Gift,
  },
  {
    id: "ads",
    label: "Ads & Banners",
    href: "/joeyokeadmin/ads",
    icon: Megaphone,
  },
  {
    id: "splash-campaigns",
    label: "Splash Campaigns",
    href: "/joeyokeadmin/splash-campaigns",
    icon: Sparkles,
  },
  {
    id: "notifications",
    label: "Push Notifications",
    href: "/joeyokeadmin/push-notifications",
    icon: BellRing,
  },
  {
    id: "analytics",
    label: "Reports & Analytics",
    href: "/joeyokeadmin/reports",
    icon: BarChart3,
  },
  {
    id: "roles",
    label: "Roles & Access",
    href: "/joeyokeadmin/roles",
    icon: ShieldCheck,
  },
  {
    id: "configurations",
    label: "Configurations",
    href: "/joeyokeadmin/configurations",
    icon: Settings,
  },
  {
    id: "support",
    label: "Support & Requests",
    href: "/joeyokeadmin/support",
    icon: CircleHelp,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<{
    role: string;
    allowed_modules: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPermissions() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from("profiles")
          .select("role, allowed_modules")
          .eq("id", user.id)
          .single();

        if (error) throw error;
        if (data) setProfile(data);
      } catch (err) {
        console.error("Error loading sidebar permissions:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchPermissions();
  }, []);

  // Check whether the user has clearance for a given module
  const canAccess = (moduleId: string) => {
    if (!profile) return false;
    if (profile.role === "super_admin") return true;
    return profile.allowed_modules?.includes(moduleId) ?? false;
  };

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
              {loading
                ? "Verifying..."
                : profile?.role === "super_admin"
                ? "Super Admin"
                : "Admin Clearance"}
            </span>
          </div>
        </div>

        {/* SCROLLABLE NAV LINKS */}
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto no-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-neutral-500">
              <Loader2 className="w-5 h-5 animate-spin text-[#CCFF00]" />
            </div>
          ) : (
            NAV_ITEMS.map((item) => {
              if (!canAccess(item.id)) return null;

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
            })
          )}
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
