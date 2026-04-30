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

async function readCanonicalTypes() {
  return readFile(
    path.join(repoRoot, "contracts", "canonical-types.ts"),
    "utf8",
  );
}

test("GameState keeps the once-per-turn ledger in canonical state", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /export interface GameState\s*{[\s\S]*?\boncePerTurn:\s*OncePerTurnRecord\[];[\s\S]*?}/m,
  );
});

test("Action preserves branded IDs for effect activation and decision responses", async () => {
  const canonicalTypes = await readCanonicalTypes();

  assert.match(
    canonicalTypes,
    /type:\s*"activateEffect";[\s\S]*?\beffectId:\s*EffectId;/m,
  );
  assert.match(
    canonicalTypes,
    /type:\s*"respondToDecision";[\s\S]*?\bdecisionId:\s*DecisionId;/m,
  );
});
