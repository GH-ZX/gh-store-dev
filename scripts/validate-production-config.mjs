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

/**
 * The OpenNext incremental cache must be armed or disarmed on both sides at
 * once.
 *
 * A binding to an R2 bucket (or D1 database) that does not exist fails the
 * deploy outright rather than degrading, so the config ships with the bindings
 * commented out and `open-next.config.ts` on the dummy overrides. Arming means
 * three edits landing together — create the bucket, uncomment the
 * `r2_buckets`/`d1_databases` blocks, switch the overrides on — and the
 * dangerous state is the half-armed one: a binding without its override (cache
 * writes silently nowhere) or an override without its binding (a deploy that
 * fails at the end of the build, after the minutes the build took).
 *
 * Both files carry explanatory comments, so commented-out mentions must not
 * count as armed: line and block comments are stripped before matching.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const wranglerActive = stripComments(config);
const openNextConfig = await readFile(new URL("../open-next.config.ts", import.meta.url), "utf8");
const openNextActive = stripComments(openNextConfig);

const cachePairs = [
  {
    label: "R2 incremental cache",
    binding: '"binding": "NEXT_INC_CACHE_R2_BUCKET"',
    override: "r2IncrementalCache",
  },
  {
    label: "D1 tag cache",
    binding: '"binding": "NEXT_TAG_CACHE_D1"',
    override: "d1NextTagCache",
  },
];

for (const { label, binding, override } of cachePairs) {
  const bindingArmed = wranglerActive.includes(binding);
  const overrideArmed = openNextActive.includes(override);

  if (bindingArmed !== overrideArmed) {
    throw new Error(
      `${label} is half-armed: wrangler.jsonc binding ${bindingArmed ? "present" : "absent"} but ` +
        `open-next.config.ts override ${overrideArmed ? "present" : "absent"}. Arm both sides ` +
        "together, after the backing resource exists (see the notes in wrangler.jsonc).",
    );
  }
}

console.log("Production public configuration is present.");
