import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Android packages a static player bundle. API/admin routes continue to run on
// Vercel, so keep them out of the static export and restore them afterwards.
const serverOnlyEntries = [
  ["app/api", ".capacitor-build-api"],
  ["app/joeyokeadmin", ".capacitor-build-admin"],
  ["proxy.ts", ".capacitor-build-proxy.ts"],
].map(([source, temporary]) => ({
  source: resolve(projectRoot, source),
  temporary: resolve(projectRoot, temporary),
}));

function run(command, args, env = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", rejectCommand);
    child.on("exit", (code) => code === 0
      ? resolveCommand()
      : rejectCommand(new Error(`${command} ${args.join(" ")} exited with code ${code}`)));
  });
}

async function moveServerCodeOutOfTheExport() {
  for (const entry of serverOnlyEntries) {
    if (existsSync(entry.temporary)) throw new Error(`Temporary build path already exists: ${entry.temporary}`);
    if (existsSync(entry.source)) await rename(entry.source, entry.temporary);
  }
}

async function restoreServerCode() {
  for (const entry of [...serverOnlyEntries].reverse()) {
    if (existsSync(entry.temporary)) await rename(entry.temporary, entry.source);
  }
}

try {
  await moveServerCodeOutOfTheExport();
  await run("npx", ["next", "build"], {
    BUILD_TARGET: "capacitor",
    NEXT_PUBLIC_APP_ENV: "production",
  });
  await run("npx", ["cap", "sync", "android"]);
} finally {
  await restoreServerCode();
}
