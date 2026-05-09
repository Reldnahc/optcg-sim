import assert from "node:assert/strict";
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
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: noParentRoot,
        trustedMainSha: "abc123",
      }),
    /exactly one changed approved parent story/i,
  );

  const multipleParentRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601", "INF-602"]),
    parentStory("CARD-002", ["INF-601", "INF-602"]),
  ]);
  const ambiguousEvidence = buildParentEvidence();
  ambiguousEvidence.changedFiles.push("stories/approved/CARD-002-parent.yaml");
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: ambiguousEvidence,
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: multipleParentRoot,
        trustedMainSha: "abc123",
      }),
    /multiple changed approved parent stories/i,
  );

  const mismatchRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601"]),
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: mismatchRoot,
        trustedMainSha: "abc123",
      }),
    /child_stories.*match cleanup child story ids/i,
  );

  const doneParentRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    { ...parentStory("CARD-001", ["INF-601", "INF-602"]), status: "done" },
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: doneParentRoot,
        trustedMainSha: "abc123",
      }),
    /parent story.*already done/i,
  );

  const packetizedParentRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    { ...parentStory("CARD-001", ["INF-601", "INF-602"]), writePacket: true },
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: packetizedParentRoot,
        trustedMainSha: "abc123",
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

  const plan = await buildCleanupDryRunPlan({
    evidence: buildParentEvidence(),
    metadata: parentMetadata(),
    metadataSourceRef: "pr-body:pr-501-body:meta-1",
    repoRoot,
    trustedMainSha: "abc123",
  });

  assert.equal(plan.boundParentStory?.storyId, "CARD-001");
  assert.equal(
    plan.boundParentStory?.storyPath,
    "stories/approved/CARD-001-parent.yaml",
  );
  assert.match(plan.boundParentStory?.storySha256 ?? "", /^[0-9a-f]{64}$/);
});

test("parent cleanup planning fails closed for malformed object-form child story ids", async () => {
  const duplicateRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601", "INF-601"], "object"),
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: duplicateRoot,
        trustedMainSha: "abc123",
      }),
    /duplicate child_stories id/i,
  );

  const missingIdRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
    parentStory("CARD-001", ["INF-601"], "object-missing-id"),
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildParentEvidence(),
        metadata: parentMetadata(),
        metadataSourceRef: "pr-body:pr-501-body:meta-1",
        repoRoot: missingIdRoot,
        trustedMainSha: "abc123",
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

function buildParentEvidence() {
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
    mergeSha: "abc123",
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
      storyEvidence("INF-601", "INF-601-a.yaml", 601),
      storyEvidence("INF-602", "INF-602-b.yaml", 602),
    ],
    parentLifecycle: {
      cleanupPlanRecordedAt: "2026-01-01T10:00:00.000Z",
      includedStories: [
        storyEvidence("INF-601", "INF-601-a.yaml", 601),
        storyEvidence("INF-602", "INF-602-b.yaml", 602),
      ],
      parentIntegrationReviewRecordId: "parent-review-1",
      parentRevisionResponseId: "parent-revision-1",
    },
  };
}

function storyEvidence(storyId, fileName, prNumber) {
  return {
    packetPath: `agent-packets/${storyId}.md`,
    storyId,
    storyPath: `stories/approved/${fileName}`,
    substoryAiReviewRecordId: `ai-${storyId}`,
    substoryPrNumber: prNumber,
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
