# Joe Yoke performance optimization report

## Outcome

The production Capacitor startup path is now materially smaller and no longer
waits for optional launch work before rendering the app shell. The final
initial Home JavaScript is **942,633 bytes raw / 270,724 bytes gzip**, versus
**1,917,903 bytes raw / 437,049 bytes gzip** before this pass.

No gameplay rules, purchases, social login, Firebase configuration, Supabase
schema, or iOS/Android native project settings were altered.

## Implemented changes

1. **Removed the startup auth gate.** The persistent app shell now renders
   while the local Supabase session is restored. The root does not block on a
   campaign lookup or show an artificial loading screen.
2. **Deferred optional launch work.** Campaigns, broadcast UI, global invites,
   and push initialization load after first paint/idle time rather than from
   the initial Home bundle. This preserves the features once loaded.
3. **Deferred feature-only modules.** Auth UI, competitive/four-player lobbies,
   and the sound engine are requested only when a user reaches or interacts
   with the relevant feature.
4. **Made localization demand-loaded.** A very small P0 navigation bootstrap
   ships initially. The complete language dictionary is loaded at idle for the
   first language, and immediately after a deliberate language change. Dynamic
   gameplay/account values retain the existing placeholder safety fallback.
5. **Removed avoidable auth reads and serialized Home requests.** The root
   passes its known user ID to invite/Home logic; Home profile and match-history
   queries start in parallel instead of one after another.
6. **Added timing marks.** `lib/performance.ts` emits browser performance marks
   for shell mounted, shell painted, deferred startup, session restored, and
   game selection. Set `NEXT_PUBLIC_PERF_DEBUG=true` in a test build to print
   these labels in the Android WebView or Safari Web Inspector console.
7. **Pinned Turbopack's project root.** The Next configuration explicitly uses
   this repository as the Turbopack root, eliminating the parent lockfile root
   warning during production builds.

## Validation completed

- `npm run check:i18n -- "/Users/apple/Downloads/Joe Yoke Glossaries Files.xlsx"`
  passed.
- `npm run analyze:bundle` completed using the Next.js 16 experimental
  analyzer.
- `npm run build:android:production` passed, including production compile,
  TypeScript, static export, and Capacitor Android sync.

## Physical-device validation still required

This code session has no physical-device profiler, so it does **not** claim
invented cold-start, FCP, interaction, memory, or network timings. Before
shipping a new package:

1. Install the generated build on a representative Android phone and iPhone.
2. Enable `NEXT_PUBLIC_PERF_DEBUG=true` in a temporary test build and capture
   the performance marks with Chrome remote inspection (Android) and Safari
   Web Inspector (iOS).
3. Verify first Home paint, session restoration, switching language, opening
   an online invite, receiving a push, campaign behavior, and each game entry.
4. Test launch on slow/offline network conditions. The local shell should
   remain available; backend-dependent data can refresh after launch.

## Recommended next measurement-led work

- Profile actual backend latency before changing the profile/wallet RPC
  sequence; it remains non-blocking to shell rendering.
- Measure whether the 50-row Home match history needs pagination or a smaller
  initial sample for low-end devices.
- Run a separate visual asset-compression pass for confirmed duplicate/large
  game images, then compare gameplay rendering on H5, Android, and iOS.
- Correct the supplied glossary's 1,309 placeholder mismatches and one missing
  English row before migrating every dynamic string to localized resources.

## Packaging

This is a web/static-export optimization. It has already synchronized Android
web assets for build validation, but no signed Android or iOS package was
created. Create new packages only when the normal release/test cycle is ready.
