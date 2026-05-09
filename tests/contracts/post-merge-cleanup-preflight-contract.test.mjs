import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { sha256 } from "../../tools/agent-packet-lifecycle.ts";
import { validateBoundCleanupPlanArtifact } from "../../tools/post-merge-cleanup/validator.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

test("preflight writes bound cleanup plan artifact only after validation passes", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-plan-"));
  const planFile = path.join(tempRoot, "bound-cleanup-plan.json");
  const metadataSource = renderMetadataSource(
    "INF-027C-bind-cleanup-metadata-to-reviewed-pr-evidence",
  );
  const evidence = buildEvidence({ metadataSource });

  const run = runPreflight({ evidence, metadataSource, planFile });

  assert.equal(run.status, 0, run.stderr);
  const artifact = validateBoundCleanupPlanArtifact(
    JSON.parse(readFileSync(planFile, "utf8")),
  );
  assert.equal(artifact.schemaVersion, "post-merge-cleanup-plan.v1");
  assert.equal(artifact.status, "valid");
  assert.equal(artifact.mergedPullRequest.number, 27);
  assert.match(artifact.metadataSource.contentSha256, /^[0-9a-f]{64}$/);
  assert.equal(artifact.packetCommand.command, "packets:complete");
  assert.match(artifact.reviewEvidenceSource.contentSha256, /^[0-9a-f]{64}$/);
  assert.match(artifact.stories[0].packetSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(artifact.packetCommand.args, [
    "--story",
    "stories/approved/INF-027C-bind-cleanup-metadata-to-reviewed-pr-evidence.yaml",
  ]);
  assert.equal(artifact.verificationCommand, "corepack pnpm verify");
  assert.match(artifact.inputsHash, /^[0-9a-f]{64}$/);
});

test("source-ref preview computes the same PR body ref used by preflight validation", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-ref-"));
  const planFile = path.join(tempRoot, "bound-cleanup-plan.json");
  const metadataSource = renderMetadataSource(
    "INF-027C-bind-cleanup-metadata-to-reviewed-pr-evidence",
  );
  const preview = runSourceRefPreview({
    id: "pr-27-body",
    kind: "pr-body",
    metadataSource,
  });

  assert.equal(preview.status, 0, preview.stderr);
  const parsedPreview = JSON.parse(preview.stdout);
  const evidence = buildEvidence({
    metadataSource,
    metadataSourceKind: "pr-body",
    metadataSourceRef: parsedPreview.metadataSourceRef,
    sourceId: "pr-27-body",
  });

  const run = runPreflight({ evidence, metadataSource, planFile });

  assert.equal(run.status, 0, run.stderr);
  const artifact = validateBoundCleanupPlanArtifact(
    JSON.parse(readFileSync(planFile, "utf8")),
  );
  assert.equal(artifact.metadataSource.ref, parsedPreview.metadataSourceRef);
  assert.equal(artifact.metadataSource.contentSha256, parsedPreview.sha256);
});

test("handoff-comment metadata source file binds to previewed source ref", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-handoff-"));
  const planFile = path.join(tempRoot, "bound-cleanup-plan.json");
  const metadataFile = path.join(tempRoot, "handoff-comment.md");
  const metadataSource = renderMetadataSource(
    "INF-027C-bind-cleanup-metadata-to-reviewed-pr-evidence",
  );
  await writeFile(metadataFile, metadataSource);
  const preview = runSourceRefPreview({
    file: metadataFile,
    id: "77",
    kind: "handoff-comment",
  });
  assert.equal(preview.status, 0, preview.stderr);
  const parsedPreview = JSON.parse(preview.stdout);
  const evidence = buildEvidence({
    metadataSource,
    metadataSourceKind: "handoff-comment",
    metadataSourceRef: parsedPreview.metadataSourceRef,
    sourceId: "77",
  });

  const run = runPreflight({
    evidence,
    metadataSourceFile: metadataFile,
    planFile,
  });

  assert.equal(run.status, 0, run.stderr);
  const artifact = validateBoundCleanupPlanArtifact(
    JSON.parse(readFileSync(planFile, "utf8")),
  );
  assert.equal(
    artifact.metadataSource.ref,
    `handoff-comment:77:${parsedPreview.sha256}`,
  );
});

test("failed preflight does not write bound cleanup plan artifact", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-plan-fail-"));
  const planFile = path.join(tempRoot, "bound-cleanup-plan.json");
  const metadataSource = renderMetadataSource("INF-999-missing");
  const evidence = buildEvidence({ metadataSource });

  const run = runPreflight({ evidence, metadataSource, planFile });

  assert.notEqual(run.status, 0);
  assert.throws(() => readFileSync(planFile, "utf8"));
});

