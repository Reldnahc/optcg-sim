import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { sha256 } from "../../tools/agent-packet-lifecycle.ts";
import { parseCleanupMetadataBlock } from "../../tools/post-merge-cleanup/metadata.ts";
import { buildCleanupDryRunPlan } from "../../tools/post-merge-cleanup/validator.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

test("parser accepts valid single metadata", async () => {
  const source = await readFile(
    path.join(repoRoot, "tests/fixtures/post-merge-cleanup/pr-body-single.md"),
    "utf8",
  );
  const metadata = parseCleanupMetadataBlock(source);

  assert.deepEqual(metadata, {
    branches: ["story/inf-027b-cleanup-metadata-parser-validator"],
    mode: "single",
    stories: [
      "stories/approved/INF-027B-add-cleanup-metadata-parser-and-validator.yaml",
    ],
  });
});

test("parser accepts valid parent metadata", () => {
  const metadata = parseCleanupMetadataBlock(`Post-merge cleanup:
  mode: parent
  stories:
    - stories/approved/INF-101-a.yaml
    - stories/approved/INF-102-b.yaml
  branches:
    - story/inf-101
    - story/inf-102
`);

  assert.equal(metadata.mode, "parent");
  assert.deepEqual(metadata.stories, [
    "stories/approved/INF-101-a.yaml",
    "stories/approved/INF-102-b.yaml",
  ]);
});

test("parser fails closed for missing malformed or ambiguous metadata", () => {
  assert.throws(() => parseCleanupMetadataBlock("no cleanup block"), /Missing/);
  assert.throws(
    () =>
      parseCleanupMetadataBlock(`Post-merge cleanup:
  stories:
    - stories/approved/A.yaml
`),
    /missing mode/i,
  );
  assert.throws(
    () =>
      parseCleanupMetadataBlock(`Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/A.yaml
Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/B.yaml
`),
    /Ambiguous/,
  );
  assert.throws(
    () =>
      parseCleanupMetadataBlock(`Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/A.yaml
  stories:
    - stories/approved/B.yaml
`),
    /duplicate stories/i,
  );
  assert.throws(
    () =>
      parseCleanupMetadataBlock(`Post-merge cleanup:
  mode: single
  stories:
    - stories/approved/A.yaml
  branches:
    - story/a
  branches:
    - story/b
`),
    /duplicate branches/i,
  );
});

