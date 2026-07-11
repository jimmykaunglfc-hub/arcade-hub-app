"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

type Message = {
  id: number;
  created_at: string;
  username: string;
  text: string;
  avatar: string;
};

export default function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [myUsername, setMyUsername] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 👤 Handle user identity profile layer
  useEffect(() => {
    let storedName = localStorage.getItem("arcade_chat_name");
    if (!storedName) {
      storedName = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem("arcade_chat_name", storedName);
    }
    setMyUsername(storedName);
  }, []);

  // 🌐 Supabase Live Feed Pipeline
  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(50);
      
      if (!error && data) setMessages(data);
    };

    fetchMessages();

    const channel = supabase
      .channel("schema-db-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const messageData = {
      username: myUsername,
      text: newMessage.trim(),
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${myUsername}`,
    };

    const { error } = await supabase.from("messages").insert([messageData]);
    if (error) console.error("Database sync warning:", error.message);

    setNewMessage("");
  };

  // Helper to format clean database timestamps
  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-240px)] bg-gradient-to-b from-surface-variant/20 to-surface rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden animate-fade-in">
      
      {/* 💳 TOP HEADER BANNER CARD */}
      <header className="px-5 py-4 bg-surface-variant/40 border-b border-white/5 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20 shadow-[0_0_15px_rgba(192,193,255,0.05)]">
            <span className="material-symbols-outlined text-primary text-xl">forum</span>
          </div>
          <div>
            <h3 className="text-sm font-black text-white tracking-tight">Global Network Chat</h3>
            <p className="text-[9px] text-secondary font-extrabold uppercase tracking-widest mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span> Systems Operational
            </p>
          </div>
        </div>
        
        {/* User Identity Chip */}
        <div className="bg-black/40 border border-white/5 px-3 py-1.5 rounded-xl flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(192,193,255,0.8)]"></div>
          <span className="text-[10px] text-on-surface-variant font-bold tracking-tight">{myUsername}</span>
        </div>
      </header>

      {/* 💬 MESSAGE SCROLL MATRIX BOX */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 scrollbar-none scroll-smooth">
        {messages.map((msg, idx) => {
          const isMe = msg.username === myUsername;
          const showSenderName = !isMe && (idx === 0 || messages[idx - 1].username !== msg.username);

          return (
            <div 
              key={msg.id} 
              className={`flex items-start gap-3 w-full max-w-full animate-fade-in ${
                isMe ? "justify-end" : "justify-start"
              }`}
            >
              {/* Profile Badge (Left Aligned for others only) */}
              {!isMe && (
                <div className="relative w-8 h-8 rounded-xl bg-surface-variant border border-white/10 flex-shrink-0 overflow-hidden mt-0.5">
                  <img src={msg.avatar} alt="User node asset" className="w-full h-full object-cover" />
                </div>
              )}

              {/* Message Block Structure */}
              <div className={`flex flex-col max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
                {showSenderName && (
                  <span className="text-[10px] text-primary font-black tracking-wide mb-1 px-1">
                    {msg.username}
                  </span>
                )}
                
                {/* Text Bubble Layer */}
                <div className={`relative px-4 py-3 text-xs leading-relaxed shadow-md transition-all ${
                  isMe 
                    ? "bg-primary text-on-primary font-semibold rounded-[1.25rem] rounded-tr-none shadow-[0_4px_12px_rgba(192,193,255,0.1)]" 
                    : "bg-surface-variant/60 text-white font-medium rounded-[1.25rem] rounded-tl-none border border-white/5"
                }`}>
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                  
                  {/* Inline micro timestamp */}
                  <span className={`text-[8px] block mt-1.5 text-right font-bold uppercase tracking-wider ${
                    isMe ? "text-on-primary/60" : "text-on-surface-variant/40"
                  }`}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              </div>

              {/* Profile Badge (Right Aligned for User only) */}
              {isMe && (
                <div className="relative w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex-shrink-0 overflow-hidden mt-0.5">
                  <img src={msg.avatar} alt="Personal avatar profile node" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 📥 BOTTOM STICKY TRANSMISSION CONTROLLER */}
      <footer className="p-4 bg-surface-variant/20 border-t border-white/5 backdrop-blur-md">
        <form onSubmit={handleSendMessage} className="relative flex items-center bg-black/40 border border-white/5 rounded-2xl overflow-hidden focus-within:border-primary/30 transition-all px-2 py-1.5">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Broadcast encrypted data packet..."
            className="flex-1 bg-transparent border-none text-xs text-white placeholder-on-surface-variant/50 focus:outline-none px-3 py-2"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className={`h-9 px-4 rounded-xl flex items-center justify-center gap-1.5 font-bold transition-all ${
              newMessage.trim() 
                ? "bg-primary text-on-primary shadow-[0_0_15px_rgba(192,193,255,0.3)] active:scale-95" 
                : "bg-surface text-on-surface-variant opacity-40 cursor-not-allowed"
            }`}
          >
            <span className="text-[10px] tracking-widest uppercase font-black pl-0.5">Send</span>
            <span className="material-symbols-outlined text-sm font-bold">send</span>
          </button>
        </form>
      </footer>

    </div>
  );
}