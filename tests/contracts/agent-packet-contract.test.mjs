import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rename,
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
const storyPath = path.join(
  repoRoot,
  "stories/approved/INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
);
const expectedRelevantConstraintBullets = [
  "one approved story may be active for implementation or review handoff at a time",
  "dormant approved backlog stories do not require checked-in packets",
  "completed stories must move to done history and must not remain in the active packet manifest",
  "the parent agent owns story-state transitions and active-packet cleanup",
  "packet tooling should enforce lifecycle invariants rather than relying on reviewer memory",
  "use `pnpm`; the canonical local verification commands are `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, and `pnpm verify`",
  "TypeScript stays strict; avoid `any`, non-null assertions (`!`), `@ts-ignore`, `@ts-nocheck`, and unchecked trust-boundary assertions without explicit justification",
  "ESLint with type-aware rules and Prettier formatting are required; CI and local verification must fail when checked-in generated artifacts are stale",
];
const tempRepoFixtureEntries = [
  ["tools", "build-agent-packet.ts"],
  [
    "stories/approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  ],
  ["specs", "15-implementation-kickoff.md"],
  ["specs", "23-repo-tooling-and-enforcement.md"],
  ["specs", "24-story-schema.md"],
  ["specs", "26-agent-packet-template.md"],
  ["specs", "27-spec-driven-story-generation-workflow.md"],
  ["specs", "32-codex-agent-integration.md"],
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

function runPacketTool(args, options = {}) {
  return runPacketToolFromRepo(repoRoot, args, options);
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

  for (const [relativeDir, fileName] of tempRepoFixtureEntries) {
    const sourcePath = path.join(repoRoot, relativeDir, fileName);
    const targetDir = path.join(tempRepoRoot, relativeDir);
    const targetPath = path.join(targetDir, fileName);

    await mkdir(targetDir, { recursive: true });
    await cp(sourcePath, targetPath);
  }

  return tempRepoRoot;
}

async function readStoryValues() {
  const story = await readFile(storyPath, "utf8");
  return {
    acceptanceCriteria: readStoryList(story, "acceptance_criteria"),
    allowedTouchPoints: readStoryList(story, "allowed_touch_points"),
    nonScope: readStoryList(story, "non_scope"),
    repoRules: readStoryList(story, "repo_rules"),
    specRefs: readStoryList(story, "spec_refs"),
    storyBoundary: readStoryScalar(story, "story_boundary"),
  };
}

function readStoryScalar(source, key) {
  const blockMatch = source.match(
    new RegExp(`^${key}:\\s*[>|][-+]?\\r?\\n((?:  .*\\r?\\n?)*)`, "m"),
  );

  if (blockMatch?.[1]) {
    return blockMatch[1]
      .split(/\r?\n/)
      .filter((line) => line.startsWith("  "))
      .map((line) => line.slice(2).trim())
      .join(" ")
      .trim();
  }

  const scalarMatch = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));

  if (!scalarMatch?.[1]) {
    throw new Error(`Unable to read story scalar ${key}`);
  }

  return scalarMatch[1].trim();
}

function readStoryList(source, key) {
  const listMatch = source.match(
    new RegExp(`^${key}:\\r?\\n((?:  - .*\\r?\\n?)*)`, "m"),
  );

  if (!listMatch?.[1]) {
    throw new Error(`Unable to read story list ${key}`);
  }

  return listMatch[1]
    .split(/\r?\n/)
    .filter((line) => line.startsWith("  - "))
    .map((line) => parseYamlScalar(line.slice(4)));
}

