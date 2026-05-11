import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { sha256 } from "../../tools/agent-packet-lifecycle.ts";
import { validateBoundCleanupPlanArtifact } from "../../tools/post-merge-cleanup/validator.ts";

const cleanupScopedVerificationCommand =
  "node --experimental-strip-types tools/post-merge-cleanup.ts --finalize-plan-file .cleanup/bound-cleanup-plan.json";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

test("preflight writes bound cleanup plan artifact only after validation passes", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-plan-"));
  const planFile = path.join(tempRoot, "bound-cleanup-plan.json");
  const fixture = await makeCleanupFixture();
  const metadataSource = renderMetadataSource(fixture.storySlug);
  const evidence = buildEvidence({ ...fixture, metadataSource });

  const run = runPreflight({
    evidence,
    metadataSource,
    planFile,
    repoRoot: fixture.repoRoot,
  });

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
  assert.deepEqual(artifact.packetCommand.args, ["--story", fixture.storyPath]);
  assert.equal(artifact.verificationCommand, cleanupScopedVerificationCommand);
  assert.match(artifact.inputsHash, /^[0-9a-f]{64}$/);
});

test("preflight accepts merge-event PR body metadata freshness at mergedAt", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-plan-merge-"));
  const planFile = path.join(tempRoot, "bound-cleanup-plan.json");
  const fixture = await makeCleanupFixture();
  const metadataSource = renderMetadataSource(fixture.storySlug);
  const evidence = buildEvidence({ ...fixture, metadataSource });
  evidence.metadataSource.updatedAt = evidence.mergedAt;

  const run = runPreflight({
    evidence,
    metadataSource,
    planFile,
    repoRoot: fixture.repoRoot,
  });

  assert.equal(run.status, 0, run.stderr);
  const artifact = validateBoundCleanupPlanArtifact(
    JSON.parse(readFileSync(planFile, "utf8")),
  );
  assert.equal(
    artifact.reviewEvidenceSource.requiredReviewId,
    "merge-actor-27",
  );
  assert.equal(artifact.metadataSource.ref, evidence.metadataSourceRef);
});

test("source-ref preview computes the same PR body ref used by preflight validation", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-ref-"));
  const planFile = path.join(tempRoot, "bound-cleanup-plan.json");
  const fixture = await makeCleanupFixture();
  const metadataSource = renderMetadataSource(fixture.storySlug);
  const preview = runSourceRefPreview({
    id: "pr-27-body",
    kind: "pr-body",
    metadataSource,
  });

  assert.equal(preview.status, 0, preview.stderr);
  const parsedPreview = JSON.parse(preview.stdout);
  const evidence = buildEvidence({
    ...fixture,
    metadataSource,
    metadataSourceKind: "pr-body",
    metadataSourceRef: parsedPreview.metadataSourceRef,
    sourceId: "pr-27-body",
  });

  const run = runPreflight({
    evidence,
    metadataSource,
    planFile,
    repoRoot: fixture.repoRoot,
  });

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
  const fixture = await makeCleanupFixture();
  const metadataSource = renderMetadataSource(fixture.storySlug);
  await writeFile(metadataFile, metadataSource);
  const preview = runSourceRefPreview({
    file: metadataFile,
    id: "77",
    kind: "handoff-comment",
  });
  assert.equal(preview.status, 0, preview.stderr);
  const parsedPreview = JSON.parse(preview.stdout);
  const evidence = buildEvidence({
    ...fixture,
    metadataSource,
    metadataSourceKind: "handoff-comment",
    metadataSourceRef: parsedPreview.metadataSourceRef,
    sourceId: "77",
  });

  const run = runPreflight({
    evidence,
    metadataSourceFile: metadataFile,
    planFile,
    repoRoot: fixture.repoRoot,
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

test("agent handoff guard rejects a PR body with missing cleanup metadata", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-handoff-"));
  const prBodyFile = path.join(tempRoot, "pr-body.md");
  await writeFile(prBodyFile, "## Summary\n\nMissing cleanup metadata.\n");

  const run = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--validate-cleanup-handoff",
      "--pr-number",
      "237",
      "--pr-body-file",
      prBodyFile,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Missing Post-merge cleanup metadata source/);
});

test("agent handoff guard rejects visually plausible fenced cleanup metadata", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-handoff-bad-"));
  const prBodyFile = path.join(tempRoot, "pr-body.md");
  await writeFile(
    prBodyFile,
    `## Summary

Implementation summary.

## Post-Merge Cleanup
\`\`\`yaml
cleanup:
  mode: single
  stories:
    - stories/approved/INF-701-cleanup-fixture.yaml
  branches:
    - story/inf-701
\`\`\`
`,
  );

  const run = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--validate-cleanup-handoff",
      "--pr-number",
      "237",
      "--pr-body-file",
      prBodyFile,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Missing Post-merge cleanup metadata source/);
});

