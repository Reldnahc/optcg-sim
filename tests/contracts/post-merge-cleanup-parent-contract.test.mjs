import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { sha256 } from "../../tools/agent-packet-lifecycle.ts";
import { buildCleanupDryRunPlan } from "../../tools/post-merge-cleanup/validator.ts";

test("parent cleanup planning rejects absent ambiguous mismatched or already-done parent stories", async () => {
  const noParentRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
  ]);
  const noParentMainSha = initializeGitRepo(noParentRoot);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(noParentMainSha),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: noParentRoot,
        trustedMainSha: noParentMainSha,
      }),
    /exactly one changed approved parent story/i,
  );

  const multipleParentRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601", "INF-602"]),
    parentStory("CARD-002", ["INF-601", "INF-602"]),
  ]);
  const multipleParentMainSha = initializeGitRepo(multipleParentRoot);
  const ambiguousEvidence = buildParentEvidence(multipleParentMainSha);
  ambiguousEvidence.changedFiles.push("stories/approved/CARD-002-parent.yaml");
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: ambiguousEvidence,
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: multipleParentRoot,
        trustedMainSha: multipleParentMainSha,
      }),
    /multiple changed approved parent stories/i,
  );

  const mismatchRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601"]),
  ]);
  const mismatchMainSha = initializeGitRepo(mismatchRoot);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(mismatchMainSha),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: mismatchRoot,
        trustedMainSha: mismatchMainSha,
      }),
    /child_stories.*match cleanup child story ids/i,
  );

  const doneParentRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    { ...parentStory("CARD-001", ["INF-601", "INF-602"]), status: "done" },
  ]);
  const doneParentMainSha = initializeGitRepo(doneParentRoot);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(doneParentMainSha),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: doneParentRoot,
        trustedMainSha: doneParentMainSha,
      }),
    /parent story.*already done/i,
  );

  const packetizedParentRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    { ...parentStory("CARD-001", ["INF-601", "INF-602"]), writePacket: true },
  ]);
  const packetizedParentMainSha = initializeGitRepo(packetizedParentRoot);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(packetizedParentMainSha),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: packetizedParentRoot,
        trustedMainSha: packetizedParentMainSha,
      }),
    /must be non-packetized/i,
  );
});

test("parent cleanup planning accepts object-form parent child stories", async () => {
  const repoRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601", "INF-602"], "object"),
  ]);
  const trustedMainSha = initializeGitRepo(repoRoot);

  const plan = await buildCleanupDryRunPlan({
    evidence: buildParentEvidence(trustedMainSha),
    metadata: parentMetadata(),
    metadataSourceRef: "pr-body:pr-501-body:meta-1",
    repoRoot,
    trustedMainSha,
  });

  assert.equal(plan.boundParentStory?.storyId, "CARD-001");
  assert.equal(
    plan.boundParentStory?.storyPath,
    "stories/approved/CARD-001-parent.yaml",
  );
  assert.match(plan.boundParentStory?.storySha256 ?? "", /^[0-9a-f]{64}$/);
});

test("parent cleanup planning rejects missing included child evidence", async () => {
  const repoRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
  ]);
  const trustedMainSha = initializeGitRepo(repoRoot);
  const evidence = buildParentEvidence(trustedMainSha);
  evidence.parentLifecycle.includedStories = [
    evidence.parentLifecycle.includedStories[0],
  ];

  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot,
        trustedMainSha,
      }),
    /missing included-substory/i,
  );
});

test("parent cleanup planning rejects mismatched included child evidence", async () => {
  const repoRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
  ]);
  const trustedMainSha = initializeGitRepo(repoRoot);
  const evidence = buildParentEvidence(trustedMainSha);
  evidence.parentLifecycle.includedStories[1].packetPath =
    "agent-packets/INF-999.md";

  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot,
        trustedMainSha,
      }),
    /does not match trusted story\/packet evidence/i,
  );
});

