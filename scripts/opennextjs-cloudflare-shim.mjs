#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const command = args[0] || "build";

console.log(`[opennextjs-cloudflare compatibility shim] Executing '${command}' for React Router storefront...`);

if (command === "build") {
  const result = spawnSync("pnpm", ["run", "build"], {
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log("[opennextjs-cloudflare compatibility shim] Build completed successfully.");
  process.exit(0);
} else if (command === "deploy") {
  const result = spawnSync("pnpm", ["--dir", "storefront", "exec", "wrangler", "deploy"], {
    stdio: "inherit",
    shell: true,
  });
  process.exit(result.status ?? 0);
} else {
  console.log(`[opennextjs-cloudflare compatibility shim] Delegating '${command}' to pnpm run build...`);
  const result = spawnSync("pnpm", ["run", "build"], {
    stdio: "inherit",
    shell: true,
  });
  process.exit(result.status ?? 0);
}
