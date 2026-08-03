# Joe Yoke: audio, native purchases, and push setup

## Sound library

The app now remembers the Profile **Sound Effects** setting and uses it for UI, game effects, and ambient music. Browser policy requires a player’s first tap before background audio can begin.

1. Obtain music and SFX with a commercial, perpetual mobile/web licence (including social sharing and advertising rights). Do not download audio from streaming platforms or games.
2. Export music as loop-safe `.mp3` or `.ogg` (128–192 kbps) and effects as short `.ogg` or `.mp3` files. Keep each effect under 100 KB where possible.
3. Add the approved files under `public/audio/`, for example `public/audio/app-ambient.mp3`, `public/audio/chess-loop.mp3`, and `public/audio/carrom-strike.ogg`.
4. Set `NEXT_PUBLIC_APP_BGM_URL=/audio/app-ambient.mp3` in the deployment environment. No app ambient track is requested until this variable is configured.
5. Give each game its own loop and event sounds rather than reusing a universal asset. Existing game calls already label events (`move`, `capture`, `strike`, `card_flip`, `victory`, `defeat`); map those labels to each game’s approved assets as they are supplied.

Recommended sources: commission an audio designer, or purchase a licence from a marketplace that explicitly grants game, web, mobile, monetisation, and perpetual usage rights. Provide the final files and licence receipts before release.

## Google Play Billing and Apple In-App Purchase

This web project cannot safely complete native store billing by itself. Package it as a native application first (for example with Capacitor), then add the official store-purchase bridge.

1. Create the app records in App Store Connect and Google Play Console using the final package/bundle IDs.
2. Create consumable point packages with identical product IDs on both stores, such as `points_500`, `points_1500`, and `points_5000`.
3. Complete tax, banking, privacy, age-rating, and testing agreements in both consoles.
4. Implement native purchase calls only through the official Apple StoreKit / Google Play Billing bridge (or a maintained Capacitor plugin).
5. Send every purchase token/receipt to a server-side verifier. Verify Apple receipts with App Store Server API and Google receipts with Google Play Developer API before awarding points.
6. Make verification idempotent using each store transaction ID, log the result, and support restore/reconciliation. Never award points from a client callback.

The existing referral purchase reward function is deliberately webhook-only; call it only after that server verification succeeds.

## Firebase Cloud Messaging

For system notification-bar delivery, package the app natively and configure Firebase Cloud Messaging in the native projects.

1. Create a Firebase project and register the final Android package ID and iOS bundle ID.
2. Add `google-services.json` to Android and `GoogleService-Info.plist` to iOS. Do not commit either file or server keys.
3. In Apple Developer, create an APNs authentication key; upload it to Firebase Cloud Messaging. Enable Push Notifications and Background Modes → Remote notifications in Xcode.
4. Request notification permission only after explaining the benefit in the app. Save the returned FCM token against the authenticated Joe Yoke profile.
5. Send from a trusted server or Firebase Cloud Functions using the FCM Admin SDK. Include a title, short body preview, `icon` / notification channel on Android, and a deep-link payload for the appropriate chat, match, or tournament.
6. Handle token refresh, logout token removal, and notification tap routing. Test with physical iOS and Android devices; simulators do not provide a valid production test for every push flow.

Use `/logo-dark.jpeg` as the starting source for the Joe Yoke notification icon, but create platform-specific monochrome Android status-bar assets before release.
