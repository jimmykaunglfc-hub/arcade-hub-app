# Joe Yoke localization repair report

## Authoritative source

The only source for generated UI resources is the Google Sheet:

`https://docs.google.com/spreadsheets/d/1dvKGQP0yRS71i9qMRnVeSy1RkQhRDgyuTxJZHHwtd4c/edit`

Run `npm run sync:i18n` to export it temporarily and regenerate the locale
JSON. The exported workbook is not retained or committed. Run
`npm run check:i18n` in CI or before release to confirm the generated files
still match the Sheet.

## Root cause

The prior failure had two independent causes:

1. Generated resources were not being refreshed from the authoritative Google
   Sheet. The previous generator treated incomplete locale cells as fatal,
   while the current Sheet is valid with runtime English fallback.
2. Most player-facing JSX used direct English text. Changing the language
   context therefore affected only the few components that manually called
   `t(...)`.

The runtime now loads locale files lazily, waits for the selected language
before applying it, and offers `LocalizedText` / `tr` for glossary-backed UI
labels. This prevents the brief reset-to-English state and does not remount the
application on a language change.

## Coverage and safety

- 1,775 valid glossary entries are generated for all 9 supported locales.
- The runtime locale code is `my`; no `mm` locale is emitted.
- Exact player-facing JSX labels, placeholders, alt labels, game instructions,
  modal copy, tabs, and common controls now resolve through the glossary.
- Dynamic translations preserve `{{placeholder}}` variables. When a translated
  cell drops or changes a placeholder, the runtime uses the English template
  rather than hiding values such as scores, prices, names, or points.
- Internal stable values are intentionally not localized: tab state keys,
  database/status values, game keys/names used for matching, result codes,
  CSS/SVG identifiers, and user-generated names/messages.

## Source data requiring follow-up

The generator does not invent translations. The live Sheet currently contains
7 invalid `#ERROR!` English cells and 152 placeholder mismatches. The exact
rows are listed in [localization-source-errors.md](./localization-source-errors.md)
and `lib/locales/generation-report.json`. Correcting those Sheet cells and
running `npm run sync:i18n` is sufficient to update the app.

## Validation

Run:

```sh
npm run sync:i18n
npm run check:i18n
npm run audit:i18n
npm run build
```

`audit:i18n` reports only glossary-backed, potentially user-visible hardcoded
English. Runtime identifiers are deliberately excluded so the audit does not
recommend changes that would break routing, matchmaking, or game rules.
