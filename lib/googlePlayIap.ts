import { Capacitor, registerPlugin } from "@capacitor/core";

export type GooglePlayProduct = {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
};

export type GooglePlayPurchaseEvidence = {
  productId: string;
  purchaseToken: string;
  orderId?: string | null;
  purchaseTime: number;
  purchaseState: "purchased" | "pending";
  acknowledged: boolean;
};

type GooglePlayBillingPlugin = {
  getProducts(options: { productIds: string[] }): Promise<{
    products: GooglePlayProduct[];
    missingProductIds: string[];
  }>;
  purchase(options: {
    productId: string;
    obfuscatedAccountId: string;
  }): Promise<
    | { status: "success"; purchase: GooglePlayPurchaseEvidence }
    | { status: "cancelled" }
    | { status: "pending"; purchase?: GooglePlayPurchaseEvidence }
  >;
  getOutstandingPurchases(): Promise<{ purchases: GooglePlayPurchaseEvidence[] }>;
};

const GooglePlayBilling = registerPlugin<GooglePlayBillingPlugin>("GooglePlayBilling");

export const isNativeGooglePlayBillingAvailable = () =>
  typeof window !== "undefined" &&
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "android";

export async function loadGooglePlayProducts(productIds: string[]) {
  if (!isNativeGooglePlayBillingAvailable() || productIds.length === 0) {
    return { products: [] as GooglePlayProduct[], missingProductIds: [] as string[] };
  }
  return GooglePlayBilling.getProducts({ productIds });
}

// Google recommends an opaque account identifier rather than the raw user ID.
// This stable SHA-256 value is also recomputed by the verifier as a second
// consistency check; Supabase Auth remains the authoritative identity.
export async function createGooglePlayAccountBinding(userId: string) {
  const bytes = new TextEncoder().encode(`joeyoke:google-play:v1:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function purchaseGooglePlayProduct(productId: string, userId: string) {
  if (!isNativeGooglePlayBillingAvailable()) {
    throw new Error("Google Play purchases are only available in the Android app.");
  }
  return GooglePlayBilling.purchase({
    productId,
    obfuscatedAccountId: await createGooglePlayAccountBinding(userId),
  });
}

export async function recoverOutstandingGooglePlayPurchases() {
  if (!isNativeGooglePlayBillingAvailable()) return [] as GooglePlayPurchaseEvidence[];
  const { purchases } = await GooglePlayBilling.getOutstandingPurchases();
  return purchases;
}
