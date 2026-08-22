package com.joeyoke.app;

import android.app.Activity;
import android.util.Log;

import androidx.annotation.NonNull;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Thin Capacitor bridge over the official Google Play Billing client.
 *
 * This bridge deliberately never acknowledges, consumes, or credits a purchase.
 * The web layer sends a PURCHASED token to the authenticated Edge Function, which
 * verifies it with Google, atomically credits Gems, then consumes it server-side.
 */
@CapacitorPlugin(name = "GooglePlayBilling")
public class GooglePlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String TAG = "JoeYokeBilling";

    private BillingClient billingClient;
    private boolean connecting = false;
    private final List<Runnable> readyActions = new ArrayList<>();
    private final Map<String, ProductDetails> productDetailsById = new HashMap<>();
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                com.android.billingclient.api.PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .build()
            )
            .build();
        Log.i(TAG, "Google Play Billing bridge initialized");
    }

    private void withBillingClient(Runnable action, PluginCall errorCall) {
        if (billingClient != null && billingClient.isReady()) {
            action.run();
            return;
        }
        readyActions.add(action);
        if (connecting) return;
        connecting = true;
        Log.i(TAG, "Connecting to Google Play Billing");
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                connecting = false;
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    Log.w(TAG, "Billing connection failed: " + result.getDebugMessage());
                    readyActions.clear();
                    if (errorCall != null) errorCall.reject("Google Play Billing is unavailable: " + result.getDebugMessage());
                    return;
                }
                Log.i(TAG, "Google Play Billing connected");
                List<Runnable> actions = new ArrayList<>(readyActions);
                readyActions.clear();
                for (Runnable readyAction : actions) readyAction.run();
            }

            @Override
            public void onBillingServiceDisconnected() {
                Log.w(TAG, "Google Play Billing disconnected; it will reconnect on the next request");
            }
        });
    }

    private List<String> readProductIds(PluginCall call) {
        JSArray values = call.getArray("productIds", new JSArray());
        List<String> productIds = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            String productId = values.optString(index, "").trim();
            if (!productId.isEmpty()) productIds.add(productId);
        }
        return productIds;
    }

    private QueryProductDetailsParams buildProductQuery(List<String> productIds) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String productId : productIds) {
            products.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build());
        }
        return QueryProductDetailsParams.newBuilder().setProductList(products).build();
    }

    private JSObject serializeProduct(ProductDetails product) {
        JSObject result = new JSObject();
        result.put("id", product.getProductId());
        result.put("displayName", product.getName());
        result.put("description", product.getDescription());
        ProductDetails.OneTimePurchaseOfferDetails offer = product.getOneTimePurchaseOfferDetails();
        result.put("displayPrice", offer == null ? "" : offer.getFormattedPrice());
        return result;
    }

    private JSObject serializePurchase(Purchase purchase) {
        JSObject result = new JSObject();
        List<String> productIds = purchase.getProducts();
        result.put("productId", productIds.isEmpty() ? "" : productIds.get(0));
        result.put("purchaseToken", purchase.getPurchaseToken());
        result.put("orderId", purchase.getOrderId());
        result.put("purchaseTime", purchase.getPurchaseTime());
        result.put("purchaseState", purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased" : "pending");
        result.put("acknowledged", purchase.isAcknowledged());
        return result;
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        List<String> productIds = readProductIds(call);
        if (productIds.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("products", new JSArray());
            empty.put("missingProductIds", new JSArray());
            call.resolve(empty);
            return;
        }
        withBillingClient(() -> {
            Log.i(TAG, "Requesting Google Play product details: " + productIds);
            billingClient.queryProductDetailsAsync(buildProductQuery(productIds), (result, queryResult) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    Log.w(TAG, "Product query failed: " + result.getDebugMessage());
                    call.reject("Google Play could not load products: " + result.getDebugMessage());
                    return;
                }
                productDetailsById.clear();
                JSArray products = new JSArray();
                Set<String> returnedIds = new HashSet<>();
                for (ProductDetails product : queryResult.getProductDetailsList()) {
                    productDetailsById.put(product.getProductId(), product);
                    returnedIds.add(product.getProductId());
                    products.put(serializeProduct(product));
                }
                JSArray missingProductIds = new JSArray();
                for (String productId : productIds) {
                    if (!returnedIds.contains(productId)) missingProductIds.put(productId);
                }
                JSObject payload = new JSObject();
                payload.put("products", products);
                payload.put("missingProductIds", missingProductIds);
                Log.i(TAG, "Google Play returned " + products.length() + " product details");
                call.resolve(payload);
            });
        }, call);
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId", "").trim();
        String obfuscatedAccountId = call.getString("obfuscatedAccountId", "").trim();
        if (productId.isEmpty() || obfuscatedAccountId.isEmpty()) {
            call.reject("A Google Play product ID and account binding are required");
            return;
        }
        if (pendingPurchaseCall != null) {
            call.reject("Another Google Play purchase is already in progress");
            return;
        }
        withBillingClient(() -> {
            // ProductDetails are intentionally reloaded immediately before the
            // flow. Google advises against long-lived ProductDetails caching.
            billingClient.queryProductDetailsAsync(buildProductQuery(Collections.singletonList(productId)), (result, queryResult) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || queryResult.getProductDetailsList().isEmpty()) {
                    call.reject("This Gem pack is unavailable in Google Play right now");
                    return;
                }
                ProductDetails product = queryResult.getProductDetailsList().get(0);
                ProductDetails.OneTimePurchaseOfferDetails offer = product.getOneTimePurchaseOfferDetails();
                if (offer == null || offer.getOfferToken().isEmpty()) {
                    call.reject("Google Play did not return a purchasable offer for this Gem pack");
                    return;
                }
                BillingFlowParams.ProductDetailsParams detailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(product)
                    .setOfferToken(offer.getOfferToken())
                    .build();
                BillingFlowParams params = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(detailsParams))
                    .setObfuscatedAccountId(obfuscatedAccountId)
                    .build();
                Activity activity = getActivity();
                if (activity == null) {
                    call.reject("Google Play checkout needs an active app screen");
                    return;
                }
                pendingPurchaseCall = call;
                Log.i(TAG, "Launching Google Play checkout for " + productId);
                BillingResult flowResult = billingClient.launchBillingFlow(activity, params);
                if (flowResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    pendingPurchaseCall = null;
                    call.reject("Google Play could not start checkout: " + flowResult.getDebugMessage());
                }
            });
        }, call);
    }

    @PluginMethod
    public void getOutstandingPurchases(PluginCall call) {
        withBillingClient(() -> billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Google Play could not recover purchases: " + result.getDebugMessage());
                    return;
                }
                JSArray serialized = new JSArray();
                for (Purchase purchase : purchases) serialized.put(serializePurchase(purchase));
                JSObject payload = new JSObject();
                payload.put("purchases", serialized);
                Log.i(TAG, "Recovered " + serialized.length() + " outstanding Google Play purchases");
                call.resolve(payload);
            }
        ), call);
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;
        if (call == null) {
            Log.w(TAG, "Received a Google Play purchase update without an active checkout; recovery will handle it");
            return;
        }
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            Log.i(TAG, "Google Play checkout cancelled");
            JSObject payload = new JSObject();
            payload.put("status", "cancelled");
            call.resolve(payload);
            return;
        }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            Log.w(TAG, "Google Play purchase failed: " + result.getDebugMessage());
            call.reject("Google Play purchase failed: " + result.getDebugMessage());
            return;
        }
        Purchase purchase = purchases.get(0);
        JSObject payload = new JSObject();
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            Log.i(TAG, "Google Play purchase is pending");
            payload.put("status", "pending");
            payload.put("purchase", serializePurchase(purchase));
            call.resolve(payload);
            return;
        }
        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
            call.reject("Google Play returned an unsupported purchase state");
            return;
        }
        Log.i(TAG, "Google Play PURCHASED update received; awaiting server verification");
        payload.put("status", "success");
        payload.put("purchase", serializePurchase(purchase));
        call.resolve(payload);
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) billingClient.endConnection();
        super.handleOnDestroy();
    }
}