test("bound cleanup plan schema rejects unexpected top-level fields", () => {
  const validArtifact = {
    branches: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
    inputsHash: "0".repeat(64),
    mergedPullRequest: {
      baseBranch: "main",
      mergeSha: "abc123",
      number: 1,
    },
    metadataSource: {
      contentSha256: "3".repeat(64),
      ref: `pr-body:body:${"3".repeat(64)}`,
    },
    packetCommand: {
      args: ["--story", "stories/approved/INF-501-story.yaml"],
      command: "packets:complete",
    },
    reviewEvidenceSource: {
      contentSha256: "4".repeat(64),
      requiredReviewId: "rvw-1",
      requiredReviewSubmittedAt: "2026-01-01T00:00:00.000Z",
    },
    schemaVersion: "post-merge-cleanup-plan.v1",
    status: "valid",
    stories: [
      {
        packetPath: "agent-packets/INF-501.md",
        packetSha256: "2".repeat(64),
        storyId: "INF-501",
        storyPath: "stories/approved/INF-501-story.yaml",
        storySha256: "1".repeat(64),
      },
    ],
    verificationCommand: "corepack pnpm verify",
  };

  assert.doesNotThrow(() => validateBoundCleanupPlanArtifact(validArtifact));
  assert.throws(
    () =>
      validateBoundCleanupPlanArtifact({
        ...validArtifact,
        unexpected: true,
      }),
    /unexpected top-level field/,
  );
  assert.throws(
    () =>
      validateBoundCleanupPlanArtifact({
        ...validArtifact,
        status: "failed",
      }),
    /status must be valid/,
  );
  assert.throws(
    () =>
      validateBoundCleanupPlanArtifact({
        ...validArtifact,
        metadataSource: {
          contentSha256: "abc",
          ref: "pr-body:body:abc",
        },
      }),
    /metadataSource\.contentSha256 must be a sha256 hash/,
  );
  assert.throws(
    () =>
      validateBoundCleanupPlanArtifact({
        ...validArtifact,
        reviewEvidenceSource: {
          contentSha256: "abc",
          requiredReviewId: "rvw-1",
          requiredReviewSubmittedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    /reviewEvidenceSource\.contentSha256 must be a sha256 hash/,
  );
});

function buildEvidence(options) {
  const trustedMainSha = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).stdout.trim();
  const metadataSourceSha = sha256(options.metadataSource);
  const metadataSourceKind = options.metadataSourceKind ?? "pr-body";
  const sourceId = options.sourceId ?? "pr-27-body";
  const metadataSourceRef =
    options.metadataSourceRef ??
    `${metadataSourceKind}:${sourceId}:${metadataSourceSha}`;
  return {
    baseBranch: "main",
    changedFiles: [
      "stories/approved/INF-027C-bind-cleanup-metadata-to-reviewed-pr-evidence.yaml",
      "agent-packets/INF-027C.md",
    ],
    defaultBranch: "main",
    mergeSha: trustedMainSha,
    merged: true,
    mergedAt: "2026-01-02T00:00:00.000Z",
    metadataSource: {
      contentSha256: metadataSourceSha,
      durable: metadataSourceKind === "handoff-comment" ? true : undefined,
      kind: metadataSourceKind,
      sourceId,
      updatedAt: "2026-01-01T12:00:00.000Z",
    },
    metadataSourceRef,
    prNumber: 27,
    reviews: [
      {
        decision: "approved",
        id: "rvw-27",
        isMergeGate: true,
        reviewerKind: "human",
        sourceRefs: [metadataSourceRef],
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
}

function renderMetadataSource(storySlug) {
  return `Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/${storySlug}.yaml
  branches:
    - story/inf-027c-cleanup-reviewed-pr-evidence-binding
`;
}

function runPreflight(options) {
  const sourceArgs =
    options.metadataSourceFile === undefined
      ? ["--pr-body", options.metadataSource]
      : ["--metadata-source-file", options.metadataSourceFile];
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      ...sourceArgs,
      "--evidence-json",
      JSON.stringify(options.evidence),
      "--preflight-plan-file",
      options.planFile,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

function runSourceRefPreview(options) {
  const sourceArgs =
    options.file === undefined
      ? ["--metadata-source", options.metadataSource]
      : ["--metadata-source-file", options.file];
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--print-source-ref",
      "--metadata-source-kind",
      options.kind,
      "--metadata-source-id",
      options.id,
      ...sourceArgs,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}
