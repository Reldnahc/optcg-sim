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

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function readActiveText(relativePath) {
  const text = await readText(relativePath);
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function assertMatchesAll(text, patterns) {
  for (const pattern of patterns) {
    assert.match(text, pattern);
  }
}

test("cleanup validation tool remains exposed through package scripts", async () => {
  const packageJson = JSON.parse(await readText("package.json"));

  assert.equal(
    packageJson.scripts["cleanup:validate-dry-run"],
    "node --experimental-strip-types tools/post-merge-cleanup.ts",
  );
  assert.equal(
    packageJson.scripts["cleanup:validate-handoff"],
    "node --experimental-strip-types tools/post-merge-cleanup.ts -- --validate-cleanup-handoff",
  );
  assert.equal(
    packageJson.scripts["packets:complete"],
    "node --experimental-strip-types tools/build-agent-packet.ts complete",
  );
  assert.equal(
    packageJson.scripts["packets:complete-many"],
    "node --experimental-strip-types tools/build-agent-packet.ts complete-many",
  );
});

test("cleanup metadata guard workflow runs trusted base code before merge", async () => {
  const workflow = await readActiveText(
    ".github/workflows/cleanup-metadata-guard.yml",
  );

  assertMatchesAll(workflow, [
    /^name:\s*Cleanup metadata guard$/m,
    /pull_request_target:/,
    /issue_comment:\s*\n\s*types:\s*\n\s*- created\s*\n\s*- edited\s*\n\s*- deleted/i,
    /types:\s*\n\s*- opened\s*\n\s*- edited\s*\n\s*- synchronize\s*\n\s*- reopened\s*\n\s*- ready_for_review/i,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
    /persist-credentials: false/,
    /github\.rest\.pulls\.get/,
    /authorAssociation: comment\.author_association/,
    /cleanup-guard-input\.json/,
    /--validate-cleanup-handoff-json-file cleanup-guard-input\.json/,
  ]);
});

test("post-merge cleanup workflow wiring preserves all cleanup gates", async () => {
  const workflow = await readActiveText(
    ".github/workflows/post-merge-packet-cleanup.yml",
  );
  const preflightIndex = workflow.indexOf(
    "Validate cleanup metadata and write preflight plan",
  );
  const setupNodeIndex = workflow.indexOf("Set up Node for cleanup tooling");
  const cleanupJobIndex = workflow.indexOf(
    "cleanup:\n    name: cleanup-direct-push",
  );
  const executeIndex = workflow.indexOf("Execute validated packet cleanup");
  const cleanupSetupNodeIndex = workflow.indexOf(
    "Set up Node for cleanup tooling",
    cleanupJobIndex,
  );
  const finalizeIndex = workflow.indexOf(
    "Finalize cleanup-scoped lifecycle verification",
  );
  const pushIndex = workflow.indexOf("Push direct cleanup commit");
  const branchIndex = workflow.indexOf("Delete safe merged cleanup branches");

  assertMatchesAll(workflow, [
    /pull_request:\s*\n\s*branches:\s*\n\s*- main\s*\n\s*types:\s*\n\s*- closed/i,
    /Check out trusted default branch[\s\S]*ref: \$\{\{ github\.event\.repository\.default_branch \}\}[\s\S]*persist-credentials: false/i,
    /Set up Node for cleanup tooling[\s\S]*uses: actions\/setup-node@v4[\s\S]*node-version: lts\/\*/i,
    /cleanup:\s*\n\s*name: cleanup-direct-push\s*\n\s*needs: preflight/i,
    /token: \$\{\{ secrets\.POST_MERGE_PACKET_CLEANUP_TOKEN \}\}/,
    /--execute-plan-file \.cleanup\/bound-cleanup-plan\.json/,
    /--finalize-plan-file \.cleanup\/bound-cleanup-plan\.json/,
    /--branch-cleanup-plan-file \.cleanup\/bound-cleanup-plan\.json/,
    /github\.rest\.git\.deleteRef/,
  ]);
  assert.ok(preflightIndex > -1, "missing preflight validation");
  assert.ok(setupNodeIndex > -1, "missing Node setup for cleanup tooling");
  assert.ok(
    setupNodeIndex < preflightIndex,
    "Node setup must happen before cleanup TypeScript tooling runs",
  );
  assert.ok(cleanupJobIndex > -1, "missing cleanup direct-push job");
  assert.ok(
    cleanupSetupNodeIndex > cleanupJobIndex,
    "cleanup direct-push job must set up Node",
  );
  assert.ok(
    cleanupSetupNodeIndex < executeIndex,
    "cleanup job Node setup must happen before cleanup TypeScript tooling runs",
  );
  assert.ok(
    executeIndex > preflightIndex,
    "packet cleanup must follow preflight",
  );
  assert.ok(
    finalizeIndex > executeIndex,
    "cleanup-scoped finalization must follow packet cleanup",
  );
  assert.ok(
    pushIndex > finalizeIndex,
    "push must follow cleanup-scoped finalization",
  );
  assert.ok(
    branchIndex > pushIndex,
    "branch deletion must follow cleanup push",
  );
  assert.doesNotMatch(workflow, /gh pr create/);
  assert.doesNotMatch(workflow, /corepack pnpm verify/);
});

test("PR template records cleanup metadata and reviewer responsibility", async () => {
  const prTemplate = await readActiveText(".github/pull_request_template.md");

  assertMatchesAll(prTemplate, [
    /^## Post-Merge Cleanup$/m,
    /Cleanup metadata is a reviewed request, not standalone authority/i,
    /Reviewers confirm this metadata matches the reviewed story scope before merge/i,
    /The human-controlled merge to `main` authorizes the cleanup metadata snapshot/i,
    /Automation-created cleanup pull requests are not created/i,
    /Post-merge cleanup:\s*\n\s*mode: single\s*\n\s*stories:\s*\n\s*- stories\/approved\/<STORY-ID>-<slug>\.yaml\s*\n\s*branches:\s*\n\s*- <head-branch>/i,
    /Post-merge cleanup:\s*\n\s*mode: parent\s*\n\s*stories:\s*\n\s*- stories\/approved\/<CHILD-STORY>\.yaml\s*\n\s*branches:\s*\n\s*- <parent-integration-branch>\s*\n\s*- <optional-substory-branch>/i,
  ]);
  assert.doesNotMatch(
    prTemplate,
    /Confirm the exact cleanup metadata source ref before merge/i,
  );
  assert.doesNotMatch(prTemplate, /names the exact `pr-body:/i);
});

test("workflow docs make automation normal and manual fallback operational-only", async () => {
  const storyExecution = await readActiveText(
    "docs/workflow/story-execution.md",
  );
  const parentBranches = await readActiveText(
    "docs/workflow/parent-integration-branches.md",
  );
  const workflowDocs = `${storyExecution}\n${parentBranches}`;

  assertMatchesAll(workflowDocs, [
    /Post-merge packet cleanup automation is the normal path after a reviewed story PR or parent PR merges/i,
    /human-controlled merge to `main` is the cleanup approval signal/i,
    /computed metadata source ref is audit evidence/i,
    /Automation-created cleanup pull requests are not created/i,
    /Manual fallback is only for operational failure/i,
    /Manual edits beyond pure packet-completion output still use the normal PR and reviewer path/i,
    /After the parent PR merges to `main`, automation completes all included substories with `pnpm run packets:complete-many/i,
    /Branch deletion runs only after packet cleanup succeeds and never deletes protected, unrelated, or unmerged branches/i,
  ]);
  assert.doesNotMatch(
    workflowDocs,
    /must reference the exact cleanup metadata source ref/i,
  );
});

test("branch-protection docs preserve narrow cleanup bypass and normal PR gates", async () => {
  const guide = await readActiveText(".github/branch-protection.md");

  assertMatchesAll(guide, [
    /Ordinary protected-branch changes still require pull requests, Code Owner review, at least one approval, conversation resolution, and required status checks/i,
    /dedicated GitHub App actor `optcg-packet-cleanup\[bot\]`/i,
    /cleanup-metadata-guard/,
    /workflow `.github\/workflows\/post-merge-packet-cleanup\.yml`/i,
    /token `POST_MERGE_PACKET_CLEANUP_TOKEN`/i,
    /only to push exact packet-completion command output to `main` after a reviewed pull request has merged/i,
    /must not open cleanup pull requests/i,
    /may delete branches only after packet lifecycle cleanup succeeds, and only for associated merged, unprotected story or substory branches/i,
    /Do not expose the cleanup token to ordinary development pushes, broad admin roles, human-user development paths, or other workflows/i,
    /remote GitHub rulesets or branch-protection settings cannot be changed from this repository/i,
  ]);
  assert.doesNotMatch(guide, /allow arbitrary GitHub Actions workflows/i);
});
