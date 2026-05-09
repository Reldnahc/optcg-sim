import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { sha256 } from "../../tools/agent-packet-lifecycle.ts";
import { parseCleanupMetadataBlock } from "../../tools/post-merge-cleanup/metadata.ts";
import { buildCleanupDryRunPlan as buildRawCleanupDryRunPlan } from "../../tools/post-merge-cleanup/validator.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

test("parser accepts valid single metadata", () => {
  const source = readFileSync(
    path.join(repoRoot, "tests/fixtures/post-merge-cleanup/pr-body-single.md"),
    "utf8",
  );
  const metadata = parseCleanupMetadataBlock(source);

  assert.deepEqual(metadata, {
    branches: ["story/inf-027b-cleanup-metadata-parser-validator"],
    mode: "single",
    stories: [
      "stories/approved/INF-027B-add-cleanup-metadata-parser-and-validator.yaml",
    ],
  });
});

test("parser accepts valid parent metadata", () => {
  const metadata = parseCleanupMetadataBlock(`Post-merge cleanup:
  mode: parent
  stories:
    - stories/approved/INF-101-a.yaml
    - stories/approved/INF-102-b.yaml
  branches:
    - story/inf-101
    - story/inf-102
`);

  assert.equal(metadata.mode, "parent");
  assert.deepEqual(metadata.stories, [
    "stories/approved/INF-101-a.yaml",
    "stories/approved/INF-102-b.yaml",
  ]);
});

test("parser fails closed for missing malformed or ambiguous metadata", () => {
  assert.throws(() => parseCleanupMetadataBlock("no cleanup block"), /Missing/);
  assert.throws(
    () =>
      parseCleanupMetadataBlock(`Post-merge cleanup:
  stories:
    - stories/approved/A.yaml
`),
    /missing mode/i,
  );
  assert.throws(
    () =>
      parseCleanupMetadataBlock(`Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/A.yaml
Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/B.yaml
`),
    /Ambiguous/,
  );
  assert.throws(
    () =>
      parseCleanupMetadataBlock(`Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/A.yaml
  stories:
    - stories/approved/B.yaml
`),
    /duplicate stories/i,
  );
  assert.throws(
    () =>
      parseCleanupMetadataBlock(`Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/A.yaml
  branches:
    - story/a
  branches:
    - story/b
`),
    /duplicate branches/i,
  );
});

test("PR evidence binding accepts valid single-story cleanup", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-501", fileName: "INF-501-story.yaml" },
  ]);
  const plan = await buildCleanupDryRunPlan({
    evidence: buildSingleEvidence(),
    metadata: {
      branches: ["story/inf-501"],
      mode: "single",
      stories: ["stories/approved/INF-501-story.yaml"],
    },
    repoRoot: tempRoot,
  });
  assert.equal(plan.mergedPrNumber, 501);
  assert.equal(plan.mergeSha, "abc123");
  assert.equal(plan.boundStories.length, 1);
});

test("PR evidence binding accepts valid parent cleanup with multiple child stories", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
  ]);
  const plan = await buildCleanupDryRunPlan({
    evidence: buildParentEvidence(),
    metadata: {
      branches: ["story/inf-601", "story/inf-602"],
      mode: "parent",
      stories: [
        "stories/approved/INF-601-a.yaml",
        "stories/approved/INF-602-b.yaml",
      ],
    },
    repoRoot: tempRoot,
  });
  assert.equal(plan.mode, "parent");
  assert.equal(plan.boundStories.length, 2);
});

test("rejects metadata that does not match merged PR story evidence", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-501", fileName: "INF-501-story.yaml" },
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-999-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /does not exist|not associated/,
  );
});

test("rejects reviewed metadata source mismatch", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-501", fileName: "INF-501-story.yaml" },
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-501-story.yaml"],
        },
        metadataSourceRef: "pr-body:pr-501-body:different-source",
        repoRoot: tempRoot,
      }),
    /reviewed PR metadata source/,
  );
});

test("rejects unsupported reviewed metadata source kind from untrusted evidence JSON", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-501", fileName: "INF-501-story.yaml" },
  ]);
  const evidence = buildSingleEvidence();
  evidence.metadataSource.kind = "issue-comment";
  evidence.metadataSourceRef = "issue-comment:pr-501-body:meta-1";
  evidence.reviews[0].sourceRefs = ["issue-comment:pr-501-body:meta-1"];

  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-501-story.yaml"],
        },
        metadataSourceRef: "issue-comment:pr-501-body:meta-1",
        repoRoot: tempRoot,
      }),
    /PR body or durable handoff comment/,
  );
});

