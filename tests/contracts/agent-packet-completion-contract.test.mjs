import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";

import {
  listFilesRecursive,
  makeTempRepoFixture,
  runPacketToolFromRepo,
  sha256,
} from "./agent-packet-test-support.mjs";

test("packet completion moves an active story to done and clears active artifacts", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const packetPath = path.join(tempRepoRoot, "agent-packets", "INF-014.md");
  const approvedStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const doneStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "done",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const expectedFilesAfterCompletion = [
    "agent-packets/active.json",
    "specs/15-implementation-kickoff.md",
    "specs/23-repo-tooling-and-enforcement.md",
    "specs/24-story-schema.md",
    "specs/26-agent-packet-template.md",
    "specs/27-spec-driven-story-generation-workflow.md",
    "specs/32-codex-agent-integration.md",
    "stories/done/INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
    "tools/build-agent-packet.ts",
  ];

  const buildResult = runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    approvedStoryPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);

  assert.equal(
    buildResult.status,
    0,
    `expected packet build to pass\nstdout:\n${buildResult.stdout ?? ""}\nstderr:\n${buildResult.stderr ?? ""}`,
  );

  const unchangedFileHashes = new Map(
    await Promise.all(
      [
        "specs/15-implementation-kickoff.md",
        "specs/23-repo-tooling-and-enforcement.md",
        "specs/24-story-schema.md",
        "specs/26-agent-packet-template.md",
        "specs/27-spec-driven-story-generation-workflow.md",
        "specs/32-codex-agent-integration.md",
        "tools/build-agent-packet.ts",
      ].map(async (relativePath) => [
        relativePath,
        sha256(await readFile(path.join(tempRepoRoot, relativePath), "utf8")),
      ]),
    ),
  );

  const completed = runPacketToolFromRepo(tempRepoRoot, [
    "complete",
    "--story",
    approvedStoryPath,
    "--manifest",
    manifestPath,
  ]);

  assert.equal(
    completed.status,
    0,
    `expected packet completion to pass\nstdout:\n${completed.stdout ?? ""}\nstderr:\n${completed.stderr ?? ""}`,
  );

  await assert.rejects(() => readFile(approvedStoryPath, "utf8"));
  await assert.rejects(() => readFile(packetPath, "utf8"));

  const doneStory = await readFile(doneStoryPath, "utf8");
  assert.match(doneStory, /^status: done$/m);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.activeStories, []);
  assert.deepEqual(
    await listFilesRecursive(tempRepoRoot),
    expectedFilesAfterCompletion,
  );

  for (const [relativePath, beforeHash] of unchangedFileHashes) {
    assert.equal(
      sha256(await readFile(path.join(tempRepoRoot, relativePath), "utf8")),
      beforeHash,
    );
  }

  const verified = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.equal(
    verified.status,
    0,
    `expected empty post-completion manifest to verify\nstdout:\n${verified.stdout ?? ""}\nstderr:\n${verified.stderr ?? ""}`,
  );
});

test("packet completion fails closed for inactive stories", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const approvedStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify({ activeStories: [], version: 1 }, null, 2),
  );

  const completed = runPacketToolFromRepo(tempRepoRoot, [
    "complete",
    "--story",
    approvedStoryPath,
    "--manifest",
    manifestPath,
  ]);

  assert.notEqual(completed.status, 0);
  assert.match(completed.stderr, /must be the active story/i);
});

