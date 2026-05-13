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
  assert.match(packet, /^## Post-Approval Role Sections$/m);
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

test("packet builder renders deterministic post-approval role sections for INF-044C", async () => {
  const tempDir = await makeTempDir();
  const outputPath = path.join(tempDir, "INF-014.md");

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
    `expected fixture packet build to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const packet = await readFile(outputPath, "utf8");
  assert.match(packet, /^## Post-Approval Role Sections$/m);
  const rolesSection = readPacketSection(packet, "Post-Approval Role Sections");
  const roleOrder = Array.from(
    rolesSection.matchAll(/^### ([a-z-]+)$/gm),
    (match) => match[1],
  );
  assert.deepEqual(roleOrder, [
    "story-orchestrator",
    "implementation",
    "code-review",
    "pr-gate",
  ]);

  assert.deepEqual(readRoleBlocks(packet), [
    {
      checklistHeading: "Handoff Checklist",
      checklistBullets: [
        "confirm required inputs are present and current",
        "confirm forbidden actions are not introduced",
        "confirm required outputs are produced for handoff",
      ],
      forbiddenActions: [
        "do not perform story-author or story-review pre-approval handoff mechanics",
        "do not introduce packet-agent, cleanup-sync-agent, or revision-agent roles",
        "do not mutate packet lifecycle semantics outside approved story scope",
      ],
      requiredInputs: [
        "approved story file under stories/approved/",
        "active packet file under agent-packets/",
        "AGENTS.md and required workflow docs for the current phase",
      ],
      requiredOutputs: [
        "worker assignment constrained to allowed_touch_points and story boundary",
        "implementation handoff instructions bound to packet authority",
        "verification handoff readiness note",
      ],
      responsibilities: [
        "own story authority, scope enforcement, ambiguity handling, and role assignment",
        "ensure active packet content is current before implementation or review handoff",
        "handoff only approved post-approval roles for this story",
      ],
      role: "story-orchestrator",
    },
    {
      checklistHeading: "Verification Checklist",
      checklistBullets: [
        "confirm required inputs are present and current",
        "confirm forbidden actions are not introduced",
        "confirm required outputs are produced for handoff",
      ],
      forbiddenActions: [
        "do not broaden scope beyond the approved story boundary or allowed_touch_points",
        "do not add packet extraction behavior unless the approved story explicitly owns it",
        "do not implement story-author/story-review handoff mechanics",
      ],
      requiredInputs: [
        "active packet content with authoritative spec references",
        "approved story scope, non-scope, and acceptance criteria",
        "allowed_touch_points and required test list",
      ],
      requiredOutputs: [
        "scoped code and test changes within approved touch points",
        "verification command results with pass/fail status",
        "assumptions and blockers note",
      ],
      responsibilities: [
        "implement only the approved story using packet authority order",
        "follow strict TypeScript, lint, and verification requirements",
        "report ambiguity instead of inventing uncited behavior",
      ],
      role: "implementation",
    },
    {
      checklistHeading: "Verification Checklist",
      checklistBullets: [
        "confirm required inputs are present and current",
        "confirm forbidden actions are not introduced",
        "confirm required outputs are produced for handoff",
      ],
      forbiddenActions: [
        "do not author new feature scope outside the reviewed patch",
        "do not bypass required tests, packet verification, or CI gate evidence",
        "do not approve scope drift that violates story boundary",
      ],
      requiredInputs: [
        "proposed patch limited to approved touch points",
        "active packet, approved story, and cited spec references",
        "verification and test evidence for required commands",
      ],
      requiredOutputs: [
        "review findings prioritized by correctness and scope compliance",
        "clear disposition for findings (fix/defer/block) with rationale",
        "review closure recommendation for pr-gate handoff",
      ],
      responsibilities: [
        "review correctness, scope fit, and required-test coverage",
        "verify no forbidden role sections or lifecycle changes were introduced",
        "confirm canonical packet behavior remains enforceable",
      ],
      role: "code-review",
    },
    {
      checklistHeading: "Handoff Checklist",
      checklistBullets: [
        "confirm required inputs are present and current",
        "confirm forbidden actions are not introduced",
        "confirm required outputs are produced for handoff",
      ],
      forbiddenActions: [
        "do not merge without required human review and passing checks",
        "do not change cleanup metadata semantics in implementation patches",
        "do not implement feature code while serving as gate role",
      ],
      requiredInputs: [
        "current PR body or durable handoff comment with cleanup metadata source",
        "fetched changed files, PR head branch, and status checks",
        "review records, revision response, and verification evidence",
      ],
      requiredOutputs: [
        "gate decision with explicit pass/fail blockers",
        "human-review-ready handoff with cleanup metadata validation status",
        "post-merge cleanup or fallback status confirmation",
      ],
      responsibilities: [
        "own PR gate state, cleanup metadata validation, and human-review handoff",
        "confirm cleanup-metadata-guard presence and passing status before handoff",
        "preserve reviewed packet lifecycle behavior without scope expansion",
      ],
      role: "pr-gate",
    },
  ]);

  for (const unexpectedRole of [
    "story-author",
    "story-review",
    "packet-agent",
    "cleanup-sync-agent",
    "revision-agent",
  ]) {
    assert.doesNotMatch(
      packet,
      new RegExp(`^### ${unexpectedRole}$`, "m"),
      `unexpected role section rendered for ${unexpectedRole}`,
    );
  }
});

