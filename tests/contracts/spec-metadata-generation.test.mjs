import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { recursive: true, force: true })),
  );
});

async function makeTempRepoWithSpecs() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "optcg-spec-meta-"));
  tempDirs.push(tempDir);
  const repoDir = path.join(tempDir, "repo");
  const specsDir = path.join(repoDir, "specs");
  const toolsDir = path.join(repoDir, "tools");
  await mkdir(specsDir, { recursive: true });
  await mkdir(toolsDir, { recursive: true });

  await writeFile(
    path.join(toolsDir, "spec-metadata.ts"),
    await readFile(path.join(repoRoot, "tools", "spec-metadata.ts"), "utf8"),
  );

  await writeFile(
    path.join(specsDir, "SPEC_VERSION.md"),
    `---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "SPEC_VERSION"
doc_title: "Specification Version Manifest"
doc_type: "manifest"
status: "canonical"
machine_readable: true
---

# Specification Version Manifest

<!-- SECTION_REF: SPEC_VERSION.s001 -->

Section Ref: \`SPEC_VERSION.s001\`

## Identity

<!-- SECTION_REF: SPEC_VERSION.s002 -->

Section Ref: \`SPEC_VERSION.s002\`

\`\`\`yaml
specVersion: v6
specPackageName: optcg-md-specs-v6
\`\`\`

## Canonical document order

<!-- SECTION_REF: SPEC_VERSION.s005 -->

Section Ref: \`SPEC_VERSION.s005\`

1. \`SPEC_VERSION.md\`
2. \`spec-manifest.json\`
3. \`README.md\`
4. \`00-project-overview.md\`
`,
  );

  await writeFile(
    path.join(specsDir, "README.md"),
    `---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "README"
doc_title: "Spec index"
doc_type: "guide"
status: "canonical"
machine_readable: true
---

# Spec index

<!-- SECTION_REF: README.s001 -->

Section Ref: \`README.s001\`

Readable index doc.
`,
  );

  await writeFile(
    path.join(specsDir, "00-project-overview.md"),
    `---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "00-project-overview"
doc_title: "Project Overview"
doc_type: "spec"
status: "canonical"
machine_readable: true
---

# Project Overview

<!-- SECTION_REF: 00-project-overview.s001 -->

Section Ref: \`00-project-overview.s001\`

Overview body.

## Constraints

<!-- SECTION_REF: 00-project-overview.s002 -->

Section Ref: \`00-project-overview.s002\`

Constraint body.
`,
  );

  await mkdir(path.join(specsDir, "nested"), { recursive: true });
  await writeFile(
    path.join(specsDir, "nested", "z-extra.md"),
    `---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "z-extra"
doc_title: "Nested extra spec doc"
doc_type: "note"
status: "canonical"
machine_readable: true
---

# Nested extra spec doc

<!-- SECTION_REF: z-extra.s001 -->

Section Ref: \`z-extra.s001\`

Nested body.
`,
  );

  return repoDir;
}

function runSpecMetadataTool(repoDir, args) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(repoDir, "tools", "spec-metadata.ts"),
      ...args,
    ],
    {
      cwd: repoDir,
      encoding: "utf8",
    },
  );
}

test("generator emits deterministic manifest and section index", async () => {
  const repoDir = await makeTempRepoWithSpecs();
  const first = runSpecMetadataTool(repoDir, ["generate"]);
  assert.equal(first.status, 0, first.stderr);

  const manifest1 = await readFile(
    path.join(repoDir, "specs", "spec-manifest.json"),
    "utf8",
  );
  const index1 = await readFile(
    path.join(repoDir, "specs", "section-index.json"),
    "utf8",
  );

  const second = runSpecMetadataTool(repoDir, ["generate"]);
  assert.equal(second.status, 0, second.stderr);

  const manifest2 = await readFile(
    path.join(repoDir, "specs", "spec-manifest.json"),
    "utf8",
  );
  const index2 = await readFile(
    path.join(repoDir, "specs", "section-index.json"),
    "utf8",
  );

  assert.equal(manifest1, manifest2);
  assert.equal(index1, index2);

  const manifestJson = JSON.parse(manifest1);
  assert.deepEqual(
    manifestJson.documents.map((doc) => doc.path),
    [
      "SPEC_VERSION.md",
      "README.md",
      "00-project-overview.md",
      "nested/z-extra.md",
    ],
  );

  const sectionIndex = JSON.parse(index1);
  assert.deepEqual(
    sectionIndex.sections.map((entry) => entry.section_ref),
    [
      "SPEC_VERSION.s001",
      "SPEC_VERSION.s002",
      "SPEC_VERSION.s005",
      "README.s001",
      "00-project-overview.s001",
      "00-project-overview.s002",
      "z-extra.s001",
    ],
  );
});

