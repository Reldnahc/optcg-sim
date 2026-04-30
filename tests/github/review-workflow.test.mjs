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
});

test("agents guidance requires AI review to finish before human review request", async () => {
  const agents = await readText("AGENTS.md");

  assert.match(agents, /AI review/i);
  assert.match(agents, /before human review/i);
  assert.match(agents, /review comment/i);
  assert.match(agents, /revision response comment/i);
});

test("checked-in review comment templates exist for AI findings and revisions", async () => {
  const aiReview = await readText(".github/review-comments/ai-review.md");
  const revisionResponse = await readText(
    ".github/review-comments/ai-review-revision-response.md",
  );

  assert.match(aiReview, /^## AI Review Record$/m);
  assert.match(aiReview, /Story ID:/);
  assert.match(aiReview, /Review scope:/i);
  assert.match(aiReview, /Findings:/i);
  assert.match(aiReview, /Verdict:/i);

  assert.match(revisionResponse, /^## AI Review Revision Response$/m);
  assert.match(revisionResponse, /AI review comment:/i);
  assert.match(revisionResponse, /Disposition:/i);
  assert.match(revisionResponse, /Follow-up commits:/i);
});
