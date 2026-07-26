"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { AdminSidebar } from "./_components/AdminSidebar";
import { TopNav } from "./_components/TopNav"; // IMPORT TOP NAV

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname(); 

  const isLoginPage = pathname === "/login" || pathname === "/joeyokeadmin/login";

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      setIsAuthorized(true);
      return;
    }

    const verifyAdminAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push("/login"); 
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile && (profile.role === "admin" || profile.role === "super_admin")) {
        setIsAuthorized(true);
      } else {
        router.push("/login"); 
      }
      setLoading(false);
    };

    verifyAdminAccess();
  }, [router, isLoginPage]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#09090b] flex items-center justify-center transition-colors">
        <span className="text-xs font-bold text-[#CCFF00] uppercase tracking-widest animate-pulse">
          Verifying Clearance...
        </span>
      </div>
    );
  }

  if (!isAuthorized) return null;

  if (isLoginPage) {
    return <main className="min-h-screen bg-[#09090b]">{children}</main>;
  }

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-white font-sans antialiased overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 flex flex-col h-full min-w-0">
        <TopNav /> {/* RENDER TOP NAV HERE */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto pb-10">{children}</div>
        </main>
      </div>
    </div>
  );
}