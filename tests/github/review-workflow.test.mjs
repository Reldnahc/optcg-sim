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

function assertMatchesAll(text, patterns) {
  for (const pattern of patterns) {
    assert.match(text, pattern);
  }
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
    /required review artifacts are missing: an AI review record plus revision response comment/i,
    /reviewer-subagent-reviewed PRs/i,
    /equivalent human-review fallback/i,
  ]);

  assert.doesNotMatch(guide, /codex\.cmd exec review/i);
  assert.doesNotMatch(guide, /Codex CLI/i);
  assert.doesNotMatch(guide, /@codex review/i);
});

test("agents guidance requires parent orchestration plus separate reviewer subagent before human review", async () => {
  const agents = await readActiveText("AGENTS.md");

  assertMatchesAll(agents, [
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
    /small local glue work/i,
    /parent agent should not do the main implementation body/i,
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

test("active packet manifest names only the current story for PR handoff", async () => {
  const manifest = await readJson("agent-packets/active.json");

  assert.deepEqual(
    manifest.activeStories.map((story) => story.storyId),
    ["INF-013"],
  );
  assert.equal(
    manifest.activeStories[0].storyPath,
    "stories/approved/INF-013-subagent-model-routing-policy.yaml",
  );
  assert.equal(
    manifest.activeStories[0].packetPath,
    "agent-packets/INF-013.md",
  );
});

test("only one approved review workflow remains authoritative after INF-011", async () => {
  const inf010 = await readText(
    "stories/done/INF-010-separate-codex-cli-review-and-timeout-policy.yaml",
  );
  const inf011 = await readText(
    "stories/approved/INF-011-subagent-orchestration-and-review-workflow.yaml",
  );

  await assert.rejects(() =>
    access(
      path.join(
        repoRoot,
        "stories/approved/INF-010-separate-codex-cli-review-and-timeout-policy.yaml",
      ),
    ),
  );

  assert.match(inf010, /^status:\s+done$/m);
  assert.match(inf010, /superseded by INF-011/i);
  assert.match(inf011, /^status:\s+approved$/m);
  assert.match(inf011, /worker subagents handle main implementation/i);
  assert.match(inf011, /reviewer\s+subagent provides the AI review gate/i);
  assert.match(
    inf011,
    /INF-010 is moved out of `stories\/approved\/` into done history so only one approved review workflow remains authoritative after this story lands/i,
  );
});
