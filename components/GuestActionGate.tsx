"use client";



import { tr } from "../lib/i18n";
import { LocalizedText } from "../lib/i18n";
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
  const isAccountSession = (session: { user?: { is_anonymous?: boolean } } | null) =>
    Boolean(session && !session.user?.is_anonymous);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(isAccountSession(data.session));
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(isAccountSession(session));
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
      // Browsing and local play remain available to guests. Only actions that
      // spend/earn wallet value or start an online match ask the player to
      // sign in; components opt in with this explicit marker.
      if (!target.closest("[data-requires-auth]")) return;
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
      <div
        data-guest-auth-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-login-title"
        className="fixed inset-0 z-[200000] flex min-h-[100dvh] items-start justify-center overflow-y-auto bg-[#070A12]/85 px-5 backdrop-blur-md"
        style={{
          paddingTop: "max(1rem, calc(var(--app-safe-top) + 0.75rem))",
          paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom) + 0.75rem))",
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowSignIn(false);
        }}
      >
        <div className="w-full max-w-sm">
          <p role="status" className="mb-3 rounded-xl border border-primary/30 bg-primary-container px-4 py-3 text-center text-xs font-bold text-on-surface">
            <LocalizedText id="UI_1497" fallback={tr("UI_1497", "Sign in to claim rewards and play online.")} /></p>
          <AuthView
            onAuthSuccess={() => setShowSignIn(false)}
            onCancel={() => setShowSignIn(false)}
            dialogTitleId="guest-login-title"
          />
        </div>
      </div>
    )}
  </>;
}
