import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { sha256 } from "../../tools/agent-packet-lifecycle.ts";
import {
  assertCleanWorktreeStatus,
  buildCleanupCommitMessage,
  selectPacketCompletionCommand,
  validateBoundCleanupPlanForExecution,
  validatePacketCompletionDiff,
} from "../../tools/post-merge-cleanup/executor.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

test("execution selects the exact packet completion command from the bound plan", () => {
  const singlePlan = buildPlan({
    stories: [buildStory("INF-501", "one")],
  });
  const parentPlan = buildPlan({
    packetCommand: {
      args: [
        "--story",
        "stories/approved/INF-501-one.yaml",
        "--story",
        "stories/approved/INF-502-two.yaml",
      ],
      command: "packets:complete-many",
    },
    stories: [buildStory("INF-501", "one"), buildStory("INF-502", "two")],
  });

  assert.deepEqual(selectPacketCompletionCommand(singlePlan), {
    args: [
      "pnpm",
      "run",
      "packets:complete",
      "--",
      "--story",
      "stories/approved/INF-501-one.yaml",
    ],
    command: "corepack",
  });
  assert.deepEqual(selectPacketCompletionCommand(parentPlan), {
    args: [
      "pnpm",
      "run",
      "packets:complete-many",
      "--",
      "--story",
      "stories/approved/INF-501-one.yaml",
      "--story",
      "stories/approved/INF-502-two.yaml",
    ],
    command: "corepack",
  });
});

test("execution rejects dirty worktrees before packet completion starts", () => {
  assert.doesNotThrow(() => assertCleanWorktreeStatus(""));
  assert.doesNotThrow(() =>
    assertCleanWorktreeStatus("?? .cleanup/bound-cleanup-plan.json\n"),
  );
  assert.throws(
    () => assertCleanWorktreeStatus(" M tools/post-merge-cleanup.ts\n"),
    /worktree must be clean before packet completion starts/,
  );
});

test("execution rejects missing and malformed plan files before packet completion", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-missing-plan-"));
  const missingPlan = path.join(tempRoot, "missing-plan.json");
  const malformedPlan = path.join(tempRoot, "malformed-plan.json");
  await writeFile(malformedPlan, "{");

  for (const planFile of [missingPlan, malformedPlan]) {
    const run = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "tools/post-merge-cleanup.ts",
        "--",
        "--execute-plan-file",
        planFile,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.notEqual(run.status, 0);
    assert.doesNotMatch(`${run.stdout}\n${run.stderr}`, /packets:complete/);
  }
});

test("execution rejects failed and wrong-version plans before packet completion", async () => {
  const repoRoot = await createFixtureRepo();
  const trustedMainSha = "abc123";
  const plan = buildPlan({
    mergedPullRequest: {
      baseBranch: "main",
      mergeSha: trustedMainSha,
      number: 77,
    },
  });

  await assert.rejects(
    () =>
      validateBoundCleanupPlanForExecution({
        plan: { ...plan, status: "failed" },
        repoRoot,
        trustedMainSha,
      }),
    /status must be valid/,
  );
  await assert.rejects(
    () =>
      validateBoundCleanupPlanForExecution({
        plan: { ...plan, schemaVersion: "post-merge-cleanup-plan.v0" },
        repoRoot,
        trustedMainSha,
      }),
    /unknown schema version/,
  );
});

test("execution builds deterministic cleanup commit messages", () => {
  const plan = buildPlan({
    mergedPullRequest: {
      baseBranch: "main",
      mergeSha: "abc123",
      number: 77,
    },
    stories: [buildStory("INF-502", "two"), buildStory("INF-501", "one")],
  });

  assert.equal(
    buildCleanupCommitMessage(plan),
    "Post-merge packet cleanup for PR #77: INF-501, INF-502",
  );
});

test("execution rejects stale bound plans before packet completion", async () => {
  const repoRoot = await createFixtureRepo();
  const story = buildStory("INF-501", "one");
  await writeFixtureStory(repoRoot, story, "approved");
  await writeFixturePacket(repoRoot, story, "packet v1\n");
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "fixture"]);
  const trustedMainSha = git(repoRoot, ["rev-parse", "HEAD"]);
  const plan = buildPlan({
    mergedPullRequest: {
      baseBranch: "main",
      mergeSha: trustedMainSha,
      number: 77,
    },
    stories: [
      {
        ...story,
        packetSha256: sha256("packet v1\n"),
        storySha256: sha256(renderStory(story, "approved")),
      },
    ],
  });

  await validateBoundCleanupPlanForExecution({
    plan,
    repoRoot,
    trustedMainSha,
  });

  await writeFixturePacket(repoRoot, story, "packet v2\n");
  await assert.rejects(
    () =>
      validateBoundCleanupPlanForExecution({
        plan,
        repoRoot,
        trustedMainSha,
      }),
    /stale packet evidence/,
  );
});