function parseYamlScalar(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function readPacketSection(packet, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionMatch = packet.match(
    new RegExp(
      `^## ${escapedHeading}\\r?\\n\\r?\\n([\\s\\S]*?)(?=^## |\\Z)`,
      "m",
    ),
  );

  if (!sectionMatch?.[1]) {
    throw new Error(`Unable to read packet section ${heading}`);
  }

  return sectionMatch[1].trimEnd();
}

function readPacketBullets(packet, heading) {
  return readPacketRawBullets(packet, heading);
}

function readPacketRawBullets(packet, heading) {
  return readPacketSection(packet, heading)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toCrlf(value) {
  return value.replace(/\r?\n/g, "\r\n");
}

test("packet builder generates the canonical packet sections for an approved story", async () => {
  const tempDir = await makeTempDir();
  const outputPath = path.join(tempDir, "INF-014.md");
  const story = await readStoryValues();

  const result = runPacketTool([
    "generate",
    "--story",
    storyPath,
    "--output",
    outputPath,
  ]);

  assert.equal(
    result.status,
    0,
    `expected packet build to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const packet = await readFile(outputPath, "utf8");

  assert.match(packet, /<!-- agent-packet:story-id INF-014 -->/);
  assert.match(packet, /<!-- agent-packet:story-sha256 [0-9a-f]{64} -->/);
  assert.match(packet, /^# Story Packet$/m);
  assert.match(packet, /^## Story$/m);
  assert.match(packet, /^## Why$/m);
  assert.match(packet, /^## Authoritative Spec References$/m);
  assert.match(packet, /^## Relevant Spec Excerpts$/m);
  assert.match(packet, /^## Story Boundary$/m);
  assert.match(packet, /^## Scope$/m);
  assert.match(packet, /^## Out of Scope$/m);
  assert.match(packet, /^## Allowed Touch Points$/m);
  assert.match(packet, /^## Constraints$/m);
  assert.match(packet, /^## Required Tests$/m);
  assert.match(packet, /^## Expected Output$/m);
  assert.match(packet, /^## Acceptance Criteria$/m);
  assert.match(packet, /^## Ambiguity Rule$/m);
  assert.match(packet, /^## Agent Instruction Footer$/m);
  assert.match(packet, /26-agent-packet-template\.s005/);
  assert.match(packet, /32-codex-agent-integration\.s013/);
  assert.match(packet, /23-repo-tooling-and-enforcement\.s005/);
  assert.doesNotMatch(packet, /23-repo-tooling-and-enforcement\.s008/);
  assert.doesNotMatch(packet, /15-implementation-kickoff\.s012/);
  assert.equal(
    readPacketSection(packet, "Story Boundary").trim(),
    story.storyBoundary,
  );
  assert.deepEqual(readPacketBullets(packet, "Out of Scope"), story.nonScope);
  assert.deepEqual(
    readPacketRawBullets(packet, "Allowed Touch Points"),
    story.allowedTouchPoints,
  );
  assert.deepEqual(
    readPacketBullets(packet, "Constraints"),
    expectedRelevantConstraintBullets,
  );
  assert.deepEqual(
    readPacketRawBullets(packet, "Acceptance Criteria"),
    story.acceptanceCriteria,
  );
  assert.deepEqual(
    readPacketBullets(packet, "Constraints").slice(0, story.repoRules.length),
    story.repoRules,
  );
  assert.doesNotMatch(
    packet,
    /### 23-repo-tooling-and-enforcement\.s008 \(Boundary enforcement\)/,
  );
  assert.doesNotMatch(
    packet,
    /### 15-implementation-kickoff\.s012 \(Guardrails\)/,
  );
});

test("packet builder normalizes annotated story spec refs without duplicating packet output labels", async () => {
  const tempDir = await makeTempDir();
  const variantStoryPath = path.join(tempDir, "INF-014-annotated.story.yaml");
  const outputPath = path.join(tempDir, "INF-014.md");
  const sourceStory = await readFile(storyPath, "utf8");
  const story = await readStoryValues();

  await writeFile(
    variantStoryPath,
    sourceStory.replace(
      `  - ${story.specRefs[0]}`,
      `  - ${story.specRefs[0]} (Packet construction rules)`,
    ),
  );

  const result = runPacketTool([
    "generate",
    "--story",
    variantStoryPath,
    "--output",
    outputPath,
  ]);

  assert.equal(
    result.status,
    0,
    `expected packet build with annotated spec refs to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const packet = await readFile(outputPath, "utf8");
  assert.match(
    packet,
    /^- 26-agent-packet-template\.s005 \(Packet construction rules\)$/m,
  );
  assert.doesNotMatch(
    packet,
    /26-agent-packet-template\.s005 \(Packet construction rules\) \(Packet construction rules\)/,
  );
});

test("active packet verification enforces packet presence, freshness, and required sections", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const packetPath = path.join(tempRepoRoot, "agent-packets", "INF-014.md");
  const approvedStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const sourceStory = await readFile(approvedStoryPath, "utf8");

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        activeStories: [
          {
            storyId: "INF-014",
            storyPath:
              "stories/approved/INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
            packetPath: "agent-packets/INF-014.md",
            storySha256: "missing-packet-placeholder",
          },
        ],
      },
      null,
      2,
    ),
  );

  const missingPacket = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.notEqual(missingPacket.status, 0);
  assert.match(missingPacket.stderr, /missing packet/i);

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

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.activeStories, [
    {
      packetPath: "agent-packets/INF-014.md",
      storyId: "INF-014",
      storyPath:
        "stories/approved/INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
      storySha256: manifest.activeStories[0].storySha256,
    },
  ]);
  assert.match(manifest.activeStories[0].storySha256, /^[0-9a-f]{64}$/);

  const verified = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.equal(
    verified.status,
    0,
    `expected active packet verification to pass\nstdout:\n${verified.stdout ?? ""}\nstderr:\n${verified.stderr ?? ""}`,
  );

  const packet = await readFile(packetPath, "utf8");
  await writeFile(approvedStoryPath, toCrlf(sourceStory));
  await writeFile(packetPath, toCrlf(packet));

  const crlfVerified = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.equal(
    crlfVerified.status,
    0,
    `expected CRLF-normalized active packet verification to pass\nstdout:\n${crlfVerified.stdout ?? ""}\nstderr:\n${crlfVerified.stderr ?? ""}`,
  );

  await writeFile(
    packetPath,
    packet.replace(
      "## Why\n\nMake completed workflow stories stop remaining active by documenting and enforcing a one-active-story lifecycle: active packets are only for the current implementation or review handoff, completed stories move to done history, and stale active-story state is cleared before the next story starts.",
      "## Why\n\nManual packet body edit that should fail canonical verification.",
    ),
  );

  const editedPacket = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.notEqual(editedPacket.status, 0);
  assert.match(editedPacket.stderr, /canonical packet content/i);
  await writeFile(
    packetPath,
    packet.replace("## Acceptance Criteria", "## Acceptance"),
  );

  const missingSection = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.notEqual(missingSection.status, 0);
  assert.match(missingSection.stderr, /missing required section/i);

  runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    approvedStoryPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);

  await writeFile(approvedStoryPath, `${sourceStory}\n# stale packet marker\n`);

  const stalePacket = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.notEqual(stalePacket.status, 0);
  assert.match(stalePacket.stderr, /stale/i);
});

