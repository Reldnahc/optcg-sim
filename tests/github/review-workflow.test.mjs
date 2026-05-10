import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

function readYamlScalar(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));

  if (!match?.[1]) {
    throw new Error(`Unable to read YAML scalar ${key}`);
  }

  return match[1].trim();
}

function assertMatchesAll(text, patterns) {
  for (const pattern of patterns) {
    assert.match(text, pattern);
  }
}

function extractBranchProtectionRequiredChecks(guide) {
  const match = guide.match(
    /## Required Status Checks[\s\S]*?Require the following checks before merge:\n\n(?<checks>(?:- `[^`]+`\n)+)/,
  );

  if (!match?.groups?.checks) {
    throw new Error("Unable to read branch-protection required checks");
  }

  return match.groups.checks
    .trim()
    .split(/\r?\n/)
    .map((line) => line.match(/^- `(?<check>[^`]+)`$/)?.groups?.check)
    .filter((check) => check !== undefined);
}

function extractCiWorkflowJobNames(workflow) {
  const jobsMatch = workflow.match(/^jobs:\n(?<jobs>[\s\S]*)$/m);

  if (!jobsMatch?.groups?.jobs) {
    throw new Error("Unable to read CI workflow jobs");
  }

  const lines = jobsMatch.groups.jobs.split(/\r?\n/);
  const jobNames = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^ {2}[\w-]+:\s*$/.test(lines[index] ?? "")) {
      continue;
    }

    const bodyLines = [];
    index += 1;

    while (
      index < lines.length &&
      !/^ {2}[\w-]+:\s*$/.test(lines[index] ?? "")
    ) {
      bodyLines.push(lines[index] ?? "");
      index += 1;
    }

    index -= 1;

    const nameLine = bodyLines.find((line) => /^ {4}name:\s*/.test(line));
    const name = nameLine?.match(/^ {4}name:\s*(?<name>.+)$/)?.groups?.name;

    if (!name) {
      throw new Error("Unable to read CI workflow job display name");
    }

    jobNames.push(name.replace(/^["']|["']$/g, ""));
  }

  return jobNames;
}

test("ci workflow check extraction reads job display names instead of job ids", () => {
  const workflow = `name: CI

jobs:
  quality-lane:
    name: quality
    runs-on: ubuntu-latest
  hidden-info-lane:
    name: hidden-info
    runs-on: ubuntu-latest
`;

  assert.deepEqual(extractCiWorkflowJobNames(workflow), [
    "quality",
    "hidden-info",
  ]);
});

function assertValidStoryId(storyId) {
  assert.match(storyId, /^[A-Z][A-Z0-9]*-\d{3}[A-Z]?$/);
}

async function assertStoryMovedToDone(storyId, fileName) {
  const doneStory = await readText(`stories/done/${fileName}`);

  await assert.rejects(() =>
    access(path.join(repoRoot, "stories", "approved", fileName)),
  );

  assert.equal(readYamlScalar(doneStory, "id"), storyId);
  assert.equal(readYamlScalar(doneStory, "status"), "done");
}

test("codeowners exists and routes review to the repo owner", async () => {
  const codeowners = await readText(".github/CODEOWNERS");

  assert.match(codeowners, /^\*\s+@Reldnahc$/m);
  assert.match(codeowners, /^\/\.github\/\s+@Reldnahc$/m);
  assert.match(codeowners, /^\/contracts\/\s+@Reldnahc$/m);
  assert.match(codeowners, /^\/specs\/\s+@Reldnahc$/m);
});

test("pull request template requires story, verification, and subagent review evidence", async () => {
  const prTemplate = await readActiveText(".github/pull_request_template.md");

  const requiredSections = [
    "## Approved Story",
    "## Spec Refs",
    "## Scope Check",
    "## Tests Run",
    "## Review",
    "## Assumptions and Risks",
  ];

  for (const section of requiredSections) {
    assert.match(
      prTemplate,
      new RegExp(`^${section.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}$`, "m"),
      `missing PR template section ${section}`,
    );
  }

  assertMatchesAll(prTemplate, [
    /pnpm verify/i,
    /AI review completed before human review request, or equivalent human review fallback recorded because no usable reviewer-subagent run remained after the available reviewer-subagent surfaces were found unavailable, timed out, or failed/i,
    /Separate reviewer subagent run completed before human review request, or equivalent human review fallback recorded because no usable reviewer-subagent run remained after the available reviewer-subagent surfaces were found unavailable, timed out, or failed/i,
    /Implementation-worker self-review or parent-coordinator self-review was not used as the review gate/i,
    /Parent agent stayed within small local glue and orchestration while worker subagent\(s\) handled the main implementation body, or this was a parent-owned documentation-only authority edit/i,
    /Reviewer subagent output came from a different agent than the implementing worker, or equivalent human review fallback was recorded/i,
    /Worker subagent reference\(s\) or `none: parent-owned authority edit`:/i,
    /Parent\/orchestrator model: `gpt-5\.5`/i,
    /Implementation worker model and reasoning: `<gpt-5\.3-codex medium \| gpt-5\.5 medium \| none: parent-owned authority edit>`/i,
    /Reviewer model and reasoning: `gpt-5\.4 high`/i,
    /Model-routing deviations:/i,
    /Parent-agent orchestration note:/i,
    /Review path used: `<reviewer subagent \| native PR review artifact \| equivalent human review fallback>`/i,
    /Reviewer subagent reference or review surface:/i,
    /Reviewer mode:/i,
    /Review timeout budget: 60 minutes/i,
    /AI review record, if reviewer subagent review was used/i,
    /Equivalent human review fallback comment, if no usable reviewer-subagent run remained/i,
    /Revision response comment, if reviewer subagent review was used/i,
    /Human merge-gate review record \(approval link or equivalent human review step reference\):/i,
    /The required review artifact is present on this PR\./i,
    /When the separate reviewer-subagent output does not already live on the PR, the AI review comment copies the findings and verdict from that separate reviewer-subagent output\./i,
    /When a reviewer subagent surface already posts a durable PR artifact, that native PR artifact itself serves as the AI review record\./i,
    /If the fallback path was used, the fallback review comment explains why no usable reviewer-subagent run remained/i,
    /Blocking AI review findings resolved or explicitly carried as blockers with disposition/i,
    /Human review requested after the AI review record or fallback review comment was posted/i,
    /Human merge-gate review record is present before merge/i,
    /Parent Integration PRs/i,
    /Each included substory PR has CI, `pnpm verify`, AI review record, and revision response recorded on its PR/i,
    /Full-story integration reviewer-subagent review is posted on this parent PR/i,
    /Parent PR revision response is posted after full-story integration review/i,
    /Parent PR body or handoff comment is updated to completed-gate language before human review is requested/i,
    /Current parent PR CI result:/i,
    /Current parent branch `pnpm verify` result:/i,
    /Human review is explicitly required before merge to `main`/i,
    /Post-merge lifecycle cleanup plan is recorded: `pnpm run packets:complete-many \.\.\.`/i,
    /Active packet state is explained if non-empty: `agent-packets\/active\.json` is only the current or most recent substory handoff pointer until post-merge cleanup, not the list of unfinished substories/i,
    /Pure post-merge packet-completion cleanup commits that contain only the exact file changes produced by `pnpm run packets:complete --story <stories\/approved\/\.\.\.yaml>` or `pnpm run packets:complete-many --story <stories\/approved\/\.\.\.yaml> --story <stories\/approved\/\.\.\.yaml>` do not use this pull-request review artifact path/i,
    /If cleanup includes any manual edit beyond that command output, use the normal PR checklist above/i,
    /File responsibility checked: guarded source, test, tool, or contract files at 800\+ effective lines are explained here or have a follow-up split\/refactor story/i,
  ]);

  assert.doesNotMatch(prTemplate, /codex\.cmd exec review/i);
  assert.doesNotMatch(prTemplate, /Codex CLI review command/i);
  assert.doesNotMatch(prTemplate, /@codex review/i);
});

test("branch protection guide names the required status checks and subagent review policy", async () => {
  const guide = await readActiveText(".github/branch-protection.md");

  assertMatchesAll(guide, [
    /quality/i,
    /test/i,
    /contracts/i,
    /coverage/i,
    /at least one approval/i,
    /require review from Code Owners/i,
    /Parent agents should remain mostly orchestration and small local glue while worker subagents handle the main implementation body when delegation is available/i,
    /AI review before human review is requested when reviewer subagent review is available/i,
    /separate reviewer subagent run before human review is requested when a reviewer-subagent surface is available/i,
    /Parent orchestration runs on gpt-5\.5/i,
    /Implementation worker subagents default to gpt-5\.3-codex medium/i,
    /Reviewer subagents always use gpt-5\.4 high/i,
    /Complex, risky, or integration-heavy implementation stories should escalate to gpt-5\.5 medium/i,
    /Parent agents own documentation-only authority edits directly/i,
    /Documentation-only authority edits still require separate reviewer subagent review/i,
    /default review path is a spawned reviewer subagent against the PR base branch/i,
    /60 minutes/i,
    /Implementation-worker self-review and parent-coordinator self-review do not satisfy the reviewer gate/i,
    /Reviewer subagent output must come from a different agent than the implementing worker/i,
    /When no usable reviewer-subagent run remains for the patch after the available reviewer-subagent surfaces were found unavailable, timed out, or failed, pull requests should record an equivalent human review step instead of silently skipping the review gate/i,
    /When a reviewer subagent surface already posts a durable pull-request artifact, that native review output should serve as the AI review record without requiring a duplicate transcription comment/i,
    /When the separate reviewer[- ]subagent output does not already live on the pull request, pull requests should post an AI review comment/i,
    /When reviewer subagent review is used, pull requests should post a revision response comment that records follow-up commits and unresolved dispositions/i,
    /When reviewer subagent review is used, pull requests should record the actual worker and reviewer identities or references in the AI review record before human approval/i,
    /When the equivalent human-review fallback is used, pull requests should record the fallback metadata in the fallback review comment before human approval/i,
    /Pull requests should record the human merge-gate review as either an approval link or an equivalent human review step reference before merge/i,
    /Pure post-merge packet-completion cleanup commits that contain only the exact file changes produced by `pnpm run packets:complete --story <stories\/approved\/\.\.\.yaml>` or `pnpm run packets:complete-many --story <stories\/approved\/\.\.\.yaml> --story <stories\/approved\/\.\.\.yaml>` are not pull-request handoffs and do not require reviewer-subagent artifacts/i,
    /Exact post-merge packet-completion cleanup may use cleanup-scoped lifecycle verification before direct push because the reviewed PR already passed human review and required checks/i,
    /If a cleanup commit includes any manual edit beyond packet-completion command output, including edits to packet files, `agent-packets\/active\.json`, tooling, tests, fixtures, specs, workflow docs, or story files, use the normal pull-request and reviewer-subagent path/i,
    /required review artifacts are missing: an AI review record plus revision response comment/i,
    /reviewer-subagent-reviewed PRs/i,
    /equivalent human-review fallback/i,
  ]);

  assert.doesNotMatch(guide, /codex\.cmd exec review/i);
  assert.doesNotMatch(guide, /Codex CLI/i);
  assert.doesNotMatch(guide, /@codex review/i);
});

test("branch protection guide documents only the exact packet cleanup bypass", async () => {
  const guide = await readActiveText(".github/branch-protection.md");

  assertMatchesAll(guide, [
    /ordinary protected-branch changes still require pull requests, Code Owner review, at least one approval, conversation resolution, and required status checks/i,
    /dedicated GitHub App actor `optcg-packet-cleanup\[bot\]`/i,
    /workflow `.github\/workflows\/post-merge-packet-cleanup\.yml`/i,
    /token `POST_MERGE_PACKET_CLEANUP_TOKEN`/i,
    /only to push exact packet-completion command output to `main` after a reviewed pull request has merged/i,
    /cleanup metadata is a reviewed cleanup request, not standalone authority/i,
    /bind cleanup metadata to reviewed pull-request evidence, merge state, trusted checked-in approved story files, current packet evidence, and parent\/substory inclusion evidence/i,
    /fail closed when metadata is absent, malformed, stale, unbound, or ineligible/i,
    /cleanup-scoped lifecycle verification before direct push/i,
    /normal main-branch CI remains the broad post-cleanup safety net/i,
    /must not open cleanup pull requests/i,
    /manual fallback is only for operational failure/i,
    /delete branches only after packet lifecycle cleanup succeeds/i,
    /associated merged, unprotected story or substory branches/i,
    /If remote GitHub rulesets or branch-protection settings cannot be changed from this repository, apply this exact bypass actor setting in GitHub before enabling the privileged cleanup push/i,
  ]);

  assert.doesNotMatch(guide, /allow arbitrary GitHub Actions workflows/i);
  assert.doesNotMatch(guide, /allow broad admin roles/i);
  assert.doesNotMatch(guide, /human users.*as a normal development path/i);
});

test("pull request template declares reviewed post-merge cleanup metadata", async () => {
  const prTemplate = await readActiveText(".github/pull_request_template.md");

  assertMatchesAll(prTemplate, [
    /^## Post-Merge Cleanup$/m,
    /Cleanup metadata is a reviewed request, not standalone authority/i,
    /Reviewers confirm this metadata matches the reviewed story scope before merge/i,
    /The human-controlled merge to `main` authorizes the cleanup metadata snapshot/i,
    /Single-story PRs:/i,
    /Post-merge cleanup:\s*\n\s*mode: single\s*\n\s*stories:\s*\n\s*- stories\/approved\/<STORY-ID>-<slug>\.yaml\s*\n\s*branches:\s*\n\s*- <head-branch>/i,
    /Parent PRs:/i,
    /Post-merge cleanup:\s*\n\s*mode: parent\s*\n\s*stories:\s*\n\s*- stories\/approved\/<CHILD-A>\.yaml\s*\n\s*- stories\/approved\/<CHILD-B>\.yaml\s*\n\s*branches:\s*\n\s*- <parent-integration-branch>\s*\n\s*- <optional-substory-branch>/i,
  ]);
  assert.doesNotMatch(
    prTemplate,
    /Confirm the exact cleanup metadata source ref before merge/i,
  );
  assert.doesNotMatch(prTemplate, /names the exact `pr-body:/i);
  assert.doesNotMatch(
    prTemplate,
    /```yaml[\s\S]*Post-merge cleanup:/i,
    "cleanup metadata examples must not be fenced YAML because the parser expects the exact source block",
  );
  assert.doesNotMatch(
    prTemplate,
    /^cleanup:\s*\n\s*mode:/im,
    "cleanup metadata examples must not add a cleanup wrapper key",
  );
});

test("workflow docs latch cleanup metadata handoff to actual PR source and guard status", async () => {
  const agents = await readActiveText("AGENTS.md");
  const storyExecution = await readActiveText(
    "docs/workflow/story-execution.md",
  );
  const parentBranches = await readActiveText(
    "docs/workflow/parent-integration-branches.md",
  );
  const reviewGate = await readActiveText("docs/workflow/review-gate.md");
  const prTemplate = await readActiveText(".github/pull_request_template.md");
  const workflowGuidance = `${agents}\n${storyExecution}\n${parentBranches}\n${reviewGate}\n${prTemplate}`;

  assertMatchesAll(workflowGuidance, [
    /actual current PR body or selected durable handoff comment/i,
    /not a copied example or reconstructed local text/i,
    /--validate-cleanup-handoff-json-file/i,
    /--require-cleanup-guard-status/i,
    /cleanup-metadata-guard/i,
    /must be present and passing before human review is requested/i,
    /no markdown fence/i,
    /no `cleanup:` wrapper/i,
  ]);
});

test("workflow docs separate real-card fixture coverage from engine behavior requirements", async () => {
  const storyExecution = await readActiveText(
    "docs/workflow/story-execution.md",
  );
  const cardFixtureCapture = await readActiveText(
    "docs/workflow/card-fixture-capture.md",
  );
  const workflowGuidance = `${storyExecution}\n${cardFixtureCapture}`;

  assertMatchesAll(workflowGuidance, [
    /real-card and cards-produced fixture coverage is separate integration\/card-data\s+coverage/i,
    /does not replace primitive, unit, regression,\s+synthetic edge-case, fail-closed, hidden-info, event-order, or state-hash\s+coverage/i,
    /engine and rules stories must keep focused synthetic\/unit\/regression tests for\s+behavior requirements/i,
    /future engine and effect-runtime stories are not required to add real-card\s+fixtures/i,
    /create a\s+separate CARD\/FIXTURE\/verification follow-up story/i,
  ]);

  assert.doesNotMatch(
    workflowGuidance,
    /Future Main Event[\s\S]*story families should\s+use the representative cards-produced manifest by default/i,
  );
});

test("workflow docs describe automated packet cleanup policy and fallback boundaries", async () => {
  const storyExecution = await readActiveText(
    "docs/workflow/story-execution.md",
  );
  const parentBranches = await readActiveText(
    "docs/workflow/parent-integration-branches.md",
  );
  const reviewGate = await readActiveText("docs/workflow/review-gate.md");
  const workflowGuidance = `${storyExecution}\n${parentBranches}\n${reviewGate}`;

  assertMatchesAll(workflowGuidance, [
    /post-merge packet cleanup automation is the normal path after a reviewed story PR or parent PR merges/i,
    /manual fallback is only for operational failure/i,
    /automation-created cleanup pull requests are not created/i,
    /manual edits beyond pure packet-completion output still use the normal PR and reviewer path/i,
    /exact packet-completion cleanup may use cleanup-scoped lifecycle verification instead of full repo verification before the direct cleanup push/i,
    /cleanup-scoped lifecycle verification proves metadata binding, packet-completion output, story lifecycle state, active packet state, and committed story metadata/i,
    /cleanup metadata is a reviewed request, not standalone authority/i,
    /computed metadata source ref is audit evidence/i,
    /durable handoff comment/i,
    /bind cleanup metadata to reviewed PR evidence and trusted checked-in story and packet state/i,
    /branch deletion runs only after packet cleanup succeeds/i,
    /never deletes protected, unrelated, or unmerged branches/i,
  ]);
  assert.doesNotMatch(
    workflowGuidance,
    /must reference the exact cleanup metadata source ref/i,
  );
});

test("root agent instructions treat manual packet completion as automation fallback", async () => {
  const agentInstructions = await readActiveText("AGENTS.md");

  assertMatchesAll(agentInstructions, [
    /Post-merge packet cleanup automation is the normal path after a reviewed story PR or parent PR merges/i,
    /manual packet-completion cleanup only as the operational fallback when automation fails or is unavailable/i,
    /Do not run manual packet completion after automation has already completed the listed story cleanup/i,
    /cleanup metadata is a reviewed request, not standalone authority/i,
    /automation-created cleanup pull requests are not created/i,
  ]);
});

test("branch protection required status checks exactly match ci workflow jobs", async () => {
  const guide = await readActiveText(".github/branch-protection.md");
  const workflow = await readActiveText(".github/workflows/ci.yml");

  const requiredChecks = extractBranchProtectionRequiredChecks(guide);
  const ciJobNames = extractCiWorkflowJobNames(workflow);

  assert.deepEqual(requiredChecks, ciJobNames);
  assert.equal(
    requiredChecks.includes("hidden-info"),
    true,
    "hidden-info must be documented as a required status check",
  );
});

test("post-merge cleanup preflight workflow is non-privileged and fail-closed", async () => {
  const workflow = await readActiveText(
    ".github/workflows/post-merge-packet-cleanup.yml",
  );

  assertMatchesAll(workflow, [
    /pull_request:\s*\n\s*branches:\s*\n\s*- main\s*\n\s*types:\s*\n\s*- closed/i,
    /permissions:\s*\n\s*contents: read\s*\n\s*pull-requests: read/i,
    /github\.event\.pull_request\.merged == true && github\.event\.pull_request\.base\.ref == github\.event\.repository\.default_branch/i,
    /uses: actions\/checkout@v4/i,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/i,
    /persist-credentials: false/i,
    /tools\/post-merge-cleanup\.ts/i,
    /--metadata-source-file cleanup-metadata\.md/i,
    /--evidence-json-file cleanup-evidence\.json/i,
    /--preflight-plan-file bound-cleanup-plan\.json/i,
    /Date\.parse\(review\.submittedAt\) <= Date\.parse\(pr\.merged_at\)/i,
    /uses: actions\/upload-artifact@v4/i,
    /name: bound-cleanup-plan\.json/i,
  ]);

  assert.doesNotMatch(workflow, /gh pr create/);
});

test("post-merge cleanup workflow gates the privileged direct push on a validated plan", async () => {
  const workflow = await readActiveText(
    ".github/workflows/post-merge-packet-cleanup.yml",
  );
  const executeIndex = workflow.indexOf("Execute validated packet cleanup");
  const finalizeIndex = workflow.indexOf(
    "Finalize cleanup-scoped lifecycle verification",
  );
  const pushIndex = workflow.indexOf("Push direct cleanup commit");

  assertMatchesAll(workflow, [
    /cleanup:\s*\n\s*name: cleanup-direct-push\s*\n\s*needs: preflight/i,
    /if: \$\{\{ needs\.preflight\.result == 'success' \}\}/i,
    /permissions:\s*\n\s*contents: write/i,
    /token: \$\{\{ secrets\.POST_MERGE_PACKET_CLEANUP_TOKEN \}\}/i,
    /persist-credentials: true/i,
    /uses: actions\/download-artifact@v4/i,
    /name: bound-cleanup-plan\.json/i,
    /path: \.cleanup/i,
    /--execute-plan-file \.cleanup\/bound-cleanup-plan\.json/i,
    /--finalize-plan-file \.cleanup\/bound-cleanup-plan\.json/i,
    /git push origin HEAD:\$\{\{ github\.event\.repository\.default_branch \}\}/i,
  ]);
  assert.ok(executeIndex > -1, "missing packet cleanup step");
  assert.ok(
    finalizeIndex > executeIndex,
    "cleanup-scoped finalization must follow packet cleanup",
  );
  assert.ok(
    pushIndex > finalizeIndex,
    "push must run after cleanup-scoped finalization",
  );
  assert.doesNotMatch(workflow, /corepack pnpm verify/);
  assert.doesNotMatch(workflow, /gh pr create/);
});

test("post-merge cleanup workflow deletes branches only after packet cleanup gates", async () => {
  const workflow = await readActiveText(
    ".github/workflows/post-merge-packet-cleanup.yml",
  );
  const pushIndex = workflow.indexOf("Push direct cleanup commit");
  const branchIndex = workflow.indexOf("Delete safe merged cleanup branches");

  assertMatchesAll(workflow, [
    /Delete safe merged cleanup branches/,
    /String\(story\.storyId\)\.toLowerCase\(\)/,
    /associatedBranches\.add\(branch\)/,
    /--branch-cleanup-plan-file \.cleanup\/bound-cleanup-plan\.json/,
    /github\.rest\.git\.deleteRef/,
  ]);
  assert.ok(pushIndex > -1, "missing direct push step");
  assert.ok(
    branchIndex > pushIndex,
    "branch deletion must run after cleanup push",
  );
  assert.doesNotMatch(workflow, /deleteRef[\s\S]*main/);
});

test("agents guidance requires parent orchestration plus separate reviewer subagent before human review", async () => {
  const agents = await readActiveText("AGENTS.md");
  const storyExecution = await readActiveText(
    "docs/workflow/story-execution.md",
  );
  const reviewGate = await readActiveText("docs/workflow/review-gate.md");
  const workflowGuidance = `${agents}\n${storyExecution}\n${reviewGate}`;

  assertMatchesAll(workflowGuidance, [
    /worker-ready/i,
    /`worker-ready` means the parent has read `AGENTS\.md`, the approved story, and the current active packet[\s\S]*packet generation and `pnpm run packets:verify`/i,
    /run `pnpm run packets:generate --story <stories\/approved\/\.\.\.yaml> --activate` and `pnpm run packets:verify` before assigning an implementation worker/i,
    /spawn a worker subagent for the main implementation body/i,
    /parent agent stays mostly in orchestration mode/i,
    /parent agent remains in charge of the story itself/i,
    /story selection/i,
    /scope[\s\S]*enforcement/i,
    /packet authority/i,
    /ambiguity handling/i,
    /review handoff/i,
    /story-state/i,
    /transitions stay with the parent agent/i,
    /rather than the worker or reviewer[\s\S]*subagents/i,
    /Parent\/orchestrator model: `gpt-5\.5`/i,
    /Reviewer subagent model: `gpt-5\.4` with `high` reasoning/i,
    /Implementation worker model: default to `gpt-5\.3-codex` with `medium` reasoning/i,
    /Complex, risky, or integration-heavy implementation stories should use `gpt-5\.5` with `medium` reasoning/i,
    /Parent-owned authority edits: documentation-only changes to `AGENTS\.md`, `specs\/`, story files, packets, and workflow templates should be handled by the parent agent directly/i,
    /Parent-owned authority edits still require tests when applicable, full verification, and separate reviewer subagent review/i,
    /Any model-routing deviation must be recorded in the PR review trail and implementation note/i,
    /Pure packet-completion cleanup is the one lifecycle exception/i,
    /does not require a separate reviewer subagent run/i,
    /Manual edits beyond the packet completion command output, including edits to packet files, `agent-packets\/active\.json`, tooling, tests, fixtures, specs, workflow docs, or story files, require full verification and separate reviewer subagent review/i,
    /small local glue work/i,
    /parent agent should not do the main implementation body/i,
    /one worker subagent per active story by default/i,
    /if a story appears to need multiple concurrent workers[\s\S]*split the story first unless the write scopes are clearly disjoint/i,
    /if worker subagents are unavailable[\s\S]*record an explicit implementation note that parent implementation fallback was used/i,
    /run a separate reviewer subagent/i,
    /self-review by the implementation worker or the parent implementation coordinator does not satisfy the reviewer gate/i,
    /request human review only after the AI review record or explicit equivalent-human-review fallback record exists/i,
    /When a separate reviewer subagent run is used, the PR review record must contain:/i,
    /an AI review record: either a native PR artifact from the reviewer subagent surface, or an AI review comment with findings and verdict/i,
    /fallback review comment based on `\.github\/review-comments\/equivalent-human-review-fallback\.md`/i,
    /The separate reviewer subagent run is a repo-level first-pass gate before human review/i,
    /the review came from a separate reviewer subagent rather than implementation-agent self-review/i,
    /the exact review path and reviewer-subagent identity or mode used/i,
    /Passing AI review does not replace human review/i,
    /60-minute timeout budget for the reviewer-subagent review step/i,
  ]);

  assert.doesNotMatch(agents, /run a separate Codex review invocation/i);
  assert.doesNotMatch(agents, /codex\.cmd exec review/i);
  assert.doesNotMatch(agents, /default Codex CLI review step/i);
});

test("agents guidance exposes a concise root checklist and links detailed workflow docs", async () => {
  const agents = await readActiveText("AGENTS.md");

  assertMatchesAll(agents, [
    /## Active Story Checklist/i,
    /Read `AGENTS\.md`, the approved story, and the active packet/i,
    /Run `pnpm run packets:generate --story <stories\/approved\/\.\.\.yaml> --activate`/i,
    /Run `pnpm run packets:verify`/i,
    /Stay inside the story boundary and `allowed_touch_points`/i,
    /Open the PR before reviewer-subagent review/i,
    /Post the AI review record or equivalent human-review fallback/i,
    /Request human review only after review records and cleanup metadata handoff checks are current/i,
    /Confirm post-merge packet cleanup automation completed the listed story cleanup after merge to `main`/i,
    /manual packet-completion cleanup only as the operational fallback when automation fails or is unavailable/i,
    /docs\/workflow\/story-execution\.md/i,
    /docs\/workflow\/review-gate\.md/i,
    /docs\/workflow\/parent-integration-branches\.md/i,
    /docs\/workflow\/reporting-and-github-sync\.md/i,
  ]);
});

test("agents and codex integration spec agree on workflow procedure authority", async () => {
  const agents = await readActiveText("AGENTS.md");
  const codexSpec = await readActiveText("specs/32-codex-agent-integration.md");

  assertMatchesAll(agents, [
    /4\. this `AGENTS\.md`/i,
    /5\. linked workflow procedure docs under `docs\/workflow\/`/i,
    /6\. local code reality/i,
    /7\. proposed patch/i,
  ]);

  assertMatchesAll(codexSpec, [
    /4\. checked-in repo instructions in `AGENTS\.md`/i,
    /5\. linked workflow procedure documents under `docs\/workflow\/`/i,
    /6\. local code reality/i,
    /7\. proposed patch/i,
  ]);
});

test("workflow procedure docs preserve required story and review gates", async () => {
  const storyExecution = await readActiveText(
    "docs/workflow/story-execution.md",
  );
  const reviewGate = await readActiveText("docs/workflow/review-gate.md");
  const parentBranches = await readActiveText(
    "docs/workflow/parent-integration-branches.md",
  );

  assertMatchesAll(storyExecution, [
    /Generated or normalized stories must receive story-review agent review/i,
    /If no usable story-review agent run exists, do not present the story as approval-ready/i,
    /active\.json` may contain zero active stories or exactly one active story/i,
    /pnpm run packets:generate --story <stories\/approved\/\.\.\.yaml> --activate/i,
    /pnpm run packets:verify/i,
    /pnpm run packets:complete --story <stories\/approved\/\.\.\.yaml>/i,
  ]);

  assertMatchesAll(reviewGate, [
    /Open the pull request before the first reviewer-subagent run/i,
    /run a separate reviewer subagent/i,
    /60 minutes/i,
    /self-review by the implementation worker or the parent implementation coordinator does not satisfy/i,
    /AI review record/i,
    /equivalent human-review fallback/i,
    /revision response comment/i,
    /Passing AI review does not replace human review/i,
  ]);

  assertMatchesAll(parentBranches, [
    /Create a parent integration branch from `main`/i,
    /Create each substory implementation branch from the parent integration branch/i,
    /Do not run `pnpm run packets:complete` for a substory when it merges only into the parent integration branch/i,
    /Human review is required on the parent PR before it merges to `main`/i,
    /pnpm run packets:complete-many/i,
  ]);
});

