import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Stage 11's exit condition, as far as it can be checked without a database.
 *
 * The real enforcement lives in two places this suite cannot reach: the
 * dashboard layout, which guards every page beneath it, and RLS, which refuses
 * the write even if both application checks were somehow skipped. What is
 * checked here is the thing those two cannot catch — a new server action added
 * under `dashboard/` that quietly forgets to say who may call it.
 *
 * It is a structural assertion about the source, deliberately: the failure it
 * exists to catch is one of omission, and omission is exactly what a test
 * against a running system does not notice, because the missing guard only
 * matters for the caller nobody wrote a case for.
 *
 * Live authorization and RLS are covered by `supabase/tests/rls/*.sql`, which
 * needs a database and runs under `supabase test db`.
 */

const DASHBOARD = join(process.cwd(), "src/app/[locale]/dashboard");

function actionFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...actionFiles(path));
    } else if (entry.name === "actions.ts" || entry.name.endsWith("-actions.ts")) {
      found.push(path);
    }
  }

  return found;
}

const files = actionFiles(DASHBOARD).map((path) => ({
  path,
  label: path.slice(DASHBOARD.length + 1),
  source: readFileSync(path, "utf8"),
}));

describe("dashboard server actions", () => {
  it("finds the action files to check, so an empty glob cannot pass silently", () => {
    // Without this, renaming the directory would turn every assertion below into
    // a vacuous truth and the suite would go green having checked nothing.
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [file.label, file.source] as const))(
    "%s requires an administrator",
    (_label, source) => {
      expect(source).toContain("requireAdmin");
    },
  );

  it.each(files.map((file) => [file.label, file.source] as const))(
    "%s is a server module",
    (_label, source) => {
      // A `"use server"` file exports a callable endpoint. One of these without
      // the directive is not reachable as an action, which is worth knowing too.
      expect(source.startsWith('"use server"')).toBe(true);
    },
  );
});

describe("audit coverage", () => {
  /*
   * Actions whose effect a customer can see, or which change who may do what.
   * These are the ones somebody may later need to attribute to a person, so the
   * audit row is part of the feature rather than a nicety.
   *
   * Listed explicitly rather than inferred: not every dashboard write deserves
   * an audit row, and a rule that guesses would either miss the ones that matter
   * or bury them among settings saves.
   */
  const mustAudit = ["support/actions.ts", "reviews/actions.ts"];

  it.each(mustAudit)("%s records who did it", (label) => {
    const file = files.find((candidate) => candidate.label === label);

    expect(file, `${label} should exist`).toBeDefined();
    expect(file?.source).toContain("recordAudit");
  });

  it("routes every audit write through the one helper", () => {
    /*
     * Two services used to carry their own copy of this insert. A third would
     * have been the point at which they drifted — so the insert now lives in
     * `admin-audit.service.ts` alone, and this is what says so.
     */
    const services = join(process.cwd(), "src/lib/services");
    const writers = readdirSync(services)
      .filter((name) => name.endsWith(".ts"))
      .filter((name) => name !== "admin-audit.service.ts")
      .filter((name) => readFileSync(join(services, name), "utf8").includes('from("audit_logs")'));

    expect(writers).toEqual([]);
  });
});
