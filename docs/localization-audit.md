# Localization implementation audit

Authoritative source: https://docs.google.com/spreadsheets/d/1dvKGQP0yRS71i9qMRnVeSy1RkQhRDgyuTxJZHHwtd4c/edit

## Generated-resource validation

| Locale | Missing generated keys | Stale generated keys |
| --- | ---: | ---: |
| en | 0 | 0 |
| my | 0 | 0 |
| th | 0 | 0 |
| zh | 0 | 0 |
| km | 0 | 0 |
| lo | 0 | 0 |
| fr | 0 | 0 |
| de | 0 | 0 |
| es | 0 | 0 |

Glossary entries: 1775. Duplicate English labels: 23.

## Potential unlocalized UI

These are exact English literals that have a canonical glossary key. They are review candidates, not automatic edits; technical literals and admin/API files are excluded.

| File | Line | English | Suggested key | Context |
| --- | ---: | --- | --- | --- |
| None | — | — | — | — |

## Translation usage

Direct `t(...)` calls found: 59 across 52 keys.

## Source issues

Invalid source values: 7. Missing translation cells: 0. Placeholder mismatches: 152. See [localization-source-errors.md](./localization-source-errors.md) and `lib/locales/generation-report.json` for details.