test("story workflow requires pre-presentation story-review agents", async () => {
  const agents = await readActiveText("AGENTS.md");
  const storyExecution = await readActiveText(
    "docs/workflow/story-execution.md",
  );
  const workflowGuidance = `${agents}\n${storyExecution}`;
  const storyWorkflow = await readActiveText(
    "specs/27-spec-driven-story-generation-workflow.md",
  );
  const codexSpec = await readActiveText("specs/32-codex-agent-integration.md");

  assertMatchesAll(workflowGuidance, [
    /pre-presentation story-review gate/i,
    /Generated or normalized stories must receive story-review agent review before the parent agent presents them to the human as approval-ready/i,
    /Approval-ready means the exact candidate story has a usable per-story story-review result, and material findings for that story are fixed, explicitly deferred, or recorded/i,
    /set-level or decomposition-group story review does not satisfy per-story candidate approval review/i,
    /Each candidate story needs its own usable story-review result before the parent agent presents that exact story for approval/i,
    /Story-review agent model: `gpt-5\.5` with `high` reasoning/i,
    /set-level story review before presenting a decomposed story group/i,
    /per-story review before presenting each candidate story for approval/i,
    /story-review agents review story authority and decomposition, not implementation patches/i,
    /If no usable story-review agent run exists, do not present the story as approval-ready; present it as unreviewed and blocked on story review/i,
    /implementation patch review remains a separate gate/i,
  ]);

  assertMatchesAll(storyWorkflow, [
    /pre-presentation story-review gate/i,
    /approval-ready means the exact candidate story has a usable per-story story-review result/i,
    /set-level or decomposition-group story review does not satisfy per-story candidate approval review/i,
    /each candidate story needs its own usable story-review result before that exact story is presented for approval/i,
    /set-level story review before a decomposed story group is presented for human approval/i,
    /per-story review before each candidate story is presented for approval/i,
    /story-review findings must be fixed, explicitly deferred, or recorded before presentation/i,
    /do not present a story as approval-ready when no usable story-review agent run exists; present it as unreviewed and blocked on story review instead/i,
    /story-review agent uses gpt-5\.5 with high reasoning/i,
  ]);

  assertMatchesAll(codexSpec, [
    /story-review subagents reviewing generated or normalized stories before human approval/i,
    /approval-ready means the exact candidate story has a usable per-story story-review result/i,
    /set-level or decomposition-group story review does not satisfy per-story candidate approval review/i,
    /each candidate story needs its own usable story-review result before the parent agent presents that exact story for approval/i,
    /story-review agent model is gpt-5\.5 with high reasoning/i,
    /story-review agents are separate from implementation reviewer subagents/i,
    /The parent agent must not present stories as approval-ready until the story-review findings are resolved, explicitly deferred, or recorded/i,
  ]);
});

