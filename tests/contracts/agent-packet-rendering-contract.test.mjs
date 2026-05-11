import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";

import {
  expectedRelevantConstraintBullets,
  makeTempDir,
  makeTempRepoFixture,
  readPacketBullets,
  readPacketRawBullets,
  readPacketSection,
  readStoryValues,
  runPacketTool,
  runPacketToolFromRepo,
  storyPath,
} from "./agent-packet-test-support.mjs";

test("packet builder generates the canonical packet sections for an approved story", async () => {
  const tempDir = await makeTempDir();
  const outputPath = path.join(tempDir, "INF-014.md");
  const story = await readStoryValues(readFile);

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
  const constraintBullets = readPacketBullets(packet, "Constraints");
  assert.deepEqual(
    constraintBullets.slice(0, expectedRelevantConstraintBullets.length),
    expectedRelevantConstraintBullets,
  );
  const constraintsSection = readPacketSection(packet, "Constraints");
  assert.match(constraintsSection, /^### Code Standard$/m);
  assert.match(
    constraintsSection,
    /Follow \[`docs\/code-standard\.md`\]\(docs\/code-standard\.md\)\. Non-negotiables:/,
  );
  assert.match(constraintsSection, /- stay inside the approved story boundary/);
  assert.match(constraintsSection, /- preserve package boundaries/);
  assert.match(
    constraintsSection,
    /- use strict TypeScript without `any`, routine non-null assertions, or ignored TS errors/,
  );
  assert.match(constraintsSection, /- prefer named exports and precise types/);
  assert.match(
    constraintsSection,
    /- keep files cohesive; 500 effective lines is suspect, 800 is high-risk, 1000 is the hard mechanical guard/,
  );
  assert.match(
    constraintsSection,
    /- split by reason-to-change, not by line count/,
  );
  assert.match(
    constraintsSection,
    /- do not over-split into tiny files or generic dumping grounds/,
  );
  assert.match(
    constraintsSection,
    /- keep engine-core pure and hidden-info safe/,
  );
  assert.match(
    constraintsSection,
    /- prove engine behavior with synthetic\/unit\/regression tests/,
  );
  assert.match(
    constraintsSection,
    /- keep real-card fixture tests separate from engine behavior requirements/,
  );
  assert.match(
    constraintsSection,
    /- preserve deterministic event ordering and state hashes/,
  );
  assert.match(
    constraintsSection,
    /- record ambiguity instead of inventing behavior/,
  );
  assert.deepEqual(
    readPacketRawBullets(packet, "Acceptance Criteria"),
    story.acceptanceCriteria,
  );
  assert.deepEqual(
    constraintBullets.slice(0, story.repoRules.length),
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
  const story = await readStoryValues(readFile);

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

test("packet excerpt extraction keeps SECTION_REF-like lines inside fenced code blocks", async () => {
  const tempDir = await makeTempDir();
  const outputPath = path.join(tempDir, "packet.md");
  const fencedExcerptStoryPath = path.join(
    tempDir,
    "fenced-excerpt-story.yaml",
  );

  await writeFile(
    fencedExcerptStoryPath,
    `spec_version: v6
spec_package_name: optcg-md-specs-v6
story_schema_version: 1.0.0
id: INF-999
epic_id: KICK-001
title: Exercise packet fenced code excerpts
type: tooling
area: infra
primary_concern: tooling
priority: low
status: approved
summary: >
  Exercise packet excerpt generation for spec sections containing SECTION_REF-like text inside fenced code blocks.
story_boundary: >
  Test-only story fixture for packet excerpt generation.
allowed_touch_points:
  - tools/**
spec_refs:
  - 28-machine-readable-conventions.s008 (Stable heading usage)
scope:
  - generate a packet excerpt for a section containing SECTION_REF-like text inside a fenced code block
non_scope:
  - implementation changes
dependencies: []
acceptance_criteria:
  - packet excerpt includes text after fenced SECTION_REF-like lines
required_tests:
  - packet excerpt extraction regression test
repo_rules:
  - must pass packet generation
ambiguity_policy: fail_and_escalate
`,
  );

  const result = runPacketTool([
    "generate",
    "--story",
    fencedExcerptStoryPath,
    "--output",
    outputPath,
  ]);

  assert.equal(
    result.status,
    0,
    `expected packet build to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const packet = await readFile(outputPath, "utf8");
  assert.match(
    packet,
    /### 28-machine-readable-conventions\.s008 \(Stable heading usage\)/,
  );
  assert.match(packet, /Preferred reference formats:/);
  assert.match(
    packet,
    /Fallback format when a section ref is unavailable should be:/,
  );
});
