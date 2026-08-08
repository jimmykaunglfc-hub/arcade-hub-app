# Staging deployment

The `staging` Git branch is the pre-production source of truth. Configure a separate Vercel project (or Vercel environment) to deploy that branch and set `NEXT_PUBLIC_APP_ENV=staging`.

Use a separate Supabase project for staging. Apply the repository migrations there and configure its URL and anon key from `.env.staging.example`. Do not point a staging build at the production Supabase project: catalog, points, matchmaking, and test data must not affect live players.

Production deploys from `main` with `NEXT_PUBLIC_APP_ENV=production` (or unset). Mini Fighter is enabled only when the build environment is `staging`; production hides it from the catalog and refuses direct native-route launches.

Release workflow:

1. Develop and test on `staging`.
2. Deploy the `staging` branch to the staging Vercel project and test against staging Supabase.
3. Merge approved commits from `staging` into `main`.
4. Deploy `main` to production after the full test pass.
