import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, test } from "vitest";

const tempDirs = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { recursive: true, force: true })),
  );
});

test("story review plan emits one parent-set review assignment for a one-child parent", async () => {
  const repoRoot = await makeStoryFixture({
    children: [{ id: "INF-047A", title: "Collapse agent workflow" }],
    parentId: "INF-047",
  });

  const result = runReviewPlan(repoRoot, [
    "--parent",
    "stories/approved/INF-047-parent.yaml",
    "--format",
    "json",
  ]);

  assert.equal(
    result.status,
    0,
    `expected review plan to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const plan = JSON.parse(result.stdout ?? "{}");
  assert.equal(plan.parent.id, "INF-047");
  assert.deepEqual(
    plan.stories.map((story) => story.id),
    ["INF-047", "INF-047A"],
  );
  assert.deepEqual(plan.reviewAssignments, [
    {
      id: "story-review:INF-047",
      model: "gpt-5.5",
      reasoning: "high",
      requiredCoverage: [
        "parent story authority and non-implementation boundary",
        "declared child story scope, non-scope, allowed touch points, required tests, and dependencies",
        "parent/child consistency and lifecycle fit",
        "findings and disposition for the parent and each declared child",
      ],
      stories: ["INF-047", "INF-047A"],
      type: "parent-story-set",
    },
  ]);
});

test("story review plan keeps multi-child parents in one deterministic parent-set assignment", async () => {
  const repoRoot = await makeStoryFixture({
    children: [
      { id: "INF-048A", title: "First child" },
      { id: "INF-048B", title: "Second child" },
    ],
    parentId: "INF-048",
  });

  const result = runReviewPlan(repoRoot, [
    "--parent",
    "stories/approved/INF-048-parent.yaml",
    "--format",
    "json",
  ]);

  assert.equal(
    result.status,
    0,
    `expected review plan to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const plan = JSON.parse(result.stdout ?? "{}");
  assert.deepEqual(
    plan.stories.map((story) => story.id),
    ["INF-048", "INF-048A", "INF-048B"],
  );
  assert.deepEqual(plan.reviewAssignments[0].stories, [
    "INF-048",
    "INF-048A",
    "INF-048B",
  ]);
});

test("story review plan accepts pnpm-run argument separator before parent option", async () => {
  const repoRoot = await makeStoryFixture({
    children: [{ id: "INF-050A", title: "Argument separator child" }],
    parentId: "INF-050",
  });

  const result = runReviewPlan(repoRoot, [
    "--",
    "--parent",
    "stories/approved/INF-050-parent.yaml",
    "--format",
    "json",
  ]);

  assert.equal(
    result.status,
    0,
    `expected review plan to accept pnpm separator\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const plan = JSON.parse(result.stdout ?? "{}");
  assert.deepEqual(plan.reviewAssignments[0].stories, ["INF-050", "INF-050A"]);
});

test("story review plan resolves children from the same story directory as the parent", async () => {
  const repoRoot = await makeStoryFixture({
    children: [{ id: "INF-051A", title: "Generated child" }],
    parentDirectory: "stories/generated",
    parentId: "INF-051",
  });

  await mkdir(path.join(repoRoot, "stories", "approved"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "stories", "approved", "INF-051A-approved-child.yaml"),
    storySource({
      epicId: "INF-051",
      id: "INF-051A",
      status: "approved",
      title: "Approved child collision",
    }),
  );

  const result = runReviewPlan(repoRoot, [
    "--parent",
    "stories/generated/INF-051-parent.yaml",
    "--format",
    "json",
  ]);

  assert.equal(
    result.status,
    0,
    `expected generated parent to resolve generated child\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const plan = JSON.parse(result.stdout ?? "{}");
  assert.equal(
    plan.stories.find((story) => story.id === "INF-051A")?.path,
    "stories/generated/INF-051A-generated-child.yaml",
  );
});

test("story review plan markdown includes required coverage", async () => {
  const repoRoot = await makeStoryFixture({
    children: [{ id: "INF-052A", title: "Markdown child" }],
    parentId: "INF-052",
  });

  const result = runReviewPlan(repoRoot, [
    "--parent",
    "stories/approved/INF-052-parent.yaml",
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout ?? "", /Required Coverage/i);
  assert.match(
    result.stdout ?? "",
    /parent story authority and non-implementation boundary/i,
  );
  assert.match(
    result.stdout ?? "",
    /declared child story scope, non-scope, allowed touch points, required tests, and dependencies/i,
  );
});

test("story review plan discovers the repo root from a subdirectory", async () => {
  const repoRoot = await makeStoryFixture({
    children: [{ id: "INF-053A", title: "Subdirectory child" }],
    parentId: "INF-053",
  });
  const subdirectory = path.join(repoRoot, "docs", "workflow");
  await mkdir(subdirectory, { recursive: true });

  const result = runReviewPlanFromCwd(repoRoot, subdirectory, [
    "--parent",
    "stories/approved/INF-053-parent.yaml",
    "--format",
    "json",
  ]);

  assert.equal(
    result.status,
    0,
    `expected review plan to resolve repo-root-relative parent from subdirectory\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`,
  );

  const plan = JSON.parse(result.stdout ?? "{}");
  assert.equal(plan.parent.path, "stories/approved/INF-053-parent.yaml");
});

test("story review plan fails closed when a declared child story cannot be found", async () => {
  const repoRoot = await makeStoryFixture({
    children: [{ id: "INF-049A", title: "Missing child" }],
    omitChildren: true,
    parentId: "INF-049",
  });

  const result = runReviewPlan(repoRoot, [
    "--parent",
    "stories/approved/INF-049-parent.yaml",
    "--format",
    "json",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr ?? "", /unable to find child story INF-049A/i);
});

function runReviewPlan(repoRoot, args) {
  return runReviewPlanFromCwd(repoRoot, repoRoot, args);
}

function runReviewPlanFromCwd(repoRoot, cwd, args) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(repoRoot, "tools", "story-review-plan.ts"),
      ...args,
    ],
    {
      cwd,
      encoding: "utf8",
    },
  );
}

async function makeStoryFixture(options) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "optcg-review-plan-"));
  tempDirs.push(tempDir);
  const repoRoot = path.join(tempDir, "optcg-sim");
  const parentDirectory = options.parentDirectory ?? "stories/approved";
  await mkdir(path.join(repoRoot, parentDirectory), {
    recursive: true,
  });
  await mkdir(path.join(repoRoot, "tools"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "package.json"),
    '{"private":true,"type":"module"}\n',
  );

  await writeFile(
    path.join(repoRoot, "tools", "story-review-plan.ts"),
    await readRepoToolSource(),
  );

  await writeFile(
    path.join(repoRoot, parentDirectory, `${options.parentId}-parent.yaml`),
    storySource({
      childStories: options.children,
      epicId: options.parentId,
      id: options.parentId,
      status: "approved",
      title: "Parent story",
    }),
  );

  if (!options.omitChildren) {
    for (const child of options.children) {
      await writeFile(
        path.join(
          repoRoot,
          parentDirectory,
          `${child.id}-${slugify(child.title)}.yaml`,
        ),
        storySource({
          epicId: options.parentId,
          id: child.id,
          status: "approved",
          title: child.title,
        }),
      );
    }
  }

  return repoRoot;
}

