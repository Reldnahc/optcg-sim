import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "..");
const checkedRoots = [
  path.join(packageRoot, "src"),
  path.join(packageRoot, "scripts"),
];

const restrictedDependencyNames = [
  "react",
  "redis",
  "pg",
  "ws",
  "axios",
  "undici",
  "node-fetch",
];

const restrictedImportPatterns = [
  /from\s+["'][^"']*\/browser(?:\/|["'])/,
  /from\s+["'][^"']*\/client(?:\/|["'])/,
  /from\s+["'][^"']*\/server(?:\/|["'])/,
  /from\s+["'][^"']*\/view-engine(?:\/|["'])/,
];

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    return /\.(?:mjs|ts)$/u.test(fullPath) ? [fullPath] : [];
  });

test("CLI package depends only on allowed local packages and standard Node APIs", () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const dependencies = Object.keys(packageJson.dependencies ?? {});
  assert.deepEqual(dependencies.sort(), ["@optcg/engine-core", "@optcg/types"]);
  assert.deepEqual(Object.keys(packageJson.devDependencies ?? {}), []);
  for (const dependency of restrictedDependencyNames) {
    assert.equal(dependencies.includes(dependency), false, dependency);
  }

  for (const root of checkedRoots) {
    assert.ok(statSync(root).isDirectory());
  }

  for (const filePath of checkedRoots.flatMap(collectSourceFiles)) {
    const source = readFileSync(filePath, "utf8");
    for (const dependency of restrictedDependencyNames) {
      assert.doesNotMatch(source, new RegExp(`from\\s+["']${dependency}["']`));
    }
    assert.doesNotMatch(source, /from\s+["']vite["']/);
    for (const pattern of restrictedImportPatterns) {
      assert.doesNotMatch(source, pattern);
    }
  }
});
