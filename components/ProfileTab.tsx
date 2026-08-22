"use client";




import { tr } from "../lib/i18n";
import { LocalizedText } from "../lib/i18n";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Capacitor } from "@capacitor/core";
import {
  Camera,
  EncodingType,
  MediaTypeSelection,
} from "@capacitor/camera";
import { supabase } from "../lib/supabaseClient";
import { soundEngine } from "../lib/soundManager";
import {
  isNativePushApp,
  PUSH_TOKEN_STORAGE_KEY,
  registerNativePushNotifications,
  unregisterNativePushNotifications,
} from "../lib/firebasePushNotifications";
import { LANGUAGES, LanguageCode, useTranslation } from "../lib/i18n";

type Profile = {
  id: string;
  email: string;
  network_id?: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
  points?: number;
  gems?: number;
  profile_edit_count?: number;
  push_enabled?: boolean;
};
type Modal =
  | "identity"
  | "account"
  | "support"
  | "activity"
  | "inventory"
  | "favorites"
  | "language"
  | "privacy-policy"
  | "terms-of-service"
  | null;
type LedgerEntry = {
  id: string;
  amount: number;
  description: string;
  created_at: string;
  mutation_type: string;
  currency_type?: "points" | "gems";
};
type EquippedCosmetic = {
  cosmetics?: {
    game_category?: string;
    image_url?: string | null;
    profile_card_layout?: "centered" | "avatar_left" | null;
    modifiers?: { background_color?: string; accent_color?: string } | null;
  } | null;
};
type InventoryItem = {
  id: string;
  cosmetic_id: string;
  is_equipped: boolean;
  cosmetics?: {
    name?: string;
    game_category?: string;
    cosmetic_type?: "game_cosmetic" | "profile_card" | "avatar_frame" | string;
    game_target?: string | null;
    image_url?: string | null;
    profile_card_layout?: "centered" | "avatar_left" | null;
    modifiers?: { background_color?: string } | null;
  } | null;
};

type ProfileEditConfig = {
  profile_edit_cost: number;
  profile_edit_currency: "points" | "gems";
};

type ProfileLandingSnapshot = {
  userId: string;
  profile: Profile;
  inventoryCount: number;
  ledger: LedgerEntry[];
};

const PROFILE_CACHE_PREFIX = "joeyoke.profile-landing.v1";
let profileLandingSnapshot: ProfileLandingSnapshot | null = null;

const readProfileLandingCache = (userId: string): ProfileLandingSnapshot | null => {
  if (profileLandingSnapshot?.userId === userId) return profileLandingSnapshot;
  try {
    const raw = window.localStorage.getItem(`${PROFILE_CACHE_PREFIX}:${userId}`);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as ProfileLandingSnapshot;
    if (snapshot.userId !== userId || !snapshot.profile) return null;
    profileLandingSnapshot = snapshot;
    return snapshot;
  } catch {
    return null;
  }
};

const writeProfileLandingCache = (snapshot: ProfileLandingSnapshot) => {
  profileLandingSnapshot = snapshot;
  try {
    window.localStorage.setItem(`${PROFILE_CACHE_PREFIX}:${snapshot.userId}`, JSON.stringify(snapshot));
  } catch {
    // The live profile remains the source of truth when storage is unavailable.
  }
};

interface ProfileTabProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onPlayFavorite?: (title: string) => void;
}

