// @ts-nocheck -- Supabase Edge Functions compile in Deno, not the app's Node
// TypeScript program. Google Play verification and Gem fulfillment are server
// authoritative; the mobile client never submits a Gem amount.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const DEFAULT_PACKAGE_NAME = "com.joeyoke.app";
const ACCOUNT_BINDING_PREFIX = "joeyoke:google-play:v1:";

const base64Url = (value: Uint8Array | string) => {
  const text = typeof value === "string" ? value : String.fromCharCode(...value);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const pemToBytes = (pem: string) => Uint8Array.from(
  atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")),
  (character) => character.charCodeAt(0),
);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

async function getGoogleAccessToken() {
  const rawCredentials = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") || "";
  if (!rawCredentials) throw new Error("Google Play verification is not configured on the server");
  let credentials: { client_email?: string; private_key?: string };
  try {
    credentials = JSON.parse(rawCredentials);
  } catch {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is invalid");
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Google Play service account credentials are incomplete");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: GOOGLE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 300,
  }));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(credentials.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("Could not authenticate with the Google Play Developer API");
  const token = await response.json() as { access_token?: string };
  if (!token.access_token) throw new Error("Google did not return an access token");
  return token.access_token;
}

type GoogleProductPurchase = {
  productId?: string;
  purchaseState?: number;
  consumptionState?: number;
  orderId?: string;
  purchaseType?: number;
  obfuscatedExternalAccountId?: string;
};

async function fetchGooglePurchase(accessToken: string, packageName: string, productId: string, purchaseToken: string) {
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    console.warn("Google Play purchase lookup rejected", { status: response.status, productId });
    throw new Error("Google Play could not verify this purchase");
  }
  return await response.json() as GoogleProductPurchase;
}

async function consumeGooglePurchase(accessToken: string, packageName: string, productId: string, purchaseToken: string) {
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    console.error("Google Play consume failed after verified Gem credit", { status: response.status, productId });
    throw new Error("Your Gems were credited, but Google Play consumption is pending. Reopen the Store to retry safely.");
  }
  console.info("Google Play consumable purchase consumed", { productId });
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorization = request.headers.get("Authorization") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase function configuration is incomplete");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Authentication required");

    const input = await request.json() as { productId?: string; purchaseToken?: string };
    const productId = String(input.productId || "").trim();
    const purchaseToken = String(input.purchaseToken || "").trim();
    if (!/^[a-z0-9_]{3,200}$/i.test(productId) || purchaseToken.length < 12 || purchaseToken.length > 4096) {
      throw new Error("Valid Google Play purchase evidence is required");
    }

    const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") || DEFAULT_PACKAGE_NAME;
    if (packageName !== DEFAULT_PACKAGE_NAME) throw new Error("Google Play package configuration is invalid");
    const accessToken = await getGoogleAccessToken();
    const purchase = await fetchGooglePurchase(accessToken, packageName, productId, purchaseToken);
    // The purchase lookup URL already binds this token to `productId`. Google
    // documents `ProductPurchase.productId` as optional, so do not reject a
    // valid lookup merely because that response field was omitted. A returned
    // non-empty value that differs is still a hard security failure.
    const verifiedProductId = String(purchase.productId || "").trim();
    if (verifiedProductId && verifiedProductId !== productId) {
      console.warn("Google Play product identity mismatch", {
        requestedProductId: productId,
        verifiedProductId,
      });
      throw new Error("Google Play product identity did not match this request");
    }
    if (!verifiedProductId) {
      console.info("Google Play purchase response omitted productId; accepting the verified lookup path", {
        requestedProductId: productId,
      });
    }
    // Google Play's products endpoint only returns PURCHASED as 0. Pending (2)
    // and every other state are intentionally never sent to the credit RPC.
    if (purchase.purchaseState !== 0) {
      if (purchase.purchaseState === 2) throw new Error("Google Play is still confirming this purchase");
      throw new Error("Google Play did not confirm this purchase");
    }

    const expectedAccountBinding = await sha256(`${ACCOUNT_BINDING_PREFIX}${user.id}`);
    if (!purchase.obfuscatedExternalAccountId || purchase.obfuscatedExternalAccountId !== expectedAccountBinding) {
      throw new Error("This Google Play purchase is bound to a different Joe Yoke account");
    }

    const tokenHash = await sha256(purchaseToken);
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: creditRows, error: creditError } = await serviceClient.rpc("credit_verified_gem_purchase", {
      p_user_id: user.id,
      p_platform: "google",
      p_store_product_id: productId,
      // Never store a replayable Google purchase token in the ledger.
      p_store_transaction_id: `google-token:${tokenHash}`,
      p_purchase_token_hash: tokenHash,
      p_original_transaction_id: purchase.orderId || null,
      p_environment: purchase.purchaseType === 0 ? "test" : "production",
      p_verifier_reference: "google-play-developer-api:v3",
    });
    if (creditError) throw creditError;
    const credit = Array.isArray(creditRows) ? creditRows[0] : creditRows;
    if (!credit) throw new Error("Verified Gem credit did not return a result");

    // A credited but unconsumed token is safe to retry: the ledger makes the
    // credit idempotent and this call frees a consumable for repeat purchase.
    let consumptionPending = false;
    if (purchase.consumptionState !== 1) {
      try {
        await consumeGooglePurchase(accessToken, packageName, productId, purchaseToken);
      } catch (consumeError) {
        // The verified ledger entry makes the next recovery attempt safe: it
        // will not credit again, but it will retry consumption. Do not tell a
        // charged player their otherwise successful Gem grant was lost.
        consumptionPending = true;
        console.error("Google Play consumption is pending after Gem credit", {
          productId,
          message: consumeError instanceof Error ? consumeError.message : "unknown error",
        });
      }
    } else {
      console.info("Google Play token was already consumed", { productId });
    }

    return new Response(JSON.stringify({
      alreadyCredited: Boolean(credit.already_credited),
      gemsCredited: Number(credit.gems_credited || 0),
      newGemsBalance: Number(credit.new_gems_balance || 0),
      consumed: !consumptionPending,
      consumptionPending,
    }), { headers: corsHeaders });
  } catch (error) {
    console.error("verify-google-play-purchase failed", error instanceof Error ? error.message : "unknown error");
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Google Play purchase verification failed" }), { status: 400, headers: corsHeaders });
  }
});
