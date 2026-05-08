import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";

import {
  makeTempRepoFixture,
  runPacketToolFromRepo,
  sha256,
  storyPath,
  toCrlf,
} from "./agent-packet-test-support.mjs";

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

test("active packet verification accepts letter-suffixed story ids with exact packet paths", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const numericStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const suffixedStoryPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014A-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const sourceStory = await readFile(numericStoryPath, "utf8");

  await writeFile(
    suffixedStoryPath,
    sourceStory.replace(/^id: INF-014$/m, "id: INF-014A"),
  );

  const buildResult = runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    suffixedStoryPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);

  assert.equal(
    buildResult.status,
    0,
    `expected suffixed packet build to pass\nstdout:\n${buildResult.stdout ?? ""}\nstderr:\n${buildResult.stderr ?? ""}`,
  );

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.activeStories, [
    {
      packetPath: "agent-packets/INF-014A.md",
      storyId: "INF-014A",
      storyPath:
        "stories/approved/INF-014A-story-lifecycle-and-active-packet-cleanup.yaml",
      storySha256: manifest.activeStories[0].storySha256,
    },
  ]);

  const verified = runPacketToolFromRepo(tempRepoRoot, [
    "verify-active",
    "--manifest",
    manifestPath,
  ]);

  assert.equal(
    verified.status,
    0,
    `expected suffixed active packet verification to pass\nstdout:\n${verified.stdout ?? ""}\nstderr:\n${verified.stderr ?? ""}`,
  );

  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        activeStories: [
          {
            ...manifest.activeStories[0],
            packetPath: "agent-packets/custom-INF-014A.md",
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
    /checked-in agent-packets\/INF-014A\.md/i,
  );
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