test("agent handoff guard accepts valid single-story cleanup metadata", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-handoff-ok-"));
  const prBodyFile = path.join(tempRoot, "pr-body.md");
  await writeFile(
    prBodyFile,
    `Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/INF-701-cleanup-fixture.yaml
  branches:
    - story/inf-701
`,
  );

  const run = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--validate-cleanup-handoff",
      "--pr-number",
      "237",
      "--pr-body-file",
      prBodyFile,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.status, "valid");
  assert.equal(output.metadata.mode, "single");
  assert.match(output.metadataSourceRef, /^pr-body:pr-237-body:[0-9a-f]{64}$/);
});

test("agent handoff guard validates fetched PR input instead of copied local metadata", async () => {
  const validCopiedExample = `Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/INF-701-cleanup-fixture.yaml
  branches:
    - story/inf-701
`;
  const copied = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--validate-cleanup-handoff",
      "--pr-number",
      "237",
      "--pr-body",
      validCopiedExample,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(copied.status, 0, copied.stderr);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-handoff-json-"));
  const handoffFile = path.join(tempRoot, "handoff.json");
  await writeFile(
    handoffFile,
    `${JSON.stringify(
      {
        issueComments: [],
        pullRequest: {
          body: `## Post-Merge Cleanup
\`\`\`yaml
cleanup:
  mode: single
  stories:
    - stories/approved/INF-701-cleanup-fixture.yaml
\`\`\`
`,
          number: 237,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      null,
      2,
    )}\n`,
  );

  const fetched = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--validate-cleanup-handoff-json-file",
      handoffFile,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.notEqual(fetched.status, 0);
  assert.match(fetched.stderr, /Missing Post-merge cleanup metadata source/);
});

test("agent handoff guard accepts trusted durable handoff comment metadata", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "optcg-handoff-comment-"),
  );
  const handoffFile = path.join(tempRoot, "handoff.json");
  await writeFile(
    handoffFile,
    `${JSON.stringify(
      {
        issueComments: [
          {
            authorAssociation: "OWNER",
            body: `Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/INF-701-cleanup-fixture.yaml
  branches:
    - story/inf-701
`,
            createdAt: "2026-01-01T00:00:00.000Z",
            id: 881,
            updatedAt: "2026-01-01T00:00:00.000Z",
            userType: "User",
          },
        ],
        pullRequest: {
          body: "## Summary\n\nCleanup metadata lives in a durable handoff comment.\n",
          number: 237,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      null,
      2,
    )}\n`,
  );

  const run = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--validate-cleanup-handoff-json-file",
      handoffFile,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.metadataSource.kind, "handoff-comment");
  assert.equal(output.metadataSource.sourceId, "881");
});

test("agent handoff status latch requires passing cleanup metadata guard check", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "optcg-handoff-status-"),
  );
  const baseInput = {
    changedFiles: [
      { filename: "stories/approved/INF-701-cleanup-fixture.yaml" },
    ],
    issueComments: [],
    pullRequest: {
      body: `Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/INF-701-cleanup-fixture.yaml
  branches:
    - story/inf-701
`,
      headRef: "story/inf-701",
      number: 237,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };

  for (const [label, statusChecks] of [
    ["missing", []],
    ["pending", [{ bucket: "pending", name: "cleanup-metadata-guard" }]],
    ["failed", [{ bucket: "fail", name: "cleanup-metadata-guard" }]],
  ]) {
    const handoffFile = path.join(tempRoot, `${label}.json`);
    await writeFile(
      handoffFile,
      `${JSON.stringify({ ...baseInput, statusChecks }, null, 2)}\n`,
    );

    const run = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "tools/post-merge-cleanup.ts",
        "--",
        "--validate-cleanup-handoff-json-file",
        handoffFile,
        "--require-cleanup-guard-status",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.notEqual(run.status, 0, label);
    assert.match(run.stderr, /cleanup-metadata-guard/);
  }

  const passingFile = path.join(tempRoot, "passing.json");
  await writeFile(
    passingFile,
    `${JSON.stringify(
      {
        ...baseInput,
        statusChecks: [
          { bucket: "pass", name: "cleanup-metadata-guard", state: "SUCCESS" },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const passing = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--validate-cleanup-handoff-json-file",
      passingFile,
      "--require-cleanup-guard-status",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(passing.status, 0, passing.stderr);
  const output = JSON.parse(passing.stdout);
  assert.equal(
    output.cleanupMetadataGuardStatus.name,
    "cleanup-metadata-guard",
  );
  assert.equal(output.humanReviewReady, true);
});

test("agent handoff scope latch rejects cleanup metadata outside reviewed PR scope", async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "optcg-handoff-scope-"),
  );
  const baseInput = {
    changedFiles: [
      { filename: "stories/approved/INF-701-cleanup-fixture.yaml" },
    ],
    issueComments: [],
    statusChecks: [
      {
        name: "cleanup-metadata-guard",
        status: "completed",
        conclusion: "success",
      },
    ],
  };

  for (const [label, body, headRef] of [
    [
      "wrong-story",
      `Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/INF-702-other.yaml
  branches:
    - story/inf-701
`,
      "story/inf-701",
    ],
    [
      "wrong-branch",
      `Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/INF-701-cleanup-fixture.yaml
  branches:
    - story/not-this-pr
`,
      "story/inf-701",
    ],
  ]) {
    const handoffFile = path.join(tempRoot, `${label}.json`);
    await writeFile(
      handoffFile,
      `${JSON.stringify(
        {
          ...baseInput,
          pullRequest: {
            body,
            headRef,
            number: 237,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        null,
        2,
      )}\n`,
    );

    const run = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "tools/post-merge-cleanup.ts",
        "--",
        "--validate-cleanup-handoff-json-file",
        handoffFile,
        "--require-cleanup-guard-status",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.notEqual(run.status, 0, label);
    assert.match(run.stderr, /reviewed PR scope|changed files|head branch/i);
  }
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
    verificationCommand: cleanupScopedVerificationCommand,
  };

  assert.doesNotThrow(() => validateBoundCleanupPlanArtifact(validArtifact));
  assert.throws(
    () =>
      validateBoundCleanupPlanArtifact({
        ...validArtifact,
        verificationCommand: "corepack pnpm verify",
      }),
    /verification command is invalid/,
  );
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
  const trustedMainSha =
    options.trustedMainSha ??
    spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).stdout.trim();
  const metadataSourceSha = sha256(options.metadataSource);
  const metadataSourceKind = options.metadataSourceKind ?? "pr-body";
  const sourceId = options.sourceId ?? "pr-27-body";
  const storyId = options.storyId ?? "INF-027C";
  const storyPath =
    options.storyPath ??
    "stories/approved/INF-027C-bind-cleanup-metadata-to-reviewed-pr-evidence.yaml";
  const packetPath = options.packetPath ?? "agent-packets/INF-027C.md";
  const metadataSourceRef =
    options.metadataSourceRef ??
    `${metadataSourceKind}:${sourceId}:${metadataSourceSha}`;
  return {
    baseBranch: "main",
    changedFiles: [storyPath, packetPath],
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
        decision: "merged",
        id: "merge-actor-27",
        isMergeGate: true,
        reviewerKind: "human",
        sourceRefs: [],
        submittedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    stories: [
      {
        packetPath,
        storyId,
        storyPath,
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
      ...(options.repoRoot === undefined
        ? []
        : ["--repo-root", options.repoRoot]),
      ...sourceArgs,
      "--evidence-json",
      JSON.stringify(options.evidence),
      "--preflight-plan-file",
      options.planFile,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

async function makeCleanupFixture() {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-cleanup-"));
  const storyId = "INF-701";
  const storyFileName = "INF-701-cleanup-fixture.yaml";
  const storyPath = `stories/approved/${storyFileName}`;
  const packetPath = `agent-packets/${storyId}.md`;
  await mkdir(path.join(fixtureRoot, "stories", "approved"), {
    recursive: true,
  });
  await mkdir(path.join(fixtureRoot, "agent-packets"), { recursive: true });
  const storySource = renderStoryYaml(storyId);
  await writeFile(path.join(fixtureRoot, storyPath), storySource);
  await writeFile(
    path.join(fixtureRoot, packetPath),
    `<!-- agent-packet:story-id ${storyId} -->
<!-- agent-packet:story-path ${storyPath} -->
<!-- agent-packet:story-sha256 ${sha256(storySource)} -->

# Story Packet
`,
  );
  const trustedMainSha = initializeGitRepo(fixtureRoot);
  return {
    packetPath,
    repoRoot: fixtureRoot,
    storyId,
    storyPath,
    storySlug: storyFileName.replace(/\.yaml$/, ""),
    trustedMainSha,
  };
}

function initializeGitRepo(fixtureRoot) {
  for (const args of [
    ["init", "-b", "main"],
    ["config", "user.name", "Fixture User"],
    ["config", "user.email", "fixture@example.com"],
    ["add", "."],
    ["commit", "-m", "fixture"],
  ]) {
    const run = spawnSync("git", args, {
      cwd: fixtureRoot,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
  }
  return spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: fixtureRoot,
    encoding: "utf8",
  }).stdout.trim();
}

function renderStoryYaml(storyId) {
  return `spec_version: v6
spec_package_name: optcg-md-specs-v6
story_schema_version: 1.0.0
id: ${storyId}
epic_id: KICK-001
title: Cleanup fixture
type: tooling
area: infra
primary_concern: tooling
priority: low
status: approved
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
