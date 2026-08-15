# Joe Yoke performance baseline

Measured on 2026-08-16 from the production-equivalent static Capacitor Android
build (`npm run build:android:production`), never from `next dev`.

## Architecture found

- Next.js 16 static export when `BUILD_TARGET=capacitor`.
- Capacitor copies the `out/` directory into the Android/iOS WebView bundle.
- The native packages load bundled local content; app startup does not depend on
  remote HTML, DNS, TLS, or a Next.js server.
- Supabase, realtime, and Firebase push are remote after the WebView starts.

## Build baseline

| Measurement | Baseline |
| --- | ---: |
| Static Capacitor build wall time | 13.83 s |
| Next compile | 2.6 s |
| TypeScript | 6.3 s |
| Capacitor Android sync | 0.16 s |
| Bundled web assets (`out/`) | 10.67 MB |
| Initial Home JS | 1.92 MB raw / 437 KB gzip / 12 chunks |
| Largest initial JS chunk | 934 KB raw / 155 KB gzip |

The build timings are developer-machine measurements, not device-launch times.
Cold launch, first visible shell, interactive Home, and game-ready timings must
be captured on Android/iOS physical devices using the in-app marks introduced by
this optimization and native/WebView profiling tools.

## Baseline request sequence

After local session restoration, the root page starts wallet/rank refresh,
presence, notification count/realtime, invite/realtime, push preference/token
work, and the campaign query. `HomeTab` additionally starts tournament, profile,
and 50-row match-history queries plus realtime listeners.

## Baseline bottlenecks found

1. All nine localization JSON resources and the detailed glossary index were
   imported by the root client provider. This accounted for the 934 KB initial
   shared chunk.
2. `checkingAuth` rendered only the campaign splash, so the usable application
   shell waited for session restoration.
3. The campaign component queried Supabase before it allowed the splash overlay
   to resolve, and it mounted twice during startup.
4. Push and invite listeners began with the root session rather than after the
   first meaningful content.
5. Large local raster images include two 2.04 MB Monopoly/lobby duplicates and
   three Cup Pong images totalling 1.70 MB. They are not initial Home assets but
   remain package-size and game-entry candidates for asset optimization.

## What was not measured automatically

No connected physical iOS/Android device profiler was available to this command
session. The baseline therefore does not invent cold-start, FCP, interaction,
memory, or network-duration numbers. Those measurements remain explicitly
marked for device validation after implementation.
