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
      // Fixed inline UUID generator tracking block logic
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
  // VIEW 1: THE HUB CONSOLE FEED
  // ============================================================================
  if (activeView === "hub") {
    return (
      <div className="w-full animate-fade-in text-on-surface flex flex-col gap-4 pb-6">
        
        {/* SEGMENTED TAB HEADER NAVIGATION */}
        <div className="bg-surface-container/50 backdrop-blur-md p-1 rounded-xl flex items-center border border-white/5">
          {[
            { id: "dms", label: "Messages" },
            { id: "groups", label: "Groups" },
            { id: "network", label: "Network" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setHubTab(tab.id as any)}
              className={`flex-1 py-1.5 font-caps text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 ${
                hubTab === tab.id ? "bg-surface-container-high text-primary shadow-sm" : "text-on-surface-variant hover:text-primary"
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
              <div className="p-8 text-center glass-panel rounded-2xl shadow-sm">
                <span className="material-symbols-outlined text-3xl text-white/20 mb-2">chat_bubble</span>
                <p className="font-body text-xs text-on-surface-variant font-medium">Your inbox is empty.<br/>Connect via the Network tab.</p>
              </div>
            ) : (
              <div className="glass-panel rounded-2xl overflow-hidden shadow-sm">
                {friends.map((friend, index) => (
                  <button 
                    key={friend.id}
                    onClick={() => openChat(friend)}
                    className={`w-full p-3.5 flex items-center justify-between transition-all hover:bg-white/5 text-left ${
                      index !== friends.length - 1 ? 'border-b border-white/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden relative bg-surface-container shrink-0">
                        <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover" unoptimized />
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-surface-tint border-[1.5px] border-surface rounded-full"></div>
                      </div>
                      <div>
                        <h4 className="font-headline text-sm font-extrabold tracking-tight text-primary">{friend.username}</h4>
                        <p className="font-body text-[10px] text-on-surface-variant font-medium truncate mt-0.5">Tap to open secure comms...</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-white/20 text-md">chevron_right</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {hubTab === "groups" && (
          <div className="flex flex-col gap-2">
            <h3 className="font-caps text-[9px] font-bold text-on-surface-variant uppercase tracking-widest px-1">Discover Communities</h3>
            <div className="glass-panel rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:bg-white/5 cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-tertiary-container/10 border border-tertiary-container/30 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-tertiary-container text-base">grid_4x4</span>
              </div>
              <div className="flex-1">
                <h4 className="font-headline text-sm font-extrabold tracking-tight text-primary">Global Checkers Hub</h4>
                <p className="font-body text-[10px] text-on-surface-variant font-medium mt-0.5">2,140 Members • 14 Online</p>
              </div>
              <button className="px-3 py-1.5 bg-white/10 text-primary font-caps text-[9px] font-bold uppercase rounded-lg">Join</button>
            </div>
          </div>
        )}

        {hubTab === "network" && (
          <div className="flex flex-col gap-4">
            <div className="bg-gradient-to-br from-tertiary-container/20 to-primary-container/5 rounded-2xl p-5 border border-white/10 glass-panel">
              <h3 className="font-caps text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Your Network ID</h3>
              <div className="flex items-end justify-between relative z-10">
                <p className="font-headline text-xl font-extrabold tracking-tight">{myUsername || "Loading..."}</p>
                <button onClick={handleCopyId} className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center border border-white/10 text-primary">
                  <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                </button>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 shadow-sm">
              <h3 className="font-caps text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 px-1">Add Connection</h3>
              <form onSubmit={handleAddFriend} className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Enter Network ID..."
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value)}
                  className="flex-1 bg-surface-container-high border border-white/10 rounded-xl px-3 py-2.5 font-body text-xs focus:outline-none focus:border-surface-tint text-primary placeholder-on-surface-variant"
                />
                <button type="submit" className="px-4 gradient-pill-primary font-caps font-bold text-[9px] uppercase tracking-wider rounded-xl shadow-sm">Invite</button>
              </form>
              {inviteStatus && <p className="font-body text-[10px] text-surface-tint font-bold mt-2 px-1">{inviteStatus}</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: INTEGRATED CHAT WINDOW VIEWPORT STABILIZED
  // ============================================================================
  return (
    <div className="w-full flex flex-col h-[calc(100vh-204px)] animate-fade-in text-on-background relative">
      
      {/* 🎮 CHALLENGE STAGE SELECTOR POPUP */}
      {showGameSelector && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex items-end justify-center p-2 z-50 rounded-2xl animate-fade-in">
          <div className="glass-panel bg-surface-container-high w-full rounded-2xl p-4 flex flex-col gap-3 border border-white/10">
            {inviteStep === "game" && (
              <>
                <div className="flex justify-between items-center px-1">
                  <h3 className="font-headline text-sm font-black uppercase text-primary">Select Arena</h3>
                  <button onClick={() => setShowGameSelector(false)} className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
                <button onClick={() => setInviteStep("carrom_mode")} className="w-full flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
                   <div className="flex items-center gap-3">
                     <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center text-white">
                       <span className="material-symbols-outlined text-xl">radio_button_checked</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-primary">Carrom Matrix</h4>
                   </div>
                   <span className="material-symbols-outlined text-white/40 text-sm">chevron_right</span>
                </button>
                <button onClick={() => handleSendGameInvite("checkers")} className="w-full flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
                   <div className="flex items-center gap-3">
                     <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center text-background">
                       <span className="material-symbols-outlined text-xl">grid_4x4</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-primary">Neon Checkers</h4>
                   </div>
                   <span className="material-symbols-outlined text-white/40 text-sm">chevron_right</span>
                </button>
              </>
            )}
            {inviteStep === "carrom_mode" && (
              <>
                <div className="flex justify-between items-center px-1">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setInviteStep("game")} className="text-on-surface-variant"><span className="material-symbols-outlined text-sm">arrow_back</span></button>
                    <h3 className="font-headline text-sm font-black uppercase text-primary">Rule Mode</h3>
                  </div>
                </div>
                <button onClick={() => handleSendGameInvite("carrom", "freestyle")} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-left font-headline text-xs text-primary flex justify-between items-center">
                  <span>Freestyle Mode (Fast)</span>
                  <span className="material-symbols-outlined text-xs text-amber-500">send</span>
                </button>
                <button onClick={() => handleSendGameInvite("carrom", "classic")} className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-left font-headline text-xs text-primary flex justify-between items-center">
                  <span>Classic Mode (Tactical)</span>
                  <span className="material-symbols-outlined text-xs text-amber-500">send</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 📞 HEADER ROW MODULE */}
      <div className="shrink-0 w-full glass-panel rounded-2xl p-2.5 flex items-center justify-between border border-white/10 shadow-sm">
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => setActiveView("hub")} 
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-primary flex items-center justify-center transition-transform active:scale-90"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden relative bg-surface-container border border-white/10">
              <Image src={activeChat?.avatar_url || ""} alt="User" fill className="object-cover" unoptimized />
            </div>
            <div>
              <h3 className="font-headline text-xs font-extrabold text-primary leading-tight">{activeChat?.username}</h3>
              <span className="font-caps text-[8px] text-surface-tint font-bold uppercase tracking-widest flex items-center gap-0.5 mt-0.5">
                <span className="w-1 h-1 bg-surface-tint rounded-full animate-pulse"></span> Comms Online
              </span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setActiveView("hub")}
          className="font-caps text-[9px] font-black text-red-400 border border-red-500/20 bg-red-500/10 px-3 py-1.5 rounded-xl hover:bg-red-500/20 active:scale-95 transition-all"
        >
          Quit Chat
        </button>
      </div>

      {/* 💬 MAIN MESSAGE CHANNELS TRAILER */}
      <div className="flex-1 w-full overflow-y-auto px-1 py-3 space-y-4 no-scrollbar relative">
        {messages.map((msg) => {
          const isMe = msg.sender_id === myUserId;
          const isCarrom = msg.game_name?.includes("Carrom");
          const gameIcon = isCarrom ? "radio_button_checked" : "grid_4x4";
          const targetUrl = msg.game_name?.includes("Checkers") ? "native://checkers" : "native://carrom";

          return (
            <div key={msg.id} className={`flex items-start w-full ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`flex flex-col max-w-[85%] ${isMe ? "items-end" : "items-start"}`}>
                
                {msg.message_type === 'text' && (
                  <div className={`px-3.5 py-2.5 font-body text-xs shadow-sm border leading-relaxed ${
                    isMe 
                      ? "bg-primary-container text-on-primary-container border-transparent rounded-2xl rounded-tr-sm" 
                      : "glass-panel text-on-surface border-white/5 rounded-2xl rounded-tl-sm"
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                )}

                {msg.message_type === 'game_invite' && (
                  <div className="w-56 rounded-2xl overflow-hidden shadow-lg p-4 flex flex-col items-center gap-2 text-center glass-panel border-white/10">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10">
                      <span className={`material-symbols-outlined text-2xl ${isCarrom ? "text-amber-500" : "text-tertiary-container"}`} style={{fontVariationSettings:"'FILL' 1"}}>{gameIcon}</span>
                    </div>
                    <div>
                      <h4 className="font-headline text-xs font-extrabold text-primary leading-tight">{msg.game_name}</h4>
                      <p className="font-caps text-[8px] text-on-surface-variant font-bold uppercase tracking-widest mt-0.5">Match Challenge</p>
                    </div>

                    <div className="w-full mt-2">
                      {msg.invite_status === 'pending' && (
                        isMe ? (
                          <div className="font-caps text-[8px] font-bold uppercase py-1.5 rounded-lg border border-white/10 text-on-surface-variant bg-white/5">Awaiting...</div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => updateInviteStatus(msg.id, 'declined')} className="flex-1 py-1.5 bg-white/5 text-primary font-caps font-bold text-[8px] uppercase tracking-widest rounded-lg border border-white/5">Decline</button>
                            <button onClick={() => updateInviteStatus(msg.id, 'accepted')} className="flex-1 py-1.5 gradient-pill-primary font-caps font-bold text-[8px] uppercase tracking-widest rounded-lg shadow-sm">Accept</button>
                          </div>
                        )
                      )}
                      {msg.invite_status === 'declined' && <div className="font-caps text-[8px] text-red-400 font-bold uppercase py-1.5 bg-red-500/10 rounded-lg border border-red-500/20">Declined</div>}
                      {msg.invite_status === 'accepted' && (
                        <button 
                          onClick={() => onPlay?.(targetUrl, msg.match_id!)}
                          className="w-full py-2 bg-primary text-background font-headline font-extrabold text-[10px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 shadow-sm"
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

      {/* 📥 INLINE DOCK DECK INPUT */}
      <div className="shrink-0 w-full bg-surface-container/90 backdrop-blur-md border border-white/10 rounded-2xl p-2 flex items-center gap-2 shadow-2xl relative z-20 mb-1">
        
        <button
          type="button"
          onClick={() => { setShowGameSelector(true); setInviteStep("game"); }}
          className="w-9 h-9 bg-white/5 hover:bg-white/10 text-primary border border-white/10 rounded-xl flex items-center justify-center active:scale-90 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-lg">swords</span>
        </button>

        <button
          type="button"
          onClick={() => alert("Media Vault and interactive emoji reaction assets initializing...")}
          className="w-9 h-9 bg-white/5 hover:bg-white/10 text-on-surface-variant border border-white/5 rounded-xl flex items-center justify-center active:scale-90 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-lg">add</span>
        </button>
        
        <form onSubmit={handleSendText} className="flex-1 flex items-center bg-surface-container-highest border border-white/5 rounded-xl pr-1 focus-within:border-surface-tint focus-within:ring-1 focus-within:ring-surface-tint transition-all overflow-hidden shadow-inner">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Message..."
            className="flex-1 bg-transparent border-none font-body text-xs text-primary placeholder-on-surface-variant focus:outline-none px-3 py-2.5 w-full"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0 ${
              newMessage.trim() ? "bg-primary-container text-on-primary-container active:scale-90 shadow-sm" : "bg-transparent text-white/10 cursor-not-allowed"
            }`}
          >
            <span className="material-symbols-outlined text-sm font-bold">arrow_upward</span>
          </button>
        </form>

      </div>

    </div>
  );
}