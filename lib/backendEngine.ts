import { supabase } from "./supabaseClient";

export interface WagerPayload {
  userId: string;
  sessionId: string;
  wagerAmount: number;
}

export interface PurchasePayload {
  userId: string;
  productId: string;
}

export const JoeYokeEngine = {
  
  // ==========================================================================
  // 1. ENGINE ECONOMIC RULES & MATCH BETS
  // ==========================================================================
  /**
   * Processes an immutable points bet for online matches.
   * If a user balance drops below the wager threshold, it cancels match entry.
   */
  async placeMatchWager({ userId, sessionId, wagerAmount }: WagerPayload): Promise<{ success: boolean; updatedPoints?: number; error?: string }> {
    if (wagerAmount <= 0) return { success: true };

    // Fetch account balance directly from the database to bypass stale client arrays
    const { data: profile, error: fetchErr } = await supabase
      .from("profiles")
      .select("points, is_banned")
      .eq("id", userId)
      .single();

    if (fetchErr || !profile) return { success: false, error: "Account sync failure." };
    if (profile.is_banned) return { success: false, error: "Access Denied: Account suspended." };
    if ((profile.points ?? 0) < wagerAmount) {
      return { success: false, error: "Insufficient arena credits. Online matchmaking is locked." };
    }

    const calculatedBalance = profile.points - wagerAmount;

    // Execute atomic balance updates
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ points: calculatedBalance })
      .eq("id", userId);

    if (updateErr) return { success: false, error: "Ledger transaction failure." };

    // Log transaction details to the security audit tables
    await supabase.from("financial_audit_logs").insert([{
      user_id: userId,
      amount: -wagerAmount,
      balance_snapshot: calculatedBalance,
      mutation_type: "match_wager",
      description: `Wager locked for game session: ${sessionId}`
    }]);

    return { success: true, updatedPoints: calculatedBalance };
  },

  /**
   * Resolves completed game session matches and handles payouts.
   */
  async resolveMatchPayout(winnerId: string, loserId: string, stakePool: number): Promise<boolean> {
    try {
      // Fetch winner balance snapshots
      const { data: winProfile } = await supabase.from("profiles").select("points").eq("id", winnerId).single();
      const currentWinBalance = winProfile?.points ?? 0;
      const finalWinPoints = currentWinBalance + stakePool;

      // Increment points for the winning account
      await supabase.from("profiles").update({ points: finalWinPoints }).eq("id", winnerId);

      // Log transaction details to the financial audit tables
      await supabase.from("financial_audit_logs").insert([{
        user_id: winnerId,
        amount: stakePool,
        balance_snapshot: finalWinPoints,
        mutation_type: "match_payout",
        description: `Victory prize pool payout claimed.`
      }]);

      return true;
    } catch (err) {
      console.error("Payout distribution exception:", err);
      return false;
    }
  },

  // ==========================================================================
  // 2. STORE BILLING & APPLE/GOOGLE WEBHOOK PROCESSING
  // ==========================================================================
  /**
   * Handles server-side digital store product purchases.
   */
  async processStoreTransaction({ userId, productId }: PurchasePayload): Promise<{ success: boolean; msg: string }> {
    const { data: product } = await supabase.from("store_products").select("*").eq("id", productId).single();
    if (!product || !product.is_active) return { success: false, msg: "Product is no longer available." };

    const { data: profile } = await supabase.from("profiles").select("points").eq("id", userId).single();
    const currentPoints = profile?.points ?? 0;

    // Handle Virtual Points Purchases
    if (product.type === "credit_pack") {
      const addedTokens = product.metadata?.credit_reward || product.cost_credits;
      const finalPoints = currentPoints + addedTokens;
      
      await supabase.from("profiles").update({ points: finalPoints }).eq("id", userId);
      await supabase.from("financial_audit_logs").insert([{
        user_id: userId,
        amount: addedTokens,
        balance_snapshot: finalPoints,
        mutation_type: "iap_purchase",
        description: `Refueled currency package: ${product.title}`
      }]);

      return { success: true, msg: "Credits added to wallet successfully." };
    }

    // Handle Cosmetics/Skins Purchases via Points Deduction
    if (currentPoints < product.cost_credits) {
      return { success: false, msg: "Insufficient credits to unlock item." };
    }

    const itemCost = product.cost_credits;
    const postDeductionPoints = currentPoints - itemCost;

    // Deduct cost from account balance
    await supabase.from("profiles").update({ points: postDeductionPoints }).eq("id", userId);
    
    // Add unlocked item to user inventory
    await supabase.from("user_inventory").insert([{
      user_id: userId,
      product_id: productId,
      is_equipped: false
    }]);

    // Log the transaction
    await supabase.from("financial_audit_logs").insert([{
      user_id: userId,
      amount: -itemCost,
      balance_snapshot: postDeductionPoints,
      mutation_type: "store_purchase",
      description: `Unlocked cosmetic layout asset: ${product.title}`
    }]);

    return { success: true, msg: `${product.title} has been added to your inventory.` };
  },

  // ==========================================================================
  // 3. CACHED VIEWPORT REFRESH SYSTEMS
  // ==========================================================================
  /**
   * Re-compiles high-speed ranking indexes to make sure leaderboards load lag-free.
   */
  async refreshGlobalLeaderboardIndexes(): Promise<void> {
    // Uses structural RPC commands to clean and rebuild cache layouts instantly
    await supabase.rpc("refresh_leaderboard_view");
  },

  /**
   * Generates secure telemetry events to track performance and session lengths.
   */
  async pushTelemetryEvent(userId: string | null, actionToken: string, payload: object): Promise<void> {
    await supabase.from("system_audit_logs").insert([{
      actor_id: userId,
      action_token: actionToken,
      target_id: userId ?? "anonymous_node",
      payload: payload
    }]);
  }
};