test("codex integration spec reflects subagent orchestration instead of cli-first execution", async () => {
  const codexSpec = await readActiveText("specs/32-codex-agent-integration.md");

  assertMatchesAll(codexSpec, [
    /orchestrate worker and reviewer subagents around one approved story/i,
    /parent Codex agent/i,
    /remain the owner of story authority, scope decisions, ambiguity handling, and review handoff/i,
    /worker subagent/i,
    /reviewer subagent/i,
    /parent\/orchestrator model is gpt-5\.5/i,
    /reviewer subagent model is gpt-5\.4 with high reasoning/i,
    /implementation worker subagents default to gpt-5\.3-codex with medium reasoning/i,
    /Complex, risky, or integration-heavy implementation stories should use gpt-5\.5 with medium reasoning/i,
    /Documentation-only authority edits should be handled by the parent agent directly/i,
    /Authority edits still require separate reviewer subagent review/i,
    /Any model-routing deviation must be recorded in the pull-request review trail\s+and implementation note/i,
    /small local glue work/i,
    /equivalent human review step/i,
    /before merge/i,
  ]);

  assert.doesNotMatch(
    codexSpec,
    /Assign the packet to Codex CLI or Codex cloud/i,
  );
});

test("checked-in review comment templates exist for AI findings and revisions", async () => {
  const aiReview = await readActiveText(".github/review-comments/ai-review.md");
  const fallbackReview = await readActiveText(
    ".github/review-comments/equivalent-human-review-fallback.md",
  );
  const revisionResponse = await readActiveText(
    ".github/review-comments/ai-review-revision-response.md",
  );

  assertMatchesAll(aiReview, [
    /^## AI Review Record$/m,
    /Story ID:/i,
    /Parent-agent orchestration note:/i,
    /Worker subagent reference\(s\) or `none: parent-owned authority edit`:/i,
    /Parent\/orchestrator model: `gpt-5\.5`/i,
    /Implementation worker model and reasoning: `<gpt-5\.3-codex medium \| gpt-5\.5 medium \| none: parent-owned authority edit>`/i,
    /Reviewer model and reasoning: `gpt-5\.4 high`/i,
    /Model-routing deviations:/i,
    /Reviewer path: <reviewer subagent \| native PR review artifact>/i,
    /Review provenance: <separate reviewer subagent run \| not implementation-worker or parent-coordinator self-review>/i,
    /Reviewer subagent reference or review surface:/i,
    /Reviewer mode:/i,
    /Review timeout budget: 60 minutes/i,
    /Findings:/i,
    /Verdict:/i,
    /Human merge-gate review record \(approval link or equivalent human review step reference\):/i,
    /Use this comment for the first-pass AI review record on reviewer-subagent-reviewed PRs/i,
    /separate reviewer subagent run/i,
  ]);

  assert.doesNotMatch(aiReview, /Codex CLI/i);
  assert.doesNotMatch(aiReview, /@codex review/i);

  assertMatchesAll(fallbackReview, [
    /^## Equivalent Human Review Fallback$/m,
    /Parent-agent orchestration note:/i,
    /Worker subagent reference\(s\) or `none: parent-owned authority edit`:/i,
    /Parent\/orchestrator model: `gpt-5\.5`/i,
    /Implementation worker model and reasoning: `<gpt-5\.3-codex medium \| gpt-5\.5 medium \| none: parent-owned authority edit>`/i,
    /Reviewer model and reasoning: `gpt-5\.4 high`/i,
    /Model-routing deviations:/i,
    /Failed or unavailable reviewer-subagent attempts:/i,
    /Why no usable reviewer-subagent run remained:/i,
    /Fallback human reviewer:/i,
    /Findings:/i,
    /Verdict:/i,
    /Human merge-gate review record \(approval link or equivalent human review step reference\):/i,
    /Use this comment when no usable reviewer-subagent run remains/i,
  ]);

  assert.doesNotMatch(fallbackReview, /Codex review/i);
  assert.doesNotMatch(fallbackReview, /@codex review/i);

  assertMatchesAll(revisionResponse, [
    /^## AI Review Revision Response$/m,
    /AI review record:/i,
    /Parent-agent orchestration note:/i,
    /Worker subagent reference\(s\) or `none: parent-owned authority edit`:/i,
    /Parent\/orchestrator model: `gpt-5\.5`/i,
    /Implementation worker model and reasoning: `<gpt-5\.3-codex medium \| gpt-5\.5 medium \| none: parent-owned authority edit>`/i,
    /Reviewer model and reasoning: `gpt-5\.4 high`/i,
    /Model-routing deviations:/i,
    /Reviewer path:/i,
    /Reviewer subagent reference or review surface:/i,
    /Follow-up commits:/i,
    /Disposition:/i,
    /Resolved findings:/i,
    /Ready for human review:/i,
    /Reference the AI review record that drove the follow-up work: either the AI review comment that copied the findings from a reviewer-subagent output that was not already durable on the PR, or the native reviewer-subagent PR artifact when that was the review path/i,
  ]);

  assert.doesNotMatch(revisionResponse, /@codex review/i);
});

