import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";

import {
  makeTempRepoFixture,
  runPacketToolFromRepo,
} from "./agent-packet-test-support.mjs";

const SUPPORTED_ROLES = [
  "story-orchestrator",
  "implementation",
  "code-review",
  "pr-gate",
];

test("packet extraction emits implementation markdown and json with aligned identity and role content", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const storyPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const packetPath = path.join(tempRepoRoot, "agent-packets", "INF-014.md");

  const built = runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    storyPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);

  assert.equal(
    built.status,
    0,
    `expected packet generation to pass\nstdout:\n${built.stdout ?? ""}\nstderr:\n${built.stderr ?? ""}`,
  );

  const markdown = runPacketToolFromRepo(tempRepoRoot, [
    "extract",
    "--role",
    "implementation",
    "--format",
    "markdown",
  ]);
  const json = runPacketToolFromRepo(tempRepoRoot, [
    "extract",
    "--role",
    "implementation",
    "--format",
    "json",
  ]);

  assert.equal(
    markdown.status,
    0,
    `expected markdown extraction to pass\nstdout:\n${markdown.stdout ?? ""}\nstderr:\n${markdown.stderr ?? ""}`,
  );
  assert.equal(
    json.status,
    0,
    `expected json extraction to pass\nstdout:\n${json.stdout ?? ""}\nstderr:\n${json.stderr ?? ""}`,
  );

  const parsed = JSON.parse(json.stdout ?? "{}");
  const packetSource = await readFile(packetPath, "utf8");
  const packetRoleContent = readPacketRoleBullets(
    packetSource,
    "implementation",
  );
  assert.equal(parsed.role, "implementation");
  assert.equal(parsed.story.id, "INF-014");
  assert.ok(Array.isArray(parsed.sharedAuthoritySummary));
  assert.ok(Array.isArray(parsed.responsibilities));
  assert.ok(Array.isArray(parsed.forbiddenActions));
  assert.ok(Array.isArray(parsed.requiredOutputs));

  const markdownSource = markdown.stdout ?? "";
  assert.match(markdownSource, /^Role:\s+implementation$/m);
  assert.match(markdownSource, /^Story ID:\s+INF-014$/m);
  assert.match(markdownSource, /^Story Title:\s+.+$/m);
  assert.match(markdownSource, /^## Shared Authority Summary$/m);
  assert.match(markdownSource, /^## Responsibilities$/m);
  assert.match(markdownSource, /^## Forbidden Actions$/m);
  assert.match(markdownSource, /^## Required Outputs$/m);
  assert.deepEqual(
    readMarkdownBullets(markdownSource, "Responsibilities"),
    parsed.responsibilities,
  );
  assert.deepEqual(parsed.responsibilities, packetRoleContent.responsibilities);
  assert.deepEqual(
    readMarkdownBullets(markdownSource, "Forbidden Actions"),
    parsed.forbiddenActions,
  );
  assert.deepEqual(parsed.forbiddenActions, packetRoleContent.forbiddenActions);
  assert.deepEqual(
    readMarkdownBullets(markdownSource, "Required Outputs"),
    parsed.requiredOutputs,
  );
  assert.deepEqual(parsed.requiredOutputs, packetRoleContent.requiredOutputs);
});

test("packet extraction emits markdown and json for each post-approval review role", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const storyPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const packetPath = path.join(tempRepoRoot, "agent-packets", "INF-014.md");

  runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    storyPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);

  for (const role of SUPPORTED_ROLES) {
    const markdown = runPacketToolFromRepo(tempRepoRoot, [
      "extract",
      "--role",
      role,
      "--format",
      "markdown",
    ]);
    const json = runPacketToolFromRepo(tempRepoRoot, [
      "extract",
      "--role",
      role,
      "--format",
      "json",
    ]);

    assert.equal(
      markdown.status,
      0,
      `expected markdown extraction for ${role}`,
    );
    assert.equal(json.status, 0, `expected json extraction for ${role}`);

    const parsed = JSON.parse(json.stdout ?? "{}");
    const packetSource = await readFile(packetPath, "utf8");
    const packetRoleContent = readPacketRoleBullets(packetSource, role);
    assert.equal(parsed.role, role);
    assert.equal(parsed.story.id, "INF-014");
    assert.deepEqual(
      readMarkdownBullets(markdown.stdout ?? "", "Shared Authority Summary"),
      parsed.sharedAuthoritySummary,
    );
    assert.deepEqual(
      readMarkdownBullets(markdown.stdout ?? "", "Responsibilities"),
      parsed.responsibilities,
    );
    assert.deepEqual(
      parsed.responsibilities,
      packetRoleContent.responsibilities,
    );
    assert.deepEqual(
      readMarkdownBullets(markdown.stdout ?? "", "Forbidden Actions"),
      parsed.forbiddenActions,
    );
    assert.deepEqual(
      parsed.forbiddenActions,
      packetRoleContent.forbiddenActions,
    );
    assert.deepEqual(
      readMarkdownBullets(markdown.stdout ?? "", "Required Outputs"),
      parsed.requiredOutputs,
    );
    assert.deepEqual(parsed.requiredOutputs, packetRoleContent.requiredOutputs);
  }
});

test("packet extraction rejects story-author and story-review roles", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const storyPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );

  runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    storyPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);

  for (const role of ["story-author", "story-review"]) {
    const result = runPacketToolFromRepo(tempRepoRoot, [
      "extract",
      "--role",
      role,
      "--format",
      "json",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr ?? "", /unsupported role|post-approval/i);
  }
});

