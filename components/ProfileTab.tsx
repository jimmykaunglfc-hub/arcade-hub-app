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

interface Friend {
  id: string;
  username: string;
  avatar_url: string;
  friendship_id: string;
}

// 🌓 Define the explicit TypeScript types passed from app/page.tsx
interface ProfileTabProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export default function ProfileTab({ isDarkMode, onToggleTheme }: ProfileTabProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchTarget, setSearchTarget] = useState("");
  const [loadingAction, setLoadingAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [fetchStatus, setFetchStatus] = useState<"loading" | "found" | "missing">("loading");

  useEffect(() => {
    fetchProfileAndFriends();
  }, []);

  const fetchProfileAndFriends = async () => {
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
      return;
    }

    const { data: friendships } = await supabase
      .from("friendships")
      .select("*")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

    if (friendships) {
      const friendIds = friendships.map(f => f.requester_id === user.id ? f.receiver_id : f.requester_id);
      
      if (friendIds.length > 0) {
        const { data: friendProfiles } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", friendIds);
        
        if (friendProfiles) {
          const mappedFriends = friendProfiles.map(p => ({
            id: p.id,
            username: p.username,
            avatar_url: p.avatar_url,
            friendship_id: friendships.find(f => f.requester_id === p.id || f.receiver_id === p.id)?.id || ""
          }));
          setFriends(mappedFriends);
        }
      } else {
        setFriends([]);
      }
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !searchTarget.trim()) return;
    setLoadingAction(true);
    setStatusMessage("");

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id, username")
      .or(`email.eq.${searchTarget.trim()},username.eq.${searchTarget.trim()}`)
      .maybeSingle();

    if (!targetProfile) {
      setStatusMessage("Player node not found in network matrix.");
      setLoadingAction(false);
      return;
    }

    if (targetProfile.id === profile.id) {
      setStatusMessage("You cannot establish a connection loop with yourself.");
      setLoadingAction(false);
      return;
    }

    const { error: inviteError } = await supabase
      .from("friendships")
      .insert({
        requester_id: profile.id,
        receiver_id: targetProfile.id,
        status: "accepted" 
      });

    if (inviteError) {
      setStatusMessage("Connection link already exists or is pending.");
    } else {
      setStatusMessage(`Successfully connected with ${targetProfile.username}!`);
      setSearchTarget("");
      fetchProfileAndFriends();
    }
    setLoadingAction(false);
  };

  const sendGameChallenge = async (friendId: string, gameName: string) => {
    if (!profile) return;
    
    const { data: match } = await supabase
      .from("checkers_matches")
      .insert({
        p1_id: profile.id,
        board: [
          [0, 2, 0, 2, 0, 2, 0, 2], [2, 0, 2, 0, 2, 0, 2, 0], [0, 2, 0, 2, 0, 2, 0, 2],
          [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0],
          [1, 0, 1, 0, 1, 0, 1, 0], [0, 1, 0, 1, 0, 1, 0, 1], [1, 0, 1, 0, 1, 0, 1, 0],
        ],
        status: "waiting"
      })
      .select()
      .single();

    if (!match) return alert("Failed to initialize match framework.");

    const { error } = await supabase
      .from("game_invites")
      .insert({
        sender_id: profile.id,
        receiver_id: friendId,
        match_id: match.id,
        game_name: gameName,
        status: "pending"
      });

    if (!error) {
      alert(`Challenge broadcasted! Opening room lobby...`);
      window.location.reload(); 
    }
  };

  const terminateSession = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (fetchStatus === "loading") {
    return (
      <div className="text-center p-6 text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest animate-pulse">
        Compiling User Node...
      </div>
    );
  }

  if (fetchStatus === "missing" || !profile) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-950/40 rounded-2xl p-6 text-center shadow-sm animate-fade-in w-full max-w-sm mx-auto mt-10">
        <span className="material-symbols-outlined text-3xl text-red-500 mb-2">error</span>
        <h2 className="text-base font-bold text-neutral-900 dark:text-white mb-1">Profile Not Synced</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6">
          Your active session exists, but your public profile row was not found. Re-authenticate to trigger the profile setup pipeline.
        </p>
        <button 
          onClick={terminateSession}
          className="w-full py-2.5 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-red-100/60 dark:hover:bg-red-950/40 transition-all active:scale-98"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12 w-full text-neutral-900 dark:text-neutral-100">
      
      {/* 👤 SECTION 1: IDENTITY PROFILE DISPLAY */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-900 rounded-3xl p-6 shadow-sm flex flex-col items-center text-center transition-colors">
        <div className="w-20 h-20 rounded-full border border-neutral-200 dark:border-neutral-800 overflow-hidden relative bg-neutral-50 dark:bg-neutral-950">
          <Image src={profile.avatar_url} alt="Profile Node" fill className="object-cover p-1" unoptimized />
        </div>
        
        <div className="mt-4 space-y-0.5">
          <h2 className="text-lg font-black tracking-tight">{profile.username}</h2>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 font-medium">{profile.email}</p>
        </div>

        <div className="flex gap-2 mt-3.5">
          <span className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md">
            Verified Account
          </span>
        </div>
      </div>

      {/* 🌓 SECTION 2: APP PREFERENCES SETTINGS HUB */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-900 rounded-2xl p-4 shadow-sm transition-colors">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3 px-1">
          System Configuration
        </h3>

        <div className="flex items-center justify-between p-1">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-xl text-neutral-400 dark:text-neutral-500">
              {isDarkMode ? "dark_mode" : "light_mode"}
            </span>
            <div>
              <span className="text-xs font-bold block">Interface Appearance</span>
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block mt-0.5">
                {isDarkMode ? "Obsidian Dark Layout" : "Minimal Light Layout"}
              </span>
            </div>
          </div>

          {/* Premium Switch Toggle Action */}
          <button 
            onClick={onToggleTheme}
            className="h-7 px-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors border border-neutral-200/40 dark:border-neutral-800/60"
          >
            Switch Mode
          </button>
        </div>
      </div>

      {/* 🤝 SECTION 3: SOCIAL CONNECTION LINK GATEWAY */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-900 rounded-2xl p-4 space-y-3 shadow-sm transition-colors">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-1">
            Network Connections
          </h3>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5 px-1">
            Establish a peer-to-peer connection via public identity username.
          </p>
        </div>

        <form onSubmit={handleAddFriend} className="flex gap-2">
          <input 
            type="text" 
            placeholder="Search username or email..."
            value={searchTarget}
            onChange={(e) => setSearchTarget(e.target.value)}
            className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 text-neutral-900 dark:text-white transition-colors"
          />
          <button 
            type="submit"
            disabled={loadingAction}
            className="px-4 bg-neutral-900 dark:bg-white text-white dark:text-black font-bold text-xs uppercase rounded-xl hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50"
          >
            Connect
          </button>
        </form>
        {statusMessage && <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold px-1">{statusMessage}</p>}
      </div>

      {/* ⚔️ SECTION 4: NETWORK FRIENDS GRID */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 px-1">
          Synchronized Friends ({friends.length})
        </h3>

        {friends.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-900 rounded-2xl p-6 text-center text-xs text-neutral-400 dark:text-neutral-500 font-medium transition-colors">
            No active peer connections found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {friends.map((friend) => (
              <div 
                key={friend.id}
                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-900 rounded-2xl p-3 flex items-center justify-between shadow-sm group transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full border border-neutral-200 dark:border-neutral-800 overflow-hidden relative bg-neutral-50 dark:bg-neutral-950">
                    <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover p-0.5" unoptimized />
                  </div>
                  <div>
                    <h4 className="text-xs font-black tracking-tight">{friend.username}</h4>
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold tracking-wide uppercase flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
                      Online
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => sendGameChallenge(friend.id, "Neon Checkers")}
                  className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white dark:hover:text-white font-bold text-[10px] uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xs">swords</span>
                  Challenge
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SYSTEM LOGOUT TERMINAL CARD */}
      <div className="pt-4 border-t border-neutral-200 dark:border-neutral-900 flex justify-center">
        <button 
          onClick={terminateSession}
          className="text-[10px] font-black uppercase tracking-wider text-neutral-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          Terminate Identity Session
        </button>
      </div>

    </div>
  );
}