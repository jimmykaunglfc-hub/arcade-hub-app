"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

// --- TYPE DEFINITIONS ---
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

export default function ChatTab({ 
  onPlay 
}: { 
  onPlay?: (url: string, matchId: string) => void 
}) {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeChat, setActiveChat] = useState<Friend | null>(null);
  
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. INITIALIZE IDENTITY & FRIENDS
  useEffect(() => {
    const initData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);

      // Fetch all accepted friends
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

  // 2. LOAD MESSAGES & SUBSCRIBE TO ACTIVE DM THREAD
  useEffect(() => {
    if (!myUserId || !activeChat) return;

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

    const channel = supabase
      .channel(`chat_${activeChat.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'direct_messages'
      }, (payload) => {
        // Handle new inserts and updates (like an invite being accepted)
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
  }, [myUserId, activeChat]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    setNewMessage(""); // Optimistic clear
    await supabase.from("direct_messages").insert([payload]);
  };

  const handleSendGameInvite = async () => {
    if (!myUserId || !activeChat) return;

    // 1. Generate Match Room silently in the background
    const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: match } = await supabase.from('checkers_matches').insert({
      p1_id: myUserId,
      board: INITIAL_BOARD,
      room_code: generatedCode,
      status: 'waiting'
    }).select().single();

    if (!match) return alert("Failed to initialize match framework.");

    // 2. Drop the Interactive Invite Card into the chat
    await supabase.from("direct_messages").insert([{
      sender_id: myUserId,
      receiver_id: activeChat.id,
      content: "I challenged you to a game!",
      message_type: 'game_invite',
      match_id: match.id,
      game_name: "Neon Checkers",
      invite_status: "pending"
    }]);
  };

  const updateInviteStatus = async (msgId: string, newStatus: string) => {
    await supabase.from('direct_messages').update({ invite_status: newStatus }).eq('id', msgId);
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // --- RENDERERS ---

  // VIEW 1: CONTACT LIST
  if (!activeChat) {
    return (
      <div className="flex flex-col h-[calc(100vh-240px)] bg-surface rounded-[2rem] border border-white/5 shadow-2xl animate-fade-in">
        <header className="px-5 py-5 bg-surface-variant/40 border-b border-white/5">
          <h3 className="text-lg font-black text-white tracking-tight">Direct Comms</h3>
          <p className="text-[10px] text-on-surface-variant font-extrabold uppercase tracking-widest mt-1">
            Select a node to establish link
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
          {friends.length === 0 ? (
            <div className="text-center mt-10 text-xs text-on-surface-variant/50 font-bold uppercase tracking-widest">
              No active connections. <br/> Add friends in the Profile tab.
            </div>
          ) : (
            friends.map(friend => (
              <button 
                key={friend.id}
                onClick={() => setActiveChat(friend)}
                className="w-full bg-surface-variant/20 hover:bg-surface-variant/40 border border-white/5 rounded-2xl p-3 flex items-center gap-4 transition-all active:scale-[0.98] text-left"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden relative border border-white/10 bg-black/40">
                  <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover p-1" unoptimized />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white tracking-tight">{friend.username}</h4>
                  <span className="text-[9px] text-green-400 font-bold tracking-wider uppercase flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    Online
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // VIEW 2: PRIVATE DM THREAD
  return (
    <div className="flex flex-col h-[calc(100vh-240px)] bg-gradient-to-b from-surface-variant/20 to-surface rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden animate-fade-in">
      
      {/* THREAD HEADER */}
      <header className="px-3 py-3 bg-surface-variant/60 border-b border-white/5 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveChat(null)}
            className="w-9 h-9 rounded-xl bg-black/30 hover:bg-black/50 border border-white/10 flex items-center justify-center text-white transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full overflow-hidden relative border border-white/10 bg-black/40">
              <Image src={activeChat.avatar_url} alt={activeChat.username} fill className="object-cover p-0.5" unoptimized />
            </div>
            <div>
              <h3 className="text-xs font-black text-white tracking-tight">{activeChat.username}</h3>
              <p className="text-[8px] text-primary font-extrabold uppercase tracking-widest mt-0.5">Encrypted Link</p>
            </div>
          </div>
        </div>
      </header>

      {/* MESSAGE SCROLL MATRIX */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 no-scrollbar scroll-smooth bg-black/20">
        {messages.map((msg) => {
          const isMe = msg.sender_id === myUserId;

          return (
            <div key={msg.id} className={`flex items-start gap-2 w-full animate-fade-in ${isMe ? "justify-end" : "justify-start"}`}>
              
              {/* MESSAGE CONTENT WRAPPER */}
              <div className={`flex flex-col max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                
                {/* 📝 STANDARD TEXT BUBBLE */}
                {msg.message_type === 'text' && (
                  <div className={`relative px-4 py-3 text-xs leading-relaxed shadow-md ${
                    isMe 
                      ? "bg-primary text-on-primary font-semibold rounded-[1.25rem] rounded-tr-sm" 
                      : "bg-surface-variant/90 text-white font-medium rounded-[1.25rem] rounded-tl-sm border border-white/5"
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                )}

                {/* 🎮 INTERACTIVE GAME INVITE CARD */}
                {msg.message_type === 'game_invite' && (
                  <div className={`w-64 relative rounded-[1.25rem] overflow-hidden border shadow-lg ${
                    isMe ? "border-primary/40 rounded-tr-sm" : "border-secondary/40 rounded-tl-sm"
                  }`}>
                    <div className={`p-4 bg-gradient-to-br flex flex-col items-center text-center gap-2 ${
                      isMe ? "from-primary/20 to-surface-variant/90" : "from-secondary/20 to-surface-variant/90"
                    }`}>
                      <span className={`material-symbols-outlined text-4xl drop-shadow-[0_0_15px_currentColor] ${isMe ? "text-primary" : "text-secondary"}`}>
                        grid_4x4
                      </span>
                      <div>
                        <h4 className="text-sm font-black text-white tracking-tight">{msg.game_name}</h4>
                        <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-widest mt-0.5">
                          {isMe ? "Invite Sent" : "Incoming Challenge"}
                        </p>
                      </div>

                      <div className="w-full mt-2">
                        {/* Status: Pending */}
                        {msg.invite_status === 'pending' && (
                          isMe ? (
                            <div className="text-[10px] text-primary font-black uppercase tracking-widest py-2 bg-black/30 rounded-lg border border-white/5">Waiting...</div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => updateInviteStatus(msg.id, 'declined')} className="flex-1 py-2 bg-black/40 text-on-surface-variant font-black text-[9px] uppercase tracking-wider rounded-lg active:scale-95 transition-all">Decline</button>
                              <button onClick={() => updateInviteStatus(msg.id, 'accepted')} className="flex-1 py-2 bg-secondary text-on-secondary shadow-[0_0_15px_rgba(74,225,118,0.3)] font-black text-[9px] uppercase tracking-wider rounded-lg active:scale-95 transition-all">Accept</button>
                            </div>
                          )
                        )}

                        {/* Status: Declined */}
                        {msg.invite_status === 'declined' && (
                          <div className="text-[10px] text-red-400 font-black uppercase tracking-widest py-2 bg-red-500/10 rounded-lg border border-red-500/20">Declined</div>
                        )}

                        {/* Status: Accepted (Ready to Play) */}
                        {msg.invite_status === 'accepted' && (
                          <button 
                            onClick={() => onPlay?.("native://checkers", msg.match_id!)}
                            className="w-full py-2.5 bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] font-black text-[10px] uppercase tracking-wider rounded-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                            Launch Engine
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                <span className="text-[8px] block mt-1 px-1 text-on-surface-variant/40 font-bold uppercase tracking-wider">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 📥 BOTTOM CHAT CONTROLLER */}
      <footer className="p-3 bg-surface-variant/40 border-t border-white/5 backdrop-blur-md">
        <form onSubmit={handleSendText} className="relative flex items-center gap-2">
          
          {/* Challenge Button */}
          <button
            type="button"
            onClick={handleSendGameInvite}
            className="w-11 h-11 flex-shrink-0 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-center text-primary hover:bg-primary/20 transition-all active:scale-90 shadow-[0_0_15px_rgba(192,193,255,0.1)]"
          >
            <span className="material-symbols-outlined text-lg">swords</span>
          </button>

          {/* Text Input */}
          <div className="flex-1 bg-black/40 border border-white/5 rounded-xl overflow-hidden focus-within:border-primary/30 transition-all flex items-center pr-1.5">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Send secure message..."
              className="flex-1 bg-transparent border-none text-xs text-white placeholder-on-surface-variant/50 focus:outline-none px-4 py-3.5"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-all ${
                newMessage.trim() ? "bg-primary text-on-primary shadow-md active:scale-90" : "bg-transparent text-on-surface-variant/40 cursor-not-allowed"
              }`}
            >
              <span className="material-symbols-outlined text-sm font-bold ml-0.5">send</span>
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}