test("validator fails for duplicate, broad-glob, outside, generated, and done paths", async () => {
  const tempRoot = await makeTempRepo({
    id: "INF-201",
    fileName: "INF-201-story.yaml",
  });
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        metadata: {
          branches: [],
          mode: "parent",
          stories: [
            "stories/approved/INF-201-story.yaml",
            "stories/approved/INF-201-story.yaml",
          ],
        },
        repoRoot: tempRoot,
      }),
    /Duplicate story path/,
  );
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/*.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /globs are not allowed/,
  );
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/generated/INF-201-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /must be under stories\/approved/,
  );
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/done/INF-201-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /must be under stories\/approved/,
  );
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        metadata: {
          branches: [],
          mode: "single",
          stories: ["../stories/approved/INF-201-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    /must be under stories\/approved/,
  );
});

test("validator fails closed for story-id mismatch, stale packet, missing packet, and ineligible story", async () => {
  const idMismatchRoot = await makeTempRepo({
    id: "INF-301",
    fileName: "INF-302-other.yaml",
  });
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-302-other.yaml"],
        },
        repoRoot: idMismatchRoot,
      }),
    /id\/path mismatch/,
  );

  const stalePacketRoot = await makeTempRepo({
    id: "INF-303",
    fileName: "INF-303-story.yaml",
    stalePacket: true,
  });
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-303-story.yaml"],
        },
        repoRoot: stalePacketRoot,
      }),
    /stale packet evidence/,
  );

  const missingPacketRoot = await makeTempRepo({
    id: "INF-304",
    fileName: "INF-304-story.yaml",
    writePacket: false,
  });
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-304-story.yaml"],
        },
        repoRoot: missingPacketRoot,
      }),
    /missing packet/,
  );

  const ineligibleStoryRoot = await makeTempRepo({
    id: "INF-305",
    fileName: "INF-305-story.yaml",
    status: "done",
  });
  await assert.rejects(
    () =>
      buildCleanupDryRunPlan({
        metadata: {
          branches: [],
          mode: "single",
          stories: ["stories/approved/INF-305-story.yaml"],
        },
        repoRoot: ineligibleStoryRoot,
      }),
    /must be approved/,
  );
});

test("dry-run output is deterministic and local-only", async () => {
  const tempRoot = await makeTempRepo({
    id: "INF-401",
    fileName: "INF-401-story.yaml",
  });
  const plan = await buildCleanupDryRunPlan({
    metadata: {
      branches: ["story/inf-401"],
      mode: "single",
      stories: ["stories/approved/INF-401-story.yaml"],
    },
    repoRoot: tempRoot,
  });

  assert.equal(plan.localOnly, true);
  assert.match(plan.statement, /Local dry-run only/i);
  assert.equal(
    plan.notAuthorizingUntil,
    "INF-027C-reviewed-pr-evidence-and-merge-state-binding",
  );
  assert.equal(
    JSON.stringify(plan),
    JSON.stringify(
      await buildCleanupDryRunPlan({
        metadata: {
          branches: ["story/inf-401"],
          mode: "single",
          stories: ["stories/approved/INF-401-story.yaml"],
        },
        repoRoot: tempRoot,
      }),
    ),
  );
});

test("package script exposes cleanup dry-run validation behavior", () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  assert.equal(
    packageJson.scripts["cleanup:validate-dry-run"],
    "node --experimental-strip-types tools/post-merge-cleanup.ts",
  );

  const run = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "tools/post-merge-cleanup.ts",
      "--",
      "--mode",
      "single",
      "--story",
      "stories/approved/INF-027B-add-cleanup-metadata-parser-and-validator.yaml",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.localOnly, true);
  assert.equal(output.mode, "single");
});

async function makeTempRepo(options) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "optcg-cleanup-"));
  await mkdir(path.join(tempRoot, "stories", "approved"), { recursive: true });
  await mkdir(path.join(tempRoot, "stories", "done"), { recursive: true });
  await mkdir(path.join(tempRoot, "agent-packets"), { recursive: true });

  const storyPath = path.join(
    tempRoot,
    "stories",
    "approved",
    options.fileName,
  );
  const status = options.status ?? "approved";
  const storySource = renderStoryYaml({
    id: options.id,
    status,
  });

  await writeFile(storyPath, storySource);

  if (options.writePacket !== false) {
    const packetSource = `<!-- agent-packet:story-id ${options.id} -->
<!-- agent-packet:story-path stories/approved/${options.fileName} -->
<!-- agent-packet:story-sha256 ${options.stalePacket ? "bad-hash" : sha256(storySource)} -->

# Story Packet
`;
    await writeFile(
      path.join(tempRoot, "agent-packets", `${options.id}.md`),
      packetSource,
    );
  }

  return tempRoot;
}

function renderStoryYaml(options) {
  return `spec_version: v6
spec_package_name: optcg-md-specs-v6
story_schema_version: 1.0.0
id: ${options.id}
epic_id: KICK-001
title: Fixture story
type: tooling
area: infra
primary_concern: tooling
priority: low
status: ${options.status}
summary: Fixture.
story_boundary: Fixture.
allowed_touch_points:
  - tools/**
spec_refs:
  - 23-repo-tooling-and-enforcement.s010
scope:
  - fixture
non_scope:
  - none
dependencies: []
acceptance_criteria:
  - fixture
required_tests:
  - fixture
repo_rules:
  - fail closed
ambiguity_policy: fail_and_escalate
`;
}
