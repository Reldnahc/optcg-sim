import assert from "node:assert/strict";
import { test } from "vitest";

import { sha256 } from "../../tools/agent-packet-lifecycle.ts";
import { buildWorkflowCleanupEvidence } from "../../tools/post-merge-cleanup/metadata.ts";

const metadataSource = `Post-merge cleanup:
  mode: parent
  stories:
    - stories/approved/INF-601-a.yaml
    - stories/approved/INF-602-b.yaml
  branches:
    - story/inf-027-parent
`;
const metadataHash = sha256(metadataSource);
const handoffRef = `handoff-comment:900:${metadataHash}`;

test("workflow evidence builder selects a reviewed durable handoff comment source", () => {
  const evidence = buildWorkflowCleanupEvidence(buildFixtureInputs());

  assert.equal(evidence.metadataSourceRef, handoffRef);
  assert.deepEqual(evidence.metadataSource, {
    contentSha256: metadataHash,
    durable: true,
    kind: "handoff-comment",
    sourceId: "900",
    updatedAt: "2026-01-01T09:00:00.000Z",
  });
  assert.deepEqual(
    evidence.reviews.find((review) => review.id === "101")?.sourceRefs,
    [handoffRef],
  );
});

test("workflow evidence builder derives parent lifecycle from durable review comments", () => {
  const evidence = buildWorkflowCleanupEvidence(buildFixtureInputs());

  assert.deepEqual(evidence.parentLifecycle, {
    cleanupPlanRecordedAt: "2026-01-01T09:30:00.000Z",
    includedStories: [
      {
        packetPath: "agent-packets/INF-601.md",
        storyId: "INF-601",
        storyPath: "stories/approved/INF-601-a.yaml",
        substoryAiReviewRecordId: "substory-ai-601",
        substoryPrNumber: 601,
      },
      {
        packetPath: "agent-packets/INF-602.md",
        storyId: "INF-602",
        storyPath: "stories/approved/INF-602-b.yaml",
        substoryAiReviewRecordId: "substory-ai-602",
        substoryPrNumber: 602,
      },
    ],
    parentIntegrationReviewRecordId: "parent-ai-review-700",
    parentRevisionResponseId: "parent-revision-700",
  });
});

test("workflow evidence builder can derive parent lifecycle from the PR body", () => {
  const inputs = buildFixtureInputs();
  inputs.issueComments.splice(1, 1);
  inputs.pullRequest.body = renderParentLifecycleEvidence();

  const evidence = buildWorkflowCleanupEvidence(inputs);

  assert.equal(
    evidence.parentLifecycle?.parentIntegrationReviewRecordId,
    "parent-ai-review-700",
  );
  assert.equal(
    evidence.parentLifecycle?.includedStories[1]?.substoryAiReviewRecordId,
    "substory-ai-602",
  );
});

test("workflow evidence builder rejects PR body metadata changed after review", () => {
  const inputs = buildFixtureInputs();
  inputs.pullRequest.body = metadataSource;
  inputs.pullRequest.updatedAt = "2026-01-01T12:30:00.000Z";
  inputs.issueComments.shift();
  inputs.reviews[0].body = `Approved. Confirmed cleanup metadata source pr-body:pr-700-body:${metadataHash}.`;

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Cleanup metadata source changed after required review point/,
  );
});

test("workflow evidence builder rejects unreferenced handoff cleanup comments", () => {
  const inputs = buildFixtureInputs();
  inputs.reviews[0].body = "Approved without exact cleanup metadata source.";

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /No reviewed cleanup metadata source references were found/,
  );
});

test("workflow evidence builder rejects handoff comments changed after review", () => {
  const inputs = buildFixtureInputs();
  inputs.issueComments[0].updatedAt = "2026-01-01T12:30:00.000Z";

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /changed after required review point/,
  );
});

test("workflow evidence builder rejects parent lifecycle evidence changed after review", () => {
  const inputs = buildFixtureInputs();
  inputs.issueComments[1].updatedAt = "2026-01-01T12:30:00.000Z";

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Parent lifecycle evidence changed after required review point/,
  );
});

test("workflow evidence builder rejects later duplicate parent lifecycle evidence", () => {
  const inputs = buildFixtureInputs();
  inputs.pullRequest.body = renderParentLifecycleEvidence();
  inputs.issueComments[1].updatedAt = "2026-01-01T12:30:00.000Z";

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Parent lifecycle evidence changed after required review point/,
  );
});

test("workflow evidence builder accepts equivalent fallback comments with a named human reviewer", () => {
  const inputs = buildFixtureInputs();
  inputs.reviews = [];
  inputs.issueComments.push({
    body: `## Equivalent Human Review Fallback

- Fallback human reviewer: reviewer-login
- Exact cleanup metadata source ref confirmed before fallback approval (\`pr-body:<source-id>:<sha256>\` or \`handoff-comment:<comment-id>:<sha256>\`): ${handoffRef}
`,
    createdAt: "2026-01-01T12:00:00.000Z",
    id: 902,
    updatedAt: "2026-01-01T12:00:00.000Z",
    userType: "Bot",
  });

  const evidence = buildWorkflowCleanupEvidence(inputs);
  const fallbackReview = evidence.reviews.find(
    (review) => review.id === "fallback-comment-902",
  );

  assert.equal(fallbackReview?.reviewerKind, "human");
  assert.equal(fallbackReview?.decision, "fallback-approved");
  assert.deepEqual(fallbackReview?.sourceRefs, [handoffRef]);
});

test("workflow evidence builder rejects parent cleanup without substory review evidence", () => {
  const inputs = buildFixtureInputs();
  inputs.issueComments[1].body = `Parent integration AI review record: parent-ai-review-700
Parent revision response: parent-revision-700
`;

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Missing durable substory PR review evidence/,
  );
});

function buildFixtureInputs() {
  return {
    changedFiles: [
      { filename: "stories/approved/INF-601-a.yaml" },
      { filename: "agent-packets/INF-601.md" },
      { filename: "stories/approved/INF-602-b.yaml" },
      { filename: "agent-packets/INF-602.md" },
    ],
    defaultBranch: "main",
    issueComments: [
      {
        body: metadataSource,
        createdAt: "2026-01-01T09:00:00.000Z",
        id: 900,
        updatedAt: "2026-01-01T09:00:00.000Z",
        userType: "User",
      },
      {
        body: renderParentLifecycleEvidence(),
        createdAt: "2026-01-01T09:30:00.000Z",
        id: 901,
        updatedAt: "2026-01-01T09:30:00.000Z",
        userType: "User",
      },
    ],
    pullRequest: {
      baseRef: "main",
      body: "",
      createdAt: "2026-01-01T08:00:00.000Z",
      headRef: "story/inf-027-parent",
      mergeCommitSha: "merge-sha",
      merged: true,
      mergedAt: "2026-01-01T13:00:00.000Z",
      number: 700,
      updatedAt: "2026-01-01T08:00:00.000Z",
    },
    reviews: [
      {
        body: `Approved. Confirmed cleanup metadata source ${handoffRef}.`,
        id: 101,
        state: "APPROVED",
        submittedAt: "2026-01-01T12:00:00.000Z",
        userType: "User",
      },
    ],
  };
}

function renderParentLifecycleEvidence() {
  return `Parent integration AI review record: parent-ai-review-700
Parent revision response: parent-revision-700
Substory AI review record:
  story: stories/approved/INF-601-a.yaml
  pr: 601
  record: substory-ai-601
Substory AI review record:
  story: stories/approved/INF-602-b.yaml
  pr: 602
  record: substory-ai-602
`;
}
