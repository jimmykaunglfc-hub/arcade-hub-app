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

export default function ProfileTab() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchTarget, setSearchTarget] = useState("");
  const [loadingAction, setLoadingAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  
  // 🛡️ Added a fetch status to prevent infinite loading loops
  const [fetchStatus, setFetchStatus] = useState<"loading" | "found" | "missing">("loading");

  useEffect(() => {
    fetchProfileAndFriends();
  }, []);

  const fetchProfileAndFriends = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Pull user's public profile row using .maybeSingle() to prevent 406 crashes
    const { data: myProfile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle(); 
    
    if (myProfile) {
      setProfile(myProfile);
      setFetchStatus("found");
    } else {
      setFetchStatus("missing");
      return; // Stop fetching friends if profile doesn't exist
    }

    // 2. Pull all accepted friendships
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

    const { data: targetProfile, error } = await supabase
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
          [0, 2, 0, 2, 0, 2, 0, 2],
          [2, 0, 2, 0, 2, 0, 2, 0],
          [0, 2, 0, 2, 0, 2, 0, 2],
          [0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0],
          [1, 0, 1, 0, 1, 0, 1, 0],
          [0, 1, 0, 1, 0, 1, 0, 1],
          [1, 0, 1, 0, 1, 0, 1, 0],
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

  // 🛡️ FALLBACK 1: Loading State
  if (fetchStatus === "loading") {
    return (
      <div className="text-center p-6 text-xs font-black text-primary uppercase tracking-widest animate-pulse">
        Compiling User Node...
      </div>
    );
  }

  // 🛡️ FALLBACK 2: Missing Profile Error Guard
  if (fetchStatus === "missing" || !profile) {
    return (
      <div className="bg-surface-variant/30 border border-red-500/30 rounded-2xl p-6 text-center shadow-lg animate-fade-in w-full max-w-sm mx-auto mt-10">
        <span className="material-symbols-outlined text-4xl text-red-400 mb-3">warning</span>
        <h2 className="text-lg font-black text-white mb-2">Profile Matrix Missing</h2>
        <p className="text-xs text-on-surface-variant/80 mb-6">
          Your secure identity session exists, but your public profile row was not found in the database. Terminate the session and log back in to trigger the auto-generation script.
        </p>
        <button 
          onClick={terminateSession}
          className="w-full py-3 bg-red-500/20 text-red-400 border border-red-500/40 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-red-500/30 transition-all active:scale-95"
        >
          Terminate Session
        </button>
      </div>
    );
  }

  // 🛡️ SUCCESS: Render normal profile UI
  return (
    <div className="space-y-6 animate-fade-in pb-12 w-full">
      {/* 👤 SECTION 1: IDENTITY DISPLAY CARD */}
      <div className="bg-gradient-to-b from-surface-variant/40 to-surface rounded-[2rem] border border-white/5 p-6 shadow-xl relative overflow-hidden flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-full border-2 border-primary overflow-hidden relative bg-black/40 shadow-[0_0_25px_rgba(192,193,255,0.25)]">
          <Image src={profile.avatar_url} alt="Profile Node" fill className="object-cover p-1.5" unoptimized />
        </div>
        
        <div className="mt-4 space-y-1">
          <h2 className="text-xl font-black text-white tracking-tight">{profile.username}</h2>
          <p className="text-xs text-on-surface-variant/60 font-medium">{profile.email}</p>
        </div>

        <div className="flex gap-2 mt-4">
          <span className="bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
            Verified Player
          </span>
          <span className="bg-white/5 border border-white/10 text-on-surface-variant/80 text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
            Supabase Auth
          </span>
        </div>

        <button 
          onClick={terminateSession}
          className="mt-6 text-[10px] font-black uppercase tracking-widest text-red-400/70 hover:text-red-400 transition-colors flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          Terminate Identity Session
        </button>
      </div>

      {/* 🤝 SECTION 2: SOCIAL CONNECTION PORTAL (ADD FRIENDS) */}
      <div className="bg-surface-variant/20 rounded-2xl border border-white/5 p-4 space-y-3 shadow-md">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-primary">Establish Connection Link</h3>
          <p className="text-[10px] text-on-surface-variant/50 font-medium mt-0.5">Input a target network username or email address below.</p>
        </div>

        <form onSubmit={handleAddFriend} className="flex gap-2">
          <input 
            type="text" 
            placeholder="Username or email address..."
            value={searchTarget}
            onChange={(e) => setSearchTarget(e.target.value)}
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 text-xs text-white focus:outline-none focus:border-primary transition-colors"
          />
          <button 
            type="submit"
            disabled={loadingAction}
            className="px-5 bg-white text-black font-black text-xs uppercase rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Connect
          </button>
        </form>
        {statusMessage && <p className="text-[10px] text-primary font-bold px-1">{statusMessage}</p>}
      </div>

      {/* ⚔️ SECTION 3: REAL-TIME FRIENDS ROSTER */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant/60 px-1">
          Synchronized Network Friends ({friends.length})
        </h3>

        {friends.length === 0 ? (
          <div className="border border-white/5 bg-surface-variant/5 rounded-2xl p-6 text-center text-xs text-on-surface-variant/40 font-medium">
            No active peer-to-peer friend links found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {friends.map((friend) => (
              <div 
                key={friend.id}
                className="bg-surface-variant/20 border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-sm group hover:border-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-black/40 border border-white/10 overflow-hidden relative">
                    <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover p-1" unoptimized />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white tracking-tight">{friend.username}</h4>
                    <span className="text-[8px] text-green-400 font-black tracking-wider uppercase flex items-center gap-1 mt-0.5">
                      <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse"></span>
                      Online Matrix
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => sendGameChallenge(friend.id, "Neon Checkers")}
                  className="h-8 px-3.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary text-primary hover:text-on-primary font-black text-[10px] uppercase tracking-wider transition-all duration-300 active:scale-95 flex items-center gap-1"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(192,193,255,0.15))' }}
                >
                  <span className="material-symbols-outlined text-xs">swords</span>
                  Challenge
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}