export default function ProfileTab({
  isDarkMode,
  onToggleTheme,
  onPlayFavorite,
}: ProfileTabProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fetchStatus, setFetchStatus] = useState<
    "loading" | "found" | "missing"
  >("loading");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [favoriteGames, setFavoriteGames] = useState<Array<{ game_id: string; title: string; category?: string }>>([]);
  const [profileCardCosmetic, setProfileCardCosmetic] = useState<EquippedCosmetic["cosmetics"]>(null);
  const [avatarFrameCosmetic, setAvatarFrameCosmetic] = useState<EquippedCosmetic["cosmetics"]>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [activityLedger, setActivityLedger] = useState<LedgerEntry[]>([]);
  const [supportEmail, setSupportEmail] = useState("support@joeyoke.com");
  const [modal, setModal] = useState<Modal>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profileEditConfig, setProfileEditConfig] = useState<ProfileEditConfig>({
    profile_edit_cost: 100,
    profile_edit_currency: "points",
  });
  const [requestType, setRequestType] = useState<
    "email_change" | "account_deletion" | "other"
  >("email_change");
  const [requestDetails, setRequestDetails] = useState("");
  const [faqs, setFaqs] = useState<
    { id: string; question: string; answer: string }[]
  >([]);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [legal, setLegal] = useState<{ title: string; content: string } | null>(
    null
  );
  const { language, setLanguage, t } = useTranslation();

  const fetchProfileData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setFetchStatus("missing");
      return;
    }

    // Render the saved landing snapshot immediately, then refresh it. The
    // profile screen is a destination players revisit often, so it should not
    // be blank while optional inventory and support data is loading.
    const cachedSnapshot = readProfileLandingCache(user.id);
    if (cachedSnapshot) {
      setProfile(cachedSnapshot.profile);
      setName(cachedSnapshot.profile.username || "");
      setAvatarUrl(cachedSnapshot.profile.avatar_url || "");
      setInventoryCount(cachedSnapshot.inventoryCount);
      setLedger(cachedSnapshot.ledger);
      setFetchStatus("found");
    }

    const [{ data: myProfile }, { count }, { data: ledgerData }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("user_inventory")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("wallet_activity_logs")
        .select(
          "id, amount, description, created_at, mutation_type:activity_type, currency_type"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (!myProfile) {
      setFetchStatus("missing");
      return;
    }
    setProfile(myProfile);
    setName(myProfile.username || "");
    setAvatarUrl(myProfile.avatar_url || "");
    setInventoryCount(count || 0);
    setLedger((ledgerData || []) as LedgerEntry[]);
    const landingSnapshot = {
      userId: user.id,
      profile: myProfile as Profile,
      inventoryCount: count || 0,
      ledger: (ledgerData || []) as LedgerEntry[],
    };
    writeProfileLandingCache(landingSnapshot);
    setFetchStatus("found");

    // The following data is used by modals and cosmetic decoration. It loads
    // after the profile landing page is visible instead of blocking it.
    const [
      { data: config },
      { data: editConfig },
      { data: rawInventory },
      { data: storeItems },
      { data: cosmetics },
      { data: favorites },
      { data: catalog },
    ] = await Promise.all([
      supabase.from("platform_config").select("support_email").eq("id", 1).maybeSingle(),
      supabase.from("platform_config").select("profile_edit_cost, profile_edit_currency").eq("id", 1).maybeSingle(),
      supabase.from("user_inventory").select("id, cosmetic_id, is_equipped").eq("user_id", user.id),
      supabase.from("store_items").select("*"),
      supabase.from("cosmetics").select("id, name, game_category, cosmetic_type, game_target, image_url, modifiers"),
      supabase.from("game_favorites").select("game_id").eq("user_id", user.id),
      supabase.rpc("get_game_catalog"),
    ]);
    const catalogById = new Map<string, { title?: string; category?: string }>((catalog || []).map((game: any) => [String(game.id), game]));
    setFavoriteGames((favorites || []).map((favorite: any) => { const game = catalogById.get(String(favorite.game_id)); return { game_id: String(favorite.game_id), title: game?.title || String(favorite.game_id), category: game?.category }; }));
    const storeById = new Map((storeItems || []).map((item) => [item.id, item]));
    const cosmeticById = new Map((cosmetics || []).map((item) => [item.id, item]));
    const resolvedInventory = (rawInventory || []).map((item) => {
      const source = cosmeticById.get(item.cosmetic_id) || storeById.get(item.cosmetic_id);
      const sourceCategory = source?.cosmetic_type === "game_cosmetic"
        ? source?.game_target || source?.game_category || "game_cosmetic"
        : source?.cosmetic_type || source?.game_category || source?.category || "other";
      const cosmeticName = String(source?.name || "").toLowerCase();
      const category = ["profile_card", "profile_card_theme", "avatar_frame", "profile_avatar_frame", "avatar_border"].includes(sourceCategory)
        ? sourceCategory
        : !source?.cosmetic_type && /avatar|border|frame/.test(cosmeticName)
        ? "avatar_frame"
        : !source?.cosmetic_type && /profile.*card|card.*background|background/.test(cosmeticName)
        ? "profile_card"
        : sourceCategory;
      return { ...item, cosmetics: source ? { ...source, game_category: category } : null } as InventoryItem;
    });
    setInventory(resolvedInventory);
    const equipped = resolvedInventory.filter((item) => item.is_equipped) as EquippedCosmetic[];
    setProfileCardCosmetic(equipped.find((item) => ["profile_card", "profile_card_theme"].includes(item.cosmetics?.game_category || ""))?.cosmetics || null);
    setAvatarFrameCosmetic(equipped.find((item) => ["avatar_frame", "profile_avatar_frame", "avatar_border"].includes(item.cosmetics?.game_category || ""))?.cosmetics || null);
    if (config?.support_email) setSupportEmail(config.support_email);
    if (editConfig) setProfileEditConfig({
      profile_edit_cost: Number(editConfig.profile_edit_cost ?? 100),
      profile_edit_currency: editConfig.profile_edit_currency === "gems" ? "gems" : "points",
    });
  };

  useEffect(() => {
    void fetchProfileData();
    soundEngine.restorePreference();
    setSoundEnabled(!soundEngine.getMutedState());
  }, []);

  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3500);
  };
  const openActivity = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("wallet_activity_logs")
      .select(
        "id, amount, description, created_at, mutation_type:activity_type, currency_type"
      )
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(200);
    setActivityLedger((data || []) as LedgerEntry[]);
    setModal("activity");
  };
  const getCosmeticSlot = (item: InventoryItem) => {
    const cosmetic = item.cosmetics;
    if (!cosmetic) return null;
    const category = cosmetic.game_category || "other";
    if (["profile_card", "profile_card_theme"].includes(category) || cosmetic.cosmetic_type === "profile_card") return "profile_card";
    if (["avatar_frame", "profile_avatar_frame", "avatar_border"].includes(category) || cosmetic.cosmetic_type === "avatar_frame") return "avatar_frame";
    // Game cosmetics replace only a cosmetic for the same game. Legacy items
    // fall back to their assigned game category, and otherwise stay independent.
    const gameTarget = cosmetic.game_target || (
      category !== "game_cosmetic" && category !== "other" ? category : item.id
    );
    return `game:${gameTarget}`;
  };

  const equipCosmetic = async (item: InventoryItem) => {
    if (!profile || !item.cosmetics?.game_category) return;
    const slot = getCosmeticSlot(item);
    if (!slot) return;
    const isCard = slot === "profile_card";
    const isFrame = slot === "avatar_frame";
    setSaving(true);
    const sameTypeInventoryIds = inventory
      .filter((entry) => getCosmeticSlot(entry) === slot)
      .map((entry) => entry.id);
    if (sameTypeInventoryIds.length) {
      const { error: slotError } = await supabase.from("user_inventory").update({ is_equipped: false }).eq("user_id", profile.id).in("id", sameTypeInventoryIds);
      if (slotError) { setSaving(false); return showMessage(slotError.message); }
    }
    const { error } = await supabase.from("user_inventory").update({ is_equipped: true }).eq("id", item.id).eq("user_id", profile.id);
    setSaving(false);
    if (error) return showMessage(error.message);
    setInventory((current) => current.map((entry) => ({ ...entry, is_equipped: entry.id === item.id ? true : sameTypeInventoryIds.includes(entry.id) ? false : entry.is_equipped })));
    if (isCard) setProfileCardCosmetic(item.cosmetics);
    if (isFrame) setAvatarFrameCosmetic(item.cosmetics);
    showMessage(`${item.cosmetics.name || "Cosmetic"} equipped${isCard || isFrame ? "." : " for its game."}`);
  };
  const updateLanguage = async (code: LanguageCode) => {
    await setLanguage(code);
    const { error } = await supabase.rpc("update_profile_language", {
      new_language: code,
    });
    if (error) showMessage(error.message);
  };
  const terminateSession = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };
  const identityChanged = Boolean(profile && (name.trim() !== profile.username || avatarUrl.trim() !== (profile.avatar_url || "")));
  const identityCost = identityChanged && profile?.profile_edit_count ? profileEditConfig.profile_edit_cost : 0;

  const saveIdentity = async () => {
    if (!profile || !name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("update_profile_identity", {
      new_username: name.trim(),
      new_avatar_url: avatarUrl.trim() || null,
    });
    setSaving(false);
    if (error) {
      showMessage(error.message);
      return;
    }
    setProfile(data as Profile);
    setModal(null);
    showMessage(
      identityCost
        ? `Profile updated for ${identityCost} ${profileEditConfig.profile_edit_currency.toUpperCase()}.`
        : "Profile updated — your first change was free."
    );
  };

  const uploadAvatarFile = async (file: File | null | undefined) => {
    if (!profile || !file) return;
    if (!file.type.startsWith("image/")) {
      showMessage("Please choose an image file.");
      return;
    }
    setSaving(true);
    const extension = file.name.split(".").pop() || "png";
    const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) {
      setSaving(false);
      showMessage(error.message);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setSaving(false);
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    await uploadAvatarFile(file);
    event.target.value = "";
  };

  const uploadNativePhoto = async (webPath: string | undefined) => {
    if (!webPath) {
      showMessage("The selected photo could not be read. Please try again.");
      return;
    }
    const response = await fetch(webPath);
    const blob = await response.blob();
    await uploadAvatarFile(
      new File([blob], `profile-photo-${Date.now()}.jpeg`, {
        type: blob.type || "image/jpeg",
      })
    );
  };

  const takeAvatarPhoto = async () => {
    setAvatarPickerOpen(false);
    try {
      const permissions = await Camera.requestPermissions({
        permissions: ["camera"],
      });
      if (permissions.camera !== "granted") {
        showMessage("Camera permission is needed to take a profile photo.");
        return;
      }
      const photo = await Camera.takePhoto({
        quality: 85,
        correctOrientation: true,
        encodingType: EncodingType.JPEG,
        editable: "no",
        saveToGallery: false,
      });
      await uploadNativePhoto(photo.webPath);
    } catch (error) {
      if ((error as { code?: string }).code !== "OS-PLUG-CAMR-0001") {
        showMessage("Unable to take a photo. Please try again.");
      }
    }
  };

  const chooseAvatarFromLibrary = async () => {
    setAvatarPickerOpen(false);
    try {
      const result = await Camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        quality: 85,
        correctOrientation: true,
        editable: "no",
      });
      await uploadNativePhoto(result.results[0]?.webPath);
    } catch (error) {
      if ((error as { code?: string }).code !== "OS-PLUG-CAMR-0001") {
        showMessage("Unable to choose a photo. Please try again.");
      }
    }
  };

  const openAvatarPicker = () => {
    if (Capacitor.isNativePlatform()) {
      setAvatarPickerOpen(true);
      return;
    }
    avatarInputRef.current?.click();
  };

  const setPushEnabled = async (enabled: boolean) => {
    if (!profile) return;
    if (enabled && isNativePushApp()) {
      try {
        const registration = await registerNativePushNotifications();
        if (registration.supported && !registration.granted) {
          showMessage("Notification permission was not granted.");
          return;
        }
        if (registration.token && registration.platform) {
          localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, registration.token);
          const { error: tokenError } = await supabase.rpc("upsert_my_push_device", {
            p_token: registration.token,
            p_platform: registration.platform,
          });
          if (tokenError) throw tokenError;
        }
      } catch (error) {
        console.error("[FCM] native registration failed", error);
        showMessage("Could not register this device for notifications.");
        return;
      }
    } else if (enabled && "Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showMessage("Notification permission was not granted.");
        return;
      }
    }
    const { error } = await supabase
      .from("profiles")
      .update({ push_enabled: enabled })
      .eq("id", profile.id);
    if (error) {
      showMessage(error.message);
      return;
    }
    if (!enabled && isNativePushApp()) {
      try {
        const token = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
        if (token) {
          const { error: disableError } = await supabase.rpc("disable_my_push_device", { p_token: token });
          if (disableError) throw disableError;
        }
        await unregisterNativePushNotifications();
      } catch (unregisterError) {
        console.warn("[FCM] native unregister failed", unregisterError);
      }
    }
    setProfile({ ...profile, push_enabled: enabled });
  };

  const openSupport = async () => {
    const { data } = await supabase
      .from("support_faqs")
      .select("id, question, answer")
      .eq("is_published", true)
      .order("sort_order");
    setFaqs(data || []);
    setModal("support");
  };
  const sendSupportTicket = async () => {
    if (!profile || !ticketSubject.trim() || !ticketMessage.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("support_tickets").insert({
      user_id: profile.id,
      subject: ticketSubject.trim(),
      message: ticketMessage.trim(),
    });
    setSaving(false);
    if (error) {
      showMessage(error.message);
      return;
    }
    setTicketSubject("");
    setTicketMessage("");
    showMessage("Support request sent.");
  };
  const sendAccountRequest = async () => {
    if (!profile || !requestDetails.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("account_requests").insert({
      user_id: profile.id,
      request_type: requestType,
      details: requestDetails.trim(),
    });
    setSaving(false);
    if (error) {
      showMessage(error.message);
      return;
    }
    setRequestDetails("");
    setModal(null);
    showMessage("Account request sent for admin review.");
  };
  const openLegal = async (slug: "privacy-policy" | "terms-of-service") => {
    const { data, error } = await supabase
      .from("legal_documents")
      .select("title, content")
      .eq("slug", slug)
      .maybeSingle();
    setLegal(
      data || {
        title:
          slug === "privacy-policy" ? "Privacy Policy" : "Terms of Service",
        content: error
          ? "This document is not published yet."
          : "No document has been published yet.",
      }
    );
    setModal(slug);
  };
  const closeModal = () => {
    // Removing a photo is only committed by Save changes. Restore the persisted
    // image when the editor is dismissed so a cancelled removal is not left in UI state.
    if (modal === "identity" && profile) {
      setName(profile.username || "");
      setAvatarUrl(profile.avatar_url || "");
    }
    setModal(null);
  };
  if (fetchStatus === "loading")
    return (
      <div className="text-center p-6 font-caps text-[10px] font-bold text-on-surface-variant uppercase tracking-widest animate-pulse">
        <LocalizedText id="UI_1598" fallback="Loading profile…" /></div>
    );
  if (fetchStatus === "missing" || !profile)
    return (
      <div className="bg-surface border border-surface-container-highest rounded-[24px] p-6 text-center shadow-sm mt-6">
        <span className="material-symbols-outlined text-[32px] text-red-500">
          error
        </span>
        <h2 className="font-headline text-base font-black text-on-surface mt-3">
          <LocalizedText id="UI_1600" fallback="Profile Not Synced" /></h2>
        <p className="text-xs text-on-surface-variant my-4">
          <LocalizedText id="UI_1601" fallback="Please sign in again to restore your profile." /></p>
        <button
          onClick={terminateSession}
          className="w-full py-3 bg-red-500/10 text-red-500 font-bold text-xs rounded-xl"
        >
          <LocalizedText id="UI_1602" fallback="Sign Out" /></button>
      </div>
    );

  const toggle = (on: boolean, handler: () => void) => (
    <button
      onClick={handler}
      aria-pressed={on}
      className={`w-12 h-7 rounded-full p-1 transition-colors flex items-center ${
        on ? "bg-primary" : "bg-surface-container-highest"
      }`}
    >
      <span
        className={`w-5 h-5 rounded-full shadow-md transition-transform ${
          on ? "bg-on-primary translate-x-5" : "bg-on-surface-variant"
        }`}
      />
    </button>
  );
  const setting = (
    icon: string,
    title: string,
    hint: string,
    control: React.ReactNode
  ) => (
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-[14px] bg-surface-container-high flex items-center justify-center text-primary">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <div>
          <span className="font-headline text-[13px] font-bold block">
            {title}
          </span>
          <span className="font-body text-[11px] text-on-surface-variant block mt-0.5">
            {hint}
          </span>
        </div>
      </div>
      {control}
    </div>
  );
  const profileDesignItems = inventory.filter((item) => ["profile_card", "profile_card_theme", "avatar_frame", "profile_avatar_frame", "avatar_border"].includes(item.cosmetics?.game_category || ""));
  const usesLeftAvatarCardLayout = profileCardCosmetic?.profile_card_layout === "avatar_left";
  const hasProfileCardArtwork = Boolean(profileCardCosmetic?.image_url);
  const maskedEmail = profile?.email ? profile.email.replace(/^(.{2})[^@]*(?=@)/, "$1••••") : "";
  const copyUserId = async () => { if (profile?.network_id) { await navigator.clipboard.writeText(profile.network_id); setMessage("User ID copied."); window.setTimeout(() => setMessage(null), 2500); } };

  return (
    <div className="space-y-5 animate-fade-in pb-12 w-full text-on-surface">
      {message && (
        <div
          role="status"
          className="sticky top-1 z-20 bg-primary-container text-primary rounded-xl p-3 text-xs font-bold shadow-lg"
        >
          {message}
        </div>
      )}
      <div
        className={`bg-surface border border-surface-container-highest rounded-[24px] p-6 flex flex-col items-center text-center relative overflow-hidden shadow-sm ${hasProfileCardArtwork ? "text-white border-white/15 shadow-lg" : ""}`}
        style={{
          backgroundColor: profileCardCosmetic?.modifiers?.background_color,
          backgroundImage: profileCardCosmetic?.image_url ? `linear-gradient(rgb(15 23 42 / 0.52), rgb(15 23 42 / 0.66)), url(${profileCardCosmetic.image_url})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <button
          onClick={() => setModal("identity")}
          className={`absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-xl text-primary backdrop-blur-sm transition-transform active:scale-95 ${hasProfileCardArtwork ? "border border-white/35 bg-slate-950/65 shadow-md" : "border border-surface-container-highest bg-background/85"}`}
          aria-label={tr("UI_1604", "Edit Profile")}
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
        </button>
        <div className={`relative h-24 w-24 ${usesLeftAvatarCardLayout ? "invisible" : ""}`}>
          <div className={`absolute z-10 overflow-hidden rounded-full bg-surface-variant shadow-inner ${avatarFrameCosmetic?.image_url ? "inset-1" : "inset-0 border-4 border-surface-container-high"}`}>
            <Image
              src={profile.avatar_url || "/logo-dark.jpeg"}
              alt={tr("UI_1606", "Profile avatar")}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          {avatarFrameCosmetic?.image_url && (
            <Image
              src={avatarFrameCosmetic.image_url}
              alt={tr("UI_1607", "Equipped avatar border")}
              fill
              className="pointer-events-none absolute inset-0 z-20 scale-[1.2] object-contain"
              unoptimized
            />
          )}
        </div>
        {usesLeftAvatarCardLayout && (
          <div className="pointer-events-none absolute left-[27%] top-1/2 z-20 h-24 w-24 -translate-x-1/2 -translate-y-1/2">
            <div className={`absolute z-10 overflow-hidden rounded-full bg-surface-variant shadow-inner ${avatarFrameCosmetic?.image_url ? "inset-1" : "inset-0 border-4 border-surface-container-high"}`}>
              <Image src={profile.avatar_url || "/logo-dark.jpeg"} alt="" fill className="object-cover" unoptimized />
            </div>
            {avatarFrameCosmetic?.image_url && <Image src={avatarFrameCosmetic.image_url} alt={tr("UI_1607", "Equipped avatar border")} fill className="absolute inset-0 z-20 scale-[1.2] object-contain" unoptimized />}
          </div>
        )}
        <div className="mt-4">
          <h2 className="font-headline text-xl font-black tracking-tight text-inherit">
            {profile.username}
          </h2>
          <button onClick={copyUserId} className={`mx-auto mt-1 flex items-center gap-1 font-body text-[13px] ${hasProfileCardArtwork ? "text-white/80" : "text-on-surface-variant"}`}>
            <span>{profile.network_id || maskedEmail}</span><span className="material-symbols-outlined text-[14px]">content_copy</span>
          </button>
        </div>
        <div className={`grid grid-cols-3 gap-2 w-full mt-6 pt-4 ${hasProfileCardArtwork ? "border-t border-white/45" : "border-t border-surface-variant"}`}>
          <div className="rounded-xl bg-black/25 px-2 py-2 backdrop-blur-sm">
            <b className="block text-lg">
              {(profile.points || 0).toLocaleString()}
            </b>
            <span className={`text-[10px] uppercase ${hasProfileCardArtwork ? "text-white/80" : "text-on-surface-variant"}`}>
              {t("I18N_points")}
            </span>
          </div>
          <div className="rounded-xl bg-black/25 px-2 py-2 backdrop-blur-sm">
            <b className="block text-lg">
              {(profile.gems || 0).toLocaleString()}
            </b>
            <span className={`text-[10px] uppercase ${hasProfileCardArtwork ? "text-white/80" : "text-on-surface-variant"}`}>
              {t("I18N_gems")}
            </span>
          </div>
          <div className="rounded-xl bg-black/25 px-2 py-2 backdrop-blur-sm">
            <b className="block text-lg">{inventoryCount}</b>
            <span className={`text-[10px] uppercase ${hasProfileCardArtwork ? "text-white/80" : "text-on-surface-variant"}`}>
              {t("UI_1692")}
            </span>
          </div>
        </div>
      </div>
      <section className="space-y-3">
        <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-2">
          {t("I18N_language")}
        </h3>
        <button
          onClick={() => setModal("language")}
          className="w-full rounded-[24px] border border-surface-container-highest bg-surface p-4 text-left hover:bg-surface-variant"
        >
          <span className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-4">
              <span className="rounded-[14px] bg-surface-container-high p-3 text-2xl">
                {LANGUAGES.find((item) => item.code === language)?.flag}
              </span>
              <span>
                <b className="block text-sm">{t("I18N_appLanguage")}</b>
                <small className="text-on-surface-variant">
                  {LANGUAGES.find((item) => item.code === language)?.label}
                </small>
              </span>
            </span>
            <span className="material-symbols-outlined text-on-surface-variant">
              chevron_right
            </span>
          </span>
        </button>
      </section>
      <section className="space-y-3">
        <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-2">
          {t("I18N_profileActivity")}
        </h3>
        <div className="bg-surface border border-surface-container-highest rounded-[24px] divide-y divide-surface-variant">
          <button
            onClick={() => void openActivity()}
            className="w-full p-4 text-left hover:bg-surface-variant"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <span className="material-symbols-outlined rounded-xl bg-surface-container-high p-2 text-primary">
                  receipt_long
                </span>
                <span>
                  <b className="block text-sm">{t("UI_1615")}</b>
                  <small className="text-on-surface-variant">
                    {ledger.length
                      ? `${ledger.length} ${t("I18N_recentWalletActivities")}`
                      : t("UI_1618")}
                  </small>
                </span>
              </span>
              <span className="material-symbols-outlined text-on-surface-variant">
                chevron_right
              </span>
            </div>
          </button>
          <button onClick={() => setModal("inventory")} className="w-full p-4 text-left hover:bg-surface-variant">
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-3"><span className="material-symbols-outlined rounded-xl bg-surface-container-high p-2 text-primary">inventory_2</span><span><b className="block text-sm">{t("UI_1620")}</b><small className="text-on-surface-variant">{inventoryCount} {t("UI_1621")}</small></span></span><span className="material-symbols-outlined text-on-surface-variant">chevron_right</span></div>
          </button>
          <button onClick={() => setModal("favorites")} className="w-full p-4 text-left hover:bg-surface-variant"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-3"><span className="material-symbols-outlined rounded-xl bg-surface-container-high p-2 text-primary">star</span><span><b className="block text-sm">{t("UI_1623")}</b><small className="text-on-surface-variant">{favoriteGames.length ? t("UI_1622", { favoriteGames, value_1: favoriteGames.length === 1 ? "" : "s" }) : t("UI_1624")}</small></span></span><span className="material-symbols-outlined text-on-surface-variant">chevron_right</span></div></button>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-2">
          {t("I18N_appPreferences")}
        </h3>
        <div className="bg-surface border border-surface-container-highest rounded-[24px] overflow-hidden divide-y divide-surface-variant">
          {setting(
            isDarkMode ? "dark_mode" : "light_mode",
            t("I18N_darkAppearance"),
            t("I18N_adjustAppearance"),
            toggle(isDarkMode, onToggleTheme)
          )}
          {setting(
            "volume_up",
            t("I18N_soundEffects"),
            t("I18N_inGameAudio"),
            toggle(soundEnabled, () => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              soundEngine.setMuted(!next);
            })
          )}
          {setting(
            "vibration",
            t("I18N_hapticFeedback"),
            t("I18N_vibrationInteractions"),
            toggle(hapticsEnabled, () => setHapticsEnabled(!hapticsEnabled))
          )}
          {setting(
            "notifications",
            t("I18N_pushNotifications"),
            t("I18N_adminAlerts"),
            toggle(
              Boolean(profile.push_enabled),
              () => void setPushEnabled(!profile.push_enabled)
            )
          )}
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-2">
          {t("I18N_accountLegal")}
        </h3>
        <div className="bg-surface border border-surface-container-highest rounded-[24px] overflow-hidden divide-y divide-surface-variant">
          {[
            ["manage_accounts", t("UI_1651"), () => setModal("account")],
            ["help", t("UI_1653"), openSupport],
            [
              "policy",
              t("UI_1595"),
              () => void openLegal("privacy-policy"),
            ],
            [
              "gavel",
              t("UI_1597"),
              () => void openLegal("terms-of-service"),
            ],
          ].map(([icon, title, action]) => (
            <button
              key={title as string}
              onClick={action as () => void}
              className="w-full flex items-center justify-between p-4 hover:bg-surface-variant text-left"
            >
              <span className="flex items-center gap-4">
                <span className="w-11 h-11 rounded-[14px] bg-surface-container-high flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">
                    {icon as string}
                  </span>
                </span>
                <span className="font-headline text-sm font-bold">
                  {title as string}
                </span>
              </span>
              <span className="material-symbols-outlined text-base text-on-surface-variant">
                chevron_right
              </span>
            </button>
          ))}
        </div>
      </section>
      <button
        onClick={terminateSession}
        className="w-full bg-surface border border-surface-container-highest rounded-[24px] p-4 flex items-center justify-center gap-2 text-red-500 font-bold text-[13px]"
      >
        <span className="material-symbols-outlined text-[18px]">logout</span>
          {t("I18N_logout")}
      </button>
      {modal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md sm:px-6" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-modal-title"
              className="flex w-full max-w-md max-h-full flex-col overflow-hidden rounded-[28px] border border-surface-container-highest bg-surface shadow-2xl"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-surface-container-highest px-5 py-4 sm:px-6">
                <h2
                  id="profile-modal-title"
                  className="font-headline font-black text-lg"
                >
                  {modal === "identity"
                    ? t("UI_1604")
                    : modal === "activity"
                    ? t("UI_1615")
                    : modal === "inventory"
                    ? t("UI_1620")
                    : modal === "favorites"
                    ? t("UI_1623")
                    : modal === "language"
                    ? t("I18N_appLanguage")
                    : modal === "account"
                    ? t("UI_1651")
                    : modal === "support"
                    ? t("UI_1653")
                    : legal?.title}
                </h2>
                <button
                  onClick={closeModal}
                  aria-label={t("UI_1654")}
                  className="-mr-2 rounded-xl p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[24px]">
                    close
                  </span>
                </button>
              </div>
              <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
                {modal === "language" && (
                  <div className="grid grid-cols-3 gap-3">
                    {LANGUAGES.map((item) => (
                      <button
                        key={item.code}
                        onClick={() =>
                          void updateLanguage(item.code).then(() =>
                            setModal(null)
                          )
                        }
                        className={`rounded-2xl p-3 text-center text-xs font-bold ${
                          language === item.code
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container-high text-on-surface"
                        }`}
                      >
                        <span className="block text-2xl">{item.flag}</span>
                        <span className="mt-2 block">{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {modal === "activity" && (
                  <div className="space-y-2">
                    {activityLedger.length ? (
                      activityLedger.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-high p-3 text-xs"
                        >
                          <span
                            className={`material-symbols-outlined rounded-full p-2 ${
                              entry.currency_type === "gems"
                                ? "bg-secondary-container text-secondary"
                                : "bg-primary-container text-primary"
                            }`}
                          >
                            {entry.currency_type === "gems"
                              ? "diamond"
                              : "bolt"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <b className="block truncate">
                              {entry.description || entry.mutation_type}
                            </b>
                            <small className="text-on-surface-variant">
                              {new Date(entry.created_at).toLocaleString()}
                            </small>
                          </span>
                          <b
                            className={
                              entry.amount >= 0
                                ? "text-emerald-500"
                                : "text-red-500"
                            }
                          >
                            {entry.amount >= 0 ? "+" : ""}
                            {entry.amount}{" "}
                            {entry.currency_type === "gems" ? tr("UI_1655", "GEMS") : tr("UI_0338", "PTS")}
                          </b>
                        </div>
                      ))
                    ) : (
                      <p className="py-8 text-center text-sm text-on-surface-variant">
                        <LocalizedText id="UI_1656" fallback={tr("UI_1656", "No activity recorded yet.")} /></p>
                    )}
                  </div>
                )}
                {modal === "inventory" && (
                  <div className="space-y-4">
                    <p className="text-xs text-on-surface-variant"><LocalizedText id="UI_1657" fallback={tr("UI_1657", "All cosmetics you have purchased. Equip profile card backgrounds and avatar borders here; equipping one automatically replaces the currently equipped cosmetic of that same type.")} /></p>
                    {inventory.length ? <div className="grid grid-cols-2 gap-3">{inventory.map((item) => {
                      const category = item.cosmetics?.game_category || "other";
                      const isEquippable = Boolean(item.cosmetics);
                      return <div key={item.id} className={`relative overflow-hidden rounded-2xl border p-3 text-left ${item.is_equipped ? "border-primary bg-primary-container" : "border-surface-container-highest bg-surface-container-high"}`}>
                        <div className="mb-3 flex h-20 items-center justify-center overflow-hidden rounded-xl bg-surface">{item.cosmetics?.image_url ? <img src={item.cosmetics.image_url} alt="" className="h-full w-full object-cover" /> : <span className="material-symbols-outlined text-3xl text-primary">palette</span>}</div>
                        <b className="block truncate text-xs">{item.cosmetics?.name || tr("UI_1660", "Purchased cosmetic")}</b>
                        <small className="mt-1 block capitalize text-on-surface-variant">{category.replaceAll("_", " ")}</small>
                        {item.is_equipped && <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-1 text-[9px] font-black text-on-primary"><LocalizedText id="UI_1661" fallback={tr("UI_1661", "EQUIPPED")} /></span>}
                        {isEquippable && <button type="button" disabled={saving || item.is_equipped} onClick={() => void equipCosmetic(item)} className="mt-3 w-full rounded-lg bg-primary px-2 py-2 text-[10px] font-black text-on-primary disabled:cursor-default disabled:opacity-70">{item.is_equipped ? tr("UI_1661", "EQUIPPED") : tr("UI_1662", "EQUIP")}</button>}
                      </div>;
                    })}</div> : <p className="py-8 text-center text-sm text-on-surface-variant"><LocalizedText id="UI_1663" fallback={tr("UI_1663", "No cosmetics purchased yet. Visit the Shop to unlock some.")} /></p>}
                  </div>
                )}
                {modal === "favorites" && <div className="grid grid-cols-2 gap-3 p-5">{favoriteGames.length ? favoriteGames.map((game) => <button key={game.game_id} onClick={() => onPlayFavorite?.(game.title)} className="rounded-2xl border border-surface-container-highest bg-surface-container-high p-4 text-left transition hover:border-primary active:scale-[.98]"><span className="material-symbols-outlined text-primary">star</span><b className="mt-2 block truncate text-sm">{game.title}</b><small className="block text-on-surface-variant">{game.category || tr("UI_1466", "Arcade")}</small><span className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-primary"><span className="material-symbols-outlined text-sm">play_arrow</span><LocalizedText id="UI_1665" fallback="PLAY" /></span></button>) : <p className="col-span-2 py-10 text-center text-xs text-on-surface-variant"><LocalizedText id="UI_1664" fallback={tr("UI_1664", "No saved games yet. Tap the star on a game detail page to add one.")} /></p>}</div>}
                {modal === "identity" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Image
                        src={avatarUrl || "/logo-dark.jpeg"}
                        alt={tr("UI_1666", "Avatar preview")}
                        width={56}
                        height={56}
                        className="rounded-full object-cover"
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={openAvatarPicker}
                        disabled={saving}
                        className="text-xs font-bold text-primary disabled:opacity-50"
                      >
                        <LocalizedText id="UI_1667" fallback={tr("UI_1667", "Upload photo")} /></button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={uploadAvatar}
                      />
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl("")}
                          disabled={saving}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <LocalizedText id="UI_1668" fallback={tr("UI_1668", "Remove photo")} /></button>
                      )}
                    </div>
                    <label className="block text-xs font-bold">
                      <LocalizedText id="UI_1669" fallback={tr("UI_1669", "Display name")} /><input
                        value={name}
                        maxLength={30}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 w-full p-3 rounded-xl bg-surface-container-high border border-surface-container-highest"
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      <LocalizedText id="UI_0114" fallback={tr("UI_0114", "Email address")} /><input
                        value={profile?.email || ""}
                        readOnly
                        aria-readonly="true"
                        className="mt-1 w-full cursor-not-allowed p-3 rounded-xl bg-surface-container border border-surface-container-highest text-on-surface-variant"
                      />
                    </label>
                    <div className="border-t border-surface-container-highest pt-4">
                      <b className="text-xs"><LocalizedText id="UI_1567" fallback={tr("UI_1567", "Profile card design")} /></b>
                      <p className="mt-1 text-xs text-on-surface-variant"><LocalizedText id="UI_1568" fallback={tr("UI_1568", "Choose a purchased avatar border or card background.")} /></p>
                      {profileDesignItems.length ? <div className="mt-3 grid grid-cols-2 gap-2">{profileDesignItems.map((item) => <button key={item.id} disabled={saving} onClick={() => void equipCosmetic(item)} className={`rounded-xl border p-2 text-left ${item.is_equipped ? "border-primary bg-primary-container" : "border-surface-container-highest bg-surface-container-high"}`}><div className="h-14 overflow-hidden rounded-lg bg-surface">{item.cosmetics?.image_url ? <img src={item.cosmetics.image_url} alt="" className="h-full w-full object-cover" /> : null}</div><span className="mt-2 block truncate text-[10px] font-bold">{item.cosmetics?.name || tr("UI_1571", "Profile cosmetic")}</span><span className="mt-2 block rounded-lg bg-primary px-2 py-1 text-center text-[9px] font-black text-on-primary">{item.is_equipped ? tr("UI_1661", "EQUIPPED") : tr("UI_1569", "EQUIP DESIGN")}</span></button>)}</div> : <p className="mt-3 text-xs text-on-surface-variant"><LocalizedText id="UI_1570" fallback={tr("UI_1570", "No profile designs purchased yet.")} /></p>}
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      <LocalizedText id="UI_1573" fallback={tr("UI_1573", "Your first profile edit is free. Later edits cost")} />{profileEditConfig.profile_edit_cost} {profileEditConfig.profile_edit_currency.toUpperCase()}<LocalizedText id="UI_1572" fallback={tr("UI_1572", ", as set by the game team.")} /></p>
                    <button
                      disabled={saving || !name.trim()}
                      onClick={() => void saveIdentity()}
                      className="w-full bg-primary text-on-primary p-3 rounded-xl text-xs font-black disabled:opacity-50"
                    >
                      {saving
                        ? tr("UI_1574", "Saving…")
                        : `Save changes${
                            identityCost ? ` (${identityCost} PTS)` : ""
                          }`}
                    </button>
                  </div>
                )}
                {modal === "account" && (
                  <div className="space-y-4">
                    <p className="text-xs text-on-surface-variant">
                      Submit an account request for backend review. Admin
                      approval or rejection will be shown in your account
                      request record.
                    </p>
                    <select
                      value={requestType}
                      onChange={(e) =>
                        setRequestType(e.target.value as typeof requestType)
                      }
                      className="w-full p-3 rounded-xl bg-surface-container-high border border-surface-container-highest text-sm"
                    >
                      <option value="email_change"><LocalizedText id="UI_1578" fallback={tr("UI_1578", "Change email address")} /></option>
                      <option value="account_deletion"><LocalizedText id="UI_1579" fallback={tr("UI_1579", "Delete account")} /></option>
                      <option value="other"><LocalizedText id="UI_1580" fallback={tr("UI_1580", "Other account request")} /></option>
                    </select>
                    <textarea
                      value={requestDetails}
                      onChange={(e) => setRequestDetails(e.target.value)}
                      placeholder={tr("UI_1581", "Tell the team what you need")}
                      className="w-full p-3 rounded-xl bg-surface-container-high border border-surface-container-highest text-sm min-h-24"
                    />
                    <button
                      disabled={saving || !requestDetails.trim()}
                      onClick={() => void sendAccountRequest()}
                      className="w-full bg-primary text-on-primary p-3 rounded-xl text-xs font-black disabled:opacity-50"
                    >
                      <LocalizedText id="UI_1582" fallback={tr("UI_1582", "Send for review")} /></button>
                  </div>
                )}
                {modal === "support" && (
                  <div className="space-y-4">
                    <a
                      className="block text-xs font-bold text-primary"
                      href={`mailto:${supportEmail}`}
                    >
                      <LocalizedText id="UI_1583" fallback={tr("UI_1583", "Contact")} />{supportEmail}
                    </a>
                    {faqs.map((faq) => (
                      <details
                        key={faq.id}
                        className="bg-surface-container-high rounded-xl p-3"
                      >
                        <summary className="text-xs font-bold cursor-pointer">
                          {faq.question}
                        </summary>
                        <p className="text-xs text-on-surface-variant mt-2 whitespace-pre-wrap">
                          {faq.answer}
                        </p>
                      </details>
                    ))}
                    <input
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      placeholder={tr("UI_1584", "Subject")}
                      className="w-full p-3 rounded-xl bg-surface-container-high border border-surface-container-highest text-sm"
                    />
                    <textarea
                      value={ticketMessage}
                      onChange={(e) => setTicketMessage(e.target.value)}
                      placeholder={tr("UI_1585", "How can we help?")}
                      className="w-full p-3 rounded-xl bg-surface-container-high border border-surface-container-highest text-sm min-h-24"
                    />
                    <button
                      disabled={
                        saving || !ticketSubject.trim() || !ticketMessage.trim()
                      }
                      onClick={() => void sendSupportTicket()}
                      className="w-full bg-primary text-on-primary p-3 rounded-xl text-xs font-black disabled:opacity-50"
                    >
                      <LocalizedText id="UI_1586" fallback={tr("UI_1586", "Send support request")} /></button>
                  </div>
                )}
                {(modal === "privacy-policy" ||
                  modal === "terms-of-service") && (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-on-surface-variant">
                    {legal?.content}
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      {avatarPickerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[210] flex items-end bg-black/70 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="avatar-source-title"
              className="w-full max-w-sm rounded-[28px] border border-surface-container-highest bg-surface p-5 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 id="avatar-source-title" className="font-headline text-lg font-black">
                  <LocalizedText id="UI_1587" fallback="Upload profile photo" /></h3>
                <button
                  type="button"
                  aria-label="Close photo options"
                  onClick={() => setAvatarPickerOpen(false)}
                  className="rounded-full p-1 text-on-surface-variant transition hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void chooseAvatarFromLibrary()}
                  className="flex w-full items-center gap-3 rounded-xl bg-surface-container-high px-4 py-3 text-left text-sm font-bold"
                >
                  <span className="material-symbols-outlined text-primary">photo_library</span>
                  <LocalizedText id="UI_1590" fallback="Photo Library" /></button>
                <button
                  type="button"
                  onClick={() => void takeAvatarPhoto()}
                  className="flex w-full items-center gap-3 rounded-xl bg-surface-container-high px-4 py-3 text-left text-sm font-bold"
                >
                  <span className="material-symbols-outlined text-primary">photo_camera</span>
                  <LocalizedText id="UI_1592" fallback="Take Photo" /></button>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarPickerOpen(false);
                    avatarInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl bg-surface-container-high px-4 py-3 text-left text-sm font-bold"
                >
                  <span className="material-symbols-outlined text-primary">folder_open</span>
                  <LocalizedText id="UI_1594" fallback="Choose File" /></button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
