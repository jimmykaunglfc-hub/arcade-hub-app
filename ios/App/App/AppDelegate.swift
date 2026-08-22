import UIKit
import Capacitor
import AVFoundation
import StoreKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private func activateGameAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            NSLog("Joe Yoke audio session setup failed: %@", error.localizedDescription)
        }
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Game effects are Web Audio clips played inside Capacitor's WKWebView.
        // Explicit playback keeps them audible on iPhone even when the hardware
        // silent switch is enabled, while mixing with any existing audio.
        activateGameAudioSession()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Camera, phone-call and interruption flows can deactivate the media
        // session, so make game effects available again when the app returns.
        activateGameAudioSession()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // Forward APNs registration and incoming messages to the Firebase
    // Messaging Capacitor plugin. The plugin converts the APNs token into the
    // FCM token that the Joe Yoke backend stores for this signed-in player.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        NotificationCenter.default.post(
            name: Notification.Name("didReceiveRemoteNotification"),
            object: completionHandler,
            userInfo: userInfo
        )
    }

}

// StoreKit 2 bridge for the existing Capacitor application. This is kept in
// the app target (rather than a third-party IAP plugin) so it tracks the
// installed Capacitor 8 native APIs and keeps storefront transaction evidence
// entirely native until it is sent to the verified server endpoint.
@objc(AppleStoreKitPlugin)
public class AppleStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleStoreKitPlugin"
    public let jsName = "AppleStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUnfinishedTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
    ]

    private var pendingTransactions: [UInt64: Transaction] = [:]

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds", String.self), !productIds.isEmpty else {
            call.reject("At least one Apple product ID is required.")
            return
        }

        Task { @MainActor in
            do {
                let products = try await Product.products(for: productIds)
                let foundIds = Set(products.map(\.id))
                call.resolve([
                    "products": products.map { product in
                        [
                            "id": product.id,
                            "displayName": product.displayName,
                            "description": product.description,
                            "displayPrice": product.displayPrice,
                            "type": product.type.rawValue,
                        ]
                    },
                    "missingProductIds": productIds.filter { !foundIds.contains($0) },
                ])
            } catch {
                call.reject("Unable to load App Store products: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty,
              let accountTokenText = call.getString("appAccountToken"),
              let accountToken = UUID(uuidString: accountTokenText) else {
            call.reject("A valid product ID and signed-in account token are required.")
            return
        }

        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("This App Store product is unavailable.")
                    return
                }
                guard product.type == .consumable else {
                    call.reject("Only consumable Gem packs can be purchased here.")
                    return
                }

                switch try await product.purchase(options: [.appAccountToken(accountToken)]) {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        pendingTransactions[transaction.id] = transaction
                        call.resolve([
                            "status": "success",
                            "transaction": transactionPayload(
                                transaction,
                                signedTransaction: verification.jwsRepresentation
                            ),
                        ])
                    case .unverified:
                        call.resolve(["status": "unverified"])
                    }
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.reject("Apple returned an unsupported purchase result.")
                }
            } catch {
                call.reject("Apple purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func getUnfinishedTransactions(_ call: CAPPluginCall) {
        Task { @MainActor in
            var transactions = [[String: Any]]()
            for await verification in Transaction.unfinished {
                switch verification {
                case .verified(let transaction):
                    pendingTransactions[transaction.id] = transaction
                    transactions.append(transactionPayload(
                        transaction,
                        signedTransaction: verification.jwsRepresentation
                    ))
                case .unverified:
                    // Unverified transactions must remain unfinished. StoreKit
                    // will provide a later opportunity to verify them safely.
                    continue
                }
            }
            call.resolve(["transactions": transactions])
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let transactionIdText = call.getString("transactionId"),
              let transactionId = UInt64(transactionIdText) else {
            call.reject("A valid Apple transaction ID is required.")
            return
        }

        Task { @MainActor in
            if let transaction = pendingTransactions[transactionId] {
                await transaction.finish()
                pendingTransactions.removeValue(forKey: transactionId)
                call.resolve()
                return
            }

            // Recovery can run after a plugin reload, so look in StoreKit's
            // unfinished sequence before reporting that it was already settled.
            for await verification in Transaction.unfinished {
                if case .verified(let transaction) = verification, transaction.id == transactionId {
                    await transaction.finish()
                    call.resolve()
                    return
                }
            }
            call.resolve()
        }
    }

    private func transactionPayload(
        _ transaction: Transaction,
        signedTransaction: String
    ) -> [String: Any] {
        let environment: String
        if #available(iOS 16.0, *) {
            environment = transaction.environment.rawValue.lowercased()
        } else {
            // StoreKit 2 transactions from a TestFlight/App Store build are
            // verified by the server against production first, then sandbox.
            // The server therefore remains authoritative on iOS 15 too.
            environment = "unknown"
        }

        return [
            "productId": transaction.productID,
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "environment": environment,
            "signedTransaction": signedTransaction,
        ]
    }
}
