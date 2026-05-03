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

async function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const contents = await readFile(absolutePath, "utf8");
  return JSON.parse(contents);
}

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

function extractContractsJobBlock(workflowText) {
  const lines = workflowText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    /^\s{2}contracts:\s*$/.test(line),
  );
  assert.notEqual(startIndex, -1, "missing contracts job block");

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (/^\s{2}[a-zA-Z0-9_-]+:\s*$/.test(lines[i])) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join("\n");
}

test("package.json exposes the canonical contract lane for CI", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(
    typeof packageJson.scripts?.contracts,
    "string",
    "missing contracts script",
  );
  assert.equal(
    typeof packageJson.scripts?.["test:contracts"],
    "string",
    "missing test:contracts script",
  );
  assert.match(
    packageJson.scripts.verify,
    /pnpm run contracts/i,
    "verify should include the root contracts lane once it exists",
  );
});

test("ci workflow file exists with the expected verification jobs", async () => {
  const workflow = await readText(".github/workflows/ci.yml");

  assert.match(workflow, /^name:\s*CI/m);
  assert.match(workflow, /^on:\s*$/m);
  assert.match(workflow, /^\s+pull_request:\s*$/m);
  assert.match(workflow, /^\s+push:\s*$/m);
  assert.match(workflow, /^\s+quality:\s*$/m);
  assert.match(workflow, /^\s+test:\s*$/m);
  assert.match(workflow, /^\s+contracts:\s*$/m);
  assert.match(workflow, /^\s+coverage:\s*$/m);
});

test("ci workflow runs the canonical root commands and publishes coverage", async () => {
  const workflow = await readText(".github/workflows/ci.yml");
  const contractsJobBlock = extractContractsJobBlock(workflow);

  const requiredCommands = [
    "pnpm install --frozen-lockfile",
    "pnpm format:check",
    "pnpm lint",
    "pnpm typecheck",
    "pnpm test",
    "pnpm contracts",
    "pnpm coverage",
  ];

  for (const command of requiredCommands) {
    const targetText =
      command === "pnpm contracts" ? contractsJobBlock : workflow;
    assert.match(
      targetText,
      new RegExp(command.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")),
      `workflow should call \`${command}\``,
    );
  }

  const forbiddenContractsJobCommands = [
    "pnpm test:contracts",
    "pnpm run contracts:compile",
    "pnpm run contracts:validate-effects",
    "pnpm run contracts:validate-db-schema",
  ];

  for (const command of forbiddenContractsJobCommands) {
    assert.doesNotMatch(
      contractsJobBlock,
      new RegExp(command.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")),
      `contracts job should not call bespoke sub-lane command \`${command}\``,
    );
  }

  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /pnpm\/action-setup@v4/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /coverage-artifact/);
});