test("parent cleanup planning rejects lifecycle evidence after human review", async () => {
  const repoRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
  ]);
  const trustedMainSha = initializeGitRepo(repoRoot);
  const evidence = buildParentEvidence(trustedMainSha);
  evidence.parentLifecycle.cleanupPlanRecordedAt = "2026-01-02T00:00:01.000Z";

  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot,
        trustedMainSha,
      }),
    /recorded before the required human merge-gate review/i,
  );
});

test("parent cleanup planning rejects missing substory commit evidence", async () => {
  const repoRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601", "INF-602"]),
  ]);
  const trustedMainSha = initializeGitRepo(repoRoot);
  const evidence = buildParentEvidence(trustedMainSha);
  const missingCommitSha = "1111111111111111111111111111111111111111";
  evidence.stories[0].substoryCommitSha = missingCommitSha;
  evidence.parentLifecycle.includedStories[0].substoryCommitSha =
    missingCommitSha;

  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot,
        trustedMainSha,
      }),
    /cannot be found/i,
  );
});

test("parent cleanup planning rejects substory commit evidence that exists but is not reachable from merged parent head", async () => {
  const repoRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601", "INF-602"]),
  ]);
  const trustedMainSha = initializeGitRepo(repoRoot);
  const unreachableCommitSha = createUnreachableCommit(repoRoot);
  const evidence = buildParentEvidence(trustedMainSha);
  evidence.stories[0].substoryCommitSha = unreachableCommitSha;
  evidence.parentLifecycle.includedStories[0].substoryCommitSha =
    unreachableCommitSha;

  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot,
        trustedMainSha,
      }),
    /is not reachable from merged parent PR head/i,
  );
});

test("parent cleanup planning fails closed for malformed object-form child story ids", async () => {
  const duplicateRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601", "INF-601"], "object"),
  ]);
  const duplicateMainSha = initializeGitRepo(duplicateRoot);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(duplicateMainSha),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: duplicateRoot,
        trustedMainSha: duplicateMainSha,
      }),
    /duplicate child_stories id/i,
  );

  const missingIdRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601"], "object-missing-id"),
  ]);
  const missingIdMainSha = initializeGitRepo(missingIdRoot);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(missingIdMainSha),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: missingIdRoot,
        trustedMainSha: missingIdMainSha,
      }),
    /malformed child_stories id/i,
  );
});

async function makeTempRepo(stories) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-cleanup-"));
  await mkdir(path.join(tempRoot, "stories", "approved"), { recursive: true });
  await mkdir(path.join(tempRoot, "agent-packets"), { recursive: true });

  for (const story of stories) {
    const storySource = renderStoryYaml({
      childStoryForm: story.childStoryForm,
      childStoryIds: story.childStoryIds,
      id: story.id,
      status: story.status ?? "approved",
    });
    await writeFile(
      path.join(tempRoot, "stories", "approved", story.fileName),
      storySource,
    );
    if (story.writePacket === false) {
      continue;
    }
    await writeFile(
      path.join(tempRoot, "agent-packets", `${story.id}.md`),
      `<!-- agent-packet:story-id ${story.id} -->
<!-- agent-packet:story-path stories/approved/${story.fileName} -->
<!-- agent-packet:story-sha256 ${sha256(storySource)} -->

# Story Packet
`,
    );
  }
  return tempRoot;
}

function parentStory(id, childStoryIds, childStoryForm = "scalar") {
  return {
    childStoryForm,
    childStoryIds,
    fileName: `${id}-parent.yaml`,
    id,
    writePacket: false,
  };
}

function parentMetadata() {
  return {
    branches: ["story/inf-601", "story/inf-602"],
    mode: "parent",
    stories: [
      "stories/approved/INF-601-a.yaml",
      "stories/approved/INF-602-b.yaml",
    ],
  };
}