test("packet extraction rejects missing or stale active packet state", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const storyPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );

  const missingActive = runPacketToolFromRepo(tempRepoRoot, [
    "extract",
    "--role",
    "implementation",
    "--format",
    "markdown",
  ]);
  assert.notEqual(missingActive.status, 0);
  assert.match(
    missingActive.stderr ?? "",
    /active story manifest|active story/i,
  );
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify({ activeStories: [], version: 1 }, null, 2)}\n`,
  );
  const emptyActive = runPacketToolFromRepo(tempRepoRoot, [
    "extract",
    "--role",
    "implementation",
    "--format",
    "markdown",
  ]);
  assert.notEqual(emptyActive.status, 0);
  assert.match(emptyActive.stderr ?? "", /active story/i);

  runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    storyPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);
  const sourceStory = await readFile(storyPath, "utf8");
  await writeFile(storyPath, `${sourceStory}\n# stale marker\n`);

  const staleActive = runPacketToolFromRepo(tempRepoRoot, [
    "extract",
    "--role",
    "implementation",
    "--format",
    "markdown",
  ]);
  assert.notEqual(staleActive.status, 0);
  assert.match(staleActive.stderr ?? "", /stale|verify-active/i);
});

test("packet extraction rejects when the requested role section is missing from packet", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const storyPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const packetPath = path.join(tempRepoRoot, "agent-packets", "INF-014.md");

  runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    storyPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);

  const packetSource = await readFile(packetPath, "utf8");
  await writeFile(
    packetPath,
    packetSource.replace(/^### implementation$/m, "### implementation-missing"),
  );

  const extracted = runPacketToolFromRepo(tempRepoRoot, [
    "extract",
    "--role",
    "implementation",
    "--format",
    "json",
  ]);

  assert.notEqual(extracted.status, 0);
  assert.match(extracted.stderr ?? "", /missing post-approval role section/i);
});

test("packet extraction keeps implementation forbidden-action wording compatible with extraction stories", async () => {
  const tempRepoRoot = await makeTempRepoFixture();
  const manifestPath = path.join(tempRepoRoot, "agent-packets", "active.json");
  const storyPath = path.join(
    tempRepoRoot,
    "stories",
    "approved",
    "INF-014-story-lifecycle-and-active-packet-cleanup.yaml",
  );
  const source = await readFile(storyPath, "utf8");
  await writeFile(
    storyPath,
    source
      .replace(/^id:\s+INF-014$/m, "id: INF-044D")
      .replace(
        /^title:\s+.*$/m,
        "title: Add deterministic role packet extraction",
      )
      .replace(
        /^summary:\s+>$/m,
        "summary: >\n  Add a packet extraction command for role-scoped handoffs.",
      )
      .replace(
        /^scope:\r?\n(?: {2}- .*\r?\n)*/m,
        "scope:\n  - add deterministic extraction for active packet role sections\n  - support Markdown and JSON extraction outputs\n",
      ),
  );

  runPacketToolFromRepo(tempRepoRoot, [
    "generate",
    "--story",
    storyPath,
    "--manifest",
    manifestPath,
    "--activate",
  ]);

  const extracted = runPacketToolFromRepo(tempRepoRoot, [
    "extract",
    "--role",
    "implementation",
    "--format",
    "json",
  ]);

  assert.equal(
    extracted.status,
    0,
    `expected extraction to pass\nstdout:\n${extracted.stdout ?? ""}\nstderr:\n${extracted.stderr ?? ""}`,
  );
  const parsed = JSON.parse(extracted.stdout ?? "{}");
  assert.equal(parsed.story.id, "INF-044D");
  assert.equal(
    parsed.forbiddenActions.includes(
      "do not add packet extraction behavior unless the approved story explicitly owns it",
    ),
    true,
  );
  assert.equal(
    parsed.forbiddenActions.includes(
      "do not add extraction CLI behavior or JSON extraction output",
    ),
    false,
  );
});

function readMarkdownBullets(source, heading) {
  const lines = source.split(/\r?\n/);
  const sectionHeading = `## ${heading}`;
  let start = -1;
  let end = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    if (start < 0) {
      if (lines[index] === sectionHeading) {
        start = index + 1;
      }
      continue;
    }

    if (lines[index]?.startsWith("## ")) {
      end = index;
      break;
    }
  }

  if (start < 0) {
    throw new Error(`Unable to read section ${heading}`);
  }
  return lines
    .slice(start, end)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}

function readPacketRoleBullets(source, role) {
  const escapedRole = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const roleMatch = source.match(
    new RegExp(`^### ${escapedRole}\\r?\\n([\\s\\S]*?)(?=^### |^## |\\Z)`, "m"),
  );

  if (!roleMatch?.[1]) {
    throw new Error(`Missing role section ${role}`);
  }

  return {
    forbiddenActions: readRoleSubsectionBullets(
      roleMatch[1],
      "Forbidden Actions",
    ),
    requiredOutputs: readRoleSubsectionBullets(
      roleMatch[1],
      "Required Outputs",
    ),
    responsibilities: readRoleSubsectionBullets(
      roleMatch[1],
      "Responsibilities",
    ),
  };
}

function readRoleSubsectionBullets(source, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionMatch = source.match(
    new RegExp(`^${escapedHeading}\\r?\\n((?:- .*\\r?\\n?)*)`, "m"),
  );

  if (!sectionMatch?.[1]) {
    throw new Error(`Missing role subsection ${heading}`);
  }

  return sectionMatch[1]
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}
