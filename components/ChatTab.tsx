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
  // VIEW 1: CONVERSATION HUB DIAL FEED (SOLID HIGH-CONTRAST)
  // ============================================================================
  if (activeView === "hub") {
    return (
      <div className="w-full animate-fade-in text-on-surface flex flex-col gap-2 pb-6">
        
        {/* ADAPTIVE HUB SWITCHER BAR */}
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-3 -mx-5 px-5">
          {[
            { id: "dms", label: "Messages" },
            { id: "groups", label: "Groups" },
            { id: "network", label: "Network" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setHubTab(tab.id as any)}
              className={`px-6 py-2.5 rounded-full font-headline text-[13px] font-bold whitespace-nowrap transition-all shadow-sm ${
                hubTab === tab.id 
                  ? "bg-primary text-on-primary" 
                  : "bg-surface text-on-surface-variant hover:text-on-surface border border-surface-container-highest"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {hubTab === "dms" && (
          <div className="flex flex-col gap-3">
            {friends.length === 0 ? (
              <div className="p-8 text-center bg-surface border border-surface-container-highest rounded-[24px] shadow-sm">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant mb-2">chat_bubble</span>
                <p className="font-body text-xs text-on-surface-variant font-medium">Your inbox is empty.<br/>Connect via the Network tab.</p>
              </div>
            ) : (
              <div className="bg-surface border border-surface-container-highest rounded-[24px] overflow-hidden shadow-sm divide-y divide-surface-variant">
                {friends.map((friend) => (
                  <button 
                    key={friend.id}
                    onClick={() => openChat(friend)}
                    className="w-full p-4 flex items-center justify-between transition-all hover:bg-surface-variant text-left active:bg-surface-variant"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden relative bg-surface-container-high shrink-0 border border-surface-container-highest">
                        <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover" unoptimized />
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary border-2 border-surface rounded-full"></div>
                      </div>
                      <div>
                        <h4 className="font-headline text-sm font-extrabold tracking-tight text-on-surface">{friend.username}</h4>
                        <p className="font-body text-[11px] text-on-surface-variant font-medium truncate mt-0.5">Tap to open secure comms...</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {hubTab === "groups" && (
          <div className="flex flex-col gap-3">
            <div className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex items-center gap-4 shadow-sm hover:bg-surface-variant cursor-pointer">
              <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[24px]">grid_4x4</span>
              </div>
              <div className="flex-1">
                <h4 className="font-headline text-sm font-extrabold tracking-tight text-on-surface">Global Checkers Hub</h4>
                <p className="font-body text-[11px] text-on-surface-variant font-medium mt-0.5">2,140 Members • 14 Online</p>
              </div>
              <button className="px-4 py-2 bg-surface-container-high text-primary font-caps text-[10px] font-bold uppercase rounded-xl hover:bg-surface-container-highest transition-colors">Join</button>
            </div>
          </div>
        )}

        {hubTab === "network" && (
          <div className="flex flex-col gap-4">
            <div className="bg-surface border border-surface-container-highest rounded-[24px] p-5 relative overflow-hidden shadow-sm">
              <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Your Network ID</h3>
              <div className="flex items-end justify-between relative z-10">
                <p className="font-headline text-xl font-extrabold tracking-tight text-on-surface">{myUsername || "Loading..."}</p>
                <button onClick={handleCopyId} className="w-10 h-10 bg-surface-container-high rounded-xl flex items-center justify-center text-primary hover:bg-surface-variant active:scale-95 transition-all">
                  <span className="material-symbols-outlined text-base">{copied ? "check" : "content_copy"}</span>
                </button>
              </div>
            </div>

            <div className="bg-surface border border-surface-container-highest rounded-[24px] p-5 shadow-sm">
              <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Add Connection</h3>
              <form onSubmit={handleAddFriend} className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter Network ID..."
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value)}
                  className="flex-1 bg-background border border-surface-container-highest rounded-xl px-4 py-3 font-body text-xs focus:outline-none focus:border focus:border-primary text-on-surface placeholder-on-surface-variant transition-colors"
                />
                <button type="submit" className="px-5 bg-primary text-on-primary hover:opacity-90 font-headline font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all">Invite</button>
              </form>
              {inviteStatus && <p className="font-body text-[11px] text-primary font-bold mt-3">{inviteStatus}</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: FULL COMPACT CONSOLE ACTIVE THREAD (SOLID HIGH-CONTRAST)
  // ============================================================================
  return (
    <div className="w-full flex flex-col h-[calc(100vh-216px)] animate-fade-in text-on-background relative">
      
      {/* 🎮 CHALLENGE CHOOSE FLOATING INTERFACE */}
      {showGameSelector && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center pb-2 z-50 rounded-2xl animate-fade-in">
          <div className="bg-surface w-full rounded-[24px] p-5 flex flex-col gap-3 shadow-2xl border border-surface-container-highest">
            {inviteStep === "game" && (
              <>
                <div className="flex justify-between items-center px-1 mb-2">
                  <h3 className="font-headline text-sm font-black uppercase text-on-surface">Select Arena</h3>
                  <button onClick={() => setShowGameSelector(false)} className="w-8 h-8 bg-surface-container-high rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
                
                <button onClick={() => handleSendGameInvite("snooker")} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center text-green-500">
                       <span className="material-symbols-outlined text-[20px]">sports_bar</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Snooker 3D</h4>
                   </div>
                   <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                </button>

                <button onClick={() => handleSendGameInvite("chess")} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                   <div className="flex items-center gap-4">
                     {/* FIXED: Swapped hex-opacity bg-secondary/10 for semantic bg-secondary-container */}
                     <div className="w-10 h-10 bg-secondary-container rounded-xl flex items-center justify-center text-secondary">
                       <span className="material-symbols-outlined text-[20px]">psychology</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Grandmaster Chess</h4>
                   </div>
                   <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                </button>

                <button onClick={() => setInviteStep("carrom_mode")} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
                       <span className="material-symbols-outlined text-[20px]">radio_button_checked</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Carrom Matrix</h4>
                   </div>
                   <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                </button>
                
                <button onClick={() => handleSendGameInvite("checkers")} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                       <span className="material-symbols-outlined text-[20px]">grid_4x4</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Neon Checkers</h4>
                   </div>
                   <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                </button>
              </>
            )}
            {inviteStep === "carrom_mode" && (
              <>
                <div className="flex justify-between items-center px-1 mb-2">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setInviteStep("game")} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined text-base">arrow_back</span></button>
                    <h3 className="font-headline text-sm font-black uppercase text-on-surface">Rule Mode</h3>
                  </div>
                </div>
                <button onClick={() => handleSendGameInvite("carrom", "freestyle")} className="w-full p-4 bg-background border border-surface-container-highest rounded-[16px] text-left font-headline text-xs text-on-surface flex justify-between items-center hover:bg-surface-variant shadow-sm">
                  <span>Freestyle Mode (Fast)</span>
                  <span className="material-symbols-outlined text-sm text-amber-500">send</span>
                </button>
                <button onClick={() => handleSendGameInvite("carrom", "classic")} className="w-full p-4 bg-background border border-surface-container-highest rounded-[16px] text-left font-headline text-xs text-on-surface flex justify-between items-center hover:bg-surface-variant shadow-sm">
                  <span>Classic Mode (Tactical)</span>
                  <span className="material-symbols-outlined text-sm text-amber-500">send</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 📞 HEADER CONSOLE BAR ROW */}
      <div className="shrink-0 w-full bg-surface border border-surface-container-highest rounded-[24px] p-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveView("hub")} 
            className="w-10 h-10 rounded-[14px] bg-background border border-surface-container-highest hover:bg-surface-variant text-on-surface flex items-center justify-center transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden relative bg-surface-container-high border border-surface-container-highest">
              <Image src={activeChat?.avatar_url || ""} alt="User" fill className="object-cover" unoptimized />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold text-on-surface leading-tight">{activeChat?.username}</h3>
              <span className="font-caps text-[9px] text-primary font-bold uppercase tracking-widest flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span> Comms Online
              </span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setActiveView("hub")}
          className="font-headline text-[10px] font-bold text-red-500 bg-red-500/10 px-4 py-2 rounded-xl hover:bg-red-500/20 active:scale-95 transition-all"
        >
          Quit Chat
        </button>
      </div>

      {/* 💬 MESSAGE CHANNEL CORE VIEWPORTS */}
      <div className="flex-1 w-full overflow-y-auto px-2 py-4 space-y-5 no-scrollbar relative">
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
              <div className={`flex flex-col max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                
                {msg.message_type === 'text' && (
                  <div className={`px-4 py-3 font-body text-[13px] leading-relaxed shadow-sm border ${
                    isMe 
                      /* FIXED: Replaced border-primary/20 which breaks tailwind, now using solid border-primary */
                      ? "bg-primary border-primary text-on-primary rounded-[20px] rounded-tr-[4px]" 
                      : "bg-surface border-surface-container-highest text-on-surface rounded-[20px] rounded-tl-[4px]"
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                )}

                {msg.message_type === 'game_invite' && (
                  <div className="w-56 rounded-[20px] shadow-sm border border-surface-container-highest p-4 flex flex-col items-center gap-2 text-center bg-surface">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-background border border-surface-container-highest">
                      <span className={`material-symbols-outlined text-[24px] ${isCarrom ? "text-amber-500" : isChess ? "text-secondary" : isSnooker ? "text-green-500" : "text-blue-500"}`} style={{fontVariationSettings:"'FILL' 1"}}>{gameIcon}</span>
                    </div>
                    <div>
                      <h4 className="font-headline text-sm font-bold text-on-surface leading-tight mt-1">{msg.game_name}</h4>
                      <p className="font-caps text-[9px] text-on-surface-variant font-bold uppercase tracking-widest mt-1">Match Challenge</p>
                    </div>

                    <div className="w-full mt-3">
                      {msg.invite_status === 'pending' && (
                        isMe ? (
                          <div className="font-headline text-[11px] font-bold py-2 rounded-xl text-on-surface-variant bg-background border border-surface-container-highest">Awaiting...</div>
                        ) : (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => updateInviteStatus(msg.id, 'declined')} 
                              className="flex-1 py-2 bg-background border border-surface-container-highest text-on-surface font-headline font-bold text-[11px] rounded-xl hover:bg-surface-variant transition-colors"
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
                              className="flex-1 py-2 bg-primary text-on-primary font-headline font-bold text-[11px] rounded-xl hover:opacity-90 disabled:opacity-40 transition-colors"
                            >
                              Accept
                            </button>
                          </div>
                        )
                      )}
                      {msg.invite_status === 'declined' && <div className="font-headline text-[11px] text-red-500 font-bold py-2 bg-red-500/10 rounded-xl">Declined</div>}
                      {msg.invite_status === 'accepted' && (
                        <button 
                          onClick={() => {
                            if (isLockedOut) {
                              alert("Match Entry Halted: Refuel your arena points to join multiplayer.");
                              return;
                            }
                            onPlay?.(targetUrl, msg.match_id!);
                          }}
                          className="w-full py-2.5 bg-primary text-on-primary font-headline font-bold text-[11px] uppercase tracking-wider rounded-xl flex items-center justify-center gap-1 shadow-sm transition-transform active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                          Enter Arena
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <span className="font-caps text-[9px] block mt-1.5 px-1 text-on-surface-variant font-bold tracking-widest">{formatTime(msg.created_at)}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 📥 INLINE DOCK DECK INPUT TRAILER */}
      <div className="shrink-0 w-full bg-surface border border-surface-container-highest rounded-[24px] p-2 flex items-center gap-2 shadow-xl mb-1">
        
        <button
          type="button"
          onClick={() => { setShowGameSelector(true); setInviteStep("game"); }}
          className="w-11 h-11 bg-background hover:bg-surface-variant text-primary border border-surface-container-highest rounded-xl flex items-center justify-center active:scale-95 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">swords</span>
        </button>

        <button
          type="button"
          onClick={() => alert("Media Vault and interactive emoji reaction assets initializing...")}
          className="w-11 h-11 bg-background hover:bg-surface-variant border border-surface-container-highest text-on-surface-variant rounded-xl flex items-center justify-center active:scale-95 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
        
        <form onSubmit={handleSendText} className="flex-1 flex items-center bg-background border border-surface-container-highest rounded-xl pr-1.5 transition-all overflow-hidden h-11 focus-within:border focus-within:border-primary">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Message..."
            className="flex-1 bg-transparent border-none font-body text-[13px] text-on-surface placeholder-on-surface-variant focus:outline-none px-4 py-2 w-full"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className={`w-8 h-8 rounded-[10px] flex items-center justify-center transition-all shrink-0 ${
              newMessage.trim() 
                ? "bg-primary text-on-primary active:scale-90" 
                : "bg-surface text-on-surface-variant cursor-not-allowed border border-surface-container-highest"
            }`}
          >
            <span className="material-symbols-outlined text-[16px] font-bold">arrow_upward</span>
          </button>
        </form>

      </div>

    </div>
  );
}