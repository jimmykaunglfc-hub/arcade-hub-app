// @ts-nocheck
// This file is compiled by Supabase's Deno edge runtime, not Next.js. The
// workspace TypeScript compiler does not resolve remote Deno imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

type BroadcastInput = {
  title?: string;
  message?: string;
  audience?: "all" | "ranked" | "vip";
  category?: "general" | "system" | "promotion";
  actionUrl?: string;
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

async function getGoogleAccessToken(serviceAccount: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth failed: ${await response.text()}`);
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error("Google OAuth did not return an access token");
  return body.access_token;
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorization = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Authentication required");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: caller, error: callerError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (callerError || !["admin", "super_admin"].includes(caller?.role)) {
      return new Response(JSON.stringify({ error: "Administrator access required" }), { status: 403, headers: corsHeaders });
    }

    const input = await request.json() as BroadcastInput;
    const title = input.title?.trim() || "";
    const message = input.message?.trim() || "";
    const audience = input.audience || "all";
    const category = input.category || "general";
    const actionUrl = input.actionUrl?.trim() || null;
    if (!title || !message || title.length > 120 || message.length > 1000) throw new Error("Invalid notification content");
    if (!["all", "ranked", "vip"].includes(audience) || !["general", "system", "promotion"].includes(category)) {
      throw new Error("Invalid broadcast targeting");
    }

    const credentialsText = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!credentialsText) throw new Error("Firebase delivery is not configured");
    const serviceAccount = JSON.parse(credentialsText) as ServiceAccount;
    if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
      throw new Error("Firebase service-account secret is incomplete");
    }

    const { data: devices, error: deviceError } = await adminClient
      .from("push_device_tokens")
      .select("id, token, user_id, profiles!inner(xp, gems)")
      .eq("platform", "android")
      .eq("enabled", true);
    if (deviceError) throw deviceError;
    const filteredDevices = (devices || []).filter((device: { profiles: { xp?: number; gems?: number } }) =>
      audience === "all" ||
      (audience === "ranked" && Number(device.profiles?.xp || 0) > 0) ||
      (audience === "vip" && Number(device.profiles?.gems || 0) > 0),
    );

    const { data: broadcast, error: broadcastError } = await adminClient
      .from("push_broadcasts")
      .insert({ title, message, audience, category, action_url: actionUrl, recipients_count: filteredDevices.length, status: "sending" })
      .select("id")
      .single();
    if (broadcastError) throw broadcastError;

    const accessToken = await getGoogleAccessToken(serviceAccount);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
    let delivered = 0;
    const invalidTokenIds: string[] = [];

    for (let index = 0; index < filteredDevices.length; index += 20) {
      const batch = filteredDevices.slice(index, index + 20);
      const results = await Promise.all(batch.map(async (device: { id: string; token: string }) => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title, body: message },
              data: { action_url: actionUrl || "", broadcast_id: broadcast.id },
              android: {
                priority: "high",
                notification: { channel_id: "joe_yoke_updates", sound: "default" },
              },
            },
          }),
        });
        if (response.ok) return { ok: true, id: device.id };
        const errorText = await response.text();
        if (/UNREGISTERED|INVALID_ARGUMENT/.test(errorText)) invalidTokenIds.push(device.id);
        console.error("FCM delivery failed", response.status, errorText);
        return { ok: false, id: device.id };
      }));
      delivered += results.filter((result) => result.ok).length;
    }

    if (invalidTokenIds.length) {
      await adminClient.from("push_device_tokens").update({ enabled: false, updated_at: new Date().toISOString() }).in("id", invalidTokenIds);
    }
    await adminClient.from("push_broadcasts").update({ recipients_count: delivered, status: "delivered" }).eq("id", broadcast.id);
    return new Response(JSON.stringify({ broadcastId: broadcast.id, delivered, invalidTokens: invalidTokenIds.length }), { headers: corsHeaders });
  } catch (error) {
    console.error("send-push-broadcast failed", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Push delivery failed" }), { status: 400, headers: corsHeaders });
  }
});
