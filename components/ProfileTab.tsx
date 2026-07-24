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

  // Local preferences states preserved
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
      <div className="text-center p-6 font-caps text-[10px] font-bold text-on-surface-variant uppercase tracking-widest animate-pulse">
        Compiling User Node...
      </div>
    );
  }

  if (fetchStatus === "missing" || !profile) {
    return (
      <div className="bg-surface border border-surface-container-highest rounded-[24px] p-6 text-center shadow-sm animate-fade-in w-full max-w-sm mx-auto mt-6">
        <span className="material-symbols-outlined text-[32px] text-red-500 mb-3">error</span>
        <h2 className="font-headline text-base font-black text-on-surface mb-1">Profile Not Synced</h2>
        <p className="font-body text-xs text-on-surface-variant mb-6 leading-relaxed">
          Your active session exists, but your public profile row was not found. Re-authenticate to trigger the profile setup pipeline.
        </p>
        <button 
          onClick={terminateSession}
          className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-headline font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-95"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in pb-12 w-full text-on-surface">
      
      {/* 👤 SECTION 1: IDENTITY HEADER CARD */}
      <div className="bg-surface border border-surface-container-highest rounded-[24px] p-6 flex flex-col items-center text-center relative overflow-hidden shadow-sm">
        
        <div className="w-24 h-24 rounded-full border-4 border-surface-container-high overflow-hidden relative bg-surface-variant z-10 shadow-inner">
          <Image src={profile.avatar_url} alt="Profile Node" fill className="object-cover" unoptimized />
        </div>
        
        <div className="mt-4 z-10">
          <h2 className="font-headline text-xl font-black tracking-tight text-on-surface">{profile.username}</h2>
          <p className="font-body text-[13px] text-on-surface-variant font-medium mt-0.5">{profile.email}</p>
        </div>

        <div className="mt-5 z-10">
          <span className="bg-primary-container text-primary text-[10px] font-caps font-bold uppercase tracking-widest px-4 py-2 rounded-xl flex items-center gap-1.5 border border-primary/20">
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
            Verified Account
          </span>
        </div>
      </div>

      {/* ⚙️ SECTION 2: APP PREFERENCES CONTAINER */}
      <div className="space-y-3">
        <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-2">App Preferences</h3>
        <div className="bg-surface border border-surface-container-highest rounded-[24px] overflow-hidden divide-y divide-surface-variant shadow-sm">
          
          {/* Theme Controller Row */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-[14px] bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">{isDarkMode ? "dark_mode" : "light_mode"}</span>
              </div>
              <div className="text-left">
                <span className="font-headline text-[13px] font-bold block text-on-surface">Dark appearance</span>
                <span className="font-body text-[11px] text-on-surface-variant block mt-0.5">Adjust interface appearance</span>
              </div>
            </div>
            <button 
              onClick={onToggleTheme}
              className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${isDarkMode ? "bg-primary" : "bg-surface-container-highest"}`}
            >
              <div className={`w-5 h-5 rounded-full shadow-md transition-transform duration-300 ${isDarkMode ? "bg-on-primary translate-x-5" : "bg-on-surface-variant translate-x-0"}`} />
            </button>
          </div>

          {/* Audio Controller Row */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-[14px] bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">volume_up</span>
              </div>
              <div className="text-left">
                <span className="font-headline text-[13px] font-bold block text-on-surface">Sound Effects</span>
                <span className="font-body text-[11px] text-on-surface-variant block mt-0.5">In-game audio cues</span>
              </div>
            </div>
            <button 
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${soundEnabled ? "bg-primary" : "bg-surface-container-highest"}`}
            >
              <div className={`w-5 h-5 rounded-full shadow-md transition-transform duration-300 ${soundEnabled ? "bg-on-primary translate-x-5" : "bg-on-surface-variant translate-x-0"}`} />
            </button>
          </div>

          {/* Haptics Controller Row */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-[14px] bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">vibration</span>
              </div>
              <div className="text-left">
                <span className="font-headline text-[13px] font-bold block text-on-surface">Haptic Feedback</span>
                <span className="font-body text-[11px] text-on-surface-variant block mt-0.5">Vibration on interactions</span>
              </div>
            </div>
            <button 
              onClick={() => setHapticsEnabled(!hapticsEnabled)}
              className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${hapticsEnabled ? "bg-primary" : "bg-surface-container-highest"}`}
            >
              <div className={`w-5 h-5 rounded-full shadow-md transition-transform duration-300 ${hapticsEnabled ? "bg-on-primary translate-x-5" : "bg-on-surface-variant translate-x-0"}`} />
            </button>
          </div>

          {/* Push Broadcast Row */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-[14px] bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">notifications</span>
              </div>
              <div className="text-left">
                <span className="font-headline text-[13px] font-bold block text-on-surface">Push Notifications</span>
                <span className="font-body text-[11px] text-on-surface-variant block mt-0.5">Game invites & messages</span>
              </div>
            </div>
            <button 
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ease-in-out flex items-center ${notificationsEnabled ? "bg-primary" : "bg-surface-container-highest"}`}
            >
              <div className={`w-5 h-5 rounded-full shadow-md transition-transform duration-300 ${notificationsEnabled ? "bg-on-primary translate-x-5" : "bg-on-surface-variant translate-x-0"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 🔐 SECTION 3: ACCOUNT & UTILITIES LINKS */}
      <div className="space-y-3">
        <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-2">Account & Legal</h3>
        <div className="bg-surface border border-surface-container-highest rounded-[24px] overflow-hidden divide-y divide-surface-variant shadow-sm">
          
          <button className="w-full flex items-center justify-between p-4 hover:bg-surface-variant transition-colors text-left group active:bg-surface-variant">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-[14px] bg-surface-container-high flex items-center justify-center text-on-surface group-hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
              </div>
              <span className="font-headline text-sm font-bold text-on-surface">Manage Account</span>
            </div>
            <span className="material-symbols-outlined text-base text-on-surface-variant">chevron_right</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-surface-variant transition-colors text-left group active:bg-surface-variant">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-[14px] bg-surface-container-high flex items-center justify-center text-on-surface group-hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[20px]">help</span>
              </div>
              <span className="font-headline text-sm font-bold text-on-surface">Help & Support</span>
            </div>
            <span className="material-symbols-outlined text-base text-on-surface-variant">chevron_right</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-surface-variant transition-colors text-left group active:bg-surface-variant">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-[14px] bg-surface-container-high flex items-center justify-center text-on-surface group-hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[20px]">policy</span>
              </div>
              <span className="font-headline text-sm font-bold text-on-surface">Privacy Policy</span>
            </div>
            <span className="material-symbols-outlined text-base text-on-surface-variant">open_in_new</span>
          </button>

          <button className="w-full flex items-center justify-between p-4 hover:bg-surface-variant transition-colors text-left group active:bg-surface-variant">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-[14px] bg-surface-container-high flex items-center justify-center text-on-surface group-hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[20px]">gavel</span>
              </div>
              <span className="font-headline text-sm font-bold text-on-surface">Terms of Service</span>
            </div>
            <span className="material-symbols-outlined text-base text-on-surface-variant">open_in_new</span>
          </button>

        </div>
      </div>

      {/* 🚪 SECTION 4: SYSTEM SHUTDOWN ACTION AREA */}
      <div className="pt-2 flex flex-col items-center gap-4">
        <button 
          onClick={terminateSession}
          className="w-full bg-surface border border-surface-container-highest rounded-[24px] p-4 flex items-center justify-center gap-2 hover:bg-surface-variant text-red-500 transition-all active:scale-[0.98] shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          <span className="font-headline text-[13px] font-bold tracking-wide">Logout Session</span>
        </button>
        
        <p className="font-caps text-[10px] font-bold text-on-surface-variant tracking-widest uppercase">
          Joe Yoke Client v1.2.0
        </p>
      </div>

    </div>
  );
}