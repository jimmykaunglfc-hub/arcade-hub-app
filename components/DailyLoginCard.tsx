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
  const [rewardPoints, setRewardPoints] = useState<number>(50); // Fallback default
  const [hasClaimedToday, setHasClaimedToday] = useState(false);

  useEffect(() => {
    if (userId) {
      checkDailyClaimStatus();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const checkDailyClaimStatus = async () => {
    setLoading(true);
    try {
      // 1. Fetch the active Daily Login payout rule set in backend (Reward System)
      const { data: rule } = await supabase
        .from("reward_rules")
        .select("reward_points")
        .eq("trigger_event", "daily_login")
        .eq("is_active", true)
        .maybeSingle();

      if (rule?.reward_points) {
        setRewardPoints(rule.reward_points);
      }

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

      // 1. Get current balance
      const { data: profile } = await supabase
        .from("profiles")
        .select("points")
        .eq("id", userId)
        .single();

      const currentPts = profile?.points ?? 0;
      const updatedPts = currentPts + rewardPoints;

      // 2. Update user profile with points & timestamp
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          points: updatedPts,
          last_daily_claim_at: nowISO,
          last_login_claim: nowISO, // Sync both column formats
        })
        .eq("id", userId);

      if (updateError) throw updateError;

      // 3. Mark locally as claimed
      setHasClaimedToday(true);

      // 4. Notify app shell to refresh header balance
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
      <div className="w-full bg-[#ff6b00] rounded-3xl p-5 text-white flex items-center justify-between opacity-80 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[20px]">card_giftcard</span>
          </div>
          <div>
            <div className="h-4 w-24 bg-white/30 rounded mb-1.5"></div>
            <div className="h-3 w-32 bg-white/20 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-gradient-to-r from-[#FF6B00] to-[#FF8800] rounded-3xl p-5 text-white flex items-center justify-between shadow-lg relative overflow-hidden">
      {/* LEFT CONTENT */}
      <div className="flex items-center gap-3.5 relative z-10">
        <div className="w-11 h-11 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shrink-0">
          <span className="material-symbols-outlined text-white text-[24px]">card_giftcard</span>
        </div>
        <div>
          <h3 className="font-headline font-black text-base leading-tight text-white">
            Daily Login
          </h3>
          <p className="text-xs font-bold text-white/90 mt-0.5">
            {hasClaimedToday
              ? "Claimed today! Check back tomorrow."
              : `+${rewardPoints.toLocaleString()} Points to play!`}
          </p>
        </div>
      </div>

      {/* RIGHT ACTION BUTTON */}
      <div className="relative z-10">
        {hasClaimedToday ? (
          <div className="flex items-center gap-1 bg-black/20 text-white/90 font-extrabold text-xs px-4 py-2 rounded-full border border-white/10">
            <span className="material-symbols-outlined text-emerald-400 text-[16px]">check_circle</span>
            Claimed
          </div>
        ) : (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="bg-white text-[#FF6B00] font-headline font-black text-xs uppercase px-5 py-2.5 rounded-full hover:bg-neutral-100 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            {claiming ? "Claiming..." : "Claim"}
          </button>
        )}
      </div>
    </div>
  );
}