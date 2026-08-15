# Joe Yoke bundle report

Measured on 2026-08-16 with production static Capacitor output, not a
development server. The measurements below use the scripts referenced in this
repository and inspect the `<script>` files referenced by `out/index.html`.

## Initial Home bundle

| Measurement | Before | Final | Change |
| --- | ---: | ---: | ---: |
| Initial JavaScript chunks | 12 | 10 | -2 |
| Raw JavaScript | 1,917,903 B | 942,633 B | -50.9% |
| Gzip JavaScript | 437,049 B | 270,724 B | -38.1% |
| Largest initial chunk | 934 KB raw / 155 KB gzip | 231 KB raw / 60 KB gzip | -75% raw |
| Complete `out/` directory | 10,667,499 B | 10,694,204 B | +0.25% |

The small full-package increase is not an initial-loading regression: it is
the added performance utility and generated bootstrap localization artifact.
Large game images remain bundled for offline Capacitor use, but are not loaded
by the Home route's startup JavaScript.

## Tooling and commands used

```sh
npm run analyze:bundle
npm run check:i18n -- "/Users/apple/Downloads/Joe Yoke Glossaries Files.xlsx"
npm run build:android:production
```

`next experimental-analyze --output` completed and wrote Next diagnostics to
`.next/diagnostics/analyze`. The final production Android/Capacitor build
compiled successfully in 2.7 seconds, completed TypeScript in 5.7 seconds,
and completed in 12.79 seconds wall-clock on the development Mac.

## Code-splitting model

- **P0:** the static WebView document, root application shell, cached theme,
  session restoration, and five navigation labels in the localization bootstrap.
- **P1:** wallet/rank refresh, notification count, Home profile/history query,
  tournament data, and their correctness-related subscriptions.
- **P2:** campaign lookup/overlay, global broadcast dialog, invite listener,
  Firebase push bridge, and full initial-language resource.
- **P3:** individual game engines, audio engine/BGM, authentication view,
  four-player lobbies, and unvisited tabs/locales.

## Asset follow-up

This pass deliberately did not change image content or remove files. The
following are good candidates for a separate, visually verified asset pass:

- `public/images/monopoly-asean-center.png` and
  `public/images/lobby-diamond-skyline.png` are byte-identical 2.04 MB images.
- The three Cup Pong image assets total about 1.70 MB.
- Several game-specific images are 1024–1441 px square PNGs. Converting only
  confirmed opaque images to WebP/AVIF and retaining needed alpha assets can
  reduce installed package size; gameplay artwork must be visually checked on
  iOS and Android before replacing any source.
