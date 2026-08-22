# Google Play Billing server setup

The Android app sends a Google Play purchase token to the authenticated
`verify-google-play-purchase` Edge Function. It never sends a Gem amount and
never credits a wallet locally. The function verifies the token with Google,
uses `credit_verified_gem_purchase(...)` for the atomic, idempotent Gem grant,
then consumes the purchase so the Gem pack can be bought again.

## One-time configuration

1. In the Google Cloud project used for Joe Yoke, enable **Google Play Android
   Developer API** (`androidpublisher.googleapis.com`).
2. Go to **IAM & Admin → Service Accounts** and create a dedicated service
   account, for example `joe-yoke-play-verifier`. Create a **JSON key** for it.
   This file is server-only: do not add it to the repository, Android project,
   or a client environment file.
3. In **Google Play Console → Users and permissions**, invite that service
   account email and give it access to Joe Yoke. For Billing API verification
   and consumable processing, grant only:
   - **View financial data, orders, and cancellation survey responses**
   - **Manage orders and subscriptions**
4. Store the JSON as a Supabase secret and deploy the Edge Function:

   ```bash
   npx supabase secrets set --project-ref cbntrwpjgxbfhfregzsk \
     GOOGLE_PLAY_SERVICE_ACCOUNT_JSON="$(cat /absolute/path/joe-yoke-play-verifier.json)" \
     GOOGLE_PLAY_PACKAGE_NAME="com.joeyoke.app"

   npx supabase functions deploy verify-google-play-purchase --project-ref cbntrwpjgxbfhfregzsk
   ```

   Use the real local path only in your terminal. Never paste the JSON contents
   into source code or commit the key.

## Behavior and recovery

- The native bridge binds checkout to `SHA-256("joeyoke:google-play:v1:" +
  Supabase user ID)`. This is opaque to Google Play; the Edge Function computes
  the same value and verifies it. Supabase Auth remains the authoritative
  account identity.
- The Edge Function checks package `com.joeyoke.app`, Google purchase state
  `PURCHASED`, the account binding, and the active `store_items` catalog item
  before calling the existing credit RPC.
- The purchase token is hashed before it reaches the ledger. The existing
  unique transaction/token hashes make retries and app-start recovery safe.
- After an idempotent Gem credit, the server calls `purchases.products:consume`.
  If consumption temporarily fails, the next foreground recovery retries it
  without issuing Gems again.

## Product IDs

The production catalog remains `public.store_items.google_product_id`. The
native app requests the currently active IDs and displays the localized price
returned by Google Play:

`gems_100`, `gems_500`, `gems_1000`, `gems_2500`, `gems_6500`.

The Admin reference fiat price is never used as the Android checkout price.