test("packet activation replaces any prior active story", async () => {
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
    JSON.stringify(
      {
        version: 1,
        activeStories: [
          {
            packetPath: "agent-packets/INF-099.md",
            storyId: "INF-099",
            storyPath: "stories/approved/INF-099-previous-story.yaml",
            storySha256: "0".repeat(64),
          },
        ],
      },
      null,
      2,
    ),
  );

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

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(
    manifest.activeStories.map((story) => story.storyId),
    ["INF-014"],
  );
});

test("active packet verification rejects multiple active stories", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        activeStories: [
          {
            packetPath: "agent-packets/INF-014.md",
            storyId: "INF-014",
            storyPath:
              "stories/approved/INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
            storySha256: "0".repeat(64),
          },
          {
            packetPath: "agent-packets/INF-099.md",
            storyId: "INF-099",
            storyPath: "stories/approved/INF-099-other-story.yaml",
            storySha256: "0".repeat(64),
          },
        ],
      },
      null,
      2,
    ),
  );

  const verified = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /at most one active story/i);
});

test("active packet verification rejects stories that drift away from approved status", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const packetPath = path.join(tempRepoRoot, "agent-packets", "INF-014.md");
  const approvedStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );

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

  const blockedStory = (await readFile(approvedStoryPath, "utf8")).replace(
    /^status: approved$/m,
    "status: blocked",
  );
  const blockedStorySha = sha256(blockedStory);
  const packet = await readFile(packetPath, "utf8");

  await writeFile(approvedStoryPath, blockedStory);
  await writeFile(
    packetPath,
    packet.replace(
      /^<!-- agent-packet:story-sha256 [0-9a-f]{64} -->$/m,
      `<!-- agent-packet:story-sha256 ${blockedStorySha} -->`,
    ),
  );
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        version: 1,
        activeStories: [
          {
            packetPath: "agent-packets/INF-014.md",
            storyId: "INF-014",
            storyPath:
              "stories/approved/INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
            storySha256: blockedStorySha,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const verified = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /status approved/i);
});

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