test("rejects malformed boolean fields from untrusted evidence JSON", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-501", fileName: "INF-501-story.yaml" },
  ]);
  const stringMergedEvidence = buildSingleEvidence();
  stringMergedEvidence.merged = "false";

  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: stringMergedEvidence,
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-501-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /merged must be a boolean/,
  );

  const stringMergeGateEvidence = buildSingleEvidence();
  stringMergeGateEvidence.reviews[0].isMergeGate = "false";

  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: stringMergeGateEvidence,
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-501-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /review\.isMergeGate must be a boolean/,
  );
});

test("rejects malformed timestamp fields from untrusted evidence JSON", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-501", fileName: "INF-501-story.yaml" },
  ]);
  const malformedMetadataTimeEvidence = buildSingleEvidence();
  malformedMetadataTimeEvidence.metadataSource.updatedAt = "not-a-date";

  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: malformedMetadataTimeEvidence,
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-501-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /metadataSource\.updatedAt must be a canonical UTC timestamp/,
  );

  const malformedReviewTimeEvidence = buildSingleEvidence();
  malformedReviewTimeEvidence.reviews[0].submittedAt = "2026-01-01T12:00:00Z";

  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: malformedReviewTimeEvidence,
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-501-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /review\.submittedAt must be a canonical UTC timestamp/,
  );
});

test("rejects merge SHA that does not match trusted default-branch checkout", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-501", fileName: "INF-501-story.yaml" },
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-501-story.yaml"],
        },
        repoRoot: tempRoot,
        trustedMainSha: "different-sha",
      }),
    /trusted checked-out default branch/,
  );
});

test("rejects post-review metadata mutation without later human review", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-501", fileName: "INF-501-story.yaml" },
  ]);
  const evidence = buildSingleEvidence();
  evidence.metadataSource.updatedAt = "2026-01-03T00:00:00.000Z";
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-501-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /changed after required review point/,
  );
});

test("accepts durable handoff comment when explicitly referenced by human merge-gate review", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-501", fileName: "INF-501-story.yaml" },
  ]);
  const evidence = buildSingleEvidence();
  evidence.metadataSource = {
    contentSha256: "meta-2",
    durable: true,
    kind: "handoff-comment",
    sourceId: "comment-77",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  evidence.metadataSourceRef = "handoff-comment:comment-77:meta-2";
  evidence.reviews[0].sourceRefs = ["handoff-comment:comment-77:meta-2"];
  const plan = await buildCleanupDryRunPlan({
    evidence,
    metadata: {
      branches: [],
      mode: "single",
      stories: ["stories/approved/INF-501-story.yaml"],
    },
    repoRoot: tempRoot,
  });
  assert.equal(
    plan.verificationInputs.metadataSource,
    "handoff-comment:comment-77:meta-2",
  );
});

test("rejects durable handoff comment not explicitly referenced by human merge-gate review", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-501", fileName: "INF-501-story.yaml" },
  ]);
  const evidence = buildSingleEvidence();
  evidence.metadataSource = {
    contentSha256: "meta-2",
    durable: true,
    kind: "handoff-comment",
    sourceId: "comment-77",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  evidence.metadataSourceRef = "handoff-comment:comment-77:meta-2";
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-501-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /must reference the exact metadata source/,
  );
});

test("rejects parent cleanup with missing parent/substory inclusion evidence", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
  ]);
  const evidence = buildParentEvidence();
  evidence.parentLifecycle.includedStories = [
    evidence.parentLifecycle.includedStories[0],
  ];
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: {
          branches: [],
          mode: "parent",
          stories: [
            "stories/approved/INF-601-a.yaml",
            "stories/approved/INF-602-b.yaml",
          ],
        },
        repoRoot: tempRoot,
      }),
    /missing included-substory/,
  );
});

test("rejects parent included-substory evidence that mismatches trusted child story or packet", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
  ]);
  const evidence = buildParentEvidence();
  evidence.parentLifecycle.includedStories[1].packetPath =
    "agent-packets/INF-999.md";
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: {
          branches: [],
          mode: "parent",
          stories: [
            "stories/approved/INF-601-a.yaml",
            "stories/approved/INF-602-b.yaml",
          ],
        },
        repoRoot: tempRoot,
      }),
    /does not match trusted story\/packet evidence/,
  );
});