test("execution accepts only exact packet completion lifecycle output", async () => {
  const repoRoot = await createFixtureRepo();
  const story = buildStory("INF-501", "one");
  const approvedStory = renderStory(story, "approved");
  const packetSource = "packet v1\n";
  await writeFixtureStory(repoRoot, story, "approved");
  await writeFixturePacket(repoRoot, story, packetSource);
  await writeActiveManifest(repoRoot, story);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "fixture"]);
  const plan = buildPlan({
    mergedPullRequest: {
      baseBranch: "main",
      mergeSha: git(repoRoot, ["rev-parse", "HEAD"]),
      number: 77,
    },
    stories: [
      {
        ...story,
        packetSha256: sha256(packetSource),
        storySha256: sha256(approvedStory),
      },
    ],
  });

  await rm(path.join(repoRoot, story.storyPath));
  await rm(path.join(repoRoot, story.packetPath));
  await writeFixtureStory(repoRoot, story, "done");
  await writeFile(
    path.join(repoRoot, "agent-packets", "active.json"),
    `${JSON.stringify({ activeStories: [], version: 1 }, null, 2)}\n`,
  );

  await validatePacketCompletionDiff({ plan, repoRoot });
});

test("execution rejects unexpected paths and manual lifecycle edits", async () => {
  const repoRoot = await createFixtureRepo();
  const story = buildStory("INF-501", "one");
  const approvedStory = renderStory(story, "approved");
  const packetSource = "packet v1\n";
  await writeFixtureStory(repoRoot, story, "approved");
  await writeFixturePacket(repoRoot, story, packetSource);
  await writeActiveManifest(repoRoot, story);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "fixture"]);
  const plan = buildPlan({
    mergedPullRequest: {
      baseBranch: "main",
      mergeSha: git(repoRoot, ["rev-parse", "HEAD"]),
      number: 77,
    },
    stories: [
      {
        ...story,
        packetSha256: sha256(packetSource),
        storySha256: sha256(approvedStory),
      },
    ],
  });

  await rm(path.join(repoRoot, story.storyPath));
  await rm(path.join(repoRoot, story.packetPath));
  await writeFixtureStory(repoRoot, story, "done", "\ntitle: edited\n");
  await writeFile(
    path.join(repoRoot, "agent-packets", "active.json"),
    `${JSON.stringify({ activeStories: [], version: 1 }, null, 2)}\n`,
  );
  await mkdir(path.join(repoRoot, "tools"), { recursive: true });
  await writeFile(path.join(repoRoot, "tools", "manual-edit.txt"), "no\n");

  await assert.rejects(
    () => validatePacketCompletionDiff({ plan, repoRoot }),
    /Unexpected cleanup output path|does not match exact packet completion output/,
  );
});

test("execution rejects unexpected untracked paths", async () => {
  const repoRoot = await createFixtureRepo();
  const story = buildStory("INF-501", "one");
  const approvedStory = renderStory(story, "approved");
  const packetSource = "packet v1\n";
  await writeFixtureStory(repoRoot, story, "approved");
  await writeFixturePacket(repoRoot, story, packetSource);
  await writeActiveManifest(repoRoot, story);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "fixture"]);
  const plan = buildPlan({
    mergedPullRequest: {
      baseBranch: "main",
      mergeSha: git(repoRoot, ["rev-parse", "HEAD"]),
      number: 77,
    },
    stories: [
      {
        ...story,
        packetSha256: sha256(packetSource),
        storySha256: sha256(approvedStory),
      },
    ],
  });

  await rm(path.join(repoRoot, story.storyPath));
  await rm(path.join(repoRoot, story.packetPath));
  await writeFixtureStory(repoRoot, story, "done");
  await writeFile(
    path.join(repoRoot, "agent-packets", "active.json"),
    `${JSON.stringify({ activeStories: [], version: 1 }, null, 2)}\n`,
  );
  await mkdir(path.join(repoRoot, "tools"), { recursive: true });
  await writeFile(path.join(repoRoot, "tools", "untracked.txt"), "no\n");

  await assert.rejects(
    () => validatePacketCompletionDiff({ plan, repoRoot }),
    /Unexpected cleanup output path: tools\/untracked\.txt/,
  );
});

