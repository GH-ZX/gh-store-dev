#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Ensure root has the wrangler deploy redirect file so any wrangler command run from root works
const deployDir = resolve(process.cwd(), ".wrangler/deploy");
const configPath = resolve(deployDir, "config.json");
if (!existsSync(deployDir)) {
  mkdirSync(deployDir, { recursive: true });
}
const configContent = JSON.stringify({
  configPath: "../../storefront/build/server/wrangler.json",
  auxiliaryWorkers: []
});
writeFileSync(configPath, configContent, "utf8");
