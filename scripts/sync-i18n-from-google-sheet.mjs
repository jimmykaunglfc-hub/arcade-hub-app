#!/usr/bin/env node

/**
 * Refresh generated UI resources from Joe Yoke's authoritative Google Sheet.
 * The downloaded workbook is temporary and is never committed as a second
 * source of truth.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const spreadsheetId = "1dvKGQP0yRS71i9qMRnVeSy1RkQhRDgyuTxJZHHwtd4c";
const sourceUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
const checkOnly = process.argv.includes("--check");
const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "joe-yoke-i18n-"));
const workbookPath = path.join(temporaryDirectory, "joe-yoke-authoritative-localization.xlsx");

try {
  const response = await fetch(exportUrl);
  if (!response.ok) throw new Error(`Could not export the authoritative Google Sheet (${response.status} ${response.statusText}).`);
  writeFileSync(workbookPath, Buffer.from(await response.arrayBuffer()));
  execFileSync(process.execPath, ["scripts/generate-i18n.mjs", workbookPath, ...(checkOnly ? ["--check"] : [])], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, JOE_YOKE_GLOSSARY_SOURCE_URL: sourceUrl },
  });
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
