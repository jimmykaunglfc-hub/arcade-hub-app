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
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [activeChat, setActiveChat] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);

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
  }, [myUserId, activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const handleSendGameInvite = async () => {
    if (!myUserId || !activeChat) return;

    const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: match } = await supabase.from('checkers_matches').insert({
      p1_id: myUserId,
      board: INITIAL_BOARD,
      room_code: generatedCode,
      status: 'waiting'
    }).select().single();

    if (!match) return alert("Failed to initialize match framework.");

    await supabase.from("direct_messages").insert([{
      sender_id: myUserId,
      receiver_id: activeChat.id,
      content: "Challenged you to a game",
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

  // VIEW 1: PREMIUM NODAL LIST REPRESENTATION
  if (!activeChat) {
    return (
      <div className="flex flex-col h-[calc(100vh-240px)] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-900 rounded-[2rem] shadow-sm transition-colors overflow-hidden">
        <header className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-900/60 bg-neutral-50/50 dark:bg-neutral-950/20">
          <h3 className="text-base font-black tracking-tight text-neutral-900 dark:text-white">Direct Comms</h3>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider mt-0.5">
            Select a connection node to interact
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
          {friends.length === 0 ? (
            <div className="text-center mt-12 text-xs text-neutral-400 dark:text-neutral-500 font-medium py-6">
              No network profiles synchronized.
            </div>
          ) : (
            friends.map(friend => (
              <button 
                key={friend.id}
                onClick={() => setActiveChat(friend)}
                className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200/60 dark:border-neutral-900 rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.99] hover:border-neutral-300 dark:hover:border-neutral-800 text-left"
              >
                <div className="w-11 h-11 rounded-full overflow-hidden relative border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                  <Image src={friend.avatar_url} alt={friend.username} fill className="object-cover p-0.5" unoptimized />
                </div>
                <div>
                  <h4 className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">{friend.username}</h4>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold tracking-wider uppercase flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
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

  // VIEW 2: PREMIUM MESSAGE PANEL INTERFACE
  return (
    <div className="flex flex-col h-[calc(100vh-240px)] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-900 rounded-[2rem] shadow-sm overflow-hidden transition-colors">
      
      <header className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-900/60 flex items-center gap-3 bg-neutral-50/50 dark:bg-neutral-950/20">
        <button 
          onClick={() => setActiveChat(null)}
          className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200/40 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center transition-all active:scale-90"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden relative border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-950">
            <Image src={activeChat.avatar_url} alt={activeChat.username} fill className="object-cover p-0.5" unoptimized />
          </div>
          <div>
            <h3 className="text-xs font-black tracking-tight text-neutral-900 dark:text-white">{activeChat.username}</h3>
            <span className="text-[9px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest block mt-0.5">Direct Thread</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 no-scrollbar bg-neutral-50/30 dark:bg-neutral-950/10">
        {messages.map((msg) => {
          const isMe = msg.sender_id === myUserId;

          return (
            <div key={msg.id} className={`flex items-start w-full ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`flex flex-col max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                
                {msg.message_type === 'text' && (
                  <div className={`px-4 py-3 text-xs rounded-2xl shadow-sm leading-relaxed border ${
                    isMe 
                      ? "bg-neutral-900 dark:bg-white text-white dark:text-black border-transparent rounded-tr-sm" 
                      : "bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-800 rounded-tl-sm"
                  }`}>
                    <p className="whitespace-pre-wrap break-words font-medium">{msg.content}</p>
                  </div>
                )}

                {msg.message_type === 'game_invite' && (
                  <div className="w-60 rounded-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-sm p-4 flex flex-col items-center gap-2.5 text-center">
                    <span className="material-symbols-outlined text-3xl text-indigo-600 dark:text-indigo-400">swords</span>
                    <div>
                      <h4 className="text-xs font-black tracking-tight text-neutral-900 dark:text-white">{msg.game_name}</h4>
                      <p className="text-[9px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider mt-1">Challenge Request</p>
                    </div>

                    <div className="w-full mt-2">
                      {msg.invite_status === 'pending' && (
                        isMe ? (
                          <div className="text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase py-2 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200/40 dark:border-neutral-800/40">Awaiting...</div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => updateInviteStatus(msg.id, 'declined')} className="flex-1 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-bold text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all border border-transparent">Decline</button>
                            <button onClick={() => updateInviteStatus(msg.id, 'accepted')} className="flex-1 py-2 bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all">Accept</button>
                          </div>
                        )
                      )}

                      {msg.invite_status === 'declined' && (
                        <div className="text-[10px] text-red-500 font-bold uppercase py-2 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-100 dark:border-red-900/40">Declined</div>
                      )}

                      {msg.invite_status === 'accepted' && (
                        <button 
                          onClick={() => onPlay?.("native://checkers", msg.match_id!)}
                          className="w-full py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-black font-black text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                          Enter Arena
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <span className="text-[9px] block mt-1.5 px-1 text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest">
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-3 border-t border-neutral-100 dark:border-neutral-900/60 bg-white dark:bg-neutral-900">
        <form onSubmit={handleSendText} className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSendGameInvite}
            className="w-11 h-11 bg-neutral-50 dark:bg-neutral-950 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-indigo-600 dark:text-indigo-400 border border-neutral-200/60 dark:border-neutral-800 rounded-xl flex items-center justify-center transition-all active:scale-90 shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-lg">swords</span>
          </button>

          <div className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200/60 dark:border-neutral-800 rounded-xl flex items-center pr-1.5 focus-within:border-neutral-300 dark:focus-within:border-neutral-700 transition-all overflow-hidden">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 bg-transparent border-none text-xs text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none px-4 py-3.5 w-full"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 ${
                newMessage.trim() ? "bg-neutral-900 dark:bg-white text-white dark:text-black active:scale-90" : "bg-transparent text-neutral-300 dark:text-neutral-700 cursor-not-allowed"
              }`}
            >
              <span className="material-symbols-outlined text-[14px] font-bold">send</span>
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}