test("packet builder accepts folded block-scalar variants in approved story yaml", async () => {
  const tempDir = await makeTempDir();
  const variantStoryPath = path.join(tempDir, "INF-014-variant.story.yaml");
  const outputPath = path.join(tempDir, "INF-014.md");
  const sourceStory = await readFile(storyPath, "utf8");

  await writeFile(
    variantStoryPath,
    sourceStory
      .replace(/^summary: >$/m, "summary: >-")
      .replace(/^story_boundary: >$/m, "story_boundary: >-"),
  );

  const result = runPacketTool([
    "generate",
    "--story",
    variantStoryPath,
    "--output",
    outputPath,
  ]);

  assert.equal(
    result.status,
    0,
    `expected packet build with block-scalar variants to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const packet = await readFile(outputPath, "utf8");
  assert.match(
    packet,
    /Make completed workflow stories stop remaining active by documenting and enforcing a one-active-story lifecycle/,
  );
  assert.match(
    packet,
    /Own story lifecycle cleanup for merged workflow stories, active packet manifest invariants, packet-tool enforcement, and workflow tests\/docs that prevent stale active stories\./,
  );
});

test("packet builder accepts inline empty-array yaml fields", async () => {
  const tempDir = await makeTempDir();
  const variantStoryPath = path.join(
    tempDir,
    "INF-014-inline-empty.story.yaml",
  );
  const outputPath = path.join(tempDir, "INF-014.md");
  const sourceStory = await readFile(storyPath, "utf8");

  await writeFile(
    variantStoryPath,
    sourceStory.replace(
      /^dependencies:\r?\n(?: {2}- .*\r?\n)*/m,
      "dependencies: []\n",
    ),
  );

  const result = runPacketTool([
    "generate",
    "--story",
    variantStoryPath,
    "--output",
    outputPath,
  ]);

  assert.equal(
    result.status,
    0,
    `expected packet build with inline empty arrays to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});

test("packet activation and verification require checked-in approved story and packet paths", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const approvedStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const generatedStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "generated",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const nonCanonicalPacketPath = path.join(
    tempRepoRoot,
    "agent-packets",
    "custom-INF-014.md",
  );
  const sourceStory = await readFile(approvedStoryPath, "utf8");

  await mkdir(path.dirname(generatedStoryPath), { recursive: true });
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(generatedStoryPath, sourceStory);

  const wrongPacketActivation = runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    approvedStoryPath,
    "--output",
    nonCanonicalPacketPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);

  assert.notEqual(wrongPacketActivation.status, 0);
  assert.match(
    wrongPacketActivation.stderr,
    /checked-in agent-packets\/INF-014\.md/i,
  );

  const wrongStoryActivation = runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    generatedStoryPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);

  assert.notEqual(wrongStoryActivation.status, 0);
  assert.match(wrongStoryActivation.stderr, /checked-in approved story/i);

  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        activeStories: [
          {
            storyId: "INF-014",
            storyPath:
              "stories/generated/INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
            packetPath: "agent-packets/INF-014.md",
            storySha256: "0".repeat(64),
          },
        ],
      },
      null,
      2,
    ),
  );

  const wrongStoryManifest = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.notEqual(wrongStoryManifest.status, 0);
  assert.match(wrongStoryManifest.stderr, /checked-in approved story/i);

  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        activeStories: [
          {
            storyId: "INF-014",
            storyPath:
              "stories/approved/INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
            packetPath: "agent-packets/custom-INF-014.md",
            storySha256: "0".repeat(64),
          },
        ],
      },
      null,
      2,
    ),
  );

  const wrongPacketManifest = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.notEqual(wrongPacketManifest.status, 0);
  assert.match(
    wrongPacketManifest.stderr,
    /checked-in agent-packets\/INF-014\.md/i,
  );
});

