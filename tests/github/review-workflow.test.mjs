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
  assert.match(
    prTemplate,
    /AI review completed before human review request, or equivalent human review fallback recorded because no usable Codex review surface remained after the available Codex review surfaces were found unavailable, timed out, or failed/i,
  );
  assert.match(prTemplate, /before human review/i);
  assert.match(
    prTemplate,
    /AI review record, if Codex review was used \(native PR artifact link or AI review comment link\)/i,
  );
  assert.match(
    prTemplate,
    /Equivalent human review fallback comment, if no usable Codex review surface remained after the available Codex review surfaces were found unavailable, timed out, or failed/i,
  );
  assert.match(
    prTemplate,
    /Revision response comment, if Codex review was used/i,
  );
  assert.match(
    prTemplate,
    /Merge-gate review record \(`@codex review` link or equivalent human review step reference\)/i,
  );
  assert.match(
    prTemplate,
    /Separate Codex review invocation completed before human review request, or equivalent human review fallback recorded because no usable Codex review surface remained after the available Codex review surfaces were found unavailable, timed out, or failed/i,
  );
  assert.match(
    prTemplate,
    /Implementation-agent self-review was not used as the review gate/i,
  );
  assert.match(
    prTemplate,
    /The required review artifact is present on this PR\./i,
  );
  assert.match(
    prTemplate,
    /When the separate Codex review output does not already live on the PR, the AI review comment copies the findings and verdict from that separate Codex review output\. When a Codex review surface already posts a durable PR artifact, that native PR artifact itself serves as the AI review record\./i,
  );
  assert.match(
    prTemplate,
    /If the fallback path was used, the fallback review comment explains why no usable Codex review surface remained after the available Codex review surfaces were found unavailable, timed out, or failed/i,
  );
  assert.match(
    prTemplate,
    /Human review requested after the AI review record or fallback review comment was posted/i,
  );
  assert.match(prTemplate, /Merge-gate review record is present before merge/i);
  assert.match(
    prTemplate,
    /Review path used: `<Codex CLI \| @codex review \| other Codex review surface \| equivalent human review fallback>`/i,
  );
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
  assert.match(
    guide,
    /AI review before human review is requested when Codex review is available/i,
  );
  assert.match(guide, /before human review/i);
  assert.match(guide, /revision response comment/i);
  assert.match(
    guide,
    /separate Codex review invocation before human review is requested when a Codex review surface is available/i,
  );
  assert.match(guide, /codex\.cmd exec review --base <PR target branch>/i);
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
    /When no usable Codex review surface remains for the patch after the available Codex review surfaces were found unavailable, timed out, or failed, pull requests should record an equivalent human review step instead of silently skipping the review gate/i,
  );
  assert.match(
    guide,
    /When a Codex review surface already posts a durable pull-request artifact, that native review output should serve as the AI review record without requiring a duplicate transcription comment/i,
  );
  assert.match(
    guide,
    /When the separate Codex review output does not already live on the pull request, pull requests should post an AI review comment/i,
  );
  assert.match(
    guide,
    /The review workflow should allow up to 60 minutes for the default Codex CLI review step while it is actively running\. Deterministic failures such as unavailable command, auth or config errors, or immediate process failure count as failed immediately\./i,
  );
  assert.match(
    guide,
    /When Codex review is used, pull requests should record the actual review path and the Codex CLI command or alternate mode in the AI review record before human approval/i,
  );
  assert.match(
    guide,
    /When the equivalent human-review fallback is used, pull requests should record the fallback metadata in the fallback review comment before human approval by using `\.github\/review-comments\/equivalent-human-review-fallback\.md`\./i,
  );
  assert.match(
    guide,
    /Pull requests should record the higher-authority merge-gate review as either an `@codex review` link or an equivalent human review step reference before merge/i,
  );
  assert.match(
    guide,
    /required review artifacts are missing: an AI review record plus revision response comment for Codex-reviewed PRs, or the fallback review comment for PRs using the equivalent human-review fallback because Codex review was unavailable, timed out, or failed/i,
  );
  assert.match(guide, /60[- ]minute/i);
});

