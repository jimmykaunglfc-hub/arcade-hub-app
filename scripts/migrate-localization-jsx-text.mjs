#!/usr/bin/env node

// One-time, reviewable migration for exact static JSX text already represented
// by the authoritative glossary. It deliberately skips attributes, call
// arguments, technical identifiers, and any text without an exact key.
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
    if (ts.isJsxText(node)) {
      const fallback = node.getText(source).trim();
      const key = map.get(fallback);
      if (key) replacements.push({ start: node.getStart(source), end: node.getEnd(), value: `<LocalizedText id=${JSON.stringify(key)} fallback={${JSON.stringify(fallback)}} />` });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!replacements.length) continue;
  for (const item of replacements.sort((left, right) => right.start - left.start)) text = `${text.slice(0, item.start)}${item.value}${text.slice(item.end)}`;
  const relativeImport = path.relative(path.dirname(file), path.join(root, "lib", "i18n")).replaceAll(path.sep, "/");
  const importPath = relativeImport.startsWith(".") ? relativeImport : `./${relativeImport}`;
  const importStatement = `import { LocalizedText } from "${importPath}";\n`;
  const directiveMatch = text.match(/^(?:"use client"|'use client');\s*\n/);
  text = directiveMatch ? `${directiveMatch[0]}\n${importStatement}${text.slice(directiveMatch[0].length)}` : `${importStatement}${text}`;
  writeFileSync(file, text);
  changedFiles += 1;
  replacedNodes += replacements.length;
}
console.log(`Migrated ${replacedNodes} exact static JSX labels in ${changedFiles} client files.`);
