import { Capacitor, registerPlugin } from "@capacitor/core";

export type AppleStoreProduct = {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
  type: string;
};

export type AppleTransactionEvidence = {
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  environment: "sandbox" | "production";
  signedTransaction: string;
};

type AppleStoreKitPlugin = {
  getProducts(options: { productIds: string[] }): Promise<{
    products: AppleStoreProduct[];
    missingProductIds: string[];
  }>;
  purchase(options: {
    productId: string;
    appAccountToken: string;
  }): Promise<
    | { status: "success"; transaction: AppleTransactionEvidence }
    | { status: "cancelled" | "pending" | "unverified" }
  >;
  getUnfinishedTransactions(): Promise<{
    transactions: AppleTransactionEvidence[];
  }>;
  finishTransaction(options: { transactionId: string }): Promise<void>;
};

const AppleStoreKit = registerPlugin<AppleStoreKitPlugin>("AppleStoreKit");

export const isNativeAppleStoreKitAvailable = () =>
  typeof window !== "undefined" &&
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios";

export async function loadAppleStoreProducts(productIds: string[]) {
  if (!isNativeAppleStoreKitAvailable() || productIds.length === 0) {
    return { products: [] as AppleStoreProduct[], missingProductIds: [] as string[] };
  }
  return AppleStoreKit.getProducts({ productIds });
}

export async function purchaseAppleProduct(productId: string, appAccountToken: string) {
  if (!isNativeAppleStoreKitAvailable()) {
    throw new Error("Apple purchases are only available in the iOS app.");
  }
  return AppleStoreKit.purchase({ productId, appAccountToken });
}

export async function recoverUnfinishedAppleTransactions() {
  if (!isNativeAppleStoreKitAvailable()) return [] as AppleTransactionEvidence[];
  const { transactions } = await AppleStoreKit.getUnfinishedTransactions();
  return transactions;
}

export async function finishAppleTransaction(transactionId: string) {
  if (!isNativeAppleStoreKitAvailable()) return;
  await AppleStoreKit.finishTransaction({ transactionId });
}
