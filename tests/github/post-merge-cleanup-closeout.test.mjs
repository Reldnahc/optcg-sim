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
    packageJson.scripts["packets:complete"],
    "node --experimental-strip-types tools/build-agent-packet.ts complete",
  );
  assert.equal(
    packageJson.scripts["packets:complete-many"],
    "node --experimental-strip-types tools/build-agent-packet.ts complete-many",
  );
});

test("post-merge cleanup workflow wiring preserves all cleanup gates", async () => {
  const workflow = await readActiveText(
    ".github/workflows/post-merge-packet-cleanup.yml",
  );
  const preflightIndex = workflow.indexOf(
    "Validate cleanup metadata and write preflight plan",
  );
  const executeIndex = workflow.indexOf("Execute validated packet cleanup");
  const verifyIndex = workflow.indexOf("Run repo verification before push");
  const revalidateIndex = workflow.indexOf(
    "Revalidate cleanup diff after verification",
  );
  const pushIndex = workflow.indexOf("Push direct cleanup commit");
  const branchIndex = workflow.indexOf("Delete safe merged cleanup branches");

  assertMatchesAll(workflow, [
    /pull_request:\s*\n\s*branches:\s*\n\s*- main\s*\n\s*types:\s*\n\s*- closed/i,
    /Check out trusted default branch[\s\S]*ref: \$\{\{ github\.event\.repository\.default_branch \}\}[\s\S]*persist-credentials: false/i,
    /cleanup:\s*\n\s*name: cleanup-direct-push\s*\n\s*needs: preflight/i,
    /token: \$\{\{ secrets\.POST_MERGE_PACKET_CLEANUP_TOKEN \}\}/,
    /--execute-plan-file \.cleanup\/bound-cleanup-plan\.json/,
    /--finalize-plan-file \.cleanup\/bound-cleanup-plan\.json/,
    /--branch-cleanup-plan-file \.cleanup\/bound-cleanup-plan\.json/,
    /github\.rest\.git\.deleteRef/,
  ]);
  assert.ok(preflightIndex > -1, "missing preflight validation");
  assert.ok(
    executeIndex > preflightIndex,
    "packet cleanup must follow preflight",
  );
  assert.ok(
    verifyIndex > executeIndex,
    "verification must follow packet cleanup",
  );
  assert.ok(
    revalidateIndex > verifyIndex,
    "final diff validation must follow verification",
  );
  assert.ok(
    pushIndex > revalidateIndex,
    "push must follow final diff validation",
  );
  assert.ok(
    branchIndex > pushIndex,
    "branch deletion must follow cleanup push",
  );
  assert.doesNotMatch(workflow, /gh pr create/);
});

test("PR template records cleanup metadata and reviewer responsibility", async () => {
  const prTemplate = await readActiveText(".github/pull_request_template.md");

  assertMatchesAll(prTemplate, [
    /^## Post-Merge Cleanup$/m,
    /Cleanup metadata is a reviewed request, not standalone authority/i,
    /Reviewers confirm this metadata matches the reviewed story scope before merge/i,
    /Confirm the exact cleanup metadata source ref before merge/i,
    /corepack pnpm cleanup:validate-dry-run -- --print-source-ref/i,
    /Automation-created cleanup pull requests are not created/i,
    /Post-merge cleanup:\s*\n\s*mode: single\s*\n\s*stories:\s*\n\s*- stories\/approved\/<STORY-ID>-<slug>\.yaml\s*\n\s*branches:\s*\n\s*- <head-branch>/i,
    /Post-merge cleanup:\s*\n\s*mode: parent\s*\n\s*stories:\s*\n\s*- stories\/approved\/<CHILD-A>\.yaml\s*\n\s*- stories\/approved\/<CHILD-B>\.yaml\s*\n\s*branches:\s*\n\s*- <parent-integration-branch>\s*\n\s*- <optional-substory-branch>/i,
  ]);
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
    /exact cleanup metadata source ref/i,
    /handoff-comment:<comment-id>:<sha256>/i,
    /Automation-created cleanup pull requests are not created/i,
    /Manual fallback is only for operational failure/i,
    /Manual edits beyond pure packet-completion output still use the normal PR and reviewer path/i,
    /After the parent PR merges to `main`, automation completes all included substories with `pnpm run packets:complete-many/i,
    /Branch deletion runs only after packet cleanup succeeds and never deletes protected, unrelated, or unmerged branches/i,
  ]);
});

test("branch-protection docs preserve narrow cleanup bypass and normal PR gates", async () => {
  const guide = await readActiveText(".github/branch-protection.md");

  assertMatchesAll(guide, [
    /Ordinary protected-branch changes still require pull requests, Code Owner review, at least one approval, conversation resolution, and required status checks/i,
    /dedicated GitHub App actor `optcg-packet-cleanup\[bot\]`/i,
    /workflow `.github\/workflows\/post-merge-packet-cleanup\.yml`/i,
    /token `POST_MERGE_PACKET_CLEANUP_TOKEN`/i,
    /only to push exact packet-completion command output to `main` after a reviewed pull request has merged/i,
    /must not open cleanup pull requests/i,
    /may delete branches only after packet lifecycle cleanup succeeds, and only for associated merged, unprotected story or substory branches/i,
    /Do not expose the cleanup token to ordinary development pushes, broad admin roles, human-user development paths, or other workflows/i,
  ]);
  assert.doesNotMatch(guide, /allow arbitrary GitHub Actions workflows/i);
});
