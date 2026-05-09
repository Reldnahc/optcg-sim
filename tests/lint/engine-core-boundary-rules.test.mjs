import assert from "node:assert/strict";
import { test } from "vitest";
import eslintConfig from "../../eslint.config.mjs";

function getEngineCoreBoundaryRule() {
  const config = eslintConfig.find((entry) =>
    Array.isArray(entry.files)
      ? entry.files.includes(
          "packages/engine-core/**/*.{ts,mts,cts,js,mjs,cjs}",
        )
      : false,
  );

  assert.ok(config, "missing engine-core eslint boundary config");

  const restrictedImportsRule = config.rules?.["no-restricted-imports"];
  assert.ok(
    Array.isArray(restrictedImportsRule),
    "engine-core no-restricted-imports must be configured with array options",
  );
  assert.equal(restrictedImportsRule[0], "error");
  assert.equal(typeof restrictedImportsRule[1], "object");

  return restrictedImportsRule[1];
}

test("engine-core import boundaries include cards package and external-data clients", () => {
  const restrictedImports = getEngineCoreBoundaryRule();
  const restrictedPaths = restrictedImports.paths ?? [];
  const restrictedPatterns = restrictedImports.patterns ?? [];

  for (const requiredPath of [
    "@optcg/cards",
    "redis",
    "pg",
    "axios",
    "undici",
    "node-fetch",
  ]) {
    assert.ok(
      restrictedPaths.includes(requiredPath),
      `engine-core boundary should ban direct import: ${requiredPath}`,
    );
  }

  for (const requiredPattern of [
    "**/cards/**",
    "@optcg/cards/*",
    "**/poneglyph-client**",
    "**/client/**",
    "**/server/**",
    "**/browser/**",
  ]) {
    assert.ok(
      restrictedPatterns.includes(requiredPattern),
      `engine-core boundary should ban import pattern: ${requiredPattern}`,
    );
  }
});
