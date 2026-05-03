import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

test("effect DSL validation assets exist", async () => {
  const requiredPaths = [
    "contracts/effect-dsl.schema.json",
    "fixtures/effect-dsl/valid/canonical-policy-enums.json",
    "fixtures/effect-dsl/valid/on-play-draw-1.json",
    "fixtures/effect-dsl/invalid/deprecated-alias-color-includes.json",
  ];

  for (const relativePath of requiredPaths) {
    await access(path.join(repoRoot, relativePath));
  }
});

test("effect block policy enums match canonical contract names", async () => {
  const schemaPath = path.join(repoRoot, "contracts/effect-dsl.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const effectBlockProperties = schema.$defs.effectBlock.properties;

  assert.deepEqual(effectBlockProperties.failurePolicy.enum, [
    "doAsMuchAsPossible",
    "requiresAll",
    "skipIfNoLegalTarget",
    "optionalIfPossible",
  ]);
  assert.deepEqual(effectBlockProperties.sourcePresencePolicy.enum, [
    "mustRemainInSameZone",
    "resolveFromDestinationZone",
    "resolveFromLastKnownInformation",
    "noSourceRequired",
  ]);
});

test("contracts:validate-effects passes on committed fixtures", () => {
  const command = process.platform === "win32" ? "cmd.exe" : "corepack";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "corepack pnpm run contracts:validate-effects"]
      : ["pnpm", "run", "contracts:validate-effects"];
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `expected contracts:validate-effects to pass\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}\nerror:\n${result.error?.message ?? ""}`,
  );
});