test("rejects parent cleanup plan recorded after required human review", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-601", fileName: "INF-601-a.yaml" },
    { id: "INF-602", fileName: "INF-602-b.yaml" },
  ]);
  const evidence = buildParentEvidence();
  evidence.parentLifecycle.cleanupPlanRecordedAt = "2026-01-01T13:00:00.000Z";
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence,
        metadata: {
          branches: [],
          mode: "parent",
          stories: [
            "stories/approved/INF-601-a.yaml",
            "stories/approved/INF-602-b.yaml",
          ],
        },
        repoRoot: tempRoot,
      }),
    /recorded before the required human merge-gate review/,
  );
});

test("validator fails closed for story-id mismatch, missing packet, and ineligible story", async () => {
  const idMismatchRoot = await makeTempRepo([
    { id: "INF-301", fileName: "INF-302-other.yaml" },
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-302-other.yaml"],
        },
        repoRoot: idMismatchRoot,
      }),
    /id\/path mismatch/,
  );

  const missingPacketRoot = await makeTempRepo([
    { id: "INF-304", fileName: "INF-304-story.yaml", writePacket: false },
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-304-story.yaml"],
        },
        repoRoot: missingPacketRoot,
      }),
    /missing packet/,
  );

  const ineligibleStoryRoot = await makeTempRepo([
    { id: "INF-305", fileName: "INF-305-story.yaml", status: "done" },
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-305-story.yaml"],
        },
        repoRoot: ineligibleStoryRoot,
      }),
    /must be approved/,
  );
});

test("rejects stale packet or story/packet mismatch after merge", async () => {
  const tempRoot = await makeTempRepo(
    [{ id: "INF-501", fileName: "INF-501-story.yaml" }],
    { stalePacket: true },
  );
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-501-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /stale packet evidence/,
  );
});

