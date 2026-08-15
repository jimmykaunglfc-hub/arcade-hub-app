# Gem catalog setup

Apply the accompanying Supabase migration before creating or activating Gem
packs in the admin panel. It creates these inactive starter packs:

| Gems | USD |
| ---: | ---: |
| 100 | $0.99 |
| 500 | $4.99 |
| 1,000 | $9.99 |
| 2,500 | $19.99 |
| 6,500 | $49.99 |

## Store console setup

Create each item as a **consumable / one-time in-app product** in both Apple
App Store Connect and Google Play Console. Choose a permanent, matching naming
convention before creation, for example:

| Pack | Apple product ID | Google Play product ID |
| --- | --- | --- |
| 100 Gems | `com.joeyoke.gems.100` | `gems_100` |
| 500 Gems | `com.joeyoke.gems.500` | `gems_500` |
| 1,000 Gems | `com.joeyoke.gems.1000` | `gems_1000` |
| 2,500 Gems | `com.joeyoke.gems.2500` | `gems_2500` |
| 6,500 Gems | `com.joeyoke.gems.6500` | `gems_6500` |

Enter the resulting IDs in **Admin → Store Management**, then activate each
pack. The panel refuses to activate a Gem pack that lacks either ID.

## Points exchange

In **Admin → Configurations → Gem-to-Points Exchange**, set the number of
Gems spent and Points received per exchange. The supplied default is `1 Gem →
100 Points`; change it before publishing if that is not your desired economy.

The app does not award Gems from a button click. A future Apple/Google billing
integration must validate the store receipt on the server, locate the catalog
item by the stored product ID, and then award its `gem_amount` exactly once.
