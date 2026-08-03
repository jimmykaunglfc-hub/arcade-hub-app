"use client";

import { ChangeEvent, useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";
import PublicProfileCardModal from "./PublicProfileCardModal";

interface Friend {
  id: string;
  username: string;
  avatar_url: string;
  last_seen_at?: string;
  is_online?: boolean;
  avatar_frame_url?: string | null;
}

interface FriendRequest extends Friend { requestId: string; }
interface ChatGroup { id: string; name: string; description: string; created_by: string; }

type ChatNetworkSnapshot = {
  userId: string;
  username: string;
  friends: Friend[];
  pendingRequests: FriendRequest[];
  groups: ChatGroup[];
  joinedGroupIds: string[];
  unreadByFriend: Record<string, number>;
};

let chatNetworkSnapshot: ChatNetworkSnapshot | null = null;

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
  onChatOpenChange?: (open: boolean) => void;
}

type ChallengeGame =
  | "checkers" | "carrom" | "chess" | "snooker" | "pool" | "uno" | "tictactoe"
  | "cup_pong" | "four_in_a_row" | "bingo" | "ping_pong";

const NEW_CHALLENGE_GAMES: Array<{ type: Extract<ChallengeGame, "cup_pong" | "four_in_a_row" | "bingo" | "ping_pong">; name: string; icon: string; accent: string }> = [
  { type: "cup_pong", name: "Cup Pong", icon: "sports_baseball", accent: "text-orange-400" },
  { type: "four_in_a_row", name: "Four in a Row", icon: "view_column", accent: "text-sky-400" },
  { type: "bingo", name: "Bingo", icon: "casino", accent: "text-fuchsia-400" },
  { type: "ping_pong", name: "Ping Pong", icon: "table_restaurant", accent: "text-emerald-400" },
];

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

