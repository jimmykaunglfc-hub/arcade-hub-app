# Gem catalog and purchase-credit contract

## What this release does

The existing `store_items` catalog is now the sole source for Gem packs. A
`currency` item represents a consumable real-money Gem pack and may be
`draft`, `active`, or `disabled`.

Only `active` items are returned to players. An active pack requires:

- a positive base Gem grant;
- a positive reference USD price; and
- at least one matching Apple or Google product ID.

The reference price is for administration and display only. Apple App Store
and Google Play determine the price a player actually pays.

## Initial catalog

| Pack | Gems | Reference USD | Apple ID | Google Play ID | Initial status |
| --- | ---: | ---: | --- | --- | --- |
| Starter Pack — 100 Gems | 100 | $0.99 | `com.joeyoke.app.gems100` | `gems_100` | Draft |
| 500 Gems | 500 | $4.99 | Set in console first | Set in console first | Draft |
| 1,000 Gems | 1,000 | $9.99 | Set in console first | Set in console first | Draft |
| 2,500 Gems | 2,500 | $19.99 | Set in console first | Set in console first | Draft |
| 6,500 Gems | 6,500 | $49.99 | Set in console first | Set in console first | Draft |

Create the matching consumable/one-time store product first. Then enter its
identifier in **Admin → Store Management**, review the configured Gem grant,
and change the pack to **Active**. Product IDs are database-enforced as unique
and cannot be changed once a verified purchase has credited that pack.

## Security model

The player app never credits Gems from a button click, callback, price, or
client-provided product data. A future server-side purchase verifier must:

1. Validate the Apple signed transaction or Google Play purchase with the
   corresponding platform.
2. Find the active catalog item by that platform's product ID.
3. Hash any Google purchase token before storage; do not persist raw receipts
   or tokens in the app database.
4. Call `credit_verified_gem_purchase` with the Supabase **service-role** key.

`credit_verified_gem_purchase` locks the catalog/profile rows, writes an
immutable transaction ledger record, changes the wallet in the same database
transaction, and uses the platform transaction ID/token hash for idempotency.
It is not executable by anonymous or authenticated player clients. It is a
credit primitive only—not receipt verification—and must not be exposed until a
real Apple/Google verifier exists.

## Gem-to-Points exchange

In **Admin → Configurations → Gem-to-Points Exchange**, set the Gems spent and
Points received per exchange. The supplied default is `1 Gem → 100 Points`.
The exchange uses a server-side row lock and logs both wallet changes; the
player cannot choose a rate or mutate a wallet balance directly.

## Deployment order

1. Review and apply the Supabase migration.
2. Open **Store Management** and keep any unconfigured packs as Draft.
3. Create the store-console products, then add their exact IDs to the relevant
   catalog rows.
4. Activate only the packs ready for a platform.
5. Add real StoreKit/Google Play Billing and server verification in the next
   implementation phase. Do **not** simulate success or credit Gems before
   that phase is complete.
