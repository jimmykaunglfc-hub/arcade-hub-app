"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useTranslation } from "../lib/i18n";

interface DailyLoginCardProps {
  userId: string | null;
  onClaimSuccess?: () => void;
}

export default function DailyLoginCard({ userId, onClaimSuccess }: DailyLoginCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [rewardPoints, setRewardPoints] = useState<number>(1000);
  const [hasClaimedToday, setHasClaimedToday] = useState(false);

  useEffect(() => {
    if (userId) {
      checkDailyClaimStatus();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const fetchActiveRewardAmount = async (): Promise<number> => {
    try {
      // Query reward_rules with fallback column checks
      const { data: rule, error } = await supabase
        .from("reward_rules")
        .select("*")
        .or("trigger_event.eq.daily_login,title.ilike.%Daily Login%")
        .maybeSingle();

      if (error) {
        console.error("Error querying reward_rules:", error.message);
        return 1000;
      }

      if (rule) {
        const pts = rule.payout_amount ?? rule.reward_points ?? rule.points;
        if (typeof pts === "number") return pts;
      }
    } catch (err) {
      console.error("Failed to fetch reward rule:", err);
    }
    return 1000;
  };

  const checkDailyClaimStatus = async () => {
    setLoading(true);
    try {
      // 1. Fetch live payout amount configured in Admin Panel
      const liveRewardPts = await fetchActiveRewardAmount();
      setRewardPoints(liveRewardPts);

      // 2. Check user's last claim timestamp from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("last_login_claim, last_daily_claim_at")
        .eq("id", userId)
        .single();

      if (profile) {
        const lastClaimTimestamp = profile.last_daily_claim_at || profile.last_login_claim;
        if (lastClaimTimestamp) {
          const lastClaimDate = new Date(lastClaimTimestamp).toDateString();
          const todayDate = new Date().toDateString();
          setHasClaimedToday(lastClaimDate === todayDate);
        }
      }
    } catch (err) {
      console.error("Error checking daily login status:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!userId || hasClaimedToday || claiming) return;
    setClaiming(true);

    try {
      // The server locks the player record, validates the once-per-day rule,
      // reads the Admin payout setting, applies the multiplier, and records
      // the wallet history in one transaction. The client never writes Points.
      const { data, error } = await supabase.rpc("claim_daily_login_reward");
      if (error) throw error;
      const claim = Array.isArray(data) ? data[0] : data;
      if (!claim) throw new Error("Daily login reward did not return a result");

      setRewardPoints(Number(claim.points_awarded || 0));
      setHasClaimedToday(true);

      if (onClaimSuccess) {
        onClaimSuccess();
      }
    } catch (err: any) {
      alert("Error claiming reward: " + err.message);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full bg-[#ff6b00] rounded-3xl p-5 text-on-surface flex items-center justify-between opacity-80 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black/10 dark:bg-white/20 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-on-surface text-[20px]">card_giftcard</span>
          </div>
          <div>
            <div className="h-4 w-24 bg-black/20 dark:bg-white/30 rounded mb-1.5"></div>
            <div className="h-3 w-32 bg-black/10 dark:bg-white/20 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-r from-[#FF6B00] to-[#FF8800] rounded-3xl p-5 text-on-surface flex items-center justify-between shadow-lg relative overflow-hidden">
      {/* LEFT CONTENT */}
      <div className="flex items-center gap-3.5 relative z-10">
        <div className="w-11 h-11 bg-black/10 dark:bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-black/10 dark:border-white/20 shrink-0">
          <span className="material-symbols-outlined text-on-surface text-[24px]">card_giftcard</span>
        </div>
        <div>
          <h3 className="font-headline font-black text-base leading-tight text-on-surface">
            {t("UI_0298")}
          </h3>
          <p className="text-xs font-bold text-on-surface/90 mt-0.5">
            {hasClaimedToday
              ? t("UI_0299")
              : `+${rewardPoints.toLocaleString()} ${t("I18N_points")}`}
          </p>
        </div>
      </div>

      {/* RIGHT ACTION BUTTON */}
      <div className="relative z-10">
        {hasClaimedToday ? (
          <div className="flex items-center gap-1 bg-black/10 dark:bg-black/20 text-on-surface/90 font-extrabold text-xs px-4 py-2 rounded-full border border-black/10 dark:border-white/10">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[16px]">check_circle</span>
            {t("UI_0301")}
          </div>
        ) : (
          <button
            onClick={handleClaim}
            disabled={claiming}
            data-requires-auth
            className="bg-surface text-on-surface font-headline font-black text-xs uppercase px-5 py-2.5 rounded-full hover:bg-surface-variant transition-all shadow-md active:scale-95 disabled:opacity-50 border border-surface-container-highest"
          >
            {claiming ? t("UI_0303") : t("UI_0302")}
          </button>
        )}
      </div>
    </div>
  );
}