async function readRepoToolSource() {
  const { readFile } = await import("node:fs/promises");
  return readFile(path.resolve("tools", "story-review-plan.ts"), "utf8").catch(
    () => "throw new Error('story-review-plan tool missing');\n",
  );
}

function storySource(options) {
  const childStories = options.childStories
    ? `child_stories:\n${options.childStories
        .map(
          (child) =>
            `  - id: ${child.id}\n    title: ${child.title}\n    concern: ${child.title}\n    depends_on: []`,
        )
        .join("\n")}\n`
    : "";

  return `spec_version: v6
spec_package_name: optcg-md-specs-v6
story_schema_version: 1.0.0
id: ${options.id}
epic_id: ${options.epicId}
title: ${options.title}
type: refactor
area: docs
primary_concern: docs
priority: critical
status: ${options.status}
summary: >
  Story review plan fixture.
story_boundary: >
  Test fixture only.
allowed_touch_points:
  - docs/**
spec_refs:
  - 27-spec-driven-story-generation-workflow.s017
scope:
  - test story review planning
non_scope:
  - production behavior
dependencies: []
${childStories}acceptance_criteria:
  - review plan can read this story
required_tests:
  - story review plan contract
repo_rules:
  - test only
ambiguity_policy: fail_and_escalate
`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