function buildParentEvidence(trustedMainSha) {
  return {
    baseBranch: "main",
    changedFiles: [
      "stories/approved/INF-601-a.yaml",
      "agent-packets/INF-601.md",
      "stories/approved/INF-602-b.yaml",
      "agent-packets/INF-602.md",
      "stories/approved/CARD-001-parent.yaml",
    ],
    defaultBranch: "main",
    mergeSha: trustedMainSha,
    merged: true,
    mergedAt: "2026-01-02T00:00:00.000Z",
    metadataSource: {
      contentSha256: "meta-1",
      kind: "pr-body",
      sourceId: "pr-501-body",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    metadataSourceRef: "pr-body:pr-501-body:meta-1",
    prNumber: 700,
    reviews: [
      {
        decision: "merged",
        id: "merge-actor-501",
        isMergeGate: true,
        reviewerKind: "human",
        sourceRefs: [],
        submittedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    stories: [
      storyEvidence("INF-601", "INF-601-a.yaml", trustedMainSha),
      storyEvidence("INF-602", "INF-602-b.yaml", trustedMainSha),
    ],
    parentLifecycle: {
      cleanupPlanRecordedAt: "2026-01-01T10:00:00.000Z",
      includedStories: [
        storyEvidence("INF-601", "INF-601-a.yaml", trustedMainSha),
        storyEvidence("INF-602", "INF-602-b.yaml", trustedMainSha),
      ],
      parentIntegrationReviewRecordId: "parent-review-1",
      parentRevisionResponseId: "parent-revision-1",
    },
  };
}

function initializeGitRepo(tempRoot) {
  for (const args of [
    ["init", "-b", "main"],
    ["config", "user.name", "Fixture User"],
    ["config", "user.email", "fixture@example.com"],
    ["add", "."],
    ["commit", "-m", "fixture"],
  ]) {
    const run = spawnSync("git", args, {
      cwd: tempRoot,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
  }
  return spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: tempRoot,
    encoding: "utf8",
  }).stdout.trim();
}

function createUnreachableCommit(tempRoot) {
  for (const args of [
    ["checkout", "-b", "side/unreachable"],
    ["commit", "--allow-empty", "-m", "unreachable"],
    ["checkout", "main"],
  ]) {
    const run = spawnSync("git", args, {
      cwd: tempRoot,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
  }
  return spawnSync("git", ["rev-parse", "side/unreachable"], {
    cwd: tempRoot,
    encoding: "utf8",
  }).stdout.trim();
}

function storyEvidence(storyId, fileName, commitSha) {
  return {
    packetPath: `agent-packets/${storyId}.md`,
    storyId,
    storyPath: `stories/approved/${fileName}`,
    substoryAiReviewRecordId: `ai-${storyId}`,
    substoryCommitSha: commitSha,
    substoryRevisionResponseId: `revision-${storyId}`,
    substoryVerificationEvidence: `verify-${storyId}`,
  };
}

function renderStoryYaml(options) {
  return `spec_version: v6
spec_package_name: optcg-md-specs-v6
story_schema_version: 1.0.0
id: ${options.id}
epic_id: KICK-001
title: Fixture story
type: tooling
area: infra
primary_concern: tooling
priority: low
status: ${options.status}
summary: Fixture.
story_boundary: Fixture.
allowed_touch_points:
  - tools/**
spec_refs:
  - 23-repo-tooling-and-enforcement.s010
scope:
  - fixture
non_scope:
  - none
dependencies: []
acceptance_criteria:
  - fixture
required_tests:
  - fixture
repo_rules:
  - fail closed
ambiguity_policy: fail_and_escalate
${renderChildStories(options)}`;
}

function renderChildStories(options) {
  if (!options.childStoryIds) {
    return "";
  }
  if (options.childStoryForm === "object") {
    return `child_stories:
${options.childStoryIds
  .map(
    (id) => `  - id: ${id}
    title: ${id} child
    concern: ${id} concern
    depends_on: []
`,
  )
  .join("")}`;
  }
  if (options.childStoryForm === "object-missing-id") {
    return `child_stories:
  - title: Missing child id
    concern: malformed child concern
    depends_on: []
`;
  }
  return `child_stories:\n${options.childStoryIds.map((id) => `  - ${id}`).join("\n")}\n`;
}