test("generator fails with deterministic diagnostics for duplicate and malformed section refs", async () => {
  const repoDir = await makeTempRepoWithSpecs();
  const badDocPath = path.join(repoDir, "specs", "README.md");
  const source = await readFile(badDocPath, "utf8");

  await writeFile(
    badDocPath,
    source.replace("Section Ref: `README.s001`", "Section Ref: `WRONG-FORMAT`"),
  );

  const malformedResult = runSpecMetadataTool(repoDir, ["generate"]);
  assert.notEqual(malformedResult.status, 0);
  assert.match(malformedResult.stderr, /specs\/README\.md/i);
  assert.match(malformedResult.stderr, /Section Ref companion mismatch/i);
  assert.match(malformedResult.stderr, /WRONG-FORMAT/i);

  await writeFile(
    badDocPath,
    source.replace(
      "Readable index doc.",
      `Readable index doc.

## Duplicate section

<!-- SECTION_REF: README.s001 -->

Section Ref: \`README.s001\`
`,
    ),
  );

  const duplicateResult = runSpecMetadataTool(repoDir, ["generate"]);
  assert.notEqual(duplicateResult.status, 0);
  assert.match(duplicateResult.stderr, /specs\/README\.md/i);
  assert.match(duplicateResult.stderr, /duplicate.*README\.s001/i);
});

test("generator fails when SECTION_REF doc prefix mismatches front matter doc_id", async () => {
  const repoDir = await makeTempRepoWithSpecs();
  const badDocPath = path.join(repoDir, "specs", "README.md");
  const source = await readFile(badDocPath, "utf8");

  await writeFile(badDocPath, source.replace("README.s001", "DIFFERENT.s001"));

  const mismatchResult = runSpecMetadataTool(repoDir, ["generate"]);
  assert.notEqual(mismatchResult.status, 0);
  assert.match(mismatchResult.stderr, /specs\/README\.md/i);
  assert.match(mismatchResult.stderr, /doc prefix DIFFERENT/i);
  assert.match(mismatchResult.stderr, /doc_id README/i);
});

test("generator fails when SECTION_REF suffix is not zero-padded numeric shape", async () => {
  const repoDir = await makeTempRepoWithSpecs();
  const badDocPath = path.join(repoDir, "specs", "README.md");
  const source = await readFile(badDocPath, "utf8");

  await writeFile(badDocPath, source.replaceAll("README.s001", "README.s1"));

  const result = runSpecMetadataTool(repoDir, ["generate"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /specs\/README\.md/i);
  assert.match(result.stderr, /malformed SECTION_REF README\.s1/i);
  assert.match(result.stderr, /<doc_id>\.sNNN/i);
});

test("generator fails when section refs are not adjacent to headings", async () => {
  const repoDir = await makeTempRepoWithSpecs();
  const badDocPath = path.join(repoDir, "specs", "README.md");
  const source = await readFile(badDocPath, "utf8");

  await writeFile(
    badDocPath,
    source.replace(
      "# Spec index\n\n<!-- SECTION_REF: README.s001 -->",
      "# Spec index\n\nIntro text before the section marker.\n\n<!-- SECTION_REF: README.s001 -->",
    ),
  );

  const result = runSpecMetadataTool(repoDir, ["generate"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /specs\/README\.md/i);
  assert.match(result.stderr, /SECTION_REF marker on line/i);
  assert.match(result.stderr, /must immediately follow a heading/i);
});

test("verify mode fails on stale checked-in artifacts with deterministic diagnostics", async () => {
  const repoDir = await makeTempRepoWithSpecs();
  const generated = runSpecMetadataTool(repoDir, ["generate"]);
  assert.equal(generated.status, 0, generated.stderr);

  const manifestPath = path.join(repoDir, "specs", "spec-manifest.json");
  const currentManifest = await readFile(manifestPath, "utf8");
  await writeFile(manifestPath, `${currentManifest}\n`);

  const verify = runSpecMetadataTool(repoDir, ["verify"]);
  assert.notEqual(verify.status, 0);
  assert.match(verify.stderr, /stale generated artifact/i);
  assert.match(verify.stderr, /specs\/spec-manifest\.json/i);
});
