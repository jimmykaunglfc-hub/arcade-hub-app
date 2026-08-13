"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AuthView from "@/components/AuthView";

export default function GuestActionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const isAdminRoute = pathname.startsWith("/joeyokeadmin");

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session));
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      setReady(true);
      if (session) setShowSignIn(false);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready || isAuthenticated || isAdminRoute) return;
    const interceptGuestAction = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("[data-guest-auth-dialog]")) return;
      if (!target.closest("button, a[href], [role='button'], input[type='submit']")) return;
      event.preventDefault();
      event.stopPropagation();
      setShowSignIn(true);
    };
    document.addEventListener("click", interceptGuestAction, true);
    return () => document.removeEventListener("click", interceptGuestAction, true);
  }, [isAdminRoute, isAuthenticated, ready]);

  return <>
    {children}
    {showSignIn && !isAuthenticated && !isAdminRoute && (
      <div data-guest-auth-dialog className="fixed inset-0 z-[200000] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-background/95 px-5 py-6 backdrop-blur-sm">
        <div className="w-full max-w-sm">
          <p role="alert" className="mb-3 rounded-xl border border-primary/30 bg-primary-container px-4 py-3 text-center text-xs font-bold text-on-primary-container">
            Sign in is required to use Joe Yoke features.
          </p>
          <AuthView onAuthSuccess={() => setShowSignIn(false)} />
        </div>
      </div>
    )}
  </>;
}
