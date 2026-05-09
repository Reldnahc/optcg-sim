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

test("workflow evidence builder selects a durable handoff comment source on human merge", () => {
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
    [],
  );
  assert.deepEqual(
    evidence.reviews.find((review) => review.id === "merge-actor-700"),
    {
      decision: "merged",
      id: "merge-actor-700",
      isMergeGate: true,
      reviewerKind: "human",
      sourceRefs: [],
      submittedAt: "2026-01-01T13:00:00.000Z",
    },
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
  inputs.pullRequest.updatedAt = "2026-01-01T13:30:00.000Z";
  inputs.issueComments.shift();

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Cleanup metadata source changed after merge/,
  );
});

test("workflow evidence builder rejects ambiguous cleanup metadata sources", () => {
  const inputs = buildFixtureInputs();
  inputs.pullRequest.body = metadataSource;

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Ambiguous cleanup metadata sources/,
  );
});

test("workflow evidence builder rejects handoff comments changed after merge", () => {
  const inputs = buildFixtureInputs();
  inputs.issueComments[0].updatedAt = "2026-01-01T13:30:00.000Z";

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Cleanup metadata source changed after merge/,
  );
});

test("workflow evidence builder rejects parent lifecycle evidence changed after merge", () => {
  const inputs = buildFixtureInputs();
  inputs.issueComments[1].updatedAt = "2026-01-01T13:30:00.000Z";

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Parent lifecycle evidence changed after required review point/,
  );
});

test("workflow evidence builder rejects later duplicate parent lifecycle evidence after merge", () => {
  const inputs = buildFixtureInputs();
  inputs.pullRequest.body = renderParentLifecycleEvidence();
  inputs.issueComments[1].updatedAt = "2026-01-01T13:30:00.000Z";

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Parent lifecycle evidence changed after required review point/,
  );
});

test("workflow evidence builder accepts equivalent fallback comments with a named human reviewer", () => {
  const inputs = buildFixtureInputs();
  inputs.eventSenderUserType = "Bot";
  inputs.reviews = [];
  inputs.issueComments.push({
    body: `## Equivalent Human Review Fallback

- Fallback human reviewer: reviewer-login
- Cleanup metadata source reviewed before fallback approval: yes, exact cleanup metadata block matched story scope
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
  assert.deepEqual(fallbackReview?.sourceRefs, []);
});

test("workflow evidence builder rejects bot-only merge evidence", () => {
  const inputs = buildFixtureInputs();
  inputs.eventSenderUserType = "Bot";
  inputs.reviews = [];

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Missing human merge-gate cleanup approval/,
  );
});

test("workflow evidence builder rejects bot merge with prior human approval but no fallback", () => {
  const inputs = buildFixtureInputs();
  inputs.eventSenderUserType = "Bot";

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Missing human merge-gate cleanup approval/,
  );
});

test("workflow evidence builder rejects fallback comments missing cleanup metadata confirmation", () => {
  const inputs = buildFixtureInputs();
  inputs.eventSenderUserType = "Bot";
  inputs.reviews = [];
  inputs.issueComments.push({
    body: `## Equivalent Human Review Fallback

- Fallback human reviewer: reviewer-login
`,
    createdAt: "2026-01-01T12:00:00.000Z",
    id: 902,
    updatedAt: "2026-01-01T12:00:00.000Z",
    userType: "Bot",
  });

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Missing human merge-gate cleanup approval/,
  );
});

test("workflow evidence builder rejects fallback comments with blank cleanup metadata confirmation", () => {
  const inputs = buildFixtureInputs();
  inputs.eventSenderUserType = "Bot";
  inputs.reviews = [];
  inputs.issueComments.push({
    body: `## Equivalent Human Review Fallback

- Fallback human reviewer: reviewer-login
- Cleanup metadata source reviewed before fallback approval:
`,
    createdAt: "2026-01-01T12:00:00.000Z",
    id: 902,
    updatedAt: "2026-01-01T12:00:00.000Z",
    userType: "Bot",
  });

  assert.throws(
    () => buildWorkflowCleanupEvidence(inputs),
    /Missing human merge-gate cleanup approval/,
  );
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
    eventSenderUserType: "User",
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
        body: "Approved.",
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
