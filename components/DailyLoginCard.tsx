"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface DailyLoginCardProps {
  userId: string | null;
  onClaimSuccess?: () => void;
}

export default function DailyLoginCard({ userId, onClaimSuccess }: DailyLoginCardProps) {
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
      const nowISO = new Date().toISOString();

      // 1. Fetch current exact payout rule
      const activePayout = await fetchActiveRewardAmount();

      // 2. Get current user balance
      const { data: profile } = await supabase
        .from("profiles")
        .select("points")
        .eq("id", userId)
        .single();

      const currentPts = profile?.points ?? 0;
      const updatedPts = currentPts + activePayout;

      // 3. Update user profile with new point total & timestamp
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          points: updatedPts,
          last_daily_claim_at: nowISO,
          last_login_claim: nowISO,
        })
        .eq("id", userId);

      if (updateError) throw updateError;

      // 4. Update local state
      setRewardPoints(activePayout);
      setHasClaimedToday(true);

      // 5. Notify header/parent component to refresh balance
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
            Daily Login
          </h3>
          <p className="text-xs font-bold text-on-surface/90 mt-0.5">
            {hasClaimedToday
              ? "Claimed today! Check back tomorrow."
              : `+${rewardPoints.toLocaleString()} Points to play!`}
          </p>
        </div>
      </div>

      {/* RIGHT ACTION BUTTON */}
      <div className="relative z-10">
        {hasClaimedToday ? (
          <div className="flex items-center gap-1 bg-black/10 dark:bg-black/20 text-on-surface/90 font-extrabold text-xs px-4 py-2 rounded-full border border-black/10 dark:border-white/10">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[16px]">check_circle</span>
            Claimed
          </div>
        ) : (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="bg-surface text-on-surface font-headline font-black text-xs uppercase px-5 py-2.5 rounded-full hover:bg-surface-variant transition-all shadow-md active:scale-95 disabled:opacity-50 border border-surface-container-highest"
          >
            {claiming ? "Claiming..." : "Claim"}
          </button>
        )}
      </div>
    </div>
  );
}