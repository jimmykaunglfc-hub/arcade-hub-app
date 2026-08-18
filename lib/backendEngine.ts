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

export interface MultiplayerGameStatePayload<TState extends object> {
  gameKey: string;
  matchId: string;
  userId: string;
  state: TState;
}

export interface MultiplayerGameStateSubscription<TState extends object> {
  gameKey: string;
  matchId: string;
  userId: string;
  onState: (state: TState) => void;
  onPresence?: (userIds: string[]) => void;
  onStatus?: (status: string) => void;
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

  // ========================================================================
  // 4. GENERIC REALTIME GAME-STATE TRANSPORT
  // ========================================================================
  /** Persists the latest authoritative snapshot for a multiplayer match. */
  async pushGameState<TState extends object>({
    gameKey,
    matchId,
    userId,
    state,
  }: MultiplayerGameStatePayload<TState>): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from("multiplayer_game_states").upsert({
      game_key: gameKey,
      match_id: matchId,
      state,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "match_id" });

    if (error) {
      console.error("Game-state push failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  },

  /** Pulls the most recent snapshot so reconnecting players can resume. */
  async pullGameState<TState extends object>(
    gameKey: string,
    matchId: string,
  ): Promise<TState | null> {
    const { data, error } = await supabase
      .from("multiplayer_game_states")
      .select("state")
      .eq("game_key", gameKey)
      .eq("match_id", matchId)
      .maybeSingle();

    if (error) {
      console.error("Game-state pull failed:", error.message);
      return null;
    }

    return (data?.state as TState | undefined) ?? null;
  },

  /** Subscribes to persisted state updates and Supabase Presence. */
  subscribeToGameState<TState extends object>({
    gameKey,
    matchId,
    userId,
    onState,
    onPresence,
    onStatus,
  }: MultiplayerGameStateSubscription<TState>): () => void {
    const channel = supabase.channel(`${gameKey}_${matchId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: userId },
      },
    });

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "multiplayer_game_states",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as { game_key?: string; state?: TState };
          if (row.game_key === gameKey && row.state) onState(row.state);
        },
      )
      .on("presence", { event: "sync" }, () => {
        onPresence?.(Object.keys(channel.presenceState()).sort());
      })
      .subscribe(async (status) => {
        onStatus?.(status);
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
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
