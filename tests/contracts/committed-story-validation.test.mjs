import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { validateCommittedStories } from "../../tools/validate-stories.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

async function makeTempRepo() {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "optcg-story-validation-"),
  );
  await mkdir(path.join(tempRoot, "contracts"), { recursive: true });
  await writeFile(
    path.join(tempRoot, "contracts", "story.schema.json"),
    await readFile(
      path.join(repoRoot, "contracts", "story.schema.json"),
      "utf8",
    ),
  );
  return tempRoot;
}

async function writeStory(tempRoot, relativePath, overrides = {}) {
  const story = {
    spec_version: "v6",
    spec_package_name: "optcg-md-specs-v6",
    story_schema_version: "1.0.0",
    id: "TST-001",
    epic_id: "TST-001",
    title: "Valid committed story fixture",
    type: "tooling",
    area: "infra",
    primary_concern: "tooling",
    priority: "low",
    status: "approved",
    summary: "Validate a committed story fixture.",
    story_boundary: "Only validate this fixture.",
    allowed_touch_points: ["tools/**"],
    spec_refs: ["23-repo-tooling-and-enforcement.s005 (Package scripts)"],
    scope: ["validate the fixture"],
    non_scope: ["change product behavior"],
    dependencies: [],
    acceptance_criteria: ["fixture validates"],
    required_tests: ["fixture validation test"],
    repo_rules: ["stay narrow"],
    ambiguity_policy: "fail_and_escalate",
    ...overrides,
  };

  const storyPath = path.join(tempRoot, relativePath);
  await mkdir(path.dirname(storyPath), { recursive: true });
  await writeFile(storyPath, renderStoryYaml(story));
  return storyPath;
}

function renderStoryYaml(story) {
  const lines = [];

  for (const [key, value] of Object.entries(story)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${item}`);
        }
      }
      continue;
    }

    lines.push(`${key}: ${value}`);
  }

  return `${lines.join("\n")}\n`;
}

test("committed story validator accepts a valid story fixture", async () => {
  const tempRoot = await makeTempRepo();
  await writeStory(tempRoot, "stories/approved/TST-001-valid-story.yaml");

  const result = await validateCommittedStories({ repoRoot: tempRoot });

  assert.equal(result.ok, true, result.diagnostics.join("\n"));
  assert.deepEqual(result.checkedFiles, [
    "stories/approved/TST-001-valid-story.yaml",
  ]);
  assert.deepEqual(result.diagnostics, []);
});

test("committed story validator reports deterministic schema diagnostics", async () => {
  const tempRoot = await makeTempRepo();
  await writeStory(tempRoot, "stories/generated/TST-001-invalid-story.yaml", {
    status: "waiting",
  });

  const result = await validateCommittedStories({ repoRoot: tempRoot });

  assert.equal(result.ok, false);
  assert.deepEqual(result.checkedFiles, [
    "stories/generated/TST-001-invalid-story.yaml",
  ]);
  assert.match(
    result.diagnostics.join("\n"),
    /stories\/generated\/TST-001-invalid-story\.yaml: \/status must be equal to one of the allowed values/,
  );
});

test("committed story validator accepts blocked-story lifecycle metadata", async () => {
  const tempRoot = await makeTempRepo();
  await writeStory(tempRoot, "stories/blocked/TST-001-blocked-story.yaml", {
    blocked_reason: "Waiting on an authority dependency.",
    status: "blocked",
  });

  const result = await validateCommittedStories({ repoRoot: tempRoot });

  assert.equal(result.ok, true, result.diagnostics.join("\n"));
  assert.deepEqual(result.checkedFiles, [
    "stories/blocked/TST-001-blocked-story.yaml",
  ]);
});

test("committed story validator accepts parent child-story metadata", async () => {
  const tempRoot = await makeTempRepo();
  const storyPath = path.join(
    tempRoot,
    "stories/generated/TST-001-parent-story.yaml",
  );
  await mkdir(path.dirname(storyPath), { recursive: true });
  await writeFile(
    storyPath,
    `${renderStoryYaml({
      spec_version: "v6",
      spec_package_name: "optcg-md-specs-v6",
      story_schema_version: "1.0.0",
      id: "TST-001",
      epic_id: "TST-001",
      title: "Parent story fixture",
      type: "implementation",
      area: "engine",
      primary_concern: "rules",
      priority: "low",
      status: "generated",
      summary: "Validate parent child-story metadata.",
      story_boundary: "Only validate this fixture.",
    })}child_stories:
  - id: TST-001A
    title: Child story A
    concern: first child concern
    depends_on: []
  - id: TST-001B
    title: Child story B
    concern: second child concern
    depends_on: [TST-001A]
${renderStoryYaml({
  allowed_touch_points: ["tools/**"],
  spec_refs: ["23-repo-tooling-and-enforcement.s005 (Package scripts)"],
  scope: ["validate the fixture"],
  non_scope: ["change product behavior"],
  dependencies: [],
  acceptance_criteria: ["fixture validates"],
  required_tests: ["fixture validation test"],
  repo_rules: ["stay narrow"],
  ambiguity_policy: "fail_and_escalate",
})}`,
  );

  const result = await validateCommittedStories({ repoRoot: tempRoot });

  assert.equal(result.ok, true, result.diagnostics.join("\n"));
  assert.deepEqual(result.checkedFiles, [
    "stories/generated/TST-001-parent-story.yaml",
  ]);
});
