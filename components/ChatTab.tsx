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
  [0, 2, 0, 2, 0, 2, 0, 2], [2, 0, 2, 0, 2, 0, 2, 0], [0, 2, 0, 2, 0, 2, 0, 2],
  [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0],
  [1, 0, 1, 0, 1, 0, 1, 0], [0, 1, 0, 1, 0, 1, 0, 1], [1, 0, 1, 0, 1, 0, 1, 0]
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

      const { data: myProfile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      if (myProfile) setMyUsername(myProfile.username);

      const { data: friendships } = await supabase
        .from("friendships")
        .select("*")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (friendships && friendships.length > 0) {
        const friendIds = friendships.map(f => f.requester_id === user.id ? f.receiver_id : f.requester_id);
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
          if ((newMsg.sender_id === myUserId && newMsg.receiver_id === activeChat.id) || (newMsg.sender_id === activeChat.id && newMsg.receiver_id === myUserId)) {
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

  // 🕹️ DYNAMIC INVITE HANDLER (Now processes rules!)
  const handleSendGameInvite = async (gameType: "checkers" | "carrom", mode?: "freestyle" | "classic") => {
    setShowGameSelector(false);
    setInviteStep("game");
    if (!myUserId || !activeChat) return;
    
    const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    if (gameType === "checkers") {
      const { data: match } = await supabase.from('checkers_matches').insert({
        p1_id: myUserId, board: INITIAL_BOARD, room_code: generatedCode, status: 'waiting'
      }).select().single();
      
      if (match) {
        await supabase.from("direct_messages").insert([{
          sender_id: myUserId, receiver_id: activeChat.id, content: `Challenged you to Neon Checkers`,
          message_type: 'game_invite', match_id: match.id, game_name: "Neon Checkers", invite_status: "pending"
        }]);
      }
    } else if (gameType === "carrom" && mode) {
      // Package the rule mode directly into the Match ID for seamless host syncing
      const gameName = mode === "classic" ? "Carrom (Classic)" : "Carrom (Freestyle)";
      const bundledPayload = `${generatedCode}_${mode}`;

      await supabase.from("direct_messages").insert([{
        sender_id: myUserId, receiver_id: activeChat.id, content: `Challenged you to ${gameName}`,
        message_type: 'game_invite', match_id: bundledPayload, game_name: gameName, invite_status: "pending"
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
      requester_id: myUserId, receiver_id: targetProfile.id, status: "accepted" 
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
      <div className="w-full animate-fade-in text-neutral-900 dark:text-neutral-100 flex flex-col gap-6 pb-6">
        
        {/* 🎛️ SEGMENTED HUB NAVIGATION (iOS Style) */}
        <div className="bg-neutral-200/60 dark:bg-neutral-800/60 p-1.5 rounded-xl flex items-center shadow-sm">
          {[
            { id: "dms", label: "Messages" },
            { id: "groups", label: "Groups" },
            { id: "network", label: "Network" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setHubTab(tab.id as any)}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-300 ${
                hubTab === tab.id 
                  ? "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm" 
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 💬 TAB: DIRECT MESSAGES */}
        {hubTab === "dms" && (
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest px-1">
              Active Conversations
            </h3>
            {friends.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-sm">
                <span className="material-symbols-outlined text-4xl text-neutral-300 dark:text-neutral-700 mb-3">chat_bubble</span>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">Your inbox is empty.<br/>Head to the Network tab to connect.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl overflow-hidden shadow-sm">
                {friends.map((friend, index) => (
                  <button 
                    key={friend.id}
                    onClick={() => openChat(friend)}
                    className={`w-full p-4 flex items-center justify-between transition-all hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-left ${
                      index !== friends.length - 1 ? 'border-b border-neutral-100 dark:border-neutral-800/60' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden relative border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 shrink-0">
                        <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover p-0.5" unoptimized />
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-[2.5px] border-white dark:border-neutral-900 rounded-full"></div>
                      </div>
                      <div>
                        <h4 className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">{friend.username}</h4>
                        <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium truncate mt-0.5">Tap to open secure comms...</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-neutral-300 dark:text-neutral-600 text-lg">chevron_right</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 🏛️ TAB: GROUPS */}
        {hubTab === "groups" && (
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest px-1">
              Discover Communities
            </h3>
            
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:border-neutral-300 dark:hover:border-neutral-700 transition-all cursor-pointer">
              <div className="w-12 h-12 rounded-[1.25rem] bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center shrink-0 shadow-inner">
                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">grid_4x4</span>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">Global Checkers Hub</h4>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium mt-0.5">2,140 Members • 14 Online</p>
              </div>
              <button className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors">Join</button>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-5 flex items-center gap-4 shadow-sm hover:border-neutral-300 dark:hover:border-neutral-700 transition-all cursor-pointer">
              <div className="w-12 h-12 rounded-[1.25rem] bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800 flex items-center justify-center shrink-0 shadow-inner">
                <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">style</span>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">Glitch Deck Veterans</h4>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium mt-0.5">856 Members • 3 Online</p>
              </div>
              <button className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors">Join</button>
            </div>
          </div>
        )}

        {/* 🌐 TAB: NETWORK & INVITATIONS */}
        {hubTab === "network" && (
          <div className="flex flex-col gap-6">
            
            {/* Share Your ID Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-6 shadow-[0_8px_20px_rgba(79,70,229,0.25)] text-white relative overflow-hidden border border-indigo-400/30">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <span className="material-symbols-outlined text-8xl">share</span>
              </div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1.5">Your Network ID</h3>
              <div className="flex items-end justify-between relative z-10">
                <p className="text-2xl font-black tracking-tight">{myUsername || "Loading..."}</p>
                <div className="flex gap-2.5">
                  <button onClick={handleCopyId} className="w-10 h-10 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-inner border border-white/10">
                    <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                  </button>
                  <button className="w-10 h-10 bg-white text-indigo-600 rounded-xl flex items-center justify-center shadow-md hover:scale-105 transition-all active:scale-95">
                    <span className="material-symbols-outlined text-sm">ios_share</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Add Friend Form */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-5 shadow-sm">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-3 px-1">Add Connection</h3>
              <form onSubmit={handleAddFriend} className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter Network ID..."
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value)}
                  className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-indigo-500 transition-colors text-neutral-900 dark:text-white"
                />
                <button type="submit" disabled={!searchTarget.trim()} className="px-6 bg-neutral-900 dark:bg-white text-white dark:text-black font-bold text-[10px] uppercase tracking-wider rounded-xl hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 shadow-sm">
                  Invite
                </button>
              </form>
              {inviteStatus && <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-2.5 px-1">{inviteStatus}</p>}
            </div>

            {/* Current Friends List */}
            <div className="flex flex-col gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 px-1 mb-1">My Network Roster</h3>
              {friends.length === 0 ? (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 px-1">No connections yet.</p>
              ) : (
                friends.map(friend => (
                  <div key={friend.id} className="flex items-center justify-between p-3 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 relative">
                        <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover p-0.5" unoptimized />
                      </div>
                      <span className="text-sm font-bold tracking-tight">{friend.username}</span>
                    </div>
                    <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Connected</span>
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
    <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-50 dark:bg-neutral-950 overflow-hidden animate-fade-in text-neutral-900 dark:text-neutral-100">
      
      {/* 🎮 2-STEP GAME SELECTOR MODAL */}
      {showGameSelector && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-end justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-full max-w-sm rounded-[2rem] p-6 shadow-2xl flex flex-col gap-4">
            
            {inviteStep === "game" && (
              <>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-base font-black tracking-tight uppercase">Select Arena</h3>
                  <button onClick={() => setShowGameSelector(false)} className="w-8 h-8 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center text-neutral-500 transition-all active:scale-90"><span className="material-symbols-outlined text-sm">close</span></button>
                </div>
                
                <button onClick={() => setInviteStep("carrom_mode")} className="w-full flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl active:scale-[0.98] transition-all shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl flex items-center justify-center shadow-md"><span className="material-symbols-outlined" style={{fontVariationSettings:"'FILL' 1"}}>radio_button_checked</span></div>
                     <div className="text-left"><h4 className="text-sm font-black text-amber-900 dark:text-amber-100">Carrom Matrix</h4><p className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest mt-0.5">Physics • Strategy</p></div>
                   </div>
                   <span className="material-symbols-outlined text-amber-500">chevron_right</span>
                </button>

                <button onClick={() => handleSendGameInvite("checkers")} className="w-full flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 rounded-2xl active:scale-[0.98] transition-all shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md"><span className="material-symbols-outlined" style={{fontVariationSettings:"'FILL' 1"}}>grid_4x4</span></div>
                     <div className="text-left"><h4 className="text-sm font-black text-indigo-900 dark:text-indigo-100">Neon Checkers</h4><p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-500 uppercase tracking-widest mt-0.5">Grid • Strategy</p></div>
                   </div>
                   <span className="material-symbols-outlined text-indigo-500">chevron_right</span>
                </button>
              </>
            )}

            {inviteStep === "carrom_mode" && (
              <>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setInviteStep("game")} className="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"><span className="material-symbols-outlined text-sm">arrow_back_ios_new</span></button>
                    <h3 className="text-base font-black tracking-tight uppercase">Select Rule Mode</h3>
                  </div>
                  <button onClick={() => {setShowGameSelector(false); setInviteStep("game");}} className="w-8 h-8 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center text-neutral-500 transition-all active:scale-90"><span className="material-symbols-outlined text-sm">close</span></button>
                </div>

                <button onClick={() => handleSendGameInvite("carrom", "freestyle")} className="w-full flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl active:scale-[0.98] transition-all shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-white dark:bg-neutral-900 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-500 rounded-xl flex items-center justify-center shadow-md"><span className="material-symbols-outlined" style={{fontVariationSettings:"'FILL' 1"}}>sports_score</span></div>
                     <div className="text-left"><h4 className="text-sm font-black text-amber-900 dark:text-amber-100">Freestyle</h4><p className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest mt-0.5">Score Based • Fast</p></div>
                   </div>
                   <span className="material-symbols-outlined text-amber-500">send</span>
                </button>

                <button onClick={() => handleSendGameInvite("carrom", "classic")} className="w-full flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl active:scale-[0.98] transition-all shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-white dark:bg-neutral-900 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-500 rounded-xl flex items-center justify-center shadow-md"><span className="material-symbols-outlined" style={{fontVariationSettings:"'FILL' 1"}}>palette</span></div>
                     <div className="text-left"><h4 className="text-sm font-black text-amber-900 dark:text-amber-100">Classic Colors</h4><p className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest mt-0.5">Claim Colors • Tactical</p></div>
                   </div>
                   <span className="material-symbols-outlined text-amber-500">send</span>
                </button>
              </>
            )}

          </div>
        </div>
      )}

      {/* 📞 THREAD HEADER */}
      <header className="shrink-0 w-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800 z-20 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveView("hub")}
              className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200/50 dark:border-neutral-700/50 text-neutral-600 dark:text-neutral-300 flex items-center justify-center transition-all active:scale-90"
            >
              <span className="material-symbols-outlined text-lg">arrow_back_ios_new</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden relative border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-950">
                <Image src={activeChat?.avatar_url || ""} alt="User" fill className="object-cover p-0.5" unoptimized />
              </div>
              <div>
                <h3 className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">{activeChat?.username}</h3>
                <span className="text-[9px] text-emerald-500 dark:text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Online
                </span>
              </div>
            </div>
          </div>
          <button className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors">
            <span className="material-symbols-outlined text-2xl">more_vert</span>
          </button>
        </div>
      </header>

      {/* 💬 MESSAGE SCROLL AREA */}
      <div className="flex-1 w-full overflow-y-auto px-4 py-6 space-y-6 no-scrollbar relative">
        {messages.map((msg) => {
          const isMe = msg.sender_id === myUserId;
          const isCarrom = msg.game_name?.includes("Carrom");
          
          // Theme classes mapped properly to prevent PurgeCSS dropping
          const themeCard = isCarrom 
            ? "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/50" 
            : "bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/50";
            
          const themeIconBox = isCarrom 
            ? "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400"
            : "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400";
            
          const themeBadge = isCarrom
            ? "text-amber-500 dark:text-amber-400 bg-white/50 dark:bg-black/20 border-amber-200/50 dark:border-amber-900/50"
            : "text-indigo-500 dark:text-indigo-400 bg-white/50 dark:bg-black/20 border-indigo-200/50 dark:border-indigo-900/50";
            
          const themeAcceptBtn = isCarrom
            ? "bg-amber-500 hover:bg-amber-600"
            : "bg-indigo-600 hover:bg-indigo-700";
            
          const gameIcon = isCarrom ? "radio_button_checked" : "grid_4x4";
          const targetUrl = isCarrom ? "native://carrom" : "native://checkers";

          return (
            <div key={msg.id} className={`flex items-start w-full ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`flex flex-col max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                
                {/* Text Bubble */}
                {msg.message_type === 'text' && (
                  <div className={`px-4 py-3 text-[13px] shadow-sm leading-relaxed border ${
                    isMe 
                      ? "bg-indigo-600 text-white border-transparent rounded-[1.25rem] rounded-tr-sm" 
                      : "bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-800 rounded-[1.25rem] rounded-tl-sm"
                  }`}>
                    <p className="whitespace-pre-wrap break-words font-medium">{msg.content}</p>
                  </div>
                )}

                {/* Game Invite Card */}
                {msg.message_type === 'game_invite' && (
                  <div className={`w-64 rounded-3xl overflow-hidden border shadow-sm p-5 flex flex-col items-center gap-3 text-center ${
                    isMe 
                      ? `${themeCard} rounded-tr-sm` 
                      : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 rounded-tl-sm"
                  }`}>
                    <div className={`w-14 h-14 rounded-[1.25rem] flex items-center justify-center mb-1 shadow-inner border ${themeIconBox}`}>
                      <span className="material-symbols-outlined text-3xl" style={{fontVariationSettings:"'FILL' 1"}}>{gameIcon}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">{msg.game_name}</h4>
                      <p className="text-[9px] text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-wider mt-1">Challenge Request</p>
                    </div>

                    <div className="w-full mt-3">
                      {msg.invite_status === 'pending' && (
                        isMe ? (
                          <div className={`text-[10px] font-bold uppercase py-2.5 rounded-xl border ${themeBadge}`}>Awaiting...</div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => updateInviteStatus(msg.id, 'declined')} className="flex-1 py-2.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 font-bold text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all">Decline</button>
                            <button onClick={() => updateInviteStatus(msg.id, 'accepted')} className={`flex-1 py-2.5 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-md ${themeAcceptBtn}`}>Accept</button>
                          </div>
                        )
                      )}
                      {msg.invite_status === 'declined' && (
                        <div className="text-[10px] text-red-500 font-bold uppercase py-2.5 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-100 dark:border-red-900/40">Declined</div>
                      )}
                      {msg.invite_status === 'accepted' && (
                        <button 
                          onClick={() => onPlay?.(targetUrl, msg.match_id!)}
                          className="w-full py-3 bg-neutral-900 dark:bg-white text-white dark:text-black font-black text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md hover:opacity-90"
                        >
                          <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                          Enter Arena
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <span className="text-[9px] block mt-1.5 px-2 text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 📥 CHAT INPUT */}
      <footer className="shrink-0 w-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-t border-neutral-200 dark:border-neutral-800 z-20" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}>
        <form onSubmit={handleSendText} className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setShowGameSelector(true); setInviteStep("game"); }}
            className="w-11 h-11 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">swords</span>
          </button>
          
          <div className="flex-1 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-full flex items-center pr-1.5 focus-within:border-indigo-400 dark:focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all overflow-hidden shadow-inner">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Message..."
              className="flex-1 bg-transparent border-none text-[13px] text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none px-4 py-3 w-full"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${
                newMessage.trim() ? "bg-indigo-600 text-white active:scale-90 shadow-sm" : "bg-transparent text-neutral-300 dark:text-neutral-700 cursor-not-allowed"
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