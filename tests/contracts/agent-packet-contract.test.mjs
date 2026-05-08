import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const tempDirs = [];
const tempRepoFixtureEntries = [
  {
    fileName: "build-agent-packet.ts",
    sourceDir: "tools",
    targetDir: "tools",
  },
  {
    fileName: "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
    sourceDir: "tests/fixtures/stories",
    targetDir: "stories/approved",
  },
  {
    fileName: "15-implementation-kickoff.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
  {
    fileName: "23-repo-tooling-and-enforcement.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
  {
    fileName: "24-story-schema.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
  {
    fileName: "26-agent-packet-template.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
  {
    fileName: "27-spec-driven-story-generation-workflow.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
  {
    fileName: "32-codex-agent-integration.md",
    sourceDir: "specs",
    targetDir: "specs",
  },
];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { recursive: true, force: true })),
  );
});

async function makeTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "optcg-agent-packets-"));
  tempDirs.push(tempDir);
  return tempDir;
}

function runPacketToolFromRepo(targetRepoRoot, args, options = {}) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(targetRepoRoot, "tools/build-agent-packet.ts"),
      ...args,
    ],
    {
      cwd: targetRepoRoot,
      encoding: "utf8",
      ...options,
    },
  );
}

async function makeTempRepoFixture() {
  const tempDir = await makeTempDir();
  const tempRepoRoot = path.join(tempDir, "repo");

  await mkdir(tempRepoRoot, { recursive: true });

  for (const fixtureEntry of tempRepoFixtureEntries) {
    const sourcePath = path.join(
      repoRoot,
      fixtureEntry.sourceDir,
      fixtureEntry.fileName,
    );
    const targetDir = path.join(tempRepoRoot, fixtureEntry.targetDir);
    const targetPath = path.join(targetDir, fixtureEntry.fileName);

    await mkdir(targetDir, { recursive: true });
    await cp(sourcePath, targetPath);
  }

  return tempRepoRoot;
}

async function listFilesRecursive(rootDir, baseDir = rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const filePaths = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...(await listFilesRecursive(entryPath, baseDir)));
      continue;
    }

    if (entry.isFile()) {
      filePaths.push(
        path.relative(baseDir, entryPath).split(path.sep).join("/"),
      );
    }
  }

  return filePaths.sort();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

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

test("repo guidance documents active-story packet requirements", async () => {
  const agents = await readFile(path.join(repoRoot, "AGENTS.md"), "utf8");
  const packetTemplate = await readFile(
    path.join(repoRoot, "specs/26-agent-packet-template.md"),
    "utf8",
  );
  const workflow = await readFile(
    path.join(repoRoot, "specs/27-spec-driven-story-generation-workflow.md"),
    "utf8",
  );
  const codexIntegration = await readFile(
    path.join(repoRoot, "specs/32-codex-agent-integration.md"),
    "utf8",
  );
  const packageJson = await readFile(
    path.join(repoRoot, "package.json"),
    "utf8",
  );

  assert.match(
    agents,
    /Approved stories may exist without packets until they become active\./,
  );
  assert.match(
    agents,
    /Before implementation starts, before a worker or reviewer subagent is assigned, and before PR handoff begins, generate a current checked-in packet/,
  );
  assert.match(
    agents,
    /Use `pnpm run packets:generate --story <stories\/approved\/\.\.\.yaml> --activate` to build or refresh the packet/,
  );
  assert.match(
    agents,
    /Use `pnpm run packets:complete --story <stories\/approved\/\.\.\.yaml>` after a story is merged/,
  );
  assert.match(
    agents,
    /A cleanup commit containing only the exact file changes produced by `pnpm run packets:complete --story <stories\/approved\/\.\.\.yaml>` or `pnpm run packets:complete-many --story <stories\/approved\/\.\.\.yaml> --story <stories\/approved\/\.\.\.yaml>` does not require a separate reviewer subagent run/i,
  );
  assert.match(
    agents,
    /If cleanup requires any manual edit beyond the packet completion command output, including edits to packet files, `agent-packets\/active\.json`, tooling, tests, fixtures, specs, workflow docs, or story files, run full verification and a separate reviewer subagent before pushing or merging/i,
  );
  assert.match(
    packetTemplate,
    /allow approved stories to sit without packets until they become active, but require a current checked-in packet before implementation assignment, reviewer assignment, or PR handoff/,
  );
  assert.match(
    packetTemplate,
    /complete stories through one packet-tool operation that moves the story to done history, removes the active packet, and clears the completed story from the active packet manifest/,
  );
  assert.match(
    packetTemplate,
    /treat the exact file changes produced by that completion operation as generated lifecycle cleanup that needs repo verification but does not need separate reviewer-subagent review unless any manual edits are added/,
  );
  assert.match(
    workflow,
    /Approved stories may remain packetless while they are dormant backlog items\./,
  );
  assert.match(
    workflow,
    /run the packet completion command to move the completed story to `stories\/done\/`, mark it `done`, remove its active packet, and clear or replace the active-story manifest/,
  );
  assert.match(
    workflow,
    /A commit that contains only the exact file changes produced by the packet completion command is a generated lifecycle cleanup and does not need a separate reviewer-subagent pass/i,
  );
  assert.match(
    codexIntegration,
    /Verify that the active story packet is present and current before worker assignment, reviewer assignment, or PR handoff\./,
  );
  assert.match(codexIntegration, /run the packet completion command/i);
  assert.match(
    codexIntegration,
    /Pure packet-completion cleanup does not require reviewer-subagent review/i,
  );
  assert.match(packageJson, /"packets:complete"/);
  assert.match(packageJson, /"packets:complete-many"/);
});
