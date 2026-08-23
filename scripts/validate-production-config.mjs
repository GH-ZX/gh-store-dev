import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

function required(name, pattern) {
  const match = config.match(pattern);

  if (!match || !match[1].trim()) {
    throw new Error(`${name} is missing from wrangler.jsonc.`);
  }

  return match[1].trim();
}

const supabaseUrl = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  /"NEXT_PUBLIC_SUPABASE_URL"\s*:\s*"([^"]+)"/,
);
const publishableKey = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  /"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"\s*:\s*"([^"]+)"/,
);
const appUrl = required("NEXT_PUBLIC_APP_URL", /"NEXT_PUBLIC_APP_URL"\s*:\s*"([^"]+)"/);

if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(supabaseUrl)) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS Supabase project URL.");
}

if (!publishableKey.startsWith("sb_publishable_")) {
  throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key, not a secret key.");
}

if (appUrl !== "https://gh-store.me") {
  throw new Error("NEXT_PUBLIC_APP_URL must point to https://gh-store.me in wrangler.jsonc.");
}

console.log("Production public configuration is present.");
