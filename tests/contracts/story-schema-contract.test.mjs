import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

async function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const contents = await readFile(absolutePath, "utf8");
  return JSON.parse(contents);
}

test("story schema contract exists", async () => {
  const schema = await readJson("contracts/story.schema.json");

  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.ok(Array.isArray(schema.required));
});

test("story schema requires concern-first story boundary fields", async () => {
  const schema = await readJson("contracts/story.schema.json");

  const requiredFields = [
    "spec_version",
    "spec_package_name",
    "story_schema_version",
    "id",
    "epic_id",
    "title",
    "type",
    "area",
    "primary_concern",
    "priority",
    "status",
    "summary",
    "story_boundary",
    "allowed_touch_points",
    "spec_refs",
    "scope",
    "non_scope",
    "dependencies",
    "acceptance_criteria",
    "required_tests",
    "repo_rules",
    "ambiguity_policy",
  ];

  for (const fieldName of requiredFields) {
    assert.ok(
      schema.required.includes(fieldName),
      `missing required field ${fieldName}`,
    );
    assert.ok(schema.properties[fieldName], `missing schema for ${fieldName}`);
  }
});

test("story schema pins the supported story schema version", async () => {
  const schema = await readJson("contracts/story.schema.json");

  assert.deepEqual(schema.properties.story_schema_version.enum, ["1.0.0"]);
});

test("story schema enums match the canonical spec vocabulary", async () => {
  const schema = await readJson("contracts/story.schema.json");

  assert.deepEqual(schema.properties.type.enum, [
    "design",
    "implementation",
    "specification",
    "verification",
    "refactor",
    "tooling",
    "ambiguity",
  ]);
  assert.deepEqual(schema.properties.area.enum, [
    "contracts",
    "engine",
    "cards",
    "server",
    "client",
    "replay",
    "database",
    "infra",
    "docs",
    "security",
    "types",
  ]);
  assert.deepEqual(schema.properties.priority.enum, [
    "critical",
    "high",
    "medium",
    "low",
  ]);
  assert.deepEqual(schema.properties.status.enum, [
    "generated",
    "approved",
    "in_progress",
    "blocked",
    "done",
    "replaced",
  ]);
  assert.deepEqual(schema.properties.primary_concern.enum, [
    "contract",
    "rules",
    "view",
    "protocol",
    "persistence",
    "tooling",
    "ui",
    "cli",
    "docs",
    "visibility",
    "verification",
  ]);
  assert.deepEqual(schema.properties.ambiguity_policy.enum, [
    "fail_and_escalate",
    "implement_if_clearly_implied",
  ]);
  assert.equal(schema.properties.blocked_reason.type, "string");
  assert.equal(schema.properties.child_stories.type, "array");
  assert.equal(schema.properties.card_source_integrity.type, "array");
  assert.equal(schema.properties.engine_capability_preflight.type, "array");
});

test("story schema supports CARD implementation preflight guard fields", async () => {
  const schema = await readJson("contracts/story.schema.json");

  for (const fieldName of [
    "card_source_integrity",
    "engine_capability_preflight",
  ]) {
    const field = schema.properties[fieldName];

    assert.equal(field.type, "array");
    assert.equal(field.minItems, 1);
    assert.equal(field.items.type, "string");
    assert.equal(field.items.minLength, 1);
  }
});

test("story schema accepts split-story letter suffixes without broad arbitrary suffixes", async () => {
  const schema = await readJson("contracts/story.schema.json");
  const storyIdPattern = new RegExp(schema.properties.id.pattern);
  const epicIdPattern = new RegExp(schema.properties.epic_id.pattern);

  assert.match("INF-015", storyIdPattern);
  assert.match("INF-006A", storyIdPattern);
  assert.doesNotMatch("INF-006AA", storyIdPattern);
  assert.doesNotMatch("INF-006-alpha", storyIdPattern);
  assert.match("KICK-001", epicIdPattern);
  assert.doesNotMatch("KICK-001A", epicIdPattern);
});

test("workflow docs require substantive CARD implementation preflight review", async () => {
  const storyExecution = await readFile(
    path.join(repoRoot, "docs/workflow/story-execution.md"),
    "utf8",
  );
  const reviewGate = await readFile(
    path.join(repoRoot, "docs/workflow/review-gate.md"),
    "utf8",
  );
  const fixtureCapture = await readFile(
    path.join(repoRoot, "docs/workflow/card-fixture-capture.md"),
    "utf8",
  );

  assert.match(storyExecution, /card_source_integrity/);
  assert.match(storyExecution, /engine_capability_preflight/);
  assert.match(storyExecution, /reusable engine gaps are already implemented/i);
  assert.match(reviewGate, /story reviewers must inspect the\s+substance/s);
  assert.match(fixtureCapture, /behavior-sensitive printed data/);
});
