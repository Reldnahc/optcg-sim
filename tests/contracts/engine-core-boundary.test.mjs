import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import eslintConfig from "../../eslint.config.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const engineCoreSrc = path.join(repoRoot, "packages/engine-core/src");

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

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
      continue;
    }
    if (/\.(?:ts|mts|cts|js|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function importedSpecifiers(source) {
  const specifiers = [];
  const importPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }
  for (const match of source.matchAll(dynamicImportPattern)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

test("engine-core import boundaries ban cards/live data and app-layer dependencies", () => {
  const restrictedImports = getEngineCoreBoundaryRule();
  const restrictedPaths = restrictedImports.paths ?? [];
  const restrictedPatterns = restrictedImports.patterns ?? [];

  for (const requiredPath of [
    "@optcg/cards",
    "@optcg/browser",
    "@optcg/client",
    "@optcg/server",
    "@optcg/ui",
    "@optcg/view-engine",
    "react",
    "redis",
    "pg",
    "ws",
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
    "**/ui/**",
    "**/view-engine/**",
  ]) {
    assert.ok(
      restrictedPatterns.includes(requiredPattern),
      `engine-core boundary should ban import pattern: ${requiredPattern}`,
    );
  }
});

test("engine-core source has no cards live-data, server, client, or UI imports", async () => {
  const forbiddenImportPrefixes = [
    "@optcg/cards",
    "@optcg/browser",
    "@optcg/client",
    "@optcg/server",
    "@optcg/ui",
    "@optcg/view-engine",
    "react",
    "redis",
    "pg",
    "ws",
    "axios",
    "undici",
    "node-fetch",
  ];
  const forbiddenImportFragments = [
    "/cards/",
    "/poneglyph-client",
    "/client/",
    "/server/",
    "/browser/",
    "/ui/",
    "/view-engine/",
  ];

  for (const filePath of await collectSourceFiles(engineCoreSrc)) {
    const source = await readFile(filePath, "utf8");
    for (const specifier of importedSpecifiers(source)) {
      assert.equal(
        forbiddenImportPrefixes.some(
          (prefix) =>
            specifier === prefix || specifier.startsWith(`${prefix}/`),
        ),
        false,
        `${path.relative(repoRoot, filePath)} imports forbidden package ${specifier}`,
      );
      assert.equal(
        forbiddenImportFragments.some((fragment) =>
          specifier.replaceAll("\\", "/").includes(fragment),
        ),
        false,
        `${path.relative(repoRoot, filePath)} imports forbidden path ${specifier}`,
      );
    }
  }
});
