"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { supabase } from "../lib/supabaseClient";
import { LANGUAGES, LanguageCode, useTranslation } from "../lib/i18n";

type Profile = {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
  points?: number;
  gems?: number;
  name_change_count?: number;
  avatar_change_count?: number;
  push_enabled?: boolean;
};
type Modal =
  | "identity"
  | "account"
  | "support"
  | "activity"
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

const NAME_CHANGE_COST = 100;
const AVATAR_CHANGE_COST = 150;

interface ProfileTabProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export default function ProfileTab({
  isDarkMode,
  onToggleTheme,
}: ProfileTabProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fetchStatus, setFetchStatus] = useState<
    "loading" | "found" | "missing"
  >("loading");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [activityLedger, setActivityLedger] = useState<LedgerEntry[]>([]);
  const [supportEmail, setSupportEmail] = useState("support@joeyoke.com");
  const [modal, setModal] = useState<Modal>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
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
    const [
      { data: myProfile },
      { count },
      { data: ledgerData },
      { data: config },
    ] = await Promise.all([
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
      supabase
        .from("platform_config")
        .select("support_email")
        .eq("id", 1)
        .maybeSingle(),
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
    if (config?.support_email) setSupportEmail(config.support_email);
    setFetchStatus("found");
  };

  useEffect(() => {
    void fetchProfileData();
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
  const updateLanguage = async (code: LanguageCode) => {
    setLanguage(code);
    const { error } = await supabase.rpc("update_profile_language", {
      new_language: code,
    });
    if (error) showMessage(error.message);
  };
  const terminateSession = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };
  const nameCost =
    profile && name.trim() !== profile.username
      ? profile.name_change_count
        ? NAME_CHANGE_COST
        : 0
      : 0;
  const avatarCost =
    profile && avatarUrl.trim() !== (profile.avatar_url || "")
      ? profile.avatar_change_count
        ? AVATAR_CHANGE_COST
        : 0
      : 0;
  const identityCost = nameCost + avatarCost;

  const saveIdentity = async () => {
    if (!profile || !name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("update_profile_identity", {
      new_username: name.trim(),
      new_avatar_url: avatarUrl.trim() || null,
      name_change_cost: NAME_CHANGE_COST,
      avatar_change_cost: AVATAR_CHANGE_COST,
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
        ? `Profile updated for ${identityCost} points.`
        : "Profile updated — your first change was free."
    );
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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

  const setPushEnabled = async (enabled: boolean) => {
    if (!profile) return;
    if (enabled && "Notification" in window) {
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
  if (fetchStatus === "loading")
    return (
      <div className="text-center p-6 font-caps text-[10px] font-bold text-on-surface-variant uppercase tracking-widest animate-pulse">
        Loading profile…
      </div>
    );
  if (fetchStatus === "missing" || !profile)
    return (
      <div className="bg-surface border border-surface-container-highest rounded-[24px] p-6 text-center shadow-sm mt-6">
        <span className="material-symbols-outlined text-[32px] text-red-500">
          error
        </span>
        <h2 className="font-headline text-base font-black text-on-surface mt-3">
          Profile Not Synced
        </h2>
        <p className="text-xs text-on-surface-variant my-4">
          Please sign in again to restore your profile.
        </p>
        <button
          onClick={terminateSession}
          className="w-full py-3 bg-red-500/10 text-red-500 font-bold text-xs rounded-xl"
        >
          Sign Out
        </button>
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
      <div className="bg-surface border border-surface-container-highest rounded-[24px] p-6 flex flex-col items-center text-center relative overflow-hidden shadow-sm">
        <button
          onClick={() => setModal("identity")}
          className="w-24 h-24 rounded-full border-4 border-surface-container-high overflow-hidden relative bg-surface-variant shadow-inner"
          aria-label="Edit profile"
        >
          <Image
            src={profile.avatar_url || "/logo-dark.jpeg"}
            alt="Profile avatar"
            fill
            className="object-cover"
            unoptimized
          />
        </button>
        <div className="mt-4">
          <h2 className="font-headline text-xl font-black tracking-tight">
            {profile.username}
          </h2>
          <p className="font-body text-[13px] text-on-surface-variant mt-0.5">
            {profile.email}
          </p>
        </div>
        <button
          onClick={() => setModal("identity")}
          className="mt-4 text-xs font-bold text-primary"
        >
          {t("editNamePhoto")}
        </button>
        <div className="grid grid-cols-3 w-full mt-6 border-t border-surface-variant pt-4">
          <div>
            <b className="block text-lg">
              {(profile.points || 0).toLocaleString()}
            </b>
            <span className="text-[10px] text-on-surface-variant uppercase">
              {t("points")}
            </span>
          </div>
          <div>
            <b className="block text-lg">
              {(profile.gems || 0).toLocaleString()}
            </b>
            <span className="text-[10px] text-on-surface-variant uppercase">
              {t("gems")}
            </span>
          </div>
          <div>
            <b className="block text-lg">{inventoryCount}</b>
            <span className="text-[10px] text-on-surface-variant uppercase">
              {t("cosmetics")}
            </span>
          </div>
        </div>
      </div>
      <section className="space-y-3">
        <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-2">
          {t("language")}
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
                <b className="block text-sm">{t("appLanguage")}</b>
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
          {t("profileActivity")}
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
                  <b className="block text-sm">Activity history</b>
                  <small className="text-on-surface-variant">
                    {ledger.length
                      ? `${ledger.length} ${t("recentWalletActivities")}`
                      : "Points, gems and reward activity"}
                  </small>
                </span>
              </span>
              <span className="material-symbols-outlined text-on-surface-variant">
                chevron_right
              </span>
            </div>
          </button>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-2">
          {t("appPreferences")}
        </h3>
        <div className="bg-surface border border-surface-container-highest rounded-[24px] overflow-hidden divide-y divide-surface-variant">
          {setting(
            isDarkMode ? "dark_mode" : "light_mode",
            t("darkAppearance"),
            t("adjustAppearance"),
            toggle(isDarkMode, onToggleTheme)
          )}
          {setting(
            "volume_up",
            t("soundEffects"),
            t("inGameAudio"),
            toggle(soundEnabled, () => setSoundEnabled(!soundEnabled))
          )}
          {setting(
            "vibration",
            t("hapticFeedback"),
            t("vibrationInteractions"),
            toggle(hapticsEnabled, () => setHapticsEnabled(!hapticsEnabled))
          )}
          {setting(
            "notifications",
            t("pushNotifications"),
            t("adminAlerts"),
            toggle(
              Boolean(profile.push_enabled),
              () => void setPushEnabled(!profile.push_enabled)
            )
          )}
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="font-caps text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-2">
          {t("accountLegal")}
        </h3>
        <div className="bg-surface border border-surface-container-highest rounded-[24px] overflow-hidden divide-y divide-surface-variant">
          {[
            ["manage_accounts", t("manageAccount"), () => setModal("account")],
            ["help", t("helpSupport"), openSupport],
            [
              "policy",
              t("privacyPolicy"),
              () => void openLegal("privacy-policy"),
            ],
            [
              "gavel",
              t("termsService"),
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
        {t("logout")}
      </button>
      {modal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 py-4 backdrop-blur-md sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-modal-title"
              className="flex w-full max-w-md max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-[28px] border border-surface-container-highest bg-surface shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-surface-container-highest px-5 py-4 sm:px-6">
                <h2
                  id="profile-modal-title"
                  className="font-headline font-black text-lg"
                >
                  {modal === "identity"
                    ? "Edit Profile"
                    : modal === "activity"
                    ? "Activity history"
                    : modal === "language"
                    ? t("appLanguage")
                    : modal === "account"
                    ? "Manage Account"
                    : modal === "support"
                    ? "Help & Support"
                    : legal?.title}
                </h2>
                <button
                  onClick={() => setModal(null)}
                  aria-label="Close"
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
                            {entry.currency_type === "gems" ? "GEMS" : "PTS"}
                          </b>
                        </div>
                      ))
                    ) : (
                      <p className="py-8 text-center text-sm text-on-surface-variant">
                        No activity recorded yet.
                      </p>
                    )}
                  </div>
                )}
                {modal === "identity" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Image
                        src={avatarUrl || "/logo-dark.jpeg"}
                        alt="Avatar preview"
                        width={56}
                        height={56}
                        className="rounded-full object-cover"
                        unoptimized
                      />
                      <label className="text-xs font-bold text-primary cursor-pointer">
                        Upload photo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={uploadAvatar}
                        />
                      </label>
                    </div>
                    <label className="block text-xs font-bold">
                      Display name
                      <input
                        value={name}
                        maxLength={30}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 w-full p-3 rounded-xl bg-surface-container-high border border-surface-container-highest"
                      />
                    </label>
                    <label className="block text-xs font-bold">
                      Photo URL (optional)
                      <input
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        className="mt-1 w-full p-3 rounded-xl bg-surface-container-high border border-surface-container-highest"
                      />
                    </label>
                    <p className="text-xs text-on-surface-variant">
                      First name and photo change are free. Later changes cost{" "}
                      {NAME_CHANGE_COST} and {AVATAR_CHANGE_COST} points.
                    </p>
                    <button
                      disabled={saving || !name.trim()}
                      onClick={() => void saveIdentity()}
                      className="w-full bg-primary text-on-primary p-3 rounded-xl text-xs font-black disabled:opacity-50"
                    >
                      {saving
                        ? "Saving…"
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
                      <option value="email_change">Change email address</option>
                      <option value="account_deletion">Delete account</option>
                      <option value="other">Other account request</option>
                    </select>
                    <textarea
                      value={requestDetails}
                      onChange={(e) => setRequestDetails(e.target.value)}
                      placeholder="Tell the team what you need"
                      className="w-full p-3 rounded-xl bg-surface-container-high border border-surface-container-highest text-sm min-h-24"
                    />
                    <button
                      disabled={saving || !requestDetails.trim()}
                      onClick={() => void sendAccountRequest()}
                      className="w-full bg-primary text-on-primary p-3 rounded-xl text-xs font-black disabled:opacity-50"
                    >
                      Send for review
                    </button>
                  </div>
                )}
                {modal === "support" && (
                  <div className="space-y-4">
                    <a
                      className="block text-xs font-bold text-primary"
                      href={`mailto:${supportEmail}`}
                    >
                      Contact {supportEmail}
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
                      placeholder="Subject"
                      className="w-full p-3 rounded-xl bg-surface-container-high border border-surface-container-highest text-sm"
                    />
                    <textarea
                      value={ticketMessage}
                      onChange={(e) => setTicketMessage(e.target.value)}
                      placeholder="How can we help?"
                      className="w-full p-3 rounded-xl bg-surface-container-high border border-surface-container-highest text-sm min-h-24"
                    />
                    <button
                      disabled={
                        saving || !ticketSubject.trim() || !ticketMessage.trim()
                      }
                      onClick={() => void sendSupportTicket()}
                      className="w-full bg-primary text-on-primary p-3 rounded-xl text-xs font-black disabled:opacity-50"
                    >
                      Send support request
                    </button>
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
    </div>
  );
}
