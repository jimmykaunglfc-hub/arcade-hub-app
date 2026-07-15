"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

interface Profile {
  id: string;
  email: string;
  username: string;
  avatar_url: string;
  created_at: string;
}

interface ProfileTabProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export default function ProfileTab({ isDarkMode, onToggleTheme }: ProfileTabProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"loading" | "found" | "missing">("loading");

  // Local preferences states preserved perfectly
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle(); 
    
    if (myProfile) {
      setProfile(myProfile);
      setFetchStatus("found");
    } else {
      setFetchStatus("missing");
    }
  };

  const terminateSession = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (fetchStatus === "loading") {
    return (
      <div className="text-center p-6 font-caps text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">
        Compiling User Node...
      </div>
    );
  }

  if (fetchStatus === "missing" || !profile) {
    return (
      <div className="bg-white/80 dark:bg-white/5 border border-red-200 dark:border-red-500/20 backdrop-blur-xl rounded-[24px] p-6 text-center shadow-md animate-fade-in w-full max-w-sm mx-auto mt-6">
        <span className="material-symbols-outlined text-3xl text-red-500 mb-2">error</span>
        <h2 className="font-headline text-base font-extrabold text-neutral-900 dark:text-primary mb-1">Profile Not Synced</h2>
        <p className="font-body text-xs text-neutral-500 dark:text-on-surface-variant mb-6 leading-relaxed">
          Your active session exists, but your public profile row was not found. Re-authenticate to trigger the profile setup pipeline.
        </p>
        <button 
          onClick={terminateSession}
          className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 font-headline font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-95"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in pb-12 w-full text-neutral-800 dark:text-on-background">
      
      {/* 👤 SECTION 1: IDENTITY HEADER CARD */}
      <div className="bg-white/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10 backdrop-blur-xl rounded-[24px] p-6 shadow-sm flex flex-col items-center text-center relative overflow-hidden transition-colors duration-300">
        {/* Harmonic background bloom glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-500/5 dark:bg-primary-container/10 blur-3xl rounded-full pointer-events-none"></div>
        
        <div className="w-20 h-20 rounded-full border border-neutral-200 dark:border-white/10 overflow-hidden relative bg-neutral-50 dark:bg-surface-container shadow-inner z-10">
          <Image src={profile.avatar_url} alt="Profile Node" fill className="object-cover p-1" unoptimized />
        </div>
        
        <div className="mt-4 space-y-0.5 z-10">
          <h2 className="font-headline text-lg font-black tracking-tight text-neutral-900 dark:text-primary">{profile.username}</h2>
          <p className="font-body text-xs text-neutral-500 dark:text-on-surface-variant font-medium">{profile.email}</p>
        </div>

        <div className="flex gap-2 mt-4 z-10">
          <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-[9px] font-caps font-bold uppercase tracking-widest px-3 py-1 rounded-lg flex items-center gap-1.5 shadow-sm">
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
            Verified Account
          </span>
        </div>
      </div>

      {/* ⚙️ SECTION 2: APP PREFERENCES CONTAINER */}
      <div className="space-y-2">
        <h3 className="font-caps text-[9px] font-bold uppercase tracking-widest text-neutral-400 dark:text-on-surface-variant px-1">App Preferences</h3>
        <div className="bg-white/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10 backdrop-blur-xl rounded-[20px] overflow-hidden shadow-sm divide-y divide-neutral-100 dark:divide-white/5 transition-colors duration-300">
          
          {/* Theme Dynamic Controller Row */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/5 flex items-center justify-center text-neutral-500 dark:text-primary">
                <span className="material-symbols-outlined text-base">{isDarkMode ? "dark_mode" : "light_mode"}</span>
              </div>
              <div className="text-left">
                <span className="font-headline text-xs font-bold block text-neutral-900 dark:text-primary">Dark appearance</span>
                <span className="font-body text-[10px] text-neutral-400 dark:text-on-surface-variant block mt-0.5">Adjust interface appearance</span>
              </div>
            </div>
            <button 
              onClick={onToggleTheme}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-300 ease-in-out flex items-center ${isDarkMode ? "bg-primary-container" : "bg-neutral-300"}`}
            >
              <div className={`w-5 h-5 rounded-full shadow-md bg-white dark:bg-neutral-950 transition-transform duration-300 ${isDarkMode ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Audio Controller Row */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/5 flex items-center justify-center text-neutral-500 dark:text-primary">
                <span className="material-symbols-outlined text-base">volume_up</span>
              </div>
              <div className="text-left">
                <span className="font-headline text-xs font-bold block text-neutral-900 dark:text-primary">Sound Effects</span>
                <span className="font-body text-[10px] text-neutral-400 dark:text-on-surface-variant block mt-0.5">In-game audio cues</span>
              </div>
            </div>
            <button 
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-300 ease-in-out flex items-center ${soundEnabled ? "bg-emerald-500 dark:bg-surface-tint" : "bg-neutral-300 dark:bg-white/10"}`}
            >
              <div className={`w-5 h-5 rounded-full shadow-md bg-white transition-transform duration-300 ${soundEnabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Haptics Controller Row */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/5 flex items-center justify-center text-neutral-500 dark:text-primary">
                <span className="material-symbols-outlined text-base">vibration</span>
              </div>
              <div className="text-left">
                <span className="font-headline text-xs font-bold block text-neutral-900 dark:text-primary">Haptic Feedback</span>
                <span className="font-body text-[10px] text-neutral-400 dark:text-on-surface-variant block mt-0.5">Vibration on interactions</span>
              </div>
            </div>
            <button 
              onClick={() => setHapticsEnabled(!hapticsEnabled)}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-300 ease-in-out flex items-center ${hapticsEnabled ? "bg-emerald-500 dark:bg-surface-tint" : "bg-neutral-300 dark:bg-white/10"}`}
            >
              <div className={`w-5 h-5 rounded-full shadow-md bg-white transition-transform duration-300 ${hapticsEnabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Push Broadcast Row */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/5 flex items-center justify-center text-neutral-500 dark:text-primary">
                <span className="material-symbols-outlined text-base">notifications</span>
              </div>
              <div className="text-left">
                <span className="font-headline text-xs font-bold block text-neutral-900 dark:text-primary">Push Notifications</span>
                <span className="font-body text-[10px] text-neutral-400 dark:text-on-surface-variant block mt-0.5">Game invites & messages</span>
              </div>
            </div>
            <button 
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-300 ease-in-out flex items-center ${notificationsEnabled ? "bg-indigo-600 dark:bg-surface-tint" : "bg-neutral-300 dark:bg-white/10"}`}
            >
              <div className={`w-5 h-5 rounded-full shadow-md bg-white transition-transform duration-300 ${notificationsEnabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 🔐 SECTION 3: ACCOUNT & UTILITIES LINKS */}
      <div className="space-y-2">
        <h3 className="font-caps text-[9px] font-bold uppercase tracking-widest text-neutral-400 dark:text-on-surface-variant px-1">Account & Legal</h3>
        <div className="bg-white/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10 backdrop-blur-xl rounded-[20px] overflow-hidden shadow-sm divide-y divide-neutral-100 dark:divide-white/5 transition-colors duration-300">
          
          <button className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/5 flex items-center justify-center text-neutral-500 dark:text-primary">
                <span className="material-symbols-outlined text-base">manage_accounts</span>
              </div>
              <span className="font-headline text-xs font-bold text-neutral-900 dark:text-primary">Manage Account</span>
            </div>
            <span className="material-symbols-outlined text-sm text-neutral-300 dark:text-white/20">chevron_right</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/5 flex items-center justify-center text-neutral-500 dark:text-primary">
                <span className="material-symbols-outlined text-base">help</span>
              </div>
              <span className="font-headline text-xs font-bold text-neutral-900 dark:text-primary">Help & Support</span>
            </div>
            <span className="material-symbols-outlined text-sm text-neutral-400 dark:text-white/20">chevron_right</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/5 flex items-center justify-center text-neutral-500 dark:text-primary">
                <span className="material-symbols-outlined text-base">policy</span>
              </div>
              <span className="font-headline text-xs font-bold text-neutral-900 dark:text-primary">Privacy Policy</span>
            </div>
            <span className="material-symbols-outlined text-sm text-neutral-300 dark:text-white/20">open_in_new</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/5 flex items-center justify-center text-neutral-500 dark:text-primary">
                <span className="material-symbols-outlined text-base">gavel</span>
              </div>
              <span className="font-headline text-xs font-bold text-neutral-900 dark:text-primary">Terms of Service</span>
            </div>
            <span className="material-symbols-outlined text-sm text-neutral-300 dark:text-white/20">open_in_new</span>
          </button>

        </div>
      </div>

      {/* 🚪 SECTION 4: SYSTEM SHUTDOWN ACTION AREA */}
      <div className="pt-2 flex flex-col items-center gap-3">
        <button 
          onClick={terminateSession}
          className="w-full bg-white/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10 backdrop-blur-xl rounded-[20px] p-4 flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-200 dark:hover:border-red-500/20 text-red-500 transition-all active:scale-[0.99] shadow-sm"
        >
          <span className="material-symbols-outlined text-base">logout</span>
          <span className="font-caps text-[10px] font-black uppercase tracking-wider">Logout Session</span>
        </button>
        
        <p className="font-caps text-[9px] font-bold text-neutral-400 dark:text-neutral-500 tracking-widest uppercase">
          Joe Yoke Client v1.2.0
        </p>
      </div>

    </div>
  );
}