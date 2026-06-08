import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const canonicalModuleFiles = [
  "types/primitives.ts",
  "types/card-metadata.ts",
  "types/events.ts",
  "types/view.ts",
  "types/game-state.ts",
  "types/effects.ts",
  "types/decisions.ts",
  "types/runtime.ts",
  "types/effect-presentation.ts",
  "types/support-certification.ts",
];

const exportNamePattern = /export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/g;

async function readContractFile(relativePath) {
  return readFile(path.join(repoRoot, "contracts", relativePath), "utf8");
}

async function readCanonicalModuleSources() {
  return Promise.all(
    canonicalModuleFiles.map(async (fileName) => ({
      fileName,
      source: await readContractFile(fileName),
    })),
  );
}

function collectExportNames(source) {
  return [...source.matchAll(exportNamePattern)].map((match) => match[1]);
}

test("canonical contract declarations live in focused domain modules", async () => {
  const moduleSources = await readCanonicalModuleSources();
  const moduleExportNames = new Set(
    moduleSources.flatMap(({ source }) => collectExportNames(source)),
  );

  assert.ok(moduleExportNames.has("CardId"));
  assert.ok(moduleExportNames.has("ResolvedCard"));
  assert.ok(moduleExportNames.has("EngineEvent"));
  assert.ok(moduleExportNames.has("PlayerView"));
  assert.ok(moduleExportNames.has("GameState"));
  assert.ok(moduleExportNames.has("Effect"));
  assert.ok(moduleExportNames.has("PendingDecision"));
  assert.ok(moduleExportNames.has("EffectQueueEntry"));
});

test("canonical compatibility barrel re-exports each focused domain module", async () => {
  const canonicalTypes = await readContractFile("canonical-types.ts");

  for (const moduleFile of canonicalModuleFiles) {
    const modulePath = `./${moduleFile.replace(/\.ts$/, ".js")}`;
    assert.match(
      canonicalTypes,
      new RegExp(`export\\s+type\\s+\\*\\s+from\\s+"${modulePath}";`),
      `missing type-only barrel export for ${modulePath}`,
    );
  }
});
