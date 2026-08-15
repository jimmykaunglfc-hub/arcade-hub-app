# Google and Apple sign-in setup

The app code supports Google and Apple login on the website, iOS, and Android.
It uses Supabase Auth as the single account system, so no Google or Apple
secret is stored in this repository.

## 1. Add Supabase redirect URLs

In **Supabase Dashboard → Authentication → URL Configuration**, add these
redirect URLs:

- `https://app.joeyoke.com/**`
- `http://localhost:3000/**` (development only)
- `com.joeyoke.app://auth/callback`

Use the actual production website address if it is different from
`https://app.joeyoke.com`.

## 2. Configure Google

1. Open **Google Cloud Console → Google Auth Platform → Clients**.
2. Create an OAuth client of type **Web application**.
3. Add the production website under **Authorized JavaScript origins**:
   `https://app.joeyoke.com`.
4. Add this exact authorized redirect URI:
   `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`.
5. In **Supabase Dashboard → Authentication → Sign In / Providers → Google**,
   enable Google and enter the Google client ID and client secret.

The Capacitor packages use the same web OAuth client through the device's
secure browser, then return to the installed app through the deep link above.

## 3. Configure Apple

1. In Apple Developer, enable **Sign in with Apple** for the App ID
   `com.joeyoke.app`.
2. Create a **Services ID** for the web OAuth flow, for example
   `com.joeyoke.app.web`, and link it to that App ID.
3. In the Services ID configuration, use your Supabase project domain as the
   domain and add this Return URL:
   `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`.
4. Create a Sign in with Apple key, then generate the Apple client secret in
   the Supabase Apple provider setup screen.
5. In **Supabase Dashboard → Authentication → Sign In / Providers → Apple**,
   enable Apple and enter the Services ID, Team ID, Key ID, and generated
   secret.

Apple OAuth client secrets expire. Set a six-month reminder to regenerate and
replace the Apple secret in Supabase before it expires.

## 4. Rebuild packages

After the provider dashboards are configured:

```bash
npm run build:ios:production
npm run build:android:production
```

Open the native projects and make fresh signed builds. Do not add provider
secrets, Apple `.p8` files, or Google client secrets to Git.

## Test checklist

1. Test Google on H5, iOS, and Android.
2. Test Apple on H5 and iOS.
3. Test a first-time signup with a referral code; the referral should apply
   after the OAuth callback creates the account.
4. Test an existing account to confirm the referral is not applied twice.
5. In Supabase Authentication users, confirm both providers create a session
   for the same Joe Yoke account where the provider email matches.