test("packet activation and verification require the checked-in active-story manifest path", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const approvedStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const nonCanonicalManifestPath = path.join(
    tempRepoRoot,
    "tmp",
    "active.json",
  );

  await mkdir(path.dirname(nonCanonicalManifestPath), { recursive: true });

  const wrongManifestActivation = runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    approvedStoryPath,
    "--manifest",
    nonCanonicalManifestPath,
    "--activate",
  ]);

  assert.notEqual(wrongManifestActivation.status, 0);
  assert.match(
    wrongManifestActivation.stderr,
    /checked-in agent-packets\/active\.json/i,
  );

  const wrongManifestVerification = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    nonCanonicalManifestPath,
  ]);

  assert.notEqual(wrongManifestVerification.status, 0);
  assert.match(
    wrongManifestVerification.stderr,
    /checked-in agent-packets\/active\.json/i,
  );
});

test("packet builder discovers checked-in spec docs recursively", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const nestedSpecsDir = path.join(tempRepoRoot, "specs", "nested");
  const movedSpecSourcePath = path.join(
    tempRepoRoot,
    "specs",
    "26-agent-packet-template.md",
  );
  const movedSpecTargetPath = path.join(
    nestedSpecsDir,
    "26-agent-packet-template.md",
  );
  const tempStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const outputPath = path.join(tempRepoRoot, "agent-packets", "INF-014.md");

  await mkdir(nestedSpecsDir, { recursive: true });
  await rename(movedSpecSourcePath, movedSpecTargetPath);

  const result = runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    tempStoryPath,
    "--output",
    outputPath,
  ]);

  assert.equal(
    result.status,
    0,
    `expected recursive spec discovery to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const packet = await readFile(outputPath, "utf8");
  assert.match(packet, /26-agent-packet-template\.s005/);
});

test("active packet verification requires a checked-in active story manifest", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const missingManifest = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
  ]);

  assert.notEqual(missingManifest.status, 0);
  assert.match(missingManifest.stderr, /manifest is required/i);
});

test("active packet verification ignores approved dormant stories without packets", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const dormantStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-099.story.yaml",
  );
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const sourceStory = await readFile(storyPath, "utf8");

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    dormantStoryPath,
    sourceStory.replace(/^id: INF-014$/m, "id: INF-099"),
  );
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        activeStories: [],
      },
      null,
      2,
    ),
  );

  const verified = runPacketToolFromRepo(tempRepoRoot, ["verify-active"]);

  assert.equal(
    verified.status,
    0,
    `expected dormant approved stories without packets to be ignored\nstdout:\n${verified.stdout ?? ""}\nstderr:\n${verified.stderr ?? ""}`,
  );
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
    packetTemplate,
    /allow approved stories to sit without packets until they become active, but require a current checked-in packet before implementation assignment, reviewer assignment, or PR handoff/,
  );
  assert.match(
    packetTemplate,
    /complete stories through one packet-tool operation that moves the story to done history, removes the active packet, and clears the completed story from the active packet manifest/,
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
    codexIntegration,
    /Verify that the active story packet is present and current before worker assignment, reviewer assignment, or PR handoff\./,
  );
  assert.match(codexIntegration, /run the packet completion command/i);
  assert.match(packageJson, /"packets:complete"/);
});