test("execution rejects manual active manifest edits", async () => {
  const repoRoot = await createFixtureRepo();
  const story = buildStory("INF-501", "one");
  const approvedStory = renderStory(story, "approved");
  const packetSource = "packet v1\n";
  await writeFixtureStory(repoRoot, story, "approved");
  await writeFixturePacket(repoRoot, story, packetSource);
  await writeActiveManifest(repoRoot, story);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "fixture"]);
  const plan = buildPlan({
    mergedPullRequest: {
      baseBranch: "main",
      mergeSha: git(repoRoot, ["rev-parse", "HEAD"]),
      number: 77,
    },
    stories: [
      {
        ...story,
        packetSha256: sha256(packetSource),
        storySha256: sha256(approvedStory),
      },
    ],
  });

  await rm(path.join(repoRoot, story.storyPath));
  await rm(path.join(repoRoot, story.packetPath));
  await writeFixtureStory(repoRoot, story, "done");
  await writeFile(
    path.join(repoRoot, "agent-packets", "active.json"),
    `${JSON.stringify(
      {
        activeStories: [
          {
            packetPath: "agent-packets/INF-999.md",
            storyId: "INF-999",
            storyPath: "stories/approved/INF-999-manual.yaml",
            storySha256: "9".repeat(64),
          },
        ],
        version: 1,
      },
      null,
      2,
    )}\n`,
  );

  await assert.rejects(
    () => validatePacketCompletionDiff({ plan, repoRoot }),
    /active packet manifest does not match exact packet completion output/i,
  );
});

async function createFixtureRepo() {
  await mkdir(os.tmpdir(), { recursive: true });
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-cleanup-exec-"));
  git(repoRoot, ["init", "-b", "main"]);
  git(repoRoot, ["config", "user.email", "tests@example.invalid"]);
  git(repoRoot, ["config", "user.name", "Tests"]);
  return repoRoot;
}

function buildPlan(overrides = {}) {
  const stories = overrides.stories ?? [buildStory("INF-501", "one")];
  return {
    branches: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
    inputsHash: "0".repeat(64),
    mergedPullRequest: {
      baseBranch: "main",
      mergeSha: "abc123",
      number: 1,
    },
    metadataSource: {
      contentSha256: "1".repeat(64),
      ref: `pr-body:pr-1-body:${"1".repeat(64)}`,
    },
    packetCommand: overrides.packetCommand ?? {
      args: ["--story", stories[0].storyPath],
      command: "packets:complete",
    },
    reviewEvidenceSource: {
      contentSha256: "2".repeat(64),
      requiredReviewId: "rvw-1",
      requiredReviewSubmittedAt: "2026-01-01T00:00:00.000Z",
    },
    schemaVersion: "post-merge-cleanup-plan.v1",
    status: "valid",
    stories,
    verificationCommand: "corepack pnpm verify",
    ...overrides,
  };
}

function buildStory(storyId, slug) {
  return {
    packetPath: `agent-packets/${storyId}.md`,
    packetSha256: "4".repeat(64),
    storyId,
    storyPath: `stories/approved/${storyId}-${slug}.yaml`,
    storySha256: "3".repeat(64),
  };
}

function git(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

function renderStory(story, status, suffix = "") {
  return `id: ${story.storyId}\nstatus: ${status}\n${suffix}`;
}

async function writeActiveManifest(repoRoot, story) {
  await mkdir(path.join(repoRoot, "agent-packets"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "agent-packets", "active.json"),
    `${JSON.stringify(
      {
        activeStories: [
          {
            packetPath: story.packetPath,
            storyId: story.storyId,
            storyPath: story.storyPath,
            storySha256: sha256(renderStory(story, "approved")),
          },
        ],
        version: 1,
      },
      null,
      2,
    )}\n`,
  );
}

async function writeFixturePacket(repoRoot, story, source) {
  const packetPath = path.join(repoRoot, story.packetPath);
  await mkdir(path.dirname(packetPath), { recursive: true });
  await writeFile(packetPath, source);
}

async function writeFixtureStory(repoRoot, story, status, suffix = "") {
  const storyPath =
    status === "done"
      ? path.join(repoRoot, "stories", "done", path.basename(story.storyPath))
      : path.join(repoRoot, story.storyPath);
  await mkdir(path.dirname(storyPath), { recursive: true });
  await writeFile(storyPath, renderStory(story, status, suffix));
}