function readRoleBlocks(packet) {
  const roleOrder = [
    "story-orchestrator",
    "implementation",
    "code-review",
    "pr-gate",
  ];

  return roleOrder.map((role) => {
    const roleBody = readRoleSection(packet, role);
    const sections = parseRoleBodySections(roleBody);
    return {
      checklistHeading: sections.checklist.heading,
      checklistBullets: sections.checklist.bullets,
      forbiddenActions: sections.forbiddenActions,
      requiredInputs: sections.requiredInputs,
      requiredOutputs: sections.requiredOutputs,
      responsibilities: sections.responsibilities,
      role,
    };
  });
}

function readRoleSection(packet, role) {
  const escapedRole = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const roleMatch = packet.match(
    new RegExp(`^### ${escapedRole}\\r?\\n([\\s\\S]*?)(?=^### |^## |\\Z)`, "m"),
  );

  if (!roleMatch?.[1]) {
    throw new Error(`Unable to read role section ${role}`);
  }

  return roleMatch[1].trim();
}

function parseRoleBodySections(body) {
  const lines = body.split(/\r?\n/);
  const sectionMap = new Map();
  let currentHeading = null;

  for (const line of lines) {
    if (line === "") {
      continue;
    }

    if (
      [
        "Responsibilities",
        "Forbidden Actions",
        "Required Inputs",
        "Required Outputs",
        "Verification Checklist",
        "Handoff Checklist",
      ].includes(line)
    ) {
      currentHeading = line;
      sectionMap.set(line, []);
      continue;
    }

    if (!currentHeading) {
      throw new Error(`Unexpected role-section content line: ${line}`);
    }

    if (!line.startsWith("- ")) {
      throw new Error(`Expected bullet line under ${currentHeading}: ${line}`);
    }

    sectionMap.get(currentHeading).push(line.slice(2));
  }

  const checklistHeading = sectionMap.has("Handoff Checklist")
    ? "Handoff Checklist"
    : "Verification Checklist";

  return {
    checklist: {
      bullets: sectionMap.get(checklistHeading) ?? [],
      heading: checklistHeading,
    },
    forbiddenActions: sectionMap.get("Forbidden Actions") ?? [],
    requiredInputs: sectionMap.get("Required Inputs") ?? [],
    requiredOutputs: sectionMap.get("Required Outputs") ?? [],
    responsibilities: sectionMap.get("Responsibilities") ?? [],
  };
}
