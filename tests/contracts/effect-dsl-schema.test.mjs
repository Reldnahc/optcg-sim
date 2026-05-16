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
    "fixtures/effect-dsl/valid/cannot-attack-chosen-target-until-end-of-turn.json",
    "fixtures/effect-dsl/valid/cannot-block-until-end-of-turn.json",
    "fixtures/effect-dsl/valid/condition-optionality-composition.json",
    "fixtures/effect-dsl/valid/draw-then-trash-sequence.json",
    "fixtures/effect-dsl/valid/draw-up-to.json",
    "fixtures/effect-dsl/valid/field-object-selected-target-continuous-binding.json",
    "fixtures/effect-dsl/valid/hand-select-play-selected.json",
    "fixtures/effect-dsl/valid/on-play-draw-1.json",
    "fixtures/effect-dsl/valid/optional-return-don-cost-sequence.json",
    "fixtures/effect-dsl/valid/return-don-cost.json",
    "fixtures/effect-dsl/valid/schema-authorability-only-composed-unsupported.json",
    "fixtures/effect-dsl/valid/temporary-modify-power-until-start-next-turn.json",
    "fixtures/effect-dsl/valid/trash-from-hand-effect.json",
    "fixtures/effect-dsl/invalid/condition-empty-and-list.json",
    "fixtures/effect-dsl/invalid/condition-unsupported-opponent-turn.json",
    "fixtures/effect-dsl/invalid/deprecated-alias-color-includes.json",
    "fixtures/effect-dsl/invalid/duration-until-end-of-turn-invalid-whose-turn.json",
    "fixtures/effect-dsl/invalid/duration-until-start-next-turn-missing-player.json",
    "fixtures/effect-dsl/invalid/duration-while-condition-true-unsupported.json",
    "fixtures/effect-dsl/invalid/draw-up-to-negative-count.json",
    "fixtures/effect-dsl/invalid/field-object-hand-zone-reference.json",
    "fixtures/effect-dsl/invalid/field-object-hidden-reference.json",
    "fixtures/effect-dsl/invalid/field-object-unsupported-family.json",
    "fixtures/effect-dsl/invalid/optionality-nonboolean-clauses.json",
    "fixtures/effect-dsl/invalid/optional-cost-segment-uses-effect-optionality.json",
    "fixtures/effect-dsl/invalid/optional-cost-segment-without-optional-cost.json",
    "fixtures/effect-dsl/invalid/optional-cost-top-level-pay-cost-effect.json",
    "fixtures/effect-dsl/invalid/play-selected-arbitrary-reference.json",
    "fixtures/effect-dsl/invalid/play-selected-before-hand-selection-producer.json",
    "fixtures/effect-dsl/invalid/play-selected-missing-hand-selection-producer.json",
    "fixtures/effect-dsl/invalid/play-selected-mismatched-hand-selection-producer.json",
    "fixtures/effect-dsl/invalid/play-selected-top-level-effect.json",
    "fixtures/effect-dsl/invalid/replacement-category-effect-block.json",
    "fixtures/effect-dsl/invalid/restriction-cannot-attack-missing-duration.json",
    "fixtures/effect-dsl/invalid/restriction-selection-target-hand-reference.json",
    "fixtures/effect-dsl/invalid/restriction-selection-target-non-hand-reference.json",
    "fixtures/effect-dsl/invalid/restriction-selection-target-missing-selection.json",
    "fixtures/effect-dsl/invalid/return-don-cost-missing-count.json",
    "fixtures/effect-dsl/invalid/select-cards-ambiguous-chooser-player.json",
    "fixtures/effect-dsl/invalid/select-cards-unsupported-visibility.json",
    "fixtures/effect-dsl/invalid/select-cards-unsupported-zone.json",
    "fixtures/effect-dsl/invalid/trash-from-hand-extra-property.json",
    "fixtures/effect-dsl/invalid/trash-from-hand-invalid-player.json",
    "fixtures/effect-dsl/invalid/trash-from-hand-missing-chooser.json",
    "fixtures/effect-dsl/invalid/trash-from-hand-missing-count.json",
    "fixtures/effect-dsl/invalid/trash-from-hand-missing-player.json",
    "fixtures/effect-dsl/invalid/trash-from-hand-negative-count.json",
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

test("schema-valid composed fixtures stay at contract authorability layer only", async () => {
  const fixturePath = path.join(
    repoRoot,
    "fixtures/effect-dsl/valid/schema-authorability-only-composed-unsupported.json",
  );
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

  assert.equal(fixture.implementationStatus, "unsupported");
  assert.equal(fixture.metadata.generatedBy, undefined);
  assert.equal(fixture.metadata.reviewedBy, undefined);
  assert.equal(fixture.metadata.reviewedAt, undefined);
  assert.equal(fixture.metadata.sourceCardVersion, undefined);
  assert.equal(fixture.metadata.supportStatus, undefined);
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