test("validator fails for duplicate, broad-glob, outside, generated, and done paths", async () => {
  const tempRoot = await makeTempRepo([
    { id: "INF-201", fileName: "INF-201-story.yaml" },
  ]);
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "parent",
          stories: [
            "stories/approved/INF-201-story.yaml",
            "stories/approved/INF-201-story.yaml",
          ],
        },
        repoRoot: tempRoot,
      }),
    /Duplicate story path|Parent-mode cleanup requires/,
  );
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/*.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /globs are not allowed/,
  );
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/generated/INF-201-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /must be under stories\/approved/,
  );
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/done/INF-201-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /must be under stories\/approved/,
  );
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        evidence: buildSingleEvidence(),
        metadata: {
          branches: [],
          mode: "single",
          stories: ["../stories/approved/INF-201-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /must be under stories\/approved/,
  );
});

test("package script exposes reviewed cleanup validation behavior", () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  assert.equal(
    packageJson.scripts["cleanup:validate-dry-run"],
    "node --experimental-strip-types tools/post-merge-cleanup.ts",
  );

  const metadataSource = `Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/INF-027C-bind-cleanup-metadata-to-reviewed-pr-evidence.yaml
  branches:
    - story/inf-027c-cleanup-reviewed-pr-evidence-binding
`;
  const trustedMainSha = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).stdout.trim();
  const metadataSourceSha = sha256(metadataSource);
  const evidence = {
    ...buildSingleEvidence(),
    changedFiles: [
      "stories/approved/INF-027C-bind-cleanup-metadata-to-reviewed-pr-evidence.yaml",
      "agent-packets/INF-027C.md",
    ],
    mergeSha: trustedMainSha,
    metadataSource: {
      contentSha256: metadataSourceSha,
      kind: "pr-body",
      sourceId: "pr-27-body",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    metadataSourceRef: `pr-body:pr-27-body:${metadataSourceSha}`,
    prNumber: 27,
    reviews: [
      {
        decision: "approved",
        id: "rvw-27",
        isMergeGate: true,
        reviewerKind: "human",
        sourceRefs: [`pr-body:pr-27-body:${metadataSourceSha}`],
        submittedAt: "2026-01-01T12:00:00.000Z",
      },
    ],
    stories: [
      {
        packetPath: "agent-packets/INF-027C.md",
        storyId: "INF-027C",
        storyPath:
          "stories/approved/INF-027C-bind-cleanup-metadata-to-reviewed-pr-evidence.yaml",
      },
    ],
  };
  const run = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--pr-body",
      metadataSource,
      "--evidence-json",
      JSON.stringify(evidence),
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.mode, "single");
  assert.equal(output.mergedPrNumber, 27);
  assert.equal(output.boundStories[0].storyId, "INF-027C");
  assert.equal(output.verificationInputs.trustedMainSha, trustedMainSha);
});

test("package script rejects unreviewed explicit CLI metadata", () => {
  const run = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--mode",
      "single",
      "--story",
      "stories/approved/INF-027C-bind-cleanup-metadata-to-reviewed-pr-evidence.yaml",
      "--evidence-json",
      JSON.stringify(buildSingleEvidence()),
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /reviewed PR body or durable handoff comment/);
});

async function makeTempRepo(stories, options = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-cleanup-"));
  await mkdir(path.join(tempRoot, "stories", "approved"), { recursive: true });
  await mkdir(path.join(tempRoot, "stories", "done"), { recursive: true });
  await mkdir(path.join(tempRoot, "agent-packets"), { recursive: true });

  for (const story of stories) {
    const storyPath = path.join(
      tempRoot,
      "stories",
      "approved",
      story.fileName,
    );
    const storySource = renderStoryYaml({
      id: story.id,
      status: story.status ?? "approved",
    });
    await writeFile(storyPath, storySource);
    if (story.writePacket === false) {
      continue;
    }
    const packetSource = `<!-- agent-packet:story-id ${story.id} -->
<!-- agent-packet:story-path stories/approved/${story.fileName} -->
<!-- agent-packet:story-sha256 ${options.stalePacket ? "bad-hash" : sha256(storySource)} -->

# Story Packet
`;
    await writeFile(
      path.join(tempRoot, "agent-packets", `${story.id}.md`),
      packetSource,
    );
  }
  return tempRoot;
}

function buildCleanupDryRunPlan(options) {
  return buildRawCleanupDryRunPlan({
    ...options,
    metadataSourceRef:
      options.metadataSourceRef ?? options.evidence.metadataSourceRef,
    trustedMainSha: options.trustedMainSha ?? options.evidence.mergeSha,
  });
}

function buildSingleEvidence() {
  return {
    baseBranch: "main",
    changedFiles: [
      "stories/approved/INF-501-story.yaml",
      "agent-packets/INF-501.md",
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
    parentLifecycle: undefined,
    prNumber: 501,
    reviews: [
      {
        decision: "approved",
        id: "rvw-1",
        isMergeGate: true,
        reviewerKind: "human",
        sourceRefs: ["pr-body:pr-501-body:meta-1"],
        submittedAt: "2026-01-01T12:00:00.000Z",
      },
    ],
    stories: [
      {
        packetPath: "agent-packets/INF-501.md",
        storyId: "INF-501",
        storyPath: "stories/approved/INF-501-story.yaml",
      },
    ],
  };
}

function buildParentEvidence() {
  return {
    ...buildSingleEvidence(),
    changedFiles: [
      "stories/approved/INF-601-a.yaml",
      "agent-packets/INF-601.md",
      "stories/approved/INF-602-b.yaml",
      "agent-packets/INF-602.md",
    ],
    prNumber: 700,
    stories: [
      {
        packetPath: "agent-packets/INF-601.md",
        storyId: "INF-601",
        storyPath: "stories/approved/INF-601-a.yaml",
        substoryAiReviewRecordId: "ai-601",
        substoryPrNumber: 601,
      },
      {
        packetPath: "agent-packets/INF-602.md",
        storyId: "INF-602",
        storyPath: "stories/approved/INF-602-b.yaml",
        substoryAiReviewRecordId: "ai-602",
        substoryPrNumber: 602,
      },
    ],
    parentLifecycle: {
      cleanupPlanRecordedAt: "2026-01-01T10:00:00.000Z",
      includedStories: [
        {
          packetPath: "agent-packets/INF-601.md",
          storyId: "INF-601",
          storyPath: "stories/approved/INF-601-a.yaml",
          substoryAiReviewRecordId: "ai-601",
          substoryPrNumber: 601,
        },
        {
          packetPath: "agent-packets/INF-602.md",
          storyId: "INF-602",
          storyPath: "stories/approved/INF-602-b.yaml",
          substoryAiReviewRecordId: "ai-602",
          substoryPrNumber: 602,
        },
      ],
      parentIntegrationReviewRecordId: "parent-review-1",
      parentRevisionResponseId: "parent-revision-1",
    },
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
`;
}
