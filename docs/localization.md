# Joe Yoke localization

The spreadsheet is the translation source of truth. It is never read by the
application at runtime; `npm run generate:i18n` turns it into static JSON in
`lib/locales/` that Next and the Capacitor builds bundle normally.

## Updating translations

After changing **Joe Yoke Glossaries Files.xlsx**, regenerate the resources:

```bash
npm run generate:i18n -- "/absolute/path/Joe Yoke Glossaries Files.xlsx"
npm run check:i18n -- "/absolute/path/Joe Yoke Glossaries Files.xlsx"
```

Commit the resulting `lib/locales/*.json` files together with the UI changes.

## Using translations

Use the permanent workbook key, never the English phrase:

```tsx
const { t, formatNumber } = useTranslation();

<h1>{t("UI_0005")}</h1>
<p>{t("UI_0020", { rank: formatNumber(rank) })}</p>
```

`t()` accepts only data supplied by the component. It does not evaluate source
code or workbook expressions. Dot paths such as `player.username` are allowed
when passing a matching object. Complex workbook expressions are normalized to
named placeholders such as `value_1`; their original expressions are recorded
in `lib/locales/generation-report.json` and must be calculated by the component
before calling `t()`.

## Validation and coverage

The generator rejects duplicate keys and missing translations. Its report also
lists workbook placeholder mismatches, complex expressions, skipped rows, and
source-location coverage. A translated dynamic entry with missing placeholders
uses English for that single entry so game/account values are never dropped.

The current glossary has one intentionally skipped invalid row (`UI_1190`),
because its English source cell is empty. Fill that cell in the workbook before
using that key.