test("active packet manifest is empty between stories or points to one current approved story and packet", async () => {
  const manifest = await readJson("agent-packets/active.json");

  assert.equal(manifest.version, 1);
  assert.equal(Array.isArray(manifest.activeStories), true);

  if (manifest.activeStories.length === 0) {
    return;
  }

  assert.equal(manifest.activeStories.length, 1);

  const [activeStory] = manifest.activeStories;

  assertValidStoryId(activeStory.storyId);
  assert.match(activeStory.storySha256, /^[0-9a-f]{64}$/);
  assert.equal(
    activeStory.packetPath,
    `agent-packets/${activeStory.storyId}.md`,
  );
  assert.match(
    activeStory.storyPath,
    new RegExp(`^stories/approved/${activeStory.storyId}-[a-z0-9-]+\\.yaml$`),
  );

  const story = await readText(activeStory.storyPath);
  const packet = await readText(activeStory.packetPath);

  assert.equal(readYamlScalar(story, "id"), activeStory.storyId);
  assert.equal(readYamlScalar(story, "status"), "approved");
  assert.match(
    packet,
    new RegExp(`<!-- agent-packet:story-id ${activeStory.storyId} -->`),
  );
  assert.match(
    packet,
    new RegExp(`<!-- agent-packet:story-path ${activeStory.storyPath} -->`),
  );
});

test("active packet workflow accepts schema-authorized story identifiers", () => {
  assert.doesNotThrow(() => assertValidStoryId("INF-015"));
  assert.doesNotThrow(() => assertValidStoryId("INF-006A"));
  assert.doesNotThrow(() => assertValidStoryId("ENG-012"));
  assert.doesNotThrow(() => assertValidStoryId("SEC-001B"));
  assert.throws(() => assertValidStoryId("INF-006AA"));
  assert.throws(() => assertValidStoryId("INF-006-alpha"));
});

test("merged workflow stories move out of approved backlog into done history", async () => {
  await assertStoryMovedToDone(
    "INF-011",
    "INF-011-subagent-orchestration-and-review-workflow.yaml",
  );
  await assertStoryMovedToDone(
    "INF-012",
    "INF-012-checked-in-active-story-packet-generation.yaml",
  );
  await assertStoryMovedToDone(
    "INF-013",
    "INF-013-subagent-model-routing-policy.yaml",
  );
  await assertStoryMovedToDone(
    "INF-014",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );

  await assert.rejects(() =>
    access(path.join(repoRoot, "agent-packets", "INF-014.md")),
  );
});
