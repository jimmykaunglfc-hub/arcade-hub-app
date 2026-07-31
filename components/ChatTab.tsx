"use client";

import { ChangeEvent, useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";

interface Friend {
  id: string;
  username: string;
  avatar_url: string;
  last_seen_at?: string;
  is_online?: boolean;
}

interface FriendRequest extends Friend { requestId: string; }
interface ChatGroup { id: string; name: string; description: string; created_by: string; }

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
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [joinedGroupIds, setJoinedGroupIds] = useState<string[]>([]);
  const [unreadByFriend, setUnreadByFriend] = useState<Record<string, number>>({});
  const [networkLoading, setNetworkLoading] = useState(true);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupStatus, setGroupStatus] = useState("");
  const [activeChat, setActiveChat] = useState<Friend | null>(null);
  
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [searchTarget, setSearchTarget] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [copied, setCopied] = useState(false);
  
  const [showGameSelector, setShowGameSelector] = useState(false);
  const [inviteStep, setInviteStep] = useState<"game" | "carrom_mode">("game");
  const [chatLoading, setChatLoading] = useState(false);
  const [showComposerMenu, setShowComposerMenu] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Multiplayer lockout rule enforcement
  const isLockedOut = currentPoints <= 0;

  const loadNetwork = useCallback(async (id: string) => {
    setNetworkLoading(true);
    const [{ data: myProfile }, { data: links }, { data: allGroups }, { data: memberships }, { data: unread }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", id).single(),
      supabase.from("friendships").select("id, requester_id, receiver_id, status").or(`requester_id.eq.${id},receiver_id.eq.${id}`),
      supabase.from("chat_groups").select("id, name, description, created_by").order("created_at", { ascending: false }).limit(30),
      supabase.from("chat_group_members").select("group_id").eq("user_id", id),
      supabase.from("direct_messages").select("sender_id").eq("receiver_id", id).is("read_at", null),
    ]);
    if (myProfile) setMyUsername(myProfile.username);
    const accepted = (links || []).filter((link) => link.status === "accepted");
    const requested = (links || []).filter((link) => link.status === "pending" && link.receiver_id === id);
    const profileIds = [...new Set([...accepted.map((link) => link.requester_id === id ? link.receiver_id : link.requester_id), ...requested.map((link) => link.requester_id)])];
    const { data: profiles } = profileIds.length ? await supabase.from("profiles").select("id, username, avatar_url, last_seen_at").in("id", profileIds) : { data: [] as Friend[] };
    const profileById = new Map((profiles || []).map((profile) => [profile.id, { ...profile, is_online: Boolean(profile.last_seen_at && Date.now() - new Date(profile.last_seen_at).getTime() < 2 * 60 * 1000) }]));
    setFriends(accepted.map((link) => profileById.get(link.requester_id === id ? link.receiver_id : link.requester_id)).filter(Boolean) as Friend[]);
    setPendingRequests(requested.map((link) => ({ ...(profileById.get(link.requester_id) as Friend), requestId: link.id })).filter((request) => request.id));
    setGroups((allGroups || []) as ChatGroup[]);
    setJoinedGroupIds((memberships || []).map((membership) => membership.group_id));
    const counts: Record<string, number> = {};
    (unread || []).forEach((message) => { counts[message.sender_id] = (counts[message.sender_id] || 0) + 1; });
    setUnreadByFriend(counts);
    setNetworkLoading(false);
  }, []);

  useEffect(() => {
    const initData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (userId && userId !== user.id) return;
      setMyUserId(user.id);
      await loadNetwork(user.id);
      await supabase.rpc("touch_chat_presence");
    };
    initData();
  }, [loadNetwork, userId]);

  useEffect(() => {
    if (!myUserId) return;
    const refresh = () => loadNetwork(myUserId);
    const channel = supabase.channel(`chat-hub-${myUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `receiver_id=eq.${myUserId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_groups" }, refresh)
      .subscribe();
    const heartbeat = window.setInterval(() => { supabase.rpc("touch_chat_presence"); }, 60000);
    return () => { window.clearInterval(heartbeat); supabase.removeChannel(channel); };
  }, [myUserId, loadNetwork]);

  useEffect(() => {
    if (!myUserId || !activeChat || activeView !== "chat") return;

    const fetchMessages = async () => {
      setChatLoading(true);
      const { data } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${myUserId},receiver_id.eq.${activeChat.id}),and(sender_id.eq.${activeChat.id},receiver_id.eq.${myUserId})`)
        .order("created_at", { ascending: true })
        .limit(50);
        
      if (data) setMessages(data);
      await supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("receiver_id", myUserId).eq("sender_id", activeChat.id).is("read_at", null);
      setUnreadByFriend((previous) => ({ ...previous, [activeChat.id]: 0 }));
      setChatLoading(false);
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

  const sendEmote = async (emote: string) => {
    if (!myUserId || !activeChat) return;
    setShowComposerMenu(false);
    await supabase.from("direct_messages").insert({ sender_id: myUserId, receiver_id: activeChat.id, content: emote, message_type: "text" });
  };

  const handleAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !myUserId || !activeChat) return;
    if (file.size > 5 * 1024 * 1024) return alert("Attachments must be 5 MB or smaller.");
    const extension = file.name.split('.').pop() || 'file';
    const path = `${myUserId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: false });
    if (error) return alert(`Upload failed: ${error.message}`);
    const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
    await supabase.from("direct_messages").insert({ sender_id: myUserId, receiver_id: activeChat.id, content: data.publicUrl, message_type: "attachment" });
    event.target.value = "";
    setShowComposerMenu(false);
  };

  const handleSendGameInvite = async (
    gameType: "checkers" | "carrom" | "chess" | "snooker" | "pool" | "uno" | "tictactoe",
    mode?: "freestyle" | "classic"
  ) => {
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
    else if (gameType === "pool") {
      const generatedUUID = crypto.randomUUID();
      await supabase.from("direct_messages").insert([{
        sender_id: myUserId,
        receiver_id: activeChat.id,
        content: "Challenged you to 8-Ball Pool",
        message_type: "game_invite",
        match_id: generatedUUID,
        game_name: "8-Ball Pool",
        invite_status: "pending"
      }]);
    }
    else if (gameType === "uno") {
      const generatedUUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

      await supabase.from("direct_messages").insert([{
        sender_id: myUserId, 
        receiver_id: activeChat.id, 
        content: `Challenged you to Uno Card Battle`,
        message_type: 'game_invite', 
        match_id: generatedUUID, 
        game_name: "Uno Card Battle", 
        invite_status: "pending"
      }]);
    }
    else if (gameType === "tictactoe") {
      const generatedUUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

      await supabase.from("direct_messages").insert([{
        sender_id: myUserId, 
        receiver_id: activeChat.id, 
        content: `Challenged you to Tic-Tac-Toe Matrix`,
        message_type: 'game_invite', 
        match_id: generatedUUID, 
        game_name: "Tic-Tac-Toe Matrix", 
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

    const { error } = await supabase.rpc("request_friend", { target_user_id: targetProfile.id });

    if (error) {
      setInviteStatus("Already in your network.");
    } else {
      setInviteStatus(`Invitation sent to ${targetProfile.username}.`);
      setSearchTarget("");
      loadNetwork(myUserId);
    }
  };

  const respondToFriendRequest = async (requestId: string, accepted: boolean) => {
    if (!myUserId) return;
    const { error } = await supabase.rpc("respond_to_friend_request", { request_id: requestId, accepted });
    if (error) setInviteStatus(error.message);
    await loadNetwork(myUserId);
  };

  const joinGroup = async (groupId: string) => {
    if (!myUserId) return;
    const { error } = await supabase.from("chat_group_members").insert({ group_id: groupId, user_id: myUserId });
    setGroupStatus(error ? error.message : "Joined group.");
    if (!error) await loadNetwork(myUserId);
  };

  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!myUserId || groupName.trim().length < 3) return setGroupStatus("Enter a group name of at least 3 characters.");
    const { data, error } = await supabase.from("chat_groups").insert({ name: groupName.trim(), description: groupDescription.trim(), created_by: myUserId }).select("id").single();
    if (error || !data) return setGroupStatus(error?.message || "Could not create group.");
    const { error: memberError } = await supabase.from("chat_group_members").insert({ group_id: data.id, user_id: myUserId, role: "owner" });
    setGroupStatus(memberError ? memberError.message : "Group created.");
    if (!memberError) { setGroupName(""); setGroupDescription(""); await loadNetwork(myUserId); }
  };

  const isOnline = (friend: Friend) => Boolean(friend.is_online);

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
      <div className="w-full animate-fade-in text-on-surface flex flex-col gap-2 pb-6">
        
        {/* ADAPTIVE HUB SWITCHER BAR */}
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-3">
          {[
            { id: "dms", label: "Messages" },
            { id: "groups", label: "Groups" },
            { id: "network", label: "Network" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setHubTab(tab.id as "dms" | "groups" | "network")}
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
            {networkLoading && <p className="px-2 py-4 text-center text-xs font-bold text-on-surface-variant animate-pulse">Syncing conversations…</p>}
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
                        <div className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-surface rounded-full ${isOnline(friend) ? "bg-primary" : "bg-on-surface-variant"}`}></div>
                      </div>
                      <div>
                        <h4 className="font-headline text-sm font-extrabold tracking-tight text-on-surface">{friend.username}</h4>
                        <p className="font-body text-[11px] text-on-surface-variant font-medium truncate mt-0.5">{isOnline(friend) ? "Online now" : "Offline"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">{unreadByFriend[friend.id] > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">{unreadByFriend[friend.id]}</span>}<span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span></div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {hubTab === "groups" && (
          <div className="flex flex-col gap-3">
            <form onSubmit={createGroup} className="bg-surface border border-surface-container-highest rounded-[24px] p-4 space-y-2 shadow-sm">
              <h3 className="font-headline text-sm font-extrabold text-on-surface">Create a group</h3>
              <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" className="w-full rounded-xl border border-surface-container-highest bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary" />
              <input value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="Description (optional)" className="w-full rounded-xl border border-surface-container-highest bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary" />
              <button className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-on-primary">Create group</button>
              {groupStatus && <p className="text-[11px] font-medium text-on-surface-variant">{groupStatus}</p>}
            </form>
            {groups.map((group) => (
              <div key={group.id} className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-primary text-[24px]">grid_4x4</span></div>
                <div className="flex-1 min-w-0"><h4 className="font-headline text-sm font-extrabold tracking-tight text-on-surface">{group.name}</h4><p className="font-body text-[11px] text-on-surface-variant truncate mt-0.5">{group.description || "Community group"}</p></div>
                {joinedGroupIds.includes(group.id) ? <span className="px-3 py-2 text-[10px] font-bold text-primary">Joined</span> : <button onClick={() => joinGroup(group.id)} className="px-4 py-2 bg-surface-container-high text-primary font-caps text-[10px] font-bold uppercase rounded-xl">Join</button>}
              </div>
            ))}
            {!networkLoading && groups.length === 0 && <p className="p-5 text-center text-xs text-on-surface-variant">No groups yet. Start the first one.</p>}
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
            {pendingRequests.length > 0 && <div className="bg-surface border border-surface-container-highest rounded-[24px] p-5 shadow-sm"><h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Connection requests</h3><div className="space-y-3">{pendingRequests.map((request) => <div key={request.requestId} className="flex items-center gap-3"><div className="w-9 h-9 rounded-full overflow-hidden relative bg-surface-container-high"><Image src={request.avatar_url} alt="" fill className="object-cover" unoptimized /></div><span className="flex-1 text-sm font-bold text-on-surface">{request.username}</span><button onClick={() => respondToFriendRequest(request.requestId, false)} className="text-xs font-bold text-on-surface-variant">Decline</button><button onClick={() => respondToFriendRequest(request.requestId, true)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary">Accept</button></div>)}</div></div>}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: FULL COMPACT CONSOLE ACTIVE THREAD
  // ============================================================================
  return (
    <div className="w-full flex flex-col h-[calc(100vh-216px)] animate-fade-in text-on-background relative">
      
      {/* 🎮 CHALLENGE CHOOSE FLOATING INTERFACE */}
      {showGameSelector && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center pb-2 z-50 rounded-2xl animate-fade-in">
          <div className="bg-surface w-full rounded-[24px] p-5 flex flex-col gap-2.5 shadow-2xl border border-surface-container-highest max-h-[85%] overflow-y-auto no-scrollbar">
            {inviteStep === "game" && (
              <>
                <div className="flex justify-between items-center px-1 mb-1">
                  <h3 className="font-headline text-sm font-black uppercase text-on-surface">Select Arena</h3>
                  <button onClick={() => setShowGameSelector(false)} className="w-8 h-8 bg-surface-container-high rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
                
                {/* 1. Uno Card Battle */}
                <button onClick={() => handleSendGameInvite("uno")} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500">
                       <span className="material-symbols-outlined text-[20px]">style</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Uno Card Battle</h4>
                   </div>
                   <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                </button>

                {/* 2. Tic-Tac-Toe Matrix */}
                <button onClick={() => handleSendGameInvite("tictactoe")} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-amber-400/10 rounded-xl flex items-center justify-center text-amber-400">
                       <span className="material-symbols-outlined text-[20px]">grid_3x3</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Tic-Tac-Toe Matrix</h4>
                   </div>
                   <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                </button>

                {/* 3. Snooker 3D */}
                <button onClick={() => handleSendGameInvite("snooker")} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center text-green-500">
                       <span className="material-symbols-outlined text-[20px]">sports_bar</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Snooker 3D</h4>
                   </div>
                   <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                </button>

                {/* 4. Grandmaster Chess */}
                <button onClick={() => handleSendGameInvite("chess")} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-secondary-container rounded-xl flex items-center justify-center text-secondary">
                       <span className="material-symbols-outlined text-[20px]">psychology</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Grandmaster Chess</h4>
                   </div>
                   <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                </button>

                {/* 5. 8-Ball Pool */}
                <button onClick={() => handleSendGameInvite("pool")} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center text-cyan-500"><span className="material-symbols-outlined text-[20px]">sports_bar</span></div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">8-Ball Pool</h4>
                   </div>
                   <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                </button>

                {/* 5. Carrom Matrix */}
                <button onClick={() => setInviteStep("carrom_mode")} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
                       <span className="material-symbols-outlined text-[20px]">radio_button_checked</span>
                     </div>
                     <h4 className="font-headline text-xs font-bold text-on-surface">Carrom Matrix</h4>
                   </div>
                   <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                </button>
                
                {/* 6. Neon Checkers */}
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
              <span className={`font-caps text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 mt-0.5 ${activeChat && isOnline(activeChat) ? "text-primary" : "text-on-surface-variant"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${activeChat && isOnline(activeChat) ? "bg-primary animate-pulse" : "bg-on-surface-variant"}`}></span> {activeChat && isOnline(activeChat) ? "Comms online" : "Offline"}
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
        {chatLoading && <div className="py-8 text-center text-xs font-bold text-on-surface-variant animate-pulse">Loading conversation…</div>}
        {!chatLoading && messages.map((msg) => {
          const isMe = msg.sender_id === myUserId;
          const isUno = msg.game_name?.includes("Uno");
          const isTicTacToe = msg.game_name?.includes("Tic-Tac-Toe");
          const isCarrom = msg.game_name?.includes("Carrom");
          const isChess = msg.game_name?.includes("Chess");
          const isSnooker = msg.game_name?.includes("Snooker");
          const isPool = msg.game_name?.includes("Pool");

          const gameIcon = isUno 
            ? "style" 
            : isTicTacToe 
              ? "grid_3x3" 
              : isCarrom 
                ? "radio_button_checked" 
                : isChess 
                  ? "psychology" 
            : isSnooker || isPool
                    ? "sports_bar" 
                    : "grid_4x4";
          
          const targetUrl = isUno 
            ? "native://uno"
            : isTicTacToe
              ? "native://tictactoe"
              : msg.game_name?.includes("Checkers") 
                ? "native://checkers" 
                : isChess 
                  ? "native://chess" 
                  : isSnooker
                    ? "native://snooker"
                    : isPool
                      ? "native://pool"
                    : "native://carrom";

          return (
            <div key={msg.id} className={`flex items-start w-full ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`flex flex-col max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                
                {msg.message_type === 'text' && (
                  <div className={`px-4 py-3 font-body text-[13px] leading-relaxed shadow-sm border ${
                    isMe 
                      ? "bg-primary border-primary text-on-primary rounded-[20px] rounded-tr-[4px]" 
                      : "bg-surface border-surface-container-highest text-on-surface rounded-[20px] rounded-tl-[4px]"
                  }`}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                )}
                {msg.message_type === 'attachment' && (
                  <a href={msg.content} target="_blank" rel="noreferrer" className="rounded-2xl bg-surface border border-surface-container-highest px-4 py-3 text-xs font-bold text-primary">Open attachment</a>
                )}

                {msg.message_type === 'game_invite' && (
                  <div className="w-56 rounded-[20px] shadow-sm border border-surface-container-highest p-4 flex flex-col items-center gap-2 text-center bg-surface">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-background border border-surface-container-highest">
                      <span className={`material-symbols-outlined text-[24px] ${
                        isUno 
                          ? "text-rose-500" 
                          : isTicTacToe 
                            ? "text-amber-400" 
                            : isCarrom 
                              ? "text-amber-500" 
                              : isChess 
                                ? "text-secondary" 
                                : isSnooker || isPool
                                  ? "text-green-500" 
                                  : "text-blue-500"
                      }`} style={{fontVariationSettings:"'FILL' 1"}}>{gameIcon}</span>
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
        <input ref={attachmentInputRef} type="file" accept="image/*,.pdf,.txt" className="hidden" onChange={handleAttachment} />
        
        <button
          type="button"
          onClick={() => { setShowGameSelector(true); setInviteStep("game"); }}
          className="w-11 h-11 bg-background hover:bg-surface-variant text-primary border border-surface-container-highest rounded-xl flex items-center justify-center active:scale-95 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">swords</span>
        </button>

        <button
          type="button"
          onClick={() => setShowComposerMenu((open) => !open)}
          className="w-11 h-11 bg-background hover:bg-surface-variant border border-surface-container-highest text-on-surface-variant rounded-xl flex items-center justify-center active:scale-95 transition-all shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
        {showComposerMenu && (
          <div className="absolute bottom-16 left-12 z-50 rounded-2xl border border-surface-container-highest bg-surface p-3 shadow-2xl">
            <button type="button" onClick={() => attachmentInputRef.current?.click()} className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-on-surface hover:bg-surface-variant"><span className="material-symbols-outlined text-base">attach_file</span>Attach file</button>
            <div className="flex gap-2">{['👍','🔥','😂','🎮','👏'].map((emote) => <button key={emote} type="button" onClick={() => sendEmote(emote)} className="text-xl">{emote}</button>)}</div>
          </div>
        )}
        
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
