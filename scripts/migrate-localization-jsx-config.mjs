#!/usr/bin/env node

// One-time follow-up migration for exact glossary literals inside JSX
// expressions/attributes. It never rewrites call arguments (which may be
// gameplay or backend identifiers), and it preserves the original English
// fallback until the active locale has loaded.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const glossary = JSON.parse(readFileSync(path.join(root, "lib/locales/glossary-index.json"), "utf8"));
const map = new Map();
for (const [key, entry] of Object.entries(glossary)) {
  const english = String(entry.english || "").trim();
  if (!english || /^[_a-z][\w.-]*$/.test(english)) continue;
  const current = map.get(english);
  if (!current || (key.startsWith("UI_") && !current.startsWith("UI_"))) map.set(english, key);
}
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return walk(target);
  return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
});
const hasJsxExpressionAncestor = (node) => {
  let current = node.parent;
  while (current) {
    if (ts.isJsxExpression(current)) return true;
    if (ts.isSourceFile(current) || ts.isFunctionLike(current)) return false;
    current = current.parent;
  }
  return false;
};
const isUnsafeRuntimeValue = (node) => {
  let current = node;
  while (current.parent && !ts.isSourceFile(current.parent)) {
    const parent = current.parent;
    if (ts.isCallExpression(parent) && parent.arguments.includes(current)) return true;
    if (ts.isBinaryExpression(parent) && /^(?:===|!==|==|!=)$/.test(parent.operatorToken.getText())) return true;
    const tagName = ts.isJsxElement(parent)
      ? parent.openingElement.tagName.getText()
      : ts.isJsxSelfClosingElement(parent)
        ? parent.tagName.getText()
        : null;
    if (tagName === "style") return true;
    current = parent;
  }
  return false;
};
const isLocalized = (node) => {
  const call = node.parent;
  return ts.isCallExpression(call) && ts.isIdentifier(call.expression) && ["t", "tr"].includes(call.expression.text);
};
const isLocalizedTextFallback = (node) => {
  const attribute = node.parent;
  const element = attribute?.parent?.parent;
  return ts.isJsxAttribute(attribute)
    && attribute.name.getText() === "fallback"
    && (ts.isJsxSelfClosingElement(element) || ts.isJsxOpeningElement(element))
    && element.tagName.getText() === "LocalizedText";
};
const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "components")), ...walk(path.join(root, "lib"))]
  .filter((file) => !file.includes(`${path.sep}api${path.sep}`) && !file.includes(`${path.sep}joeyokeadmin${path.sep}`) && !file.includes(`${path.sep}locales${path.sep}`) && !file.endsWith(`${path.sep}i18n.tsx`));
let changedFiles = 0;
let replacedNodes = 0;
for (const file of files) {
  let text = readFileSync(file, "utf8");
  if (!text.startsWith('"use client"') && !text.startsWith("'use client'")) continue;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const replacements = [];
  const visit = (node) => {
    if (ts.isStringLiteralLike(node) && !isLocalized(node) && !isLocalizedTextFallback(node) && (hasJsxExpressionAncestor(node) || ts.isJsxAttribute(node.parent)) && !isUnsafeRuntimeValue(node)) {
      const fallback = node.text.trim();
      const key = map.get(fallback);
      if (key) {
        const value = `tr(${JSON.stringify(key)}, ${JSON.stringify(fallback)})`;
        replacements.push({
          start: node.getStart(source),
          end: node.getEnd(),
          value: ts.isJsxAttribute(node.parent) ? `{${value}}` : value,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!replacements.length) continue;
  for (const item of replacements.sort((left, right) => right.start - left.start)) text = `${text.slice(0, item.start)}${item.value}${text.slice(item.end)}`;
  const relativeImport = path.relative(path.dirname(file), path.join(root, "lib", "i18n")).replaceAll(path.sep, "/");
  const importPath = relativeImport.startsWith(".") ? relativeImport : `./${relativeImport}`;
  const importStatement = `import { tr } from "${importPath}";\n`;
  const directiveMatch = text.match(/^(?:"use client"|'use client');\s*\n/);
  if (!/^import \{ tr \} from /m.test(text)) {
    text = directiveMatch ? `${directiveMatch[0]}\n${importStatement}${text.slice(directiveMatch[0].length)}` : `${importStatement}${text}`;
  }
  writeFileSync(file, text);
  changedFiles += 1;
  replacedNodes += replacements.length;
}
console.log(`Migrated ${replacedNodes} exact JSX configuration literals in ${changedFiles} client files.`);
