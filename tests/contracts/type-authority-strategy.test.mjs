import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const typeAuthorityDocPath = path.join(
  repoRoot,
  "docs",
  "contracts",
  "type-authority.md",
);

function normalizeText(value) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");
}

test("type authority strategy doc exists and names the selected model", async () => {
  const doc = normalizeText(await readFile(typeAuthorityDocPath, "utf8"));

  assert.ok(
    doc.includes("`contracts/canonical-types.ts`"),
    "doc must identify contracts/canonical-types.ts as canonical authority",
  );
  assert.ok(
    doc.includes("`contracts/types/*`"),
    "doc must identify contracts/types/* as canonical authority",
  );
  assert.ok(
    doc.includes(
      "Selected model: checked-in package type files generated/synced from canonical contract modules.",
    ),
    "doc must select the checked-in generated/synced package-file strategy",
  );
  assert.ok(
    doc.includes(
      "Contract shape changes require edits in canonical contract modules under separate approved authority, not one-sided package patches.",
    ),
    "doc must require canonical contract edits for shape changes",
  );

  assert.ok(
    doc.includes(
      "Only canonical projection modules are generated/synced output in this strategy:",
    ),
    "doc must scope generated ownership to canonical projection modules",
  );
  assert.ok(
    !doc.includes(
      "`packages/types/src/*` is generated/synced output ownership territory for this authority strategy.",
    ),
    "doc must not claim all packages/types/src/* files are generated outputs",
  );
  assert.ok(
    doc.includes(
      "Tests, manifests, and support files under `packages/types/src` are not generated canonical projections unless a later explicit change includes them",
    ),
    "doc must explicitly exclude tests/manifests/support files from generated canonical projections",
  );
});

test("type authority strategy doc captures current package boundary constraints", async () => {
  const doc = normalizeText(await readFile(typeAuthorityDocPath, "utf8"));
  const packageJson = JSON.parse(
    await readFile(
      path.join(repoRoot, "packages", "types", "package.json"),
      "utf8",
    ),
  );
  const tsconfig = JSON.parse(
    await readFile(
      path.join(repoRoot, "packages", "types", "tsconfig.json"),
      "utf8",
    ),
  );

  const declaredTypesEntry = packageJson.types;
  const declaredExportTypesEntry = packageJson.exports?.["."]?.types;
  const declaredRootDir = tsconfig.compilerOptions?.rootDir;
  const declaredInclude = tsconfig.include;

  assert.equal(declaredTypesEntry, "./src/index.ts");
  assert.equal(declaredExportTypesEntry, "./src/index.ts");
  assert.equal(declaredRootDir, "src");
  assert.deepEqual(declaredInclude, ["src/**/*.ts"]);

  const expectedTypesLine = `- \`types\`: \`${declaredTypesEntry}\``;
  const expectedExportTypesLine = `- \`.\` export \`types\`: \`${declaredExportTypesEntry}\``;
  const expectedRootDirLine = `- \`rootDir\`: \`${declaredRootDir}\``;
  const expectedIncludeLine = `- \`include\`: \`${JSON.stringify(declaredInclude)}\``;

  assert.ok(
    doc.includes(expectedTypesLine),
    `doc must contain exact package.json types fact: ${expectedTypesLine}`,
  );
  assert.ok(
    doc.includes(expectedExportTypesLine),
    `doc must contain exact package.json export types fact: ${expectedExportTypesLine}`,
  );
  assert.ok(
    doc.includes(expectedRootDirLine),
    `doc must contain exact tsconfig rootDir fact: ${expectedRootDirLine}`,
  );
  assert.ok(
    doc.includes(expectedIncludeLine),
    `doc must contain exact tsconfig include fact: ${expectedIncludeLine}`,
  );
  assert.ok(
    doc.includes(
      "direct re-export from `contracts/*` into the `@optcg/types` package would require broad package-boundary changes",
    ),
    "doc must justify why direct re-export is not selected under current constraints",
  );
});

test("type authority strategy doc maps the current canonical module set to canonical projections", async () => {
  const doc = normalizeText(await readFile(typeAuthorityDocPath, "utf8"));
  const canonicalModuleNames = (
    await readdir(path.join(repoRoot, "contracts", "types"))
  )
    .filter((fileName) => fileName.endsWith(".ts"))
    .sort();

  for (const fileName of canonicalModuleNames) {
    const expectedMappingLine = `- \`contracts/types/${fileName}\` -> \`packages/types/src/${fileName}\``;
    assert.ok(
      doc.includes(expectedMappingLine),
      `doc must include canonical mapping line: ${expectedMappingLine}`,
    );
  }

  assert.ok(
    doc.includes(
      "- `contracts/canonical-types.ts` -> `packages/types/src/index.ts` export surface alignment",
    ),
    "doc must map canonical barrel authority to package index surface",
  );
});
