import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";

import {
  makeTempDir,
  runPacketTool,
  storyPath,
} from "./agent-packet-test-support.mjs";

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

test("packet builder accepts schema-valid object-form child stories", async () => {
  const tempDir = await makeTempDir();
  const variantStoryPath = path.join(
    tempDir,
    "INF-014-object-child-stories.story.yaml",
  );
  const outputPath = path.join(tempDir, "INF-014.md");
  const sourceStory = await readFile(storyPath, "utf8");

  await writeFile(
    variantStoryPath,
    `${sourceStory}child_stories:
  - id: INF-014A
    title: Child story A
    concern: first child concern
    depends_on: []
  - id: INF-014B
    title: Child story B
    concern: second child concern
    depends_on: [INF-014A]
`,
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
    `expected packet build with object-form child_stories to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );
});
