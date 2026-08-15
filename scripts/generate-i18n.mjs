#!/usr/bin/env node

/**
 * Converts the Joe Yoke glossary workbook into static locale JSON files.
 *
 * The workbook is intentionally a development artifact: the app imports the
 * generated JSON resources, so it never parses Excel at runtime.
 *
 * Usage:
 *   npm run generate:i18n -- /absolute/path/Joe\ Yoke\ Glossaries\ Files.xlsx
 *   npm run check:i18n -- /absolute/path/Joe\ Yoke\ Glossaries\ Files.xlsx
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

const localeCodes = ["en", "my", "th", "zh", "km", "lo", "fr", "de", "es"];
// P0 launch labels required before the rest of a locale is requested.
const bootstrapKeys = ["UI_0036", "UI_0037", "UI_0038", "UI_0039", "UI_0040"];
const workbookColumns = { en: "english", my: "my", th: "th", zh: "zh", km: "km", lo: "lo", fr: "fr", de: "de", es: "es" };
const requiredColumns = ["key", "locations", ...Object.values(workbookColumns)];
const root = process.cwd();
const outputDirectory = path.join(root, "lib", "locales");
const checkOnly = process.argv.includes("--check");
const suppliedWorkbook = process.argv.slice(2).find((value) => !value.startsWith("--"));
const defaultWorkbook = path.join(root, "localization", "Joe Yoke Glossaries Files.xlsx");
const workbookPath = suppliedWorkbook || process.env.JOE_YOKE_GLOSSARY || defaultWorkbook;
const sourceUrl = process.env.JOE_YOKE_GLOSSARY_SOURCE_URL || "https://docs.google.com/spreadsheets/d/1dvKGQP0yRS71i9qMRnVeSy1RkQhRDgyuTxJZHHwtd4c/edit";

if (!existsSync(workbookPath)) {
  throw new Error(
    `Glossary workbook not found: ${workbookPath}\n` +
      "Pass its path explicitly, e.g. npm run generate:i18n -- /path/to/Joe Yoke Glossaries Files.xlsx",
  );
}

const cleanText = (value) => String(value ?? "").replace(/\r\n?/g, "\n").trim();
const expressionPattern = /\$\{([^}]+)\}/g;
const isSafeVariablePath = (expression) => /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(expression);
const createVariableMap = (english) => {
  const variables = new Map();
  let complexIndex = 0;
  for (const match of String(english).matchAll(expressionPattern)) {
    const expression = match[1].trim();
    if (!variables.has(expression)) {
      variables.set(expression, isSafeVariablePath(expression) ? expression : `value_${++complexIndex}`);
    }
  }
  return variables;
};
const normalizeTemplate = (value, variables) =>
  cleanText(value).replace(expressionPattern, (_match, rawExpression) => {
    const expression = rawExpression.trim();
    const variable = variables.get(expression) || (isSafeVariablePath(expression) ? expression : undefined);
    return variable ? `{{${variable}}}` : _match;
  });
const getTemplateTokens = (value) => [...String(value).matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)].map((match) => match[1]);
const getUnresolvedExpressions = (value) =>
  [...String(value).matchAll(/\$\{([^}]+)\}/g)]
    .map((match) => match[1].trim())
    .filter((expression) => !isSafeVariablePath(expression));
const listSourceFiles = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
};
const getLocationPaths = (locations) =>
  cleanText(locations)
    .split("|")
    .map((location) => location.trim().replace(/:\d+(?::\d+)?$/, ""))
    .filter(Boolean);

const workbook = XLSX.readFile(workbookPath, { raw: false });
const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
if (!firstSheet) throw new Error("The glossary workbook does not contain a worksheet.");
const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
if (!rows.length) throw new Error("The glossary worksheet is empty.");

const headers = Object.keys(rows[0]);
const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
if (missingColumns.length) {
  throw new Error(`Glossary is missing required columns: ${missingColumns.join(", ")}`);
}

const resources = Object.fromEntries(localeCodes.map((locale) => [locale, {}]));
const sourceIndex = {};
const fatalErrors = [];
const unresolvedExpressions = [];
const placeholderMismatches = [];
const skippedRows = [];
const missingTranslations = [];
const sourceErrors = [];
const invalidSourceValue = /^(?:#(?:ERROR!|REF!|VALUE!|N\/A)|#(?:DIV\/0!|NAME\?|NUM!|NULL!))$/i;

for (const [index, row] of rows.entries()) {
  const rowNumber = index + 2;
  const key = cleanText(row.key);
  if (!key) {
    skippedRows.push({ row: rowNumber, reason: "missing key" });
    continue;
  }
  if (sourceIndex[key]) {
    fatalErrors.push(`Row ${rowNumber}: duplicate key ${key}.`);
    continue;
  }

  const rawEnglish = cleanText(row[workbookColumns.en]);
  if (!rawEnglish) {
    skippedRows.push({ row: rowNumber, key, reason: "missing English source" });
    continue;
  }
  if (invalidSourceValue.test(rawEnglish)) {
    sourceErrors.push({ row: rowNumber, key, locations: cleanText(row.locations), locale: "en", value: rawEnglish, reason: "invalid spreadsheet error value" });
    skippedRows.push({ row: rowNumber, key, reason: "invalid English source" });
    continue;
  }
  const variables = createVariableMap(rawEnglish);
  const normalized = {};
  for (const locale of localeCodes) {
    const source = cleanText(row[workbookColumns[locale]]);
    if (!source) {
      if (locale === "en") {
        fatalErrors.push(`Row ${rowNumber}: English source is missing for ${key}.`);
      } else {
        missingTranslations.push({ row: rowNumber, key, locations: cleanText(row.locations), locale });
      }
      continue;
    }
    if (invalidSourceValue.test(source)) {
      sourceErrors.push({ row: rowNumber, key, locations: cleanText(row.locations), locale, value: source, reason: "invalid spreadsheet error value" });
      continue;
    }
    normalized[locale] = normalizeTemplate(source, variables);
  }

  const englishTokens = getTemplateTokens(normalized.en || "");
  for (const locale of localeCodes.filter((code) => code !== "en")) {
    const translatedTokens = getTemplateTokens(normalized[locale] || "");
    if ([...englishTokens].sort().join("|") !== [...translatedTokens].sort().join("|")) {
      placeholderMismatches.push({
        row: rowNumber,
        key,
        locale,
        expected: englishTokens,
        found: translatedTokens,
      });
    }
  }

  for (const locale of localeCodes) {
    const expressions = getUnresolvedExpressions(row[workbookColumns[locale]]);
    if (expressions.length) unresolvedExpressions.push({ key, locale, expressions });
  }

  sourceIndex[key] = {
    english: normalized.en,
    rawEnglish,
    locations: cleanText(row.locations),
    placeholders: englishTokens,
    variableExpressions: Object.fromEntries(variables),
    missingLocales: localeCodes.filter((locale) => !normalized[locale]),
  };
  for (const locale of localeCodes) {
    if (normalized[locale]) resources[locale][key] = normalized[locale];
  }
}

const locationAudit = { referencedFiles: new Set(), existingFiles: new Set(), missingFiles: new Set(), exactEnglishMatches: 0, unmatchedKeys: [] };
for (const [key, entry] of Object.entries(sourceIndex)) {
  const locations = getLocationPaths(entry.locations);
  let matched = false;
  for (const sourcePath of locations) {
    locationAudit.referencedFiles.add(sourcePath);
    const absolutePath = path.join(root, sourcePath);
    if (!existsSync(absolutePath)) {
      locationAudit.missingFiles.add(sourcePath);
      continue;
    }
    locationAudit.existingFiles.add(sourcePath);
    if (readFileSync(absolutePath, "utf8").includes(entry.rawEnglish)) matched = true;
  }
  if (matched) locationAudit.exactEnglishMatches += 1;
  else if (locations.length) locationAudit.unmatchedKeys.push(key);
}

if (fatalErrors.length) {
  throw new Error(`Glossary validation failed:\n- ${fatalErrors.join("\n- ")}`);
}

const report = {
  workbook: path.basename(workbookPath),
  sourceUrl,
  entries: Object.keys(sourceIndex).length,
  locales: localeCodes,
  unresolvedExpressions,
  placeholderMismatches,
  skippedRows,
  missingTranslations,
  sourceErrors,
  locationAudit: {
    scannedSourceFiles: listSourceFiles(path.join(root, "app")).length + listSourceFiles(path.join(root, "components")).length + listSourceFiles(path.join(root, "lib")).length,
    referencedFiles: locationAudit.referencedFiles.size,
    existingFiles: locationAudit.existingFiles.size,
    missingFiles: [...locationAudit.missingFiles].sort(),
    exactEnglishMatches: locationAudit.exactEnglishMatches,
    unmatchedKeys: locationAudit.unmatchedKeys,
  },
  // Google Sheets exports can carry volatile workbook metadata. Hash the
  // parsed glossary instead, so a no-content-change export does not make the
  // generated report appear stale.
  glossaryChecksum: createHash("sha256").update(JSON.stringify(sourceIndex)).digest("hex"),
};
const sourceErrorsMarkdown = [
  "# Localization source errors",
  "",
  `Generated from \`${path.basename(workbookPath)}\`. This report never invents a replacement translation.`,
  "",
  "## Invalid spreadsheet values",
  "",
  "| Key | Location | Locale | Value | Reason |",
  "| --- | --- | --- | --- | --- |",
  ...(sourceErrors.length
    ? sourceErrors.map((item) => `| ${item.key} | ${item.locations || "—"} | ${item.locale} | ${item.value} | ${item.reason} |`)
    : ["| None | — | — | — | — |"]),
  "",
  "## Missing translations",
  "",
  "The runtime falls back to English only for these genuinely blank selected-language values.",
  "",
  "| Key | Location | Locale |",
  "| --- | --- | --- |",
  ...(missingTranslations.length
    ? missingTranslations.map((item) => `| ${item.key} | ${item.locations || "—"} | ${item.locale} |`)
    : ["| None | — | — |"]),
  "",
];
const outputs = {
  ...Object.fromEntries(localeCodes.map((locale) => [`${locale}.json`, resources[locale]])),
  "bootstrap.json": Object.fromEntries(localeCodes.map((locale) => [
    locale,
    Object.fromEntries(bootstrapKeys.map((key) => [key, resources[locale][key]])),
  ])),
  "glossary-index.json": sourceIndex,
  "placeholder-index.json": Object.fromEntries(
    Object.entries(sourceIndex).map(([key, entry]) => [key, entry.placeholders]),
  ),
  "generation-report.json": report,
};

const formatJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sourceErrorsPath = path.join(root, "docs", "localization-source-errors.md");
const sourceErrorsDocument = `${sourceErrorsMarkdown.join("\n")}\n`;
const changes = Object.entries(outputs).filter(([name, value]) => {
  const destination = path.join(outputDirectory, name);
  return !existsSync(destination) || readFileSync(destination, "utf8") !== formatJson(value);
});
const sourceErrorsOutOfDate = !existsSync(sourceErrorsPath) || readFileSync(sourceErrorsPath, "utf8") !== sourceErrorsDocument;

if (checkOnly) {
  if (changes.length || sourceErrorsOutOfDate) {
    throw new Error(`Generated localization files are out of date: ${[...changes.map(([name]) => name), ...(sourceErrorsOutOfDate ? ["docs/localization-source-errors.md"] : [])].join(", ")}`);
  }
  console.log(`Localization resources are current (${report.entries} entries × ${localeCodes.length} locales).`);
  process.exit(0);
}

mkdirSync(outputDirectory, { recursive: true });
for (const [name, value] of Object.entries(outputs)) {
  writeFileSync(path.join(outputDirectory, name), formatJson(value));
}
mkdirSync(path.dirname(sourceErrorsPath), { recursive: true });
writeFileSync(sourceErrorsPath, sourceErrorsDocument);

console.log(`Generated ${report.entries} localization entries for ${localeCodes.length} locales.`);
if (unresolvedExpressions.length || placeholderMismatches.length || skippedRows.length || missingTranslations.length || sourceErrors.length) {
  console.warn(
    `Generated with ${unresolvedExpressions.length} complex expressions, ${placeholderMismatches.length} translation placeholder mismatches, ${missingTranslations.length} missing translations, ${sourceErrors.length} invalid source values, and ${skippedRows.length} skipped rows. ` +
      "See lib/locales/generation-report.json and docs/localization-source-errors.md before migrating affected dynamic strings.",
  );
}
