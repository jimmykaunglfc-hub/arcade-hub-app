#!/usr/bin/env node

/**
 * Reports, but never rewrites, likely user-visible English that already has a
 * glossary entry. This keeps localization migration reviewable and avoids
 * changing technical identifiers, API fields, or ambiguous literals blindly.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const localesDirectory = path.join(root, "lib", "locales");
const reportPath = path.join(root, "docs", "localization-audit.md");
const localeCodes = ["en", "my", "th", "zh", "km", "lo", "fr", "de", "es"];
const glossary = JSON.parse(readFileSync(path.join(localesDirectory, "glossary-index.json"), "utf8"));
const generationReport = JSON.parse(readFileSync(path.join(localesDirectory, "generation-report.json"), "utf8"));
const generated = Object.fromEntries(localeCodes.map((locale) => [locale, JSON.parse(readFileSync(path.join(localesDirectory, `${locale}.json`), "utf8"))]));

const walk = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(itemPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [itemPath] : [];
  });
};
const sourceFiles = [...walk(path.join(root, "app")), ...walk(path.join(root, "components")), ...walk(path.join(root, "lib"))]
  .filter((file) => !file.includes(`${path.sep}api${path.sep}`) && !file.includes(`${path.sep}joeyokeadmin${path.sep}`) && !file.includes(`${path.sep}locales${path.sep}`));
const canonicalKey = (keys) => [...keys].sort((left, right) => {
  const weight = (key) => key.startsWith("UI_") ? 0 : key.startsWith("I18N_") ? 1 : 2;
  return weight(left) - weight(right) || left.localeCompare(right);
})[0];
const englishToKeys = new Map();
for (const [key, entry] of Object.entries(glossary)) {
  const text = String(entry.english || "").trim();
  if (!text || text.startsWith("#")) continue;
  englishToKeys.set(text, [...(englishToKeys.get(text) || []), key]);
}
const isTechnicalToken = (text) => /^[_a-z][\w.-]*$/.test(text) || /^(?:id|created_at|sender_id|receiver_id|group_id|profiles|direct_messages|game_invite|pending|accepted|declined|undefined|null)$/.test(text);
const hasJsxAncestor = (node) => {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current)) return true;
    current = current.parent;
  }
  return false;
};
const isLocalizedTextFallback = (node) => {
  const attribute = node.parent;
  const element = attribute?.parent?.parent;
  return ts.isJsxAttribute(attribute)
    && attribute.name.getText() === "fallback"
    && ts.isJsxSelfClosingElement(element)
    && element.tagName.getText() === "LocalizedText";
};
const isTranslationCallFallback = (node) => {
  const call = node.parent;
  return ts.isCallExpression(call)
    && ts.isIdentifier(call.expression)
    && ["t", "tr"].includes(call.expression.text)
    && call.arguments.includes(node);
};
const isRuntimeStateLiteral = (node) => {
  let current = node;
  while (current.parent && !ts.isSourceFile(current.parent)) {
    const parent = current.parent;
    if (ts.isCallExpression(parent) && parent.arguments.includes(current)) return true;
    // Object IDs are application state. They may deliberately use the same
    // English words as a visible label, but translating them breaks routing
    // and tab matching rather than localizing UI copy.
    if (ts.isPropertyAssignment(parent) && parent.name.getText() === "id") return true;
    if (ts.isBinaryExpression(parent) && /^(?:===|!==|==|!=)$/.test(parent.operatorToken.getText())) return true;
    current = parent;
  }
  return false;
};
const isStyleLiteral = (node) => {
  let current = node;
  while (current.parent && !ts.isSourceFile(current.parent)) {
    current = current.parent;
    const tagName = ts.isJsxElement(current)
      ? current.openingElement.tagName.getText()
      : ts.isJsxSelfClosingElement(current)
        ? current.tagName.getText()
        : null;
    if (tagName === "style") return true;
  }
  return false;
};
const literalText = (node) => ts.isJsxText(node) ? node.getText().trim() : node.text.trim();
const findings = [];
const usedKeys = new Map();

for (const filePath of sourceFiles) {
  const sourceText = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t" && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      const key = node.arguments[0].text;
      usedKeys.set(key, (usedKeys.get(key) || 0) + 1);
    }
    if (ts.isJsxText(node) || ts.isStringLiteralLike(node)) {
      const text = literalText(node);
      const keys = englishToKeys.get(text);
      if (keys && !isTechnicalToken(text) && !isLocalizedTextFallback(node) && !isTranslationCallFallback(node) && !isRuntimeStateLiteral(node) && !isStyleLiteral(node) && (ts.isJsxText(node) || hasJsxAncestor(node))) {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        findings.push({
          file: path.relative(root, filePath),
          line: position.line + 1,
          english: text,
          key: canonicalKey(keys),
          context: ts.isJsxText(node) ? "JSX text" : "JSX/config literal",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const expectedKeys = new Set(Object.keys(glossary));
const localeValidation = localeCodes.map((locale) => {
  const keys = new Set(Object.keys(generated[locale]));
  return {
    locale,
    missing: [...expectedKeys].filter((key) => !keys.has(key)),
    stale: [...keys].filter((key) => !expectedKeys.has(key)),
  };
});
const duplicateEnglish = [...englishToKeys.entries()].filter(([, keys]) => keys.length > 1).map(([english, keys]) => ({ english, keys }));
const lines = [
  "# Localization implementation audit",
  "",
  `Authoritative source: ${generationReport.sourceUrl || "not recorded; run npm run sync:i18n"}`,
  "",
  "## Generated-resource validation",
  "",
  "| Locale | Missing generated keys | Stale generated keys |",
  "| --- | ---: | ---: |",
  ...localeValidation.map((item) => `| ${item.locale} | ${item.missing.length} | ${item.stale.length} |`),
  "",
  `Glossary entries: ${expectedKeys.size}. Duplicate English labels: ${duplicateEnglish.length}.`,
  "",
  "## Potential unlocalized UI",
  "",
  "These are exact English literals that have a canonical glossary key. They are review candidates, not automatic edits; technical literals and admin/API files are excluded.",
  "",
  "| File | Line | English | Suggested key | Context |",
  "| --- | ---: | --- | --- | --- |",
  ...(findings.length ? findings.map((item) => `| ${item.file} | ${item.line} | ${item.english.replaceAll("|", "\\|")} | ${item.key} | ${item.context} |`) : ["| None | — | — | — | — |"]),
  "",
  "## Translation usage",
  "",
  `Direct \`t(...)\` calls found: ${[...usedKeys.values()].reduce((sum, value) => sum + value, 0)} across ${usedKeys.size} keys.`,
  "",
  "## Source issues",
  "",
  `Invalid source values: ${generationReport.sourceErrors.length}. Missing translation cells: ${generationReport.missingTranslations.length}. Placeholder mismatches: ${generationReport.placeholderMismatches.length}. See [localization-source-errors.md](./localization-source-errors.md) and \`lib/locales/generation-report.json\` for details.`,
  "",
];
mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${lines.join("\n")}\n`);
console.log(`Localization audit complete: ${findings.length} potential UI literals, ${expectedKeys.size} glossary entries, ${localeValidation.reduce((sum, item) => sum + item.missing.length + item.stale.length, 0)} generated-resource discrepancies.`);