export default function ChatTab({ currentPoints, userId, onPlay, onChatOpenChange }: ChatTabProps) {
  const [activeView, setActiveView] = useState<"hub" | "chat" | "referral">("hub");
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
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeChat, setActiveChat] = useState<Friend | null>(null);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [searchTarget, setSearchTarget] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const [showReferralDashboard, setShowReferralDashboard] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [referralStats, setReferralStats] = useState({ invited: 0, earned: 0 });
  const [referralInvitees, setReferralInvitees] = useState<Array<{ username: string; network_id: string; created_at: string }>>([]);
  
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
      supabase.from("profiles").select("username, network_id").eq("id", id).single(),
      supabase.from("friendships").select("id, requester_id, receiver_id, status").or(`requester_id.eq.${id},receiver_id.eq.${id}`),
      supabase.from("chat_groups").select("id, name, description, created_by").order("created_at", { ascending: false }).limit(30),
      supabase.from("chat_group_members").select("group_id").eq("user_id", id),
      supabase.from("direct_messages").select("sender_id").eq("receiver_id", id).is("read_at", null),
    ]);
    const { data: referralData } = await supabase.rpc("get_my_referral_dashboard");
    if (referralData) setReferralStats(Array.isArray(referralData) ? referralData[0] : referralData);
    const { data: invitees } = await supabase.rpc("get_my_referral_invitees");
    if (invitees) setReferralInvitees(invitees as Array<{ username: string; network_id: string; created_at: string }>);
    if (myProfile) setMyUsername(myProfile.network_id || myProfile.username);
    const accepted = (links || []).filter((link) => link.status === "accepted");
    const requested = (links || []).filter((link) => link.status === "pending" && link.receiver_id === id);
    const profileIds = [...new Set([...accepted.map((link) => link.requester_id === id ? link.receiver_id : link.requester_id), ...requested.map((link) => link.requester_id)])];
    const [{ data: profiles }, publicCards] = await Promise.all([
      profileIds.length ? supabase.from("profiles").select("id, username, avatar_url, last_seen_at").in("id", profileIds) : Promise.resolve({ data: [] as Friend[] }),
      Promise.all(profileIds.map((userId) => supabase.rpc("get_public_profile_card", { target_user_id: userId }).single())),
    ]);
    const frameByUser = new Map(publicCards.flatMap(({ data }) => data ? [[(data as { user_id: string; avatar_frame_url: string | null }).user_id, (data as { avatar_frame_url: string | null }).avatar_frame_url] as [string, string | null]] : []));
    const profileById = new Map((profiles || []).map((profile) => [profile.id, { ...profile, avatar_frame_url: frameByUser.get(profile.id) || null, is_online: Boolean(profile.last_seen_at && Date.now() - new Date(profile.last_seen_at).getTime() < 3 * 60 * 1000) }]));
    const resolvedFriends = (accepted.map((link) => profileById.get(link.requester_id === id ? link.receiver_id : link.requester_id)).filter(Boolean) as Friend[]).sort((a, b) => Number(Boolean(b.is_online)) - Number(Boolean(a.is_online)) || a.username.localeCompare(b.username));
    const resolvedRequests = requested.map((link) => ({ ...(profileById.get(link.requester_id) as Friend), requestId: link.id })).filter((request) => request.id);
    const resolvedGroups = (allGroups || []) as ChatGroup[];
    const resolvedGroupIds = (memberships || []).map((membership) => membership.group_id);
    setFriends(resolvedFriends);
    setPendingRequests(resolvedRequests);
    setGroups(resolvedGroups);
    setJoinedGroupIds(resolvedGroupIds);
    const counts: Record<string, number> = {};
    (unread || []).forEach((message) => { counts[message.sender_id] = (counts[message.sender_id] || 0) + 1; });
    setUnreadByFriend(counts);
    chatNetworkSnapshot = { userId: id, username: myProfile?.network_id || myProfile?.username || "", friends: resolvedFriends, pendingRequests: resolvedRequests, groups: resolvedGroups, joinedGroupIds: resolvedGroupIds, unreadByFriend: counts };
    setNetworkLoading(false);
  }, []);

  useEffect(() => {
    const initData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (userId && userId !== user.id) return;
      setMyUserId(user.id);
      if (chatNetworkSnapshot?.userId === user.id) {
        setMyUsername(chatNetworkSnapshot.username);
        setFriends(chatNetworkSnapshot.friends);
        setPendingRequests(chatNetworkSnapshot.pendingRequests);
        setGroups(chatNetworkSnapshot.groups);
        setJoinedGroupIds(chatNetworkSnapshot.joinedGroupIds);
        setUnreadByFriend(chatNetworkSnapshot.unreadByFriend);
        setNetworkLoading(false);
        void loadNetwork(user.id);
      } else {
        await loadNetwork(user.id);
      }
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, refresh)
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
    gameType: ChallengeGame,
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
    else if (gameType !== "carrom") {
      const game = NEW_CHALLENGE_GAMES.find((candidate) => candidate.type === gameType);
      if (!game) return;
      await supabase.from("direct_messages").insert([{
        sender_id: myUserId,
        receiver_id: activeChat.id,
        content: `Challenged you to ${game.name}`,
        message_type: "game_invite",
        match_id: crypto.randomUUID(),
        game_name: game.name,
        invite_status: "pending",
      }]);
    }
    if (gameType === "carrom" && mode) {
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
      .ilike("network_id", searchTarget.trim())
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
  const handleShareReferral = async () => {
    const shareData = { title: "Join me on Joe Yoke", text: `Use my referral code: ${myUsername}` };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* User dismissed the native sheet. */ }
      return;
    }
    setShowShareSheet(true);
  };

  const openChat = (friend: Friend) => {
    setActiveChat(friend);
    setActiveView("chat");
    onChatOpenChange?.(true);
  };
  const closeChat = () => { setActiveView("hub"); onChatOpenChange?.(false); };

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
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-surface-container-highest bg-surface-container-high p-1.5 mb-3">
          {[
            { id: "dms", label: "Direct" },
            { id: "groups", label: "Groups" },
            { id: "network", label: "Invite" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setHubTab(tab.id as "dms" | "groups" | "network")}
              className={`py-2.5 rounded-xl font-headline text-[12px] font-bold whitespace-nowrap transition-all ${
                hubTab === tab.id 
                  ? "bg-background text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
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
              <div className="space-y-3">
                {friends.map((friend) => (
                  <button 
                    key={friend.id}
                    onClick={() => openChat(friend)}
                    className="w-full rounded-[22px] border border-surface-container-highest bg-surface p-4 flex items-center justify-between transition-all hover:bg-surface-variant text-left active:scale-[.98] shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-visible relative bg-surface-container-high shrink-0 border border-surface-container-highest">
                        <Image src={friend.avatar_url || "/logo-dark.jpeg"} alt={friend.username} fill className="object-cover rounded-full" unoptimized />
                        {friend.avatar_frame_url && <Image src={friend.avatar_frame_url} alt="" fill className="pointer-events-none scale-[1.2] object-contain" unoptimized />}
                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 border-[3px] border-surface rounded-full shadow-[0_0_14px_rgba(204,255,0,0.8)] ${isOnline(friend) ? "bg-primary" : "bg-on-surface-variant"}`}></div>
                      </div>
                      <div>
                        <h4 className="font-headline text-sm font-extrabold tracking-tight text-on-surface">{friend.username}</h4>
                        <p className="font-body text-[11px] font-medium text-on-surface-variant truncate mt-1">{isOnline(friend) ? "Online now" : "Say hi and start a match"}</p>
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
            {!showCreateGroup ? <button onClick={() => setShowCreateGroup(true)} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/50 bg-primary-container/20 p-4 text-left"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-on-primary"><span className="material-symbols-outlined">add</span></span><span><b className="block text-sm">Create a new group</b><small className="text-xs text-on-surface-variant">Start a community for your friends</small></span></button> : <form onSubmit={createGroup} className="bg-surface border border-surface-container-highest rounded-[24px] p-4 space-y-2 shadow-sm">
              <h3 className="font-headline text-sm font-extrabold text-on-surface">Create a group</h3>
              <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" className="w-full rounded-xl border border-surface-container-highest bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary" />
              <input value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="Description (optional)" className="w-full rounded-xl border border-surface-container-highest bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary" />
              <div className="flex gap-2"><button className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-on-primary">Create group</button><button type="button" onClick={() => setShowCreateGroup(false)} className="rounded-xl bg-surface-container-high px-4 py-2 text-xs font-bold">Cancel</button></div>
              {groupStatus && <p className="text-[11px] font-medium text-on-surface-variant">{groupStatus}</p>}
            </form>}
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
            <div onClick={() => { setActiveView("referral"); onChatOpenChange?.(true); }} role="button" tabIndex={0} className="w-full text-left bg-gradient-to-br from-[#a9f500] to-emerald-500 rounded-[24px] p-5 relative overflow-hidden shadow-sm text-black active:scale-[.98] cursor-pointer">
              <span className="material-symbols-outlined absolute -right-2 -top-2 text-[90px] opacity-15">group_add</span>
              <h3 className="font-headline text-xl font-black mb-1">Invite &amp; Earn!</h3>
              <p className="max-w-[250px] text-xs font-semibold">Share your referral code and earn rewards when friends join.</p>
              <div className="flex items-end justify-between relative z-10">
                <p className="mt-4 font-headline text-sm font-black tracking-tight">{myUsername || "Loading..."}</p>
                <button onClick={(event) => { event.stopPropagation(); handleCopyId(); }} className="h-10 rounded-xl bg-black px-4 text-xs font-black text-white active:scale-95 transition-all">
                  <span className="material-symbols-outlined text-base">{copied ? "check" : "content_copy"}</span>
                </button>
              </div>
              <button onClick={(event) => { event.stopPropagation(); void handleShareReferral(); }} className="relative z-10 mt-3 rounded-xl bg-black px-4 py-2 text-xs font-black text-white">Share referral code</button>
            </div>

            <div className="bg-surface border border-surface-container-highest rounded-[24px] p-5 shadow-sm">
              <h3 className="font-headline text-sm font-extrabold text-on-surface mb-3">Add Friend by ID</h3>
              <form onSubmit={handleAddFriend} className="flex flex-col gap-2 sm:flex-row">
                <input 
                  type="text" 
                  placeholder="Enter User ID..."
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value)}
                  className="min-w-0 flex-1 bg-background border border-surface-container-highest rounded-xl px-4 py-3 font-body text-xs focus:outline-none focus:border focus:border-primary text-on-surface placeholder-on-surface-variant transition-colors"
                />
                <button type="submit" className="h-11 shrink-0 whitespace-nowrap px-5 bg-primary text-on-primary hover:opacity-90 font-headline font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all">Add</button>
              </form>
              {inviteStatus && <p className="font-body text-[11px] text-primary font-bold mt-3">{inviteStatus}</p>}
            </div>
            {pendingRequests.length > 0 && <div className="bg-surface border border-surface-container-highest rounded-[24px] p-5 shadow-sm"><h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Connection requests</h3><div className="space-y-3">{pendingRequests.map((request) => <div key={request.requestId} className="flex items-center gap-3"><div className="w-9 h-9 rounded-full overflow-hidden relative bg-surface-container-high"><Image src={request.avatar_url} alt="" fill className="object-cover" unoptimized /></div><span className="flex-1 text-sm font-bold text-on-surface">{request.username}</span><button onClick={() => respondToFriendRequest(request.requestId, false)} className="text-xs font-bold text-on-surface-variant">Decline</button><button onClick={() => respondToFriendRequest(request.requestId, true)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary">Accept</button></div>)}</div></div>}
            {showShareSheet && <div className="fixed inset-0 z-[100101] flex items-end bg-black/60 backdrop-blur-sm"><div className="w-full rounded-t-[30px] bg-surface px-5 pb-[calc(22px+env(safe-area-inset-bottom))] pt-3 shadow-2xl"><div className="mx-auto h-1.5 w-10 rounded-full bg-on-surface-variant/40" /><div className="mt-4 flex items-center justify-between"><h3 className="font-headline text-xl font-black">Share referral code</h3><button onClick={() => setShowShareSheet(false)} className="grid h-9 w-9 place-items-center rounded-full bg-surface-container-high"><span className="material-symbols-outlined">close</span></button></div><p className="mt-1 text-xs text-on-surface-variant">Copy your code to share it in any app.</p><button onClick={() => { handleCopyId(); setShowShareSheet(false); }} className="mt-5 flex w-full items-center gap-4 rounded-2xl bg-surface-container-high p-4 text-left"><span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-on-primary"><span className="material-symbols-outlined">content_copy</span></span><span><b className="block text-sm">Copy referral code</b><small className="text-xs text-on-surface-variant">{myUsername}</small></span></button></div></div>}
          </div>
        )}
      </div>
    );
  }

  if (activeView === "referral") {
    return <div className="fixed inset-0 z-[100002] overflow-y-auto bg-background px-5 pb-8 pt-[calc(18px+env(safe-area-inset-top))] text-on-surface"><header className="flex items-center gap-3"><button onClick={() => { setActiveView("hub"); onChatOpenChange?.(false); }} className="grid h-10 w-10 place-items-center rounded-full"><span className="material-symbols-outlined">arrow_back</span></button><h1 className="font-headline text-lg font-black">Invite dashboard</h1></header><section className="mt-7 rounded-[28px] bg-gradient-to-br from-[#a9f500] to-emerald-500 p-6 text-black"><p className="text-xs font-bold">Your referral code</p><p className="mt-1 font-headline text-2xl font-black">{myUsername}</p><button onClick={handleCopyId} className="mt-4 rounded-xl bg-black px-4 py-2 text-xs font-black text-white">Copy code</button></section><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-surface-container-high p-5"><b className="text-3xl text-primary">{referralStats.invited}</b><p className="mt-1 text-xs text-on-surface-variant">Total invitees</p></div><div className="rounded-2xl bg-surface-container-high p-5"><b className="text-3xl text-primary">{referralStats.earned}</b><p className="mt-1 text-xs text-on-surface-variant">Points earned</p></div></div><h2 className="mt-7 font-headline text-base font-black">Invitee information</h2><div className="mt-3 space-y-3">{referralInvitees.length ? referralInvitees.map((invitee) => <div key={invitee.network_id} className="flex items-center gap-3 rounded-2xl border border-surface-container-highest bg-surface p-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-primary-container font-black text-primary">{invitee.username.slice(0,1)}</span><span className="min-w-0 flex-1"><b className="block text-sm">{invitee.username}</b><small className="text-xs text-on-surface-variant">{invitee.network_id} · Joined {new Date(invitee.created_at).toLocaleDateString()}</small></span><span className="rounded-full bg-primary-container px-2 py-1 text-[10px] font-bold text-primary">Active</span></div>) : <p className="rounded-2xl bg-surface p-5 text-center text-xs text-on-surface-variant">No invitees yet. Share your code to get started.</p>}</div></div>;
  }

  // ============================================================================
  // VIEW 2: FULL COMPACT CONSOLE ACTIVE THREAD
  // ============================================================================
  return (
    <div
      className="fixed inset-0 z-[100002] flex min-h-0 flex-col gap-0 overflow-hidden bg-background animate-fade-in text-on-background"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      
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
                {NEW_CHALLENGE_GAMES.map((game) => (
                  <button key={game.type} onClick={() => handleSendGameInvite(game.type)} className="w-full flex items-center justify-between p-3 bg-background border border-surface-container-highest rounded-[16px] hover:bg-surface-variant transition-colors shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center ${game.accent}`}>
                        <span className="material-symbols-outlined text-[20px]">{game.icon}</span>
                      </div>
                      <h4 className="font-headline text-xs font-bold text-on-surface">{game.name}</h4>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant text-base">chevron_right</span>
                  </button>
                ))}
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
      <div className="shrink-0 w-full border-b border-surface-container-highest bg-background px-5 py-4 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button 
            onClick={closeChat}
            className="w-10 h-10 rounded-[14px] hover:bg-surface-variant text-on-surface flex items-center justify-center transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative h-10 w-10 shrink-0 rounded-full bg-surface-container-high">
              <Image src={activeChat?.avatar_url || ""} alt="User" fill className="object-cover" unoptimized />
              {activeChat?.avatar_frame_url && <Image src={activeChat.avatar_frame_url} alt="" fill className="pointer-events-none scale-[1.2] object-contain" unoptimized />}
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-headline text-sm font-bold text-on-surface leading-tight">{activeChat?.username}</h3>
              <span className={`font-caps text-[9px] font-black uppercase tracking-[0.12em] flex items-center gap-1 mt-1 ${activeChat && isOnline(activeChat) ? "text-primary" : "text-on-surface-variant"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${activeChat && isOnline(activeChat) ? "bg-primary animate-pulse" : "bg-on-surface-variant"}`}></span> {activeChat && isOnline(activeChat) ? "Comms online" : "Offline"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => activeChat && setViewingProfileId(activeChat.id)} aria-label="View profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface"><span className="material-symbols-outlined text-[20px]">person</span></button>
        </div>
      </div>

      {/* 💬 MESSAGE CHANNEL CORE VIEWPORTS */}
      <div className="relative min-h-0 flex-1 w-full overflow-y-auto overscroll-contain px-5 py-4 space-y-5 no-scrollbar">
        {chatLoading && <div className="py-8 text-center text-xs font-bold text-on-surface-variant animate-pulse">Loading conversation…</div>}
        {!chatLoading && messages.map((msg) => {
          const isMe = msg.sender_id === myUserId;
          const isUno = msg.game_name?.includes("Uno");
          const isTicTacToe = msg.game_name?.includes("Tic-Tac-Toe");
          const isCarrom = msg.game_name?.includes("Carrom");
          const isChess = msg.game_name?.includes("Chess");
          const isSnooker = msg.game_name?.includes("Snooker");
          const isPool = msg.game_name?.includes("Pool");
          const newChallenge = NEW_CHALLENGE_GAMES.find((game) => game.name === msg.game_name);

          const gameIcon = newChallenge?.icon || (isUno 
            ? "style" 
            : isTicTacToe 
              ? "grid_3x3" 
              : isCarrom 
                ? "radio_button_checked" 
                : isChess 
                  ? "psychology" 
            : isSnooker || isPool
                    ? "sports_bar" 
                    : "grid_4x4");
          
          const targetUrl = newChallenge
            ? `native://${newChallenge.type}`
            : isUno 
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
                        newChallenge
                          ? newChallenge.accent
                          : isUno 
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
      <div className="shrink-0 w-full border-t border-surface-container-highest bg-background p-3 flex items-center gap-2">
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

      {viewingProfileId && <PublicProfileCardModal userId={viewingProfileId} onClose={() => setViewingProfileId(null)} />}

    </div>
  );
}
