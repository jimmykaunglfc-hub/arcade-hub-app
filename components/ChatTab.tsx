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

interface ChatTabProps {
  currentPoints: number;
  userId: string | null;
  onPlay?: (url: string, matchId: string) => void;
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

export default function ChatTab({ currentPoints, userId, onPlay }: ChatTabProps) {
  const [activeView, setActiveView] = useState<"hub" | "chat">("hub");
  const [hubTab, setHubTab] = useState<"dms" | "groups" | "network">("dms");

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string>("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeChat, setActiveChat] = useState<Friend | null>(null);
  
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [searchTarget, setSearchTarget] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [copied, setCopied] = useState(false);
  
  const [showGameSelector, setShowGameSelector] = useState(false);
  const [inviteStep, setInviteStep] = useState<"game" | "carrom_mode">("game");

  // Multiplayer lockout rule enforcement
  const isLockedOut = currentPoints <= 0;

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

  useEffect(() => {
    if (activeView === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeView]);

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

  const handleSendGameInvite = async (gameType: "checkers" | "carrom" | "chess" | "snooker", mode?: "freestyle" | "classic") => {
    setShowGameSelector(false);
    setInviteStep("game");
    if (!myUserId || !activeChat) return;

    if (isLockedOut) {
      alert("Matchmaking Halted: You cannot issue challenges with 0 credits.");
      return;
    }
    
    // Checkers Logic
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
    } 
    // Chess Logic
    else if (gameType === "chess") {
      const generatedUUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

      await supabase.from("direct_messages").insert([{
        sender_id: myUserId, 
        receiver_id: activeChat.id, 
        content: `Challenged you to Grandmaster Chess`,
        message_type: 'game_invite', 
        match_id: generatedUUID, 
        game_name: "Grandmaster Chess", 
        invite_status: "pending"
      }]);
    }
    // Snooker Logic
    else if (gameType === "snooker") {
      const generatedUUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

      await supabase.from("direct_messages").insert([{
        sender_id: myUserId, 
        receiver_id: activeChat.id, 
        content: `Challenged you to Snooker 3D`,
        message_type: 'game_invite', 
        match_id: generatedUUID, 
        game_name: "Snooker 3D", 
        invite_status: "pending"
      }]);
    }
    // Carrom Logic
    else if (gameType === "carrom" && mode) {
      const generatedUUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
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
  // VIEW 1: CONVERSATION HUB DIAL FEED
  // ============================================================================
  if (activeView === "hub") {
    return (
      <div className="w-full animate-fade-in text-on-surface flex flex-col gap-4 pb-6">
        
        {/* ADAPTIVE HUB SWITCHER BAR */}
        <div className="bg-surface/50 backdrop-blur-md p-1 rounded-xl flex items-center border border-surface-container-highest shadow-sm">
          {[
            { id: "dms", label: "Messages" },
            { id: "groups", label: "Groups" },
            { id: "network", label: "Network" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setHubTab(tab.id as any)}
              className={`flex-1 py-1.5 font-caps text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 ${
                hubTab === tab.id 
                  ? "bg-surface-container-high text-primary shadow-sm" 
                  : "text-on-surface-variant hover:text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {hubTab === "dms" && (
          <div className="flex flex-col gap-2">
            <h3 className="font-caps text-[9px] font-bold text-on-surface-variant uppercase tracking-widest px-1">Active Conversations</h3>
            {friends.length === 0 ? (
              <div className="p-8 text-center bg-surface/80 border border-surface-container-highest backdrop-blur-xl rounded-2xl shadow-sm">
                <span className="material-symbols-outlined text-3xl text-surface-container-highest mb-2">chat_bubble</span>
                <p className="font-body text-xs text-on-surface-variant font-medium">Your inbox is empty.<br/>Connect via the Network tab.</p>
              </div>
            ) : (
              <div className="bg-surface/80 border border-surface-container-highest backdrop-blur-xl rounded-2xl overflow-hidden shadow-sm divide-y divide-surface-container-highest">
                {friends.map((friend) => (
                  <button 
                    key={friend.id}
                    onClick={() => openChat(friend)}
                    className="w-full p-3.5 flex items-center justify-between transition-all hover:bg-surface-variant text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden relative bg-surface-container shrink-0 shadow-inner">
                        <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover" unoptimized />
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-surface-container-highest rounded-full"></div>
                      </div>
                      <div>
                        <h4 className="font-headline text-sm font-extrabold tracking-tight text-on-surface">{friend.username}</h4>
                        <p className="font-body text-[10px] text-on-surface-variant font-medium truncate mt-0.5">Tap to open secure comms...</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-surface-container-highest text-md">chevron_right</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {hubTab === "groups" && (
          <div className="flex flex-col gap-2">
            <h3 className="font-caps text-[9px] font-bold text-on-surface-variant uppercase tracking-widest px-1">Discover Communities</h3>
            <div className="bg-surface/80 border border-surface-container-highest backdrop-blur-xl rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:bg-surface-variant cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-primary-container/10 border border-primary-container/30 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-base">grid_4x4</span>
              </div>
              <div className="flex-1">
                <h4 className="font-headline text-sm font-extrabold tracking-tight text-on-surface">Global Checkers Hub</h4>
                <p className="font-body text-[10px] text-on-surface-variant font-medium mt-0.5">2,140 Members • 14 Online</p>
              </div>
              <button className="px-3 py-1.5 bg-surface-container-highest text-primary font-caps text-[9px] font-bold uppercase rounded-lg border border-surface-container-highest">Join</button>
            </div>
          </div>
        )}

        {hubTab === "network" && (
          <div className="flex flex-col gap-4">
            <div className="bg-gradient-to-br from-primary-container/20 to-primary-container/5 rounded-2xl p-5 border border-primary/20 shadow-sm relative overflow-hidden">
              <h3 className="font-caps text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Your Network ID</h3>
              <div className="flex items-end justify-between relative z-10">
                <p className="font-headline text-xl font-extrabold tracking-tight text-on-surface">{myUsername || "Loading..."}</p>
                <button onClick={handleCopyId} className="w-9 h-9 bg-surface/80 border border-surface-container-highest rounded-lg flex items-center justify-center text-primary shadow-sm">
                  <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                </button>
              </div>
            </div>

            <div className="bg-surface/80 border border-surface-container-highest backdrop-blur-xl rounded-2xl p-4 shadow-sm">
              <h3 className="font-caps text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 px-1">Add Connection</h3>
              <form onSubmit={handleAddFriend} className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter Network ID..."
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value)}
                  className="flex-1 bg-surface-container-high border border-surface-container-highest rounded-xl px-3 py-2.5 font-body text-xs focus:outline-none focus:border-primary text-on-surface placeholder-on-surface-variant transition-colors"
                />
                <button type="submit" className="px-4 gradient-pill-primary font-caps font-bold text-[9px] uppercase tracking-wider rounded-xl shadow-sm">Invite</button>
              </form>
              {inviteStatus && <p className="font-body text-[10px] text-primary font-bold mt-2 px-1">{inviteStatus}</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: FULL COMPACT CONSOLE ACTIVE THREAD
  // ============================================================================
  return (
    <div className="w-full flex flex-col h-[calc(100vh-204px)] animate-fade-in text-on-background relative">
      
      {/* 🎮 CHALLENGE CHOOSE FLOATING INTERFACE */}
      {showGameSelector && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-end justify-center p-2 z-50 rounded-2xl animate-fade-in">
          <div className="bg-surface-container-high w-full rounded-2xl p-4 flex flex-col gap-3 border border-surface-container-highest shadow-2xl">
            {inviteStep === "game" && (
              <>
                <div className="flex justify-between items-center px-1">
                  <h3 className="font-headline text-sm font-black uppercase text-on-surface">Select Arena</h3>
                  <button onClick={() => setShowGameSelector(false)} className="w-7 h-7 bg-surface/50 border border-surface-container-highest rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
                
                <button onClick={() => handleSendGameInvite("snooker")} className="w-full flex items-center justify-between p-3 bg-surface/50 border border-surface-container-highest rounded-xl hover:bg-surface-variant transition-colors">
                   <div className="flex items-center gap-3">
                     <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center text-white">
                       <span className="material-symbols-outlined text-xl">sports_bar</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Snooker 3D</h4>
                   </div>
                   <span className="material-symbols-outlined text-surface-container-highest text-sm">chevron_right</span>
                </button>

                <button onClick={() => handleSendGameInvite("chess")} className="w-full flex items-center justify-between p-3 bg-surface/50 border border-surface-container-highest rounded-xl hover:bg-surface-variant transition-colors">
                   <div className="flex items-center gap-3">
                     <div className="w-9 h-9 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-lg flex items-center justify-center text-white">
                       <span className="material-symbols-outlined text-xl">psychology</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Grandmaster Chess</h4>
                   </div>
                   <span className="material-symbols-outlined text-surface-container-highest text-sm">chevron_right</span>
                </button>

                <button onClick={() => setInviteStep("carrom_mode")} className="w-full flex items-center justify-between p-3 bg-surface/50 border border-surface-container-highest rounded-xl hover:bg-surface-variant transition-colors">
                   <div className="flex items-center gap-3">
                     <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center text-white">
                       <span className="material-symbols-outlined text-xl">radio_button_checked</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Carrom Matrix</h4>
                   </div>
                   <span className="material-symbols-outlined text-surface-container-highest text-sm">chevron_right</span>
                </button>
                
                <button onClick={() => handleSendGameInvite("checkers")} className="w-full flex items-center justify-between p-3 bg-surface/50 border border-surface-container-highest rounded-xl hover:bg-surface-variant transition-colors">
                   <div className="flex items-center gap-3">
                     <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center text-white">
                       <span className="material-symbols-outlined text-xl">grid_4x4</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Neon Checkers</h4>
                   </div>
                   <span className="material-symbols-outlined text-surface-container-highest text-sm">chevron_right</span>
                </button>
              </>
            )}
            {inviteStep === "carrom_mode" && (
              <>
                <div className="flex justify-between items-center px-1">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setInviteStep("game")} className="text-on-surface-variant hover:text-primary"><span className="material-symbols-outlined text-sm">arrow_back</span></button>
                    <h3 className="font-headline text-sm font-black uppercase text-on-surface">Rule Mode</h3>
                  </div>
                </div>
                <button onClick={() => handleSendGameInvite("carrom", "freestyle")} className="w-full p-3 bg-surface/50 border border-surface-container-highest rounded-xl text-left font-headline text-xs text-on-surface flex justify-between items-center hover:bg-surface-variant">
                  <span>Freestyle Mode (Fast)</span>
                  <span className="material-symbols-outlined text-xs text-amber-500">send</span>
                </button>
                <button onClick={() => handleSendGameInvite("carrom", "classic")} className="w-full p-3 bg-surface/50 border border-surface-container-highest rounded-xl text-left font-headline text-xs text-on-surface flex justify-between items-center hover:bg-surface-variant">
                  <span>Classic Mode (Tactical)</span>
                  <span className="material-symbols-outlined text-xs text-amber-500">send</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 📞 HEADER CONSOLE BAR ROW */}
      <div className="shrink-0 w-full bg-surface/80 border border-surface-container-highest backdrop-blur-xl rounded-2xl p-2.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => setActiveView("hub")} 
            className="w-8 h-8 rounded-xl bg-surface-container-high hover:bg-surface-variant border border-surface-container-highest text-on-surface flex items-center justify-center transition-transform active:scale-90"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden relative bg-surface-container border border-surface-container-highest">
              <Image src={activeChat?.avatar_url || ""} alt="User" fill className="object-cover" unoptimized />
            </div>
            <div>
              <h3 className="font-headline text-xs font-extrabold text-on-surface leading-tight">{activeChat?.username}</h3>
              <span className="font-caps text-[8px] text-primary font-bold uppercase tracking-widest flex items-center gap-0.5 mt-0.5">
                <span className="w-1 h-1 bg-primary rounded-full animate-pulse"></span> Comms Online
              </span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setActiveView("hub")}
          className="font-caps text-[9px] font-black text-red-500 border border-red-500/20 bg-red-500/10 px-3 py-1.5 rounded-xl hover:bg-red-500/20 active:scale-95 transition-all"
        >
          Quit Chat
        </button>
      </div>

      {/* 💬 MESSAGE CHANNEL CORE VIEWPORTS */}
      <div className="flex-1 w-full overflow-y-auto px-1 py-3 space-y-4 no-scrollbar relative">
        {messages.map((msg) => {
          const isMe = msg.sender_id === myUserId;
          const isCarrom = msg.game_name?.includes("Carrom");
          const isChess = msg.game_name?.includes("Chess");
          const isSnooker = msg.game_name?.includes("Snooker");
          const gameIcon = isCarrom ? "radio_button_checked" : isChess ? "psychology" : isSnooker ? "sports_bar" : "grid_4x4";
          
          const targetUrl = msg.game_name?.includes("Checkers") 
            ? "native://checkers" 
            : isChess 
              ? "native://chess" 
              : isSnooker
                ? "native://snooker"
                : "native://carrom";

          return (
            <div key={msg.id} className={`flex items-start w-full ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`flex flex-col max-w-[85%] ${isMe ? "items-end" : "items-start"}`}>
                
                {msg.message_type === 'text' && (
                  <div className={`px-3.5 py-2.5 font-body text-xs shadow-sm border leading-relaxed ${
                    isMe 
                      ? "bg-primary text-on-primary border-transparent rounded-2xl rounded-tr-sm" 
                      : "bg-surface border-surface-container-highest text-on-surface rounded-2xl rounded-tl-sm"
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                )}

                {msg.message_type === 'game_invite' && (
                  <div className="w-56 rounded-2xl overflow-hidden shadow-md p-4 flex flex-col items-center gap-2 text-center bg-surface border border-surface-container-highest">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface-container-high border border-surface-container-highest">
                      <span className={`material-symbols-outlined text-2xl ${isCarrom ? "text-amber-500" : isChess ? "text-purple-500" : isSnooker ? "text-emerald-500" : "text-primary"}`} style={{fontVariationSettings:"'FILL' 1"}}>{gameIcon}</span>
                    </div>
                    <div>
                      <h4 className="font-headline text-xs font-extrabold text-on-surface leading-tight">{msg.game_name}</h4>
                      <p className="font-caps text-[8px] text-on-surface-variant font-bold uppercase tracking-widest mt-0.5">Match Challenge</p>
                    </div>

                    <div className="w-full mt-2">
                      {msg.invite_status === 'pending' && (
                        isMe ? (
                          <div className="font-caps text-[8px] font-bold uppercase py-1.5 rounded-lg border border-surface-container-highest text-on-surface-variant bg-surface-container-high">Awaiting...</div>
                        ) : (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => updateInviteStatus(msg.id, 'declined')} 
                              className="flex-1 py-1.5 bg-surface-container-high text-on-surface font-caps font-bold text-[8px] uppercase tracking-widest rounded-lg border border-surface-container-highest hover:opacity-80 transition-opacity"
                            >
                              Decline
                            </button>
                            <button 
                              onClick={() => {
                                if (isLockedOut) {
                                  alert("Accept Halted: You cannot accept challenges with 0 credits.");
                                  return;
                                }
                                updateInviteStatus(msg.id, 'accepted');
                              }}
                              disabled={isLockedOut}
                              className="flex-1 py-1.5 gradient-pill-primary font-caps font-bold text-[8px] uppercase tracking-widest rounded-lg shadow-sm disabled:opacity-40"
                            >
                              Accept
                            </button>
                          </div>
                        )
                      )}
                      {msg.invite_status === 'declined' && <div className="font-caps text-[8px] text-red-500 font-bold uppercase py-1.5 bg-red-500/10 rounded-lg border border-red-500/20">Declined</div>}
                      {msg.invite_status === 'accepted' && (
                        <button 
                          onClick={() => {
                            if (isLockedOut) {
                              alert("Match Entry Halted: Refuel your arena points to join multiplayer.");
                              return;
                            }
                            onPlay?.(targetUrl, msg.match_id!);
                          }}
                          className="w-full py-2 bg-primary text-on-primary font-headline font-extrabold text-[10px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 shadow-sm transition-transform active:scale-95"
                        >
                          <span className="material-symbols-outlined text-sm">play_arrow</span>
                          Enter Arena
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <span className="font-caps text-[8px] block mt-1 px-1 text-on-surface-variant font-bold tracking-widest">{formatTime(msg.created_at)}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 📥 INLINE DOCK DECK INPUT TRAILER */}
      <div className="shrink-0 w-full bg-surface/90 backdrop-blur-md border border-surface-container-highest rounded-2xl p-2 flex items-center gap-2 shadow-xl relative z-20 mb-1">
        
        <button
          type="button"
          onClick={() => { setShowGameSelector(true); setInviteStep("game"); }}
          className="w-9 h-9 bg-surface-container-high hover:bg-surface-variant text-primary border border-surface-container-highest rounded-xl flex items-center justify-center active:scale-90 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-lg">swords</span>
        </button>

        <button
          type="button"
          onClick={() => alert("Media Vault and interactive emoji reaction assets initializing...")}
          className="w-9 h-9 bg-surface-container-high hover:bg-surface-variant text-on-surface-variant border border-surface-container-highest rounded-xl flex items-center justify-center active:scale-90 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-lg">add</span>
        </button>
        
        <form onSubmit={handleSendText} className="flex-1 flex items-center bg-surface-container-highest border border-surface-container-highest rounded-xl pr-1 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all overflow-hidden shadow-inner">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Message..."
            className="flex-1 bg-transparent border-none font-body text-xs text-on-surface placeholder-on-surface-variant focus:outline-none px-3 py-2.5 w-full"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0 ${
              newMessage.trim() 
                ? "bg-primary text-on-primary active:scale-90 shadow-sm" 
                : "bg-transparent text-on-surface-variant cursor-not-allowed"
            }`}
          >
            <span className="material-symbols-outlined text-sm font-bold">arrow_upward</span>
          </button>
        </form>

      </div>

    </div>
  );
}