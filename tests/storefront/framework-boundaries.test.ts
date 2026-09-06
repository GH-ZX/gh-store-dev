import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { expect, it } from "vitest";
import ts from "typescript";

it("has no Next.js runtime imports in the migrated application", () => {
  const root = fileURLToPath(new URL("../../storefront/app", import.meta.url));
  const dependencies: string[] = [];
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { scan(path); continue; }
      if (!/\.tsx?$/.test(path)) continue;
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
        if (specifier && ts.isStringLiteral(specifier) && /^(next(?:\/|$)|server-only$)/.test(specifier.text)) dependencies.push(`${path}: ${specifier.text}`);
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(root);
  expect(dependencies).toEqual([]);
});
