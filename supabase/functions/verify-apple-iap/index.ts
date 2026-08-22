// @ts-nocheck -- Supabase Edge Functions compile in Deno, not the app's Node
// TypeScript program. This matches the project's existing Edge Function setup.
// Apple IAP fulfillment is deliberately server-authoritative. The native app
// submits only an Apple transaction ID; this function retrieves the signed
// transaction from Apple's App Store Server API, validates the application and
// player binding, then calls the existing atomic credit RPC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type AppleTransactionPayload = {
  transactionId?: string | number;
  originalTransactionId?: string | number;
  productId?: string;
  bundleId?: string;
  environment?: string;
  appAccountToken?: string;
  type?: string;
  revocationDate?: number;
};

const base64Url = (value: Uint8Array | string) => {
  const text = typeof value === "string" ? value : String.fromCharCode(...value);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const pemToBytes = (pem: string) =>
  Uint8Array.from(
    atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")),
    (character) => character.charCodeAt(0),
  );

const decodeJwsPayload = (jws: string): AppleTransactionPayload => {
  const segments = jws.split(".");
  if (segments.length !== 3) throw new Error("Apple returned malformed transaction data");
  const normalized = segments[1].replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))));
};

async function createAppleServerApiToken() {
  const issuer = Deno.env.get("APPLE_IAP_ISSUER_ID") || "";
  const keyId = Deno.env.get("APPLE_IAP_KEY_ID") || "";
  const bundleId = Deno.env.get("APPLE_IAP_BUNDLE_ID") || "";
  const privateKey = (Deno.env.get("APPLE_IAP_PRIVATE_KEY") || "").replaceAll("\\n", "\n");
  if (!issuer || !keyId || !bundleId || !privateKey) {
    throw new Error("Apple IAP verification is not configured on the server");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: issuer,
    iat: now,
    exp: now + 300,
    aud: "appstoreconnect-v1",
    bid: bundleId,
  }));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return { token: `${signingInput}.${base64Url(new Uint8Array(signature))}`, bundleId };
}

async function fetchAppleTransaction(transactionId: string, token: string) {
  const endpoints = [
    ["production", "https://api.storekit.itunes.apple.com/inApps/v1/transactions"],
    ["sandbox", "https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions"],
  ] as const;

  let lastError = "";
  for (const [environment, baseUrl] of endpoints) {
    const response = await fetch(`${baseUrl}/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const body = await response.json() as { signedTransactionInfo?: string };
      if (!body.signedTransactionInfo) throw new Error("Apple did not return signed transaction information");
      return { environment, signedTransaction: body.signedTransactionInfo };
    }
    lastError = `${response.status}: ${await response.text()}`;
    // A sandbox purchase is not present in production. Other errors should
    // not be hidden by blindly retrying in another environment.
    if (response.status !== 404) break;
  }
  throw new Error(`Apple could not verify this transaction (${lastError || "not found"})`);
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorization = request.headers.get("Authorization") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase function configuration is incomplete");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Authentication required");

    const input = await request.json() as { transactionId?: string };
    const transactionId = String(input.transactionId || "").trim();
    if (!/^\d{6,}$/.test(transactionId)) throw new Error("A valid Apple transaction ID is required");

    const { token, bundleId } = await createAppleServerApiToken();
    const apple = await fetchAppleTransaction(transactionId, token);
    const transaction = decodeJwsPayload(apple.signedTransaction);
    const verifiedTransactionId = String(transaction.transactionId || "");
    const productId = String(transaction.productId || "").trim();
    const appAccountToken = String(transaction.appAccountToken || "").toLowerCase();
    const environment = String(transaction.environment || apple.environment).toLowerCase();

    if (verifiedTransactionId !== transactionId) throw new Error("Apple transaction identity did not match the request");
    if (!productId) throw new Error("Apple transaction did not include a product ID");
    if (transaction.bundleId !== bundleId) throw new Error("This transaction belongs to another application");
    if (appAccountToken !== user.id.toLowerCase()) throw new Error("This transaction is not bound to the signed-in Joe Yoke account");
    if (transaction.revocationDate) throw new Error("This Apple transaction has been revoked");
    if (transaction.type && transaction.type.toLowerCase() !== "consumable") {
      throw new Error("Only consumable Gem transactions are accepted");
    }
    if (!["sandbox", "production"].includes(environment)) throw new Error("Apple returned an unsupported purchase environment");

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: creditRows, error: creditError } = await serviceClient.rpc("credit_verified_gem_purchase", {
      p_user_id: user.id,
      p_platform: "apple",
      p_store_product_id: productId,
      p_store_transaction_id: verifiedTransactionId,
      p_original_transaction_id: transaction.originalTransactionId ? String(transaction.originalTransactionId) : null,
      p_environment: environment,
      p_verifier_reference: `apple-server-api:${environment}`,
    });
    if (creditError) throw creditError;
    const credit = Array.isArray(creditRows) ? creditRows[0] : creditRows;
    if (!credit) throw new Error("Verified Gem credit did not return a result");

    return new Response(JSON.stringify({
      alreadyCredited: Boolean(credit.already_credited),
      gemsCredited: Number(credit.gems_credited || 0),
      newGemsBalance: Number(credit.new_gems_balance || 0),
    }), { headers: corsHeaders });
  } catch (error) {
    console.error("verify-apple-iap failed", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Apple purchase verification failed" }),
      { status: 400, headers: corsHeaders },
    );
  }
});
