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

  // Local states for UI premium feel (Settings)
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
      <div className="text-center p-6 text-xs font-bold text-neutral-400 dark:text-neutral-600 uppercase tracking-widest animate-pulse">
        Compiling User Node...
      </div>
    );
  }

  if (fetchStatus === "missing" || !profile) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/40 rounded-[2rem] p-6 text-center shadow-sm animate-fade-in w-full max-w-sm mx-auto mt-10">
        <span className="material-symbols-outlined text-3xl text-red-500 mb-2">error</span>
        <h2 className="text-base font-bold text-neutral-900 dark:text-white mb-1">Profile Not Synced</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6">
          Your active session exists, but your public profile row was not found. Re-authenticate to trigger the profile setup pipeline.
        </p>
        <button 
          onClick={terminateSession}
          className="w-full py-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-red-100/60 dark:hover:bg-red-950/40 transition-all active:scale-95"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12 w-full text-neutral-900 dark:text-neutral-100">
      
      {/* 👤 SECTION 1: PREMIUM IDENTITY DISPLAY */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[2rem] p-6 shadow-sm flex flex-col items-center text-center transition-colors relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-500/10 dark:bg-indigo-500/20 blur-3xl rounded-full pointer-events-none"></div>
        
        <div className="w-20 h-20 rounded-full border border-neutral-200 dark:border-neutral-800 overflow-hidden relative bg-neutral-50 dark:bg-neutral-950 shadow-sm z-10">
          <Image src={profile.avatar_url} alt="Profile Node" fill className="object-cover p-1" unoptimized />
        </div>
        
        <div className="mt-4 space-y-1 z-10">
          <h2 className="text-xl font-black tracking-tight text-neutral-900 dark:text-white">{profile.username}</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">{profile.email}</p>
        </div>

        <div className="flex gap-2 mt-4 z-10">
          <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-lg flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[12px]">verified</span>
            Verified Account
          </span>
        </div>
      </div>

      {/* ⚙️ SECTION 2: APP PREFERENCES */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 px-4">App Preferences</h3>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm transition-colors">
          
          {/* Theme Toggle */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800/60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400">
                <span className="material-symbols-outlined text-base">{isDarkMode ? "dark_mode" : "light_mode"}</span>
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block text-neutral-900 dark:text-white">Dark Mode</span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block mt-0.5">Adjust interface appearance</span>
              </div>
            </div>
            {/* Custom Premium CSS Toggle */}
            <button 
              onClick={onToggleTheme}
              className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${isDarkMode ? "bg-indigo-600" : "bg-neutral-200 dark:bg-neutral-700"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${isDarkMode ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Sound Toggle */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800/60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400">
                <span className="material-symbols-outlined text-base">volume_up</span>
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block text-neutral-900 dark:text-white">Sound Effects</span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block mt-0.5">In-game audio cues</span>
              </div>
            </div>
            <button 
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${soundEnabled ? "bg-emerald-500" : "bg-neutral-200 dark:bg-neutral-700"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${soundEnabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Haptics Toggle */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800/60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400">
                <span className="material-symbols-outlined text-base">vibration</span>
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block text-neutral-900 dark:text-white">Haptic Feedback</span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block mt-0.5">Vibration on interactions</span>
              </div>
            </div>
            <button 
              onClick={() => setHapticsEnabled(!hapticsEnabled)}
              className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${hapticsEnabled ? "bg-emerald-500" : "bg-neutral-200 dark:bg-neutral-700"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${hapticsEnabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Notifications Toggle */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400">
                <span className="material-symbols-outlined text-base">notifications</span>
              </div>
              <div className="text-left">
                <span className="text-xs font-bold block text-neutral-900 dark:text-white">Push Notifications</span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block mt-0.5">Game invites & messages</span>
              </div>
            </div>
            <button 
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${notificationsEnabled ? "bg-indigo-600" : "bg-neutral-200 dark:bg-neutral-700"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${notificationsEnabled ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 🔐 SECTION 3: ACCOUNT & SUPPORT */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 px-4">Account & Legal</h3>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm transition-colors flex flex-col">
          
          <button className="w-full flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-lg text-neutral-500">person</span>
              <span className="text-xs font-bold text-neutral-900 dark:text-white">Manage Account</span>
            </div>
            <span className="material-symbols-outlined text-sm text-neutral-400">chevron_right</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-lg text-neutral-500">help</span>
              <span className="text-xs font-bold text-neutral-900 dark:text-white">Help & Support</span>
            </div>
            <span className="material-symbols-outlined text-sm text-neutral-400">chevron_right</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-lg text-neutral-500">policy</span>
              <span className="text-xs font-bold text-neutral-900 dark:text-white">Privacy Policy</span>
            </div>
            <span className="material-symbols-outlined text-sm text-neutral-400">open_in_new</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-lg text-neutral-500">gavel</span>
              <span className="text-xs font-bold text-neutral-900 dark:text-white">Terms of Service</span>
            </div>
            <span className="material-symbols-outlined text-sm text-neutral-400">open_in_new</span>
          </button>

        </div>
      </div>

      {/* 🚪 SECTION 4: LOGOUT & VERSION */}
      <div className="pt-4 flex flex-col items-center gap-4">
        <button 
          onClick={terminateSession}
          className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/20 hover:border-red-200 dark:hover:border-red-900/50 text-red-500 transition-all active:scale-[0.98] shadow-sm"
        >
          <span className="material-symbols-outlined text-lg">logout</span>
          <span className="text-xs font-black uppercase tracking-wider">Terminate Session</span>
        </button>
        
        <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
          Joe Yoke Client v1.2.0
        </p>
      </div>

    </div>
  );
}