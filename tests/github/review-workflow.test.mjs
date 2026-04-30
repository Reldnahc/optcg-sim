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

test("codeowners exists and routes review to the repo owner", async () => {
  const codeowners = await readText(".github/CODEOWNERS");

  assert.match(codeowners, /^\*\s+@Reldnahc$/m);
  assert.match(codeowners, /^\/\.github\/\s+@Reldnahc$/m);
  assert.match(codeowners, /^\/contracts\/\s+@Reldnahc$/m);
  assert.match(codeowners, /^\/specs\/\s+@Reldnahc$/m);
});

test("pull request template requires story, verification, and review evidence", async () => {
  const prTemplate = await readText(".github/pull_request_template.md");

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

  assert.match(prTemplate, /@codex review/i);
  assert.match(prTemplate, /pnpm verify/i);
  assert.match(prTemplate, /AI review/i);
  assert.match(prTemplate, /before human review/i);
  assert.match(prTemplate, /AI review comment/i);
  assert.match(prTemplate, /revision response comment/i);
  assert.match(
    prTemplate,
    /Separate Codex review invocation completed before human review request/i,
  );
  assert.match(
    prTemplate,
    /Implementation-agent self-review was not used as the review gate/i,
  );
  assert.match(
    prTemplate,
    /copies the findings and verdict from the separate Codex review output onto this PR/i,
  );
  assert.match(prTemplate, /Codex CLI or `@codex review`/i);
  assert.match(prTemplate, /60[- ]minute/i);
});

test("branch protection guide names the required status checks and approvals", async () => {
  const guide = await readText(".github/branch-protection.md");

  assert.match(guide, /quality/);
  assert.match(guide, /test/);
  assert.match(guide, /contracts/);
  assert.match(guide, /coverage/);
  assert.match(guide, /at least one approval/i);
  assert.match(guide, /require review from Code Owners/i);
  assert.match(guide, /AI review/i);
  assert.match(guide, /before human review/i);
  assert.match(guide, /revision response comment/i);
  assert.match(guide, /separate Codex review invocation before human review/i);
  assert.match(
    guide,
    /GitHub `@codex review` remains an allowed alternate review path/i,
  );
  assert.match(
    guide,
    /Implementation-agent self-review does not satisfy the Codex review gate/i,
  );
  assert.match(
    guide,
    /findings and verdict copied from the separate Codex review output/i,
  );
  assert.match(guide, /60[- ]minute/i);
});

test("agents guidance requires AI review to finish before human review request", async () => {
  const agents = await readText("AGENTS.md");

  assert.match(agents, /AI review/i);
  assert.match(agents, /before human review/i);
  assert.match(agents, /review comment/i);
  assert.match(agents, /revision response comment/i);
  assert.match(agents, /run a separate Codex review invocation/i);
  assert.match(
    agents,
    /GitHub `@codex review` remains an allowed alternate path/i,
  );
  assert.match(
    agents,
    /self-review by the implementation agent does not satisfy the Codex review gate/i,
  );
  assert.match(
    agents,
    /copy the findings and verdict from that separate Codex review output into an AI review comment/i,
  );
  assert.match(agents, /60[- ]minute/i);
});

test("checked-in review comment templates exist for AI findings and revisions", async () => {
  const aiReview = await readText(".github/review-comments/ai-review.md");
  const revisionResponse = await readText(
    ".github/review-comments/ai-review-revision-response.md",
  );

  assert.match(aiReview, /^## AI Review Record$/m);
  assert.match(aiReview, /Story ID:/);
  assert.match(aiReview, /Reviewer path: Codex CLI or `@codex review`/i);
  assert.match(aiReview, /Review scope:/i);
  assert.match(aiReview, /Review command or mode:/i);
  assert.match(aiReview, /Review timeout budget:/i);
  assert.match(aiReview, /Findings:/i);
  assert.match(aiReview, /Verdict:/i);
  assert.match(aiReview, /separate Codex review invocation/i);
  assert.match(
    aiReview,
    /Copy the findings and verdict from that separate Codex review output into this comment/i,
  );
  assert.match(aiReview, /60[- ]minute/i);

  assert.match(revisionResponse, /^## AI Review Revision Response$/m);
  assert.match(revisionResponse, /AI review comment:/i);
  assert.match(revisionResponse, /Disposition:/i);
  assert.match(revisionResponse, /Follow-up commits:/i);
  assert.match(revisionResponse, /Reviewer path:/i);
  assert.match(
    revisionResponse,
    /Reference the AI review comment that copied the findings from the separate Codex review output/i,
  );
});
