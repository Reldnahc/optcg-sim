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

const toolingLaneFiles = ["packages/cli/src", "tests/lint"];

async function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const contents = await readFile(absolutePath, "utf8");
  return JSON.parse(contents);
}

test("contracts lane aggregates canonical contract subcommands", async () => {
  const packageJson = await readJson("package.json");
  const contractsLane = packageJson.scripts?.contracts;

  assert.equal(typeof contractsLane, "string", "missing root contracts lane");

  const expectedSubcommands = [
    "corepack pnpm run contracts:compile",
    "corepack pnpm run contracts:validate-effects",
    "corepack pnpm run contracts:validate-db-schema",
    "corepack pnpm run types:sync:check",
    "corepack pnpm run test:contracts",
  ];

  const actualSubcommands = contractsLane
    .split("&&")
    .map((part) => part.trim());
  assert.deepEqual(
    actualSubcommands,
    expectedSubcommands,
    "contracts lane must be exact expected commands chained with && in order",
  );

  assert.doesNotMatch(
    contractsLane,
    /\bpnpm run contracts(?!:)\b/,
    "contracts lane must not invoke itself",
  );
  assert.doesNotMatch(
    contractsLane,
    /\|\|\s*true\b/i,
    "contracts lane must not bypass failures with fallback clauses",
  );
});

test("root test lanes separate contracts and tooling without dropping coverage", async () => {
  const packageJson = await readJson("package.json");
  const rootTestLane = packageJson.scripts?.test;
  const contractsTestLane = packageJson.scripts?.["test:contracts"];
  const toolingLane = packageJson.scripts?.["test:tooling"];

  assert.equal(typeof rootTestLane, "string", "missing root test lane");
  assert.equal(
    typeof contractsTestLane,
    "string",
    "missing test:contracts lane",
  );
  assert.equal(typeof toolingLane, "string", "missing test:tooling lane");

  assert.match(
    contractsTestLane,
    /\bvitest\s+run\s+tests\/contracts\b/,
    "contract test lane must explicitly include tests/contracts suites",
  );

  assert.match(
    rootTestLane,
    /--exclude\s+tests\/contracts\/\*\*\/\*\.test\.mjs\b/,
    "root test lane must exclude broad tests/contracts suites",
  );
  assert.match(
    rootTestLane,
    /--exclude\s+packages\/cli\/src\/\*\*\/\*\.test\.ts\b/,
    "root test lane must exclude CLI suites owned by tooling lane",
  );
  assert.match(
    rootTestLane,
    /--exclude\s+tests\/lint\/\*\*\/\*\.test\.mjs\b/,
    "root test lane must exclude lint-config suites owned by tooling lane",
  );
  assert.doesNotMatch(
    contractsTestLane,
    /\|\|\s*true\b/i,
    "contracts lane must not bypass failures with fallback clauses",
  );

  for (const toolingTarget of toolingLaneFiles) {
    assert.match(
      toolingLane,
      new RegExp(
        `\\b${toolingTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      ),
      `tooling lane must include ${toolingTarget}`,
    );
  }
});

test("root typecheck compiles workspace package lanes", async () => {
  const packageJson = await readJson("package.json");
  const typecheckLane = packageJson.scripts?.typecheck;

  assert.equal(typeof typecheckLane, "string", "missing root typecheck lane");

  const expectedSubcommands = [
    "corepack pnpm exec tsc -p packages/types/tsconfig.json --noEmit",
    "corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit",
    "corepack pnpm exec tsc -p packages/cli/tsconfig.json --noEmit",
    "corepack pnpm exec tsc -p packages/cards/tsconfig.json --noEmit",
    "corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit",
    "corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit",
    "corepack pnpm exec tsc -p tools/tsconfig.json --noEmit",
  ];

  const actualSubcommands = typecheckLane
    .split("&&")
    .map((part) => part.trim());
  assert.deepEqual(
    actualSubcommands,
    expectedSubcommands,
    "typecheck lane must compile workspace packages and tools in order",
  );
});
