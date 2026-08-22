import { existsSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Native player builds are static. Keep Vercel-only API and admin routes out of
// the exported bundle; they remain available to the production web deployment.
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
    child.on("exit", (code) => {
      if (code === 0) {
        resolveCommand();
        return;
      }
      rejectCommand(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function moveServerCodeOutOfTheExport() {
  for (const entry of serverOnlyEntries) {
    if (existsSync(entry.temporary)) {
      throw new Error(`Temporary build path already exists: ${entry.temporary}`);
    }
    if (existsSync(entry.source)) {
      await rename(entry.source, entry.temporary);
    }
  }
}

async function restoreServerCode() {
  for (const entry of [...serverOnlyEntries].reverse()) {
    if (existsSync(entry.temporary)) {
      await rename(entry.temporary, entry.source);
    }
  }
}

async function registerAppNativePlugins() {
  // Capacitor regenerates this file during every sync. The StoreKit bridge
  // lives in the app target (not an npm plugin), so retain its class in the
  // generated registration list after each sync.
  const configPath = resolve(projectRoot, "ios/App/App/capacitor.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const classes = new Set(config.packageClassList || []);
  classes.add("AppleStoreKitPlugin");
  config.packageClassList = [...classes];
  await writeFile(configPath, `${JSON.stringify(config, null, "\t")}\n`);
}

try {
  await moveServerCodeOutOfTheExport();
  await run("npx", ["next", "build"], {
    BUILD_TARGET: "capacitor",
    NEXT_PUBLIC_APP_ENV: "production",
  });
  await run("npx", ["cap", "sync", "ios"]);
  await registerAppNativePlugins();
} finally {
  await restoreServerCode();
}
