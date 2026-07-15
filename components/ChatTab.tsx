"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

interface Friend {
  id: string;
  username: string;
  avatar_url: string;
}

interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: string;
  match_id?: string;
  game_name?: string;
  invite_status?: string;
  created_at: string;
}

const INITIAL_BOARD = [
  [0, 2, 0, 2, 0, 2, 0, 2], 
  [2, 0, 2, 0, 2, 0, 2, 0], 
  [0, 2, 0, 2, 0, 2, 0, 2],
  [0, 0, 0, 0, 0, 0, 0, 0], 
  [0, 0, 0, 0, 0, 0, 0, 0],
  [1, 0, 1, 0, 1, 0, 1, 0], 
  [0, 1, 0, 1, 0, 1, 0, 1], 
  [1, 0, 1, 0, 1, 0, 1, 0]
];

export default function ChatTab({ onPlay }: { onPlay?: (url: string, matchId: string) => void }) {
  // 🧭 HUB NAVIGATION STATE
  const [activeView, setActiveView] = useState<"hub" | "chat">("hub");
  const [hubTab, setHubTab] = useState<"dms" | "groups" | "network">("dms");

  // 👤 USER & DATA STATES
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string>("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeChat, setActiveChat] = useState<Friend | null>(null);
  
  // 💬 CHAT STATES
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 🤝 INVITATION & GAME SELECTOR STATES
  const [searchTarget, setSearchTarget] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [copied, setCopied] = useState(false);
  
  // 🎮 Modal Navigation State
  const [showGameSelector, setShowGameSelector] = useState(false);
  const [inviteStep, setInviteStep] = useState<"game" | "carrom_mode">("game");

  // 1. INITIALIZE IDENTITY & NETWORK
  useEffect(() => {
    const initData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);

      const { data: myProfile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();
        
      if (myProfile) setMyUsername(myProfile.username);

      const { data: friendships } = await supabase
        .from("friendships")
        .select("*")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (friendships && friendships.length > 0) {
        const friendIds = friendships.map(f => 
          f.requester_id === user.id ? f.receiver_id : f.requester_id
        );
        const { data: friendProfiles } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", friendIds);
        
        if (friendProfiles) setFriends(friendProfiles);
      }
    };
    initData();
  }, []);

  // 2. LOAD MESSAGES (When a chat is opened)
  useEffect(() => {
    if (!myUserId || !activeChat || activeView !== "chat") return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${myUserId},receiver_id.eq.${activeChat.id}),and(sender_id.eq.${activeChat.id},receiver_id.eq.${myUserId})`)
        .order("created_at", { ascending: true })
        .limit(50);
        
      if (data) setMessages(data);
    };

    fetchMessages();

    const channel = supabase.channel(`chat_${activeChat.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newMsg = payload.new as DirectMessage;
          if (
            (newMsg.sender_id === myUserId && newMsg.receiver_id === activeChat.id) || 
            (newMsg.sender_id === activeChat.id && newMsg.receiver_id === myUserId)
          ) {
            setMessages((prev) => [...prev, newMsg]);
          }
        } else if (payload.eventType === 'UPDATE') {
          const updatedMsg = payload.new as DirectMessage;
          setMessages((prev) => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
        }
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myUserId, activeChat, activeView]);

  // Safely scroll to bottom ONLY when inside the full-screen chat modal
  useEffect(() => {
    if (activeView === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeView]);

  // --- ACTIONS ---
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !myUserId || !activeChat) return;

    const payload = {
      sender_id: myUserId,
      receiver_id: activeChat.id,
      content: newMessage.trim(),
      message_type: 'text'
    };
    setNewMessage("");
    await supabase.from("direct_messages").insert([payload]);
  };

  // 🕹️ DATABASE-SAFE GAME INVITER
  const handleSendGameInvite = async (gameType: "checkers" | "carrom", mode?: "freestyle" | "classic") => {
    setShowGameSelector(false);
    setInviteStep("game");
    if (!myUserId || !activeChat) return;
    
    if (gameType === "checkers") {
      const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: match } = await supabase.from('checkers_matches').insert({
        p1_id: myUserId, 
        board: INITIAL_BOARD, 
        room_code: generatedCode, 
        status: 'waiting'
      }).select().single();
      
      if (match) {
        await supabase.from("direct_messages").insert([{
          sender_id: myUserId, 
          receiver_id: activeChat.id, 
          content: `Challenged you to Neon Checkers`,
          message_type: 'game_invite', 
          match_id: match.id, 
          game_name: "Neon Checkers", 
          invite_status: "pending"
        }]);
      }
    } else if (gameType === "carrom" && mode) {
      // 🛡️ CRITICAL FIX: Generate a strict UUID to satisfy DB Column constraints
      const generatedUUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      
      // Store the mode in the free-text 'game_name' column instead to prevent UUID format crashes
      const gameName = mode === "classic" ? "Carrom (Classic)" : "Carrom (Freestyle)";

      await supabase.from("direct_messages").insert([{
        sender_id: myUserId, 
        receiver_id: activeChat.id, 
        content: `Challenged you to ${gameName}`,
        message_type: 'game_invite', 
        match_id: generatedUUID, 
        game_name: gameName, 
        invite_status: "pending"
      }]);
    }
  };

  const updateInviteStatus = async (msgId: string, newStatus: string) => {
    await supabase.from('direct_messages').update({ invite_status: newStatus }).eq('id', msgId);
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myUserId || !searchTarget.trim()) return;
    setInviteStatus("Searching network...");

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", searchTarget.trim())
      .maybeSingle();

    if (!targetProfile) {
      setInviteStatus("User ID not found.");
      return;
    }
    if (targetProfile.id === myUserId) {
      setInviteStatus("You cannot invite yourself.");
      return;
    }

    const { error } = await supabase.from("friendships").insert({
      requester_id: myUserId, 
      receiver_id: targetProfile.id, 
      status: "accepted" 
    });

    if (error) {
      setInviteStatus("Already in your network.");
    } else {
      setInviteStatus(`Successfully connected with ${targetProfile.username}!`);
      setSearchTarget("");
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(myUsername);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openChat = (friend: Friend) => {
    setActiveChat(friend);
    setActiveView("chat");
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };


  // ============================================================================
  // RENDER VIEW 1: THE HUB 
  // ============================================================================
  if (activeView === "hub") {
    return (
      <div className="w-full animate-fade-in text-on-surface flex flex-col gap-6 pb-6">
        
        {/* 🎛️ SEGMENTED HUB NAVIGATION (Glassmorphism) */}
        <div className="bg-surface-container/50 backdrop-blur-md p-1.5 rounded-xl flex items-center shadow-sm border border-white/5">
          {[
            { id: "dms", label: "Messages" },
            { id: "groups", label: "Groups" },
            { id: "network", label: "Network" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setHubTab(tab.id as any)}
              className={`flex-1 py-2 font-caps text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 ${
                hubTab === tab.id 
                  ? "bg-surface-container-high text-primary shadow-sm" 
                  : "text-on-surface-variant hover:text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 💬 TAB: DIRECT MESSAGES */}
        {hubTab === "dms" && (
          <div className="flex flex-col gap-3">
            <h3 className="font-caps text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">
              Active Conversations
            </h3>
            {friends.length === 0 ? (
              <div className="p-8 text-center glass-panel rounded-3xl shadow-sm">
                <span className="material-symbols-outlined text-4xl text-white/20 mb-3">chat_bubble</span>
                <p className="font-body text-xs text-on-surface-variant font-medium leading-relaxed">
                  Your inbox is empty.<br/>Head to the Network tab to connect.
                </p>
              </div>
            ) : (
              <div className="glass-panel rounded-3xl overflow-hidden shadow-sm">
                {friends.map((friend, index) => (
                  <button 
                    key={friend.id}
                    onClick={() => openChat(friend)}
                    className={`w-full p-4 flex items-center justify-between transition-all hover:bg-white/5 text-left ${
                      index !== friends.length - 1 ? 'border-b border-white/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden relative bg-surface-container shrink-0">
                        <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover" unoptimized />
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-surface-tint border-[2px] border-surface rounded-full"></div>
                      </div>
                      <div>
                        <h4 className="font-headline text-sm font-extrabold tracking-tight text-primary">{friend.username}</h4>
                        <p className="font-body text-[11px] text-on-surface-variant font-medium truncate mt-0.5">Tap to open secure comms...</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-white/20 text-lg">chevron_right</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 🏛️ TAB: GROUPS */}
        {hubTab === "groups" && (
          <div className="flex flex-col gap-3">
            <h3 className="font-caps text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">
              Discover Communities
            </h3>
            
            <div className="glass-panel rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:bg-white/5 transition-all cursor-pointer">
              <div className="w-12 h-12 rounded-[1.25rem] bg-tertiary-container/10 border border-tertiary-container/30 flex items-center justify-center shrink-0 shadow-inner">
                <span className="material-symbols-outlined text-tertiary-container">grid_4x4</span>
              </div>
              <div className="flex-1">
                <h4 className="font-headline text-sm font-extrabold tracking-tight text-primary">Global Checkers Hub</h4>
                <p className="font-body text-[10px] text-on-surface-variant font-medium mt-0.5">2,140 Members • 14 Online</p>
              </div>
              <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-primary font-caps text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors">Join</button>
            </div>

            <div className="glass-panel rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:bg-white/5 transition-all cursor-pointer">
              <div className="w-12 h-12 rounded-[1.25rem] bg-primary-container/10 border border-primary-container/30 flex items-center justify-center shrink-0 shadow-inner">
                <span className="material-symbols-outlined text-surface-tint">style</span>
              </div>
              <div className="flex-1">
                <h4 className="font-headline text-sm font-extrabold tracking-tight text-primary">Glitch Deck Veterans</h4>
                <p className="font-body text-[10px] text-on-surface-variant font-medium mt-0.5">856 Members • 3 Online</p>
              </div>
              <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-primary font-caps text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors">Join</button>
            </div>
          </div>
        )}

        {/* 🌐 TAB: NETWORK & INVITATIONS */}
        {hubTab === "network" && (
          <div className="flex flex-col gap-6">
            
            {/* Share Your ID Card (Gradient Upgrade) */}
            <div className="bg-gradient-to-br from-tertiary-container/30 to-primary-container/10 rounded-3xl p-6 shadow-lg text-primary relative overflow-hidden border border-white/20 glass-panel">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <span className="material-symbols-outlined text-8xl">share</span>
              </div>
              <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Your Network ID</h3>
              <div className="flex items-end justify-between relative z-10">
                <p className="font-headline text-2xl font-extrabold tracking-tight">{myUsername || "Loading..."}</p>
                <div className="flex gap-2.5">
                  <button onClick={handleCopyId} className="w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-inner border border-white/10">
                    <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                  </button>
                  <button className="w-10 h-10 bg-primary text-background rounded-xl flex items-center justify-center shadow-md hover:scale-105 transition-all active:scale-95">
                    <span className="material-symbols-outlined text-sm">ios_share</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Add Friend Form */}
            <div className="glass-panel rounded-3xl p-5 shadow-sm">
              <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3 px-1">Add Connection</h3>
              <form onSubmit={handleAddFriend} className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter Network ID..."
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value)}
                  className="flex-1 bg-surface-container-high border border-white/10 rounded-xl px-4 py-3 font-body text-xs focus:outline-none focus:border-surface-tint transition-colors text-primary placeholder-on-surface-variant"
                />
                <button type="submit" disabled={!searchTarget.trim()} className="px-6 gradient-pill-primary font-caps font-bold text-[10px] uppercase tracking-wider rounded-xl hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 shadow-sm">
                  Invite
                </button>
              </form>
              {inviteStatus && <p className="font-body text-[11px] text-surface-tint font-bold mt-2.5 px-1">{inviteStatus}</p>}
            </div>

            {/* Current Friends List */}
            <div className="flex flex-col gap-2">
              <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1 mb-1">My Network Roster</h3>
              {friends.length === 0 ? (
                <p className="font-body text-xs text-on-surface-variant px-1">No connections yet.</p>
              ) : (
                friends.map(friend => (
                  <div key={friend.id} className="flex items-center justify-between p-3 glass-panel rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container relative">
                        <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover" unoptimized />
                      </div>
                      <span className="font-headline text-sm font-extrabold tracking-tight">{friend.username}</span>
                    </div>
                    <span className="font-caps text-[9px] font-bold text-surface-tint uppercase tracking-widest">Connected</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // RENDER VIEW 2: FULL-SCREEN OVERLAY CHAT MODAL 
  // ============================================================================
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background overflow-hidden animate-fade-in text-on-background">
      
      {/* 🎮 2-STEP GAME SELECTOR MODAL (Glassmorphism) */}
      {showGameSelector && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-end justify-center p-4 animate-fade-in">
          <div className="glass-panel bg-surface-container-high/90 w-full max-w-sm rounded-[2rem] p-6 shadow-2xl flex flex-col gap-4 border border-white/10">
            
            {inviteStep === "game" && (
              <>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-headline text-base font-extrabold tracking-tight uppercase text-primary">Select Arena</h3>
                  <button 
                    onClick={() => setShowGameSelector(false)} 
                    className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-on-surface-variant transition-all active:scale-90"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
                
                <button 
                  onClick={() => setInviteStep("carrom_mode")} 
                  className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl active:scale-[0.98] transition-all shadow-sm"
                >
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl flex items-center justify-center shadow-md">
                        <span className="material-symbols-outlined" style={{fontVariationSettings:"'FILL' 1"}}>radio_button_checked</span>
                     </div>
                     <div className="text-left">
                        <h4 className="font-headline text-sm font-extrabold text-primary">Carrom Matrix</h4>
                        <p className="font-caps text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-0.5">Physics • Strategy</p>
                     </div>
                   </div>
                   <span className="material-symbols-outlined text-white/40">chevron_right</span>
                </button>

                <button 
                  onClick={() => handleSendGameInvite("checkers")} 
                  className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl active:scale-[0.98] transition-all shadow-sm"
                >
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-gradient-to-br from-tertiary-container to-blue-500 text-background rounded-xl flex items-center justify-center shadow-md">
                        <span className="material-symbols-outlined" style={{fontVariationSettings:"'FILL' 1"}}>grid_4x4</span>
                     </div>
                     <div className="text-left">
                        <h4 className="font-headline text-sm font-extrabold text-primary">Neon Checkers</h4>
                        <p className="font-caps text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mt-0.5">Grid • Strategy</p>
                     </div>
                   </div>
                   <span className="material-symbols-outlined text-white/40">chevron_right</span>
                </button>
              </>
            )}

            {inviteStep === "carrom_mode" && (
              <>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setInviteStep("game")} 
                      className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">arrow_back_ios_new</span>
                    </button>
                    <h3 className="font-headline text-base font-extrabold tracking-tight uppercase text-primary">Rule Mode</h3>
                  </div>
                  <button 
                    onClick={() => { setShowGameSelector(false); setInviteStep("game"); }} 
                    className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-on-surface-variant transition-all active:scale-90"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>

                <button 
                  onClick={() => handleSendGameInvite("carrom", "freestyle")} 
                  className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl active:scale-[0.98] transition-all shadow-sm"
                >
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-white/10 border border-amber-500/50 text-amber-500 rounded-xl flex items-center justify-center shadow-md">
                        <span className="material-symbols-outlined" style={{fontVariationSettings:"'FILL' 1"}}>sports_score</span>
                     </div>
                     <div className="text-left">
                        <h4 className="font-headline text-sm font-extrabold text-primary">Freestyle</h4>
                        <p className="font-caps text-[9px] font-bold text-amber-500/80 uppercase tracking-widest mt-0.5">Score Based • Fast</p>
                     </div>
                   </div>
                   <span className="material-symbols-outlined text-amber-500">send</span>
                </button>

                <button 
                  onClick={() => handleSendGameInvite("carrom", "classic")} 
                  className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl active:scale-[0.98] transition-all shadow-sm"
                >
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-white/10 border border-amber-500/50 text-amber-500 rounded-xl flex items-center justify-center shadow-md">
                        <span className="material-symbols-outlined" style={{fontVariationSettings:"'FILL' 1"}}>palette</span>
                     </div>
                     <div className="text-left">
                        <h4 className="font-headline text-sm font-extrabold text-primary">Classic Colors</h4>
                        <p className="font-caps text-[9px] font-bold text-amber-500/80 uppercase tracking-widest mt-0.5">Claim Colors • Tactical</p>
                     </div>
                   </div>
                   <span className="material-symbols-outlined text-amber-500">send</span>
                </button>
              </>
            )}

          </div>
        </div>
      )}

      {/* 📞 THREAD HEADER */}
      <header className="shrink-0 w-full bg-surface/60 backdrop-blur-xl border-b border-white/10 z-20 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveView("hub")}
              className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-on-surface flex items-center justify-center transition-all active:scale-90"
            >
              <span className="material-symbols-outlined text-lg">arrow_back_ios_new</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden relative bg-surface-container">
                <Image src={activeChat?.avatar_url || ""} alt="User" fill className="object-cover" unoptimized />
              </div>
              <div>
                <h3 className="font-headline text-sm font-extrabold tracking-tight text-primary">{activeChat?.username}</h3>
                <span className="font-caps text-[9px] text-surface-tint font-bold uppercase tracking-widest flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-surface-tint rounded-full animate-pulse"></span> Online
                </span>
              </div>
            </div>
          </div>
          <button className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-2xl">more_vert</span>
          </button>
        </div>
      </header>

      {/* 💬 MESSAGE SCROLL AREA */}
      <div className="flex-1 w-full overflow-y-auto px-4 py-6 space-y-6 no-scrollbar relative">
        {messages.map((msg) => {
          const isMe = msg.sender_id === myUserId;
          const isCarrom = msg.game_name?.includes("Carrom");
          
          const gameIcon = isCarrom ? "radio_button_checked" : "grid_4x4";
          const targetUrl = isCarrom ? "native://carrom" : "native://checkers";

          return (
            <div key={msg.id} className={`flex items-start w-full ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`flex flex-col max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                
                {/* Text Bubble */}
                {msg.message_type === 'text' && (
                  <div className={`px-4 py-3 font-body text-[14px] shadow-sm leading-relaxed border ${
                    isMe 
                      ? "bg-primary-container text-on-primary-container border-transparent rounded-[1.25rem] rounded-tr-sm" 
                      : "glass-panel text-on-surface rounded-[1.25rem] rounded-tl-sm"
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                )}

                {/* Game Invite Card (Premium Action Card) */}
                {msg.message_type === 'game_invite' && (
                  <div className={`w-64 rounded-3xl overflow-hidden shadow-lg p-5 flex flex-col items-center gap-3 text-center ${
                    isMe 
                      ? `glass-panel border-primary-container/30 rounded-tr-sm` 
                      : "glass-panel border-white/10 rounded-tl-sm"
                  }`}>
                    <div className="w-14 h-14 rounded-[1.25rem] flex items-center justify-center mb-1 shadow-inner bg-white/5 border border-white/10">
                      <span className={`material-symbols-outlined text-3xl ${isCarrom ? "text-amber-500" : "text-tertiary-container"}`} style={{fontVariationSettings:"'FILL' 1"}}>{gameIcon}</span>
                    </div>
                    <div>
                      <h4 className="font-headline text-sm font-extrabold tracking-tight text-primary">{msg.game_name}</h4>
                      <p className="font-caps text-[9px] text-on-surface-variant font-bold uppercase tracking-wider mt-1">Challenge Request</p>
                    </div>

                    <div className="w-full mt-3">
                      {msg.invite_status === 'pending' && (
                        isMe ? (
                          <div className="font-caps text-[10px] font-bold uppercase py-2.5 rounded-xl border border-white/20 text-on-surface-variant bg-white/5">Awaiting...</div>
                        ) : (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => updateInviteStatus(msg.id, 'declined')} 
                              className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-primary font-caps font-bold text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all border border-white/5"
                            >
                              Decline
                            </button>
                            <button 
                              onClick={() => updateInviteStatus(msg.id, 'accepted')} 
                              className="flex-1 py-2.5 gradient-pill-primary font-caps font-bold text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-md"
                            >
                              Accept
                            </button>
                          </div>
                        )
                      )}
                      {msg.invite_status === 'declined' && (
                        <div className="font-caps text-[10px] text-red-400 font-bold uppercase py-2.5 bg-red-500/10 rounded-xl border border-red-500/20">
                          Declined
                        </div>
                      )}
                      {msg.invite_status === 'accepted' && (
                        <button 
                          onClick={() => onPlay?.(targetUrl, msg.match_id!)}
                          className="w-full py-3 bg-primary text-background font-headline font-extrabold text-[11px] uppercase tracking-wider rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md hover:opacity-90"
                        >
                          <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                          Enter Arena
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <span className="font-caps text-[9px] block mt-1.5 px-2 text-on-surface-variant font-bold uppercase tracking-widest">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 📥 CHAT INPUT */}
      <footer className="shrink-0 w-full bg-surface/60 backdrop-blur-xl border-t border-white/10 z-20" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}>
        <form onSubmit={handleSendText} className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setShowGameSelector(true); setInviteStep("game"); }}
            className="w-11 h-11 bg-white/5 hover:bg-white/10 text-primary border border-white/10 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">swords</span>
          </button>
          
          <div className="flex-1 bg-surface-container-highest border border-white/10 rounded-full flex items-center pr-1.5 focus-within:border-surface-tint focus-within:ring-1 focus-within:ring-surface-tint transition-all overflow-hidden shadow-inner">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Message..."
              className="flex-1 bg-transparent border-none font-body text-[14px] text-primary placeholder-on-surface-variant focus:outline-none px-4 py-3 w-full"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${
                newMessage.trim() ? "bg-primary-container text-on-primary-container active:scale-90 shadow-sm" : "bg-transparent text-white/20 cursor-not-allowed"
              }`}
            >
              <span className="material-symbols-outlined text-[16px] font-bold">arrow_upward</span>
            </button>
          </div>
        </form>
      </footer>

    </div>
  );
}