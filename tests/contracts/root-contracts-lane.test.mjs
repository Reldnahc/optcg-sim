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

const cleanupContractFiles = [
  "tests/contracts/post-merge-cleanup-contract.test.mjs",
  "tests/contracts/post-merge-cleanup-parent-contract.test.mjs",
  "tests/contracts/post-merge-cleanup-preflight-contract.test.mjs",
  "tests/contracts/post-merge-cleanup-executor-contract.test.mjs",
  "tests/contracts/post-merge-branch-cleanup-contract.test.mjs",
  "tests/github/post-merge-cleanup-closeout.test.mjs",
  "tests/github/post-merge-cleanup-evidence-builder.test.mjs",
];

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
    "corepack pnpm run stories:validate",
    "corepack pnpm run types:sync:check",
    "corepack pnpm run test:contracts",
    "corepack pnpm run test:cleanup-contracts",
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

test("root test lanes separate cleanup-heavy contracts without dropping coverage", async () => {
  const packageJson = await readJson("package.json");
  const rootTestLane = packageJson.scripts?.test;
  const contractsTestLane = packageJson.scripts?.["test:contracts"];
  const cleanupLane = packageJson.scripts?.["test:cleanup-contracts"];

  assert.equal(typeof rootTestLane, "string", "missing root test lane");
  assert.equal(
    typeof contractsTestLane,
    "string",
    "missing test:contracts lane",
  );
  assert.equal(
    typeof cleanupLane,
    "string",
    "missing test:cleanup-contracts lane",
  );

  for (const cleanupFile of cleanupContractFiles) {
    assert.match(
      rootTestLane,
      new RegExp(
        `--exclude\\s+${cleanupFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
      `root test lane must exclude cleanup-heavy file ${cleanupFile}`,
    );
    assert.match(
      cleanupLane,
      new RegExp(cleanupFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `cleanup lane must include cleanup-heavy file ${cleanupFile}`,
    );
  }

  for (const cleanupFile of cleanupContractFiles.filter((file) =>
    file.startsWith("tests/contracts/"),
  )) {
    assert.match(
      contractsTestLane,
      new RegExp(
        `--exclude\\s+${cleanupFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
      `contract test lane must exclude cleanup-heavy file ${cleanupFile}`,
    );
  }

  assert.match(
    cleanupLane,
    /--no-file-parallelism\b/,
    "cleanup lane should isolate git-heavy cleanup suites from file-level parallelism",
  );
  assert.doesNotMatch(
    cleanupLane,
    /\|\|\s*true\b/i,
    "cleanup lane must not bypass failures with fallback clauses",
  );
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