test("complete-many completes explicit approved stories including inactive predecessors", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const activeStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const inactiveStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-015-parent-integration-cleanup.yaml",
  );
  const duplicateIdStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-015-duplicate-parent-integration-cleanup.yaml",
  );
  const missingPacketStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-016-missing-packet-parent-integration-cleanup.yaml",
  );
  const stalePacketStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-017-stale-packet-parent-integration-cleanup.yaml",
  );
  const activePacketPath = path.join(
    tempRepoRoot,
    "agent-packets",
    "INF-014.md",
  );
  const inactivePacketPath = path.join(
    tempRepoRoot,
    "agent-packets",
    "INF-015.md",
  );
  const doneActiveStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "done",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const doneInactiveStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "done",
    "INF-015-parent-integration-cleanup.yaml",
  );

  const activeStorySource = await readFile(activeStoryPath, "utf8");
  const inactiveStorySource = activeStorySource
    .replace(/^id: INF-014$/m, "id: INF-015")
    .replace(
      /^title: .+$/m,
      "title: Parent integration cleanup can complete multiple approved substories",
    );
  const missingPacketStorySource = activeStorySource
    .replace(/^id: INF-014$/m, "id: INF-016")
    .replace(
      /^title: .+$/m,
      "title: Parent integration cleanup rejects missing packets",
    );
  const stalePacketStorySource = activeStorySource
    .replace(/^id: INF-014$/m, "id: INF-017")
    .replace(
      /^title: .+$/m,
      "title: Parent integration cleanup rejects stale packets",
    );
  await writeFile(inactiveStoryPath, inactiveStorySource);
  await writeFile(duplicateIdStoryPath, inactiveStorySource);
  await writeFile(missingPacketStoryPath, missingPacketStorySource);
  await writeFile(stalePacketStoryPath, stalePacketStorySource);

  const activeBuildResult = runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    activeStoryPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);
  assert.equal(activeBuildResult.status, 0);

  const inactiveBuildResult = runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    inactiveStoryPath,
    "--output",
    inactivePacketPath,
  ]);
  assert.equal(inactiveBuildResult.status, 0);

  const stalePacketBuildResult = runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    stalePacketStoryPath,
  ]);
  assert.equal(stalePacketBuildResult.status, 0);
  await writeFile(
    stalePacketStoryPath,
    stalePacketStorySource.replace(
      /^title: .+$/m,
      "title: Parent integration cleanup changed after packet generation",
    ),
  );

  const manifestSource = await readFile(manifestPath, "utf8");
  await rm(manifestPath);
  const missingManifestResult = runPacketToolFromRepo(tempRepoRoot, [
    "complete-many",
    "--story",
    inactiveStoryPath,
    "--story",
    activeStoryPath,
  ]);
  await writeFile(manifestPath, manifestSource);
  assert.notEqual(missingManifestResult.status, 0);
  assert.match(missingManifestResult.stderr, /manifest is required/i);

  const missingPacketResult = runPacketToolFromRepo(tempRepoRoot, [
    "complete-many",
    "--story",
    missingPacketStoryPath,
    "--manifest",
    manifestPath,
  ]);
  assert.notEqual(missingPacketResult.status, 0);
  assert.match(missingPacketResult.stderr, /missing packet/i);

  const stalePacketResult = runPacketToolFromRepo(tempRepoRoot, [
    "complete-many",
    "--story",
    stalePacketStoryPath,
    "--manifest",
    manifestPath,
  ]);
  assert.notEqual(stalePacketResult.status, 0);
  assert.match(stalePacketResult.stderr, /stale packet/i);

  const duplicateStoriesResult = runPacketToolFromRepo(tempRepoRoot, [
    "complete-many",
    "--story",
    inactiveStoryPath,
    "--story",
    inactiveStoryPath,
    "--manifest",
    manifestPath,
  ]);
  assert.notEqual(duplicateStoriesResult.status, 0);
  assert.match(duplicateStoriesResult.stderr, /duplicate --story argument/i);

  const duplicateStoryIdsResult = runPacketToolFromRepo(tempRepoRoot, [
    "complete-many",
    "--story",
    inactiveStoryPath,
    "--story",
    duplicateIdStoryPath,
    "--manifest",
    manifestPath,
  ]);
  assert.notEqual(duplicateStoryIdsResult.status, 0);
  assert.match(duplicateStoryIdsResult.stderr, /duplicate story id/i);

  const completeManyResult = runPacketToolFromRepo(tempRepoRoot, [
    "complete-many",
    "--story",
    inactiveStoryPath,
    "--story",
    activeStoryPath,
    "--manifest",
    manifestPath,
  ]);
  assert.equal(
    completeManyResult.status,
    0,
    `expected complete-many to pass\nstdout:\n${completeManyResult.stdout ?? ""}\nstderr:\n${completeManyResult.stderr ?? ""}`,
  );

  await assert.rejects(() => readFile(activeStoryPath, "utf8"));
  await assert.rejects(() => readFile(inactiveStoryPath, "utf8"));
  await assert.rejects(() => readFile(activePacketPath, "utf8"));
  await assert.rejects(() => readFile(inactivePacketPath, "utf8"));
  assert.match(await readFile(doneActiveStoryPath, "utf8"), /^status: done$/m);
  assert.match(
    await readFile(doneInactiveStoryPath, "utf8"),
    /^status: done$/m,
  );

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.activeStories, []);
});