test("agents guidance requires AI review to finish before human review request", async () => {
  const agents = await readText("AGENTS.md");

  assert.match(agents, /Passing AI review does not replace human review/i);
  assert.match(agents, /before human review/i);
  assert.match(agents, /review comment/i);
  assert.match(agents, /revision response comment/i);
  assert.match(agents, /run a separate Codex review invocation/i);
  assert.match(agents, /codex\.cmd exec review --base <PR target branch>/i);
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
    /if no usable Codex review surface remains for the patch after the available Codex review surfaces were found unavailable, timed out, or failed, record an equivalent human review fallback comment explicitly rather than silently skipping the review gate/i,
  );
  assert.match(
    agents,
    /if the separate Codex review surface already posted a durable pull-request artifact, treat that native PR artifact as the AI review record and do not require a duplicate transcription comment/i,
  );
  assert.match(
    agents,
    /if a separate Codex review invocation was used and its output does not already live on the pull request, copy the findings and verdict from that separate Codex review output into an AI review comment before human review is requested/i,
  );
  assert.match(
    agents,
    /request human review only after the AI review record or explicit equivalent-human-review fallback record exists, and after the revision response comment is up to date when a separate Codex review invocation was used/i,
  );
  assert.match(
    agents,
    /The separate Codex review invocation is a repo-level first-pass gate before human review\. It does not replace the spec's merge-gate requirement for `@codex review` or an equivalent human review step\./i,
  );
  assert.match(
    agents,
    /When a separate Codex review invocation is used, the PR review record must contain:/i,
  );
  assert.match(
    agents,
    /an AI review record: either a native PR artifact from `@codex review` or another Codex review surface, or an AI review comment with findings and verdict when the separate review output does not already live on the pull request/i,
  );
  assert.match(
    agents,
    /give the default Codex CLI review step up to 60 minutes while it is actively running; deterministic failures such as unavailable command, auth or config errors, or immediate process failure count as failed immediately and do not require waiting out the timeout budget/i,
  );
  assert.match(
    agents,
    /fallback review comment based on `\.github\/review-comments\/equivalent-human-review-fallback\.md`/i,
  );
  assert.match(agents, /60[- ]minute/i);
});

test("checked-in review comment templates exist for AI findings and revisions", async () => {
  const aiReview = await readText(".github/review-comments/ai-review.md");
  const fallbackReview = await readText(
    ".github/review-comments/equivalent-human-review-fallback.md",
  );
  const revisionResponse = await readText(
    ".github/review-comments/ai-review-revision-response.md",
  );

  assert.match(aiReview, /^## AI Review Record$/m);
  assert.match(aiReview, /Story ID:/);
  assert.match(
    aiReview,
    /Reviewer path: <Codex CLI \| @codex review \| other Codex review surface>/i,
  );
  assert.match(
    aiReview,
    /Review provenance: <separate Codex review invocation \| not implementation-agent self-review>/i,
  );
  assert.match(aiReview, /Review scope:/i);
  assert.match(aiReview, /Review command or mode:/i);
  assert.match(aiReview, /Review timeout budget:/i);
  assert.match(aiReview, /Findings:/i);
  assert.match(aiReview, /Verdict:/i);
  assert.match(
    aiReview,
    /Merge-gate review record \(`@codex review` link or equivalent human review step reference\):/i,
  );
  assert.match(aiReview, /separate Codex review invocation/i);
  assert.match(
    aiReview,
    /If the separate Codex review output does not already live on the pull request, copy the findings and verdict from that separate Codex review output into this comment/i,
  );
  assert.match(
    aiReview,
    /If the separate Codex review surface already posted a durable pull-request artifact, use that native PR artifact itself as the AI review record and do not require a duplicate AI review comment/i,
  );
  assert.match(
    aiReview,
    /When the workflow falls back to an equivalent human review because no usable Codex review surface remains after the available Codex review surfaces were found unavailable, timed out, or failed, do not require this comment; record the fallback review comment instead/i,
  );
  assert.match(aiReview, /60[- ]minute/i);

  assert.match(fallbackReview, /^## Equivalent Human Review Fallback$/m);
  assert.match(fallbackReview, /Failed or unavailable Codex review attempts:/i);
  assert.match(fallbackReview, /Why no usable Codex review surface remained:/i);
  assert.match(fallbackReview, /Fallback human reviewer:/i);
  assert.match(fallbackReview, /Findings:/i);
  assert.match(fallbackReview, /Verdict:/i);
  assert.match(
    fallbackReview,
    /Merge-gate review record \(`@codex review` link or equivalent human review step reference\):/i,
  );
  assert.match(
    fallbackReview,
    /Use this comment when no usable Codex review surface remains after the available Codex review surfaces were found unavailable, timed out, or failed/i,
  );

  assert.match(revisionResponse, /^## AI Review Revision Response$/m);
  assert.match(revisionResponse, /AI review record:/i);
  assert.match(revisionResponse, /Disposition:/i);
  assert.match(revisionResponse, /Follow-up commits:/i);
  assert.match(revisionResponse, /Reviewer path:/i);
  assert.match(
    revisionResponse,
    /Reference the AI review record that drove the follow-up work: either the AI review comment that copied the findings from a non-GitHub Codex review output, or the native `@codex review` artifact when that was the review path/i,
  );
});

test("only one approved review workflow remains authoritative after INF-010", async () => {
  const inf009 = await readText(
    "stories/done/INF-009-ai-review-gate-and-pr-comment-trail.yaml",
  );
  const inf010 = await readText(
    "stories/approved/INF-010-separate-codex-cli-review-and-timeout-policy.yaml",
  );

  await assert.rejects(() =>
    access(
      path.join(
        repoRoot,
        "stories/approved/INF-009-ai-review-gate-and-pr-comment-trail.yaml",
      ),
    ),
  );
  assert.match(inf009, /^status:\s+done$/m);
  assert.match(inf009, /superseded by INF-010/i);
  assert.match(
    inf010,
    /INF-009 is moved out of `stories\/approved\/` into done history so only one approved review workflow remains authoritative after this story lands/i,
  );
});
