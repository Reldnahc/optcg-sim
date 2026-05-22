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
    "fixtures/effect-dsl/valid/don-field-count-self-lte.json",
    "fixtures/effect-dsl/valid/don-field-count-opponent-eq.json",
    "fixtures/effect-dsl/valid/don-field-count-self-gte.json",
    "fixtures/effect-dsl/valid/field-object-selected-target-continuous-binding.json",
    "fixtures/effect-dsl/valid/hand-select-play-selected.json",
    "fixtures/effect-dsl/valid/leader-color-count-condition.json",
    "fixtures/effect-dsl/valid/leader-type-attribute-has-card-in-zone.json",
    "fixtures/effect-dsl/valid/on-play-draw-1.json",
    "fixtures/effect-dsl/valid/optional-return-don-cost-sequence.json",
    "fixtures/effect-dsl/valid/optional-choose-one-trash-cost-sequence.json",
    "fixtures/effect-dsl/valid/optional-trash-from-hand-cost-sequence.json",
    "fixtures/effect-dsl/valid/permanent-trash-count-keyword-protection-sequence.json",
    "fixtures/effect-dsl/valid/return-don-cost.json",
    "fixtures/effect-dsl/valid/schema-authorability-only-composed-unsupported.json",
    "fixtures/effect-dsl/valid/scoped-set-base-power-permanent.json",
    "fixtures/effect-dsl/valid/scoped-set-base-power-permanent-no-filter.json",
    "fixtures/effect-dsl/valid/start-of-game-stage-search-play-selected.json",
    "fixtures/effect-dsl/valid/scoped-top-n-search-chooser-only-any-card.json",
    "fixtures/effect-dsl/valid/scoped-top-n-search-public-filtered.json",
    "fixtures/effect-dsl/valid/temporary-modify-power-until-start-next-turn.json",
    "fixtures/effect-dsl/valid/trash-from-hand-effect.json",
    "fixtures/effect-dsl/invalid/condition-empty-and-list.json",
    "fixtures/effect-dsl/invalid/condition-unsupported-opponent-turn.json",
    "fixtures/effect-dsl/invalid/deprecated-alias-color-includes.json",
    "fixtures/effect-dsl/invalid/duration-until-end-of-turn-invalid-whose-turn.json",
    "fixtures/effect-dsl/invalid/duration-until-start-next-turn-missing-player.json",
    "fixtures/effect-dsl/invalid/duration-while-condition-true-unsupported.json",
    "fixtures/effect-dsl/invalid/draw-up-to-negative-count.json",
    "fixtures/effect-dsl/invalid/don-field-count-bad-comparator.json",
    "fixtures/effect-dsl/invalid/don-field-count-negative-value.json",
    "fixtures/effect-dsl/invalid/don-field-count-unsupported-player-scope.json",
    "fixtures/effect-dsl/invalid/don-field-count-custom-shortcut.json",
    "fixtures/effect-dsl/invalid/give-keyword-missing-duration.json",
    "fixtures/effect-dsl/invalid/give-protection-invalid-controller-owned-exclusion.json",
    "fixtures/effect-dsl/invalid/give-protection-unsupported-family.json",
    "fixtures/effect-dsl/invalid/field-object-hand-zone-reference.json",
    "fixtures/effect-dsl/invalid/field-object-hidden-reference.json",
    "fixtures/effect-dsl/invalid/field-object-selected-target-producer-must-be-select-targets.json",
    "fixtures/effect-dsl/invalid/field-object-selected-target-unrelated-producer-mismatch.json",
    "fixtures/effect-dsl/invalid/field-object-unsupported-family.json",
    "fixtures/effect-dsl/invalid/leader-color-count-bad-comparator.json",
    "fixtures/effect-dsl/invalid/leader-color-count-bad-player.json",
    "fixtures/effect-dsl/invalid/leader-color-count-negative-value.json",
    "fixtures/effect-dsl/invalid/leader-color-count-unsafe-integer.json",
    "fixtures/effect-dsl/invalid/leader-has-card-in-zone-missing-metadata-filter.json",
    "fixtures/effect-dsl/invalid/leader-has-card-in-zone-nonleader-category.json",
    "fixtures/effect-dsl/invalid/leader-has-card-in-zone-private-zone.json",
    "fixtures/effect-dsl/invalid/leader-metadata-unsupported-predicate.json",
    "fixtures/effect-dsl/invalid/optionality-nonboolean-clauses.json",
    "fixtures/effect-dsl/invalid/optional-cost-segment-uses-effect-optionality.json",
    "fixtures/effect-dsl/invalid/optional-cost-segment-without-optional-cost.json",
    "fixtures/effect-dsl/invalid/optional-cost-top-level-pay-cost-effect.json",
    "fixtures/effect-dsl/invalid/optional-choose-one-trash-cost-empty-options.json",
    "fixtures/effect-dsl/invalid/optional-choose-one-trash-cost-field-arbitrary-filter.json",
    "fixtures/effect-dsl/invalid/optional-choose-one-trash-cost-field-extra-zone.json",
    "fixtures/effect-dsl/invalid/optional-choose-one-trash-cost-field-missing-types-any.json",
    "fixtures/effect-dsl/invalid/optional-choose-one-trash-cost-field-non-character.json",
    "fixtures/effect-dsl/invalid/optional-choose-one-trash-cost-field-opponent.json",
    "fixtures/effect-dsl/invalid/optional-choose-one-trash-cost-missing-optional.json",
    "fixtures/effect-dsl/invalid/optional-choose-one-trash-cost-top-level-pay-cost.json",
    "fixtures/effect-dsl/invalid/optional-choose-one-trash-cost-unsupported-alternative.json",
    "fixtures/effect-dsl/invalid/optional-trash-from-hand-cost-missing-chooser.json",
    "fixtures/effect-dsl/invalid/optional-trash-from-hand-cost-missing-optional.json",
    "fixtures/effect-dsl/invalid/optional-trash-from-hand-cost-optional-false.json",
    "fixtures/effect-dsl/invalid/optional-trash-from-hand-cost-zero-count.json",
    "fixtures/effect-dsl/invalid/play-selected-arbitrary-reference.json",
    "fixtures/effect-dsl/invalid/play-selected-before-hand-selection-producer.json",
    "fixtures/effect-dsl/invalid/play-selected-missing-hand-selection-producer.json",
    "fixtures/effect-dsl/invalid/play-selected-mismatched-hand-selection-producer.json",
    "fixtures/effect-dsl/invalid/play-selected-top-level-effect.json",
    "fixtures/effect-dsl/invalid/permanent-condition-unsupported-shape.json",
    "fixtures/effect-dsl/invalid/replacement-category-effect-block.json",
    "fixtures/effect-dsl/invalid/restriction-cannot-attack-missing-duration.json",
    "fixtures/effect-dsl/invalid/restriction-selection-target-hand-reference.json",
    "fixtures/effect-dsl/invalid/restriction-selection-target-non-hand-reference.json",
    "fixtures/effect-dsl/invalid/restriction-selection-target-missing-selection.json",
    "fixtures/effect-dsl/invalid/return-don-cost-missing-count.json",
    "fixtures/effect-dsl/invalid/trash-count-condition-negative-value.json",
    "fixtures/effect-dsl/invalid/select-cards-ambiguous-chooser-player.json",
    "fixtures/effect-dsl/invalid/select-cards-unsupported-visibility.json",
    "fixtures/effect-dsl/invalid/select-cards-unsupported-zone.json",
    "fixtures/effect-dsl/invalid/standalone-choose-one-cost.json",
    "fixtures/effect-dsl/invalid/standalone-trash-from-field-cost.json",
    "fixtures/effect-dsl/invalid/set-base-power-malformed-target.json",
    "fixtures/effect-dsl/invalid/set-base-power-fractional-value.json",
    "fixtures/effect-dsl/invalid/set-base-power-non-character-target.json",
    "fixtures/effect-dsl/invalid/set-base-power-nonnumeric-value.json",
    "fixtures/effect-dsl/invalid/set-base-power-unsupported-duration-while-condition-true.json",
    "fixtures/effect-dsl/invalid/set-base-power-unsupported-filter-composition.json",
    "fixtures/effect-dsl/invalid/start-of-game-stage-play-selected-mismatched-selection.json",
    "fixtures/effect-dsl/invalid/start-of-game-stage-search-non-stage-filter.json",
    "fixtures/effect-dsl/invalid/start-of-game-stage-search-wrong-destination.json",
    "fixtures/effect-dsl/invalid/top-n-search-chooser-only-nonempty-filter.json",
    "fixtures/effect-dsl/invalid/top-n-search-look-count-zero.json",
    "fixtures/effect-dsl/invalid/top-n-search-public-empty-filter.json",
    "fixtures/effect-dsl/invalid/top-n-search-remainder-destination-trash.json",
    "fixtures/effect-dsl/invalid/top-n-search-remainder-order-random.json",
    "fixtures/effect-dsl/invalid/top-n-search-remainder-position-top.json",
    "fixtures/effect-dsl/invalid/top-n-search-reveal-owner-only.json",
    "fixtures/effect-dsl/invalid/top-n-search-shuffle-after.json",
    "fixtures/effect-dsl/invalid/top-n-search-shuffle-after-missing.json",
    "fixtures/effect-dsl/invalid/top-n-search-unsupported-destination-trash.json",
    "fixtures/effect-dsl/invalid/top-n-search-unsupported-filter-cost.json",
    "fixtures/effect-dsl/invalid/top-n-search-unsupported-max-two.json",
    "fixtures/effect-dsl/invalid/top-n-search-unsupported-player-opponent.json",
    "fixtures/effect-dsl/invalid/top-n-search-unsupported-zone-trash.json",
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

test("SUP-002I scoped top-N search fixtures remain schema-authorability-only", async () => {
  const fixturePaths = [
    "fixtures/effect-dsl/valid/scoped-top-n-search-public-filtered.json",
    "fixtures/effect-dsl/valid/scoped-top-n-search-chooser-only-any-card.json",
  ];

  for (const relativePath of fixturePaths) {
    const fixture = JSON.parse(
      await readFile(path.join(repoRoot, relativePath), "utf8"),
    );
    assert.equal(fixture.implementationStatus, "unsupported");
    assert.equal(fixture.metadata.generatedBy, undefined);
    assert.equal(fixture.metadata.reviewedBy, undefined);
    assert.equal(fixture.metadata.reviewedAt, undefined);
    assert.equal(fixture.metadata.sourceCardVersion, undefined);
    assert.equal(fixture.metadata.supportStatus, undefined);
  }
});

test("SUP-002I schema authorizes only scoped top-N deck search request variants", async () => {
  const schemaPath = path.join(repoRoot, "contracts/effect-dsl.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const searchEffect = schema.$defs.effect.oneOf.find(
    (variant) => variant?.properties?.type?.const === "search",
  );

  assert.ok(searchEffect);
  assert.deepEqual(searchEffect.required, ["type", "request"]);
  assert.equal(
    searchEffect.properties.request.$ref,
    "#/$defs/scopedTopNSearchRequest",
  );

  const request = schema.$defs.scopedTopNSearchRequest;
  const handDestinationVariants = request.oneOf.filter(
    (variant) => variant.properties.destination?.const === "hand",
  );
  assert.deepEqual(
    handDestinationVariants.map((variant) => variant.properties.revealTo),
    [{ const: "bothPlayers" }, { const: "chooserOnly" }],
  );

  for (const variant of handDestinationVariants) {
    assert.equal(variant.additionalProperties, false);
    assert.deepEqual(variant.required, [
      "zone",
      "player",
      "lookCount",
      "filter",
      "min",
      "max",
      "destination",
      "revealTo",
      "remainingCards",
      "shuffleAfter",
    ]);
    assert.deepEqual(variant.properties.zone, { const: "deck" });
    assert.deepEqual(variant.properties.player, { const: "self" });
    assert.deepEqual(variant.properties.lookCount, {
      type: "integer",
      minimum: 1,
    });
    assert.deepEqual(variant.properties.min, { const: 0 });
    assert.deepEqual(variant.properties.max, { const: 1 });
    assert.deepEqual(variant.properties.destination, { const: "hand" });
    assert.equal(
      variant.properties.remainingCards.$ref,
      "#/$defs/scopedTopNSearchRemainingCards",
    );
    assert.deepEqual(variant.properties.shuffleAfter, { const: false });
  }

  assert.deepEqual(schema.$defs.scopedTopNSearchRemainingCards, {
    type: "object",
    additionalProperties: false,
    required: ["destination", "position", "order"],
    properties: {
      destination: { const: "deck" },
      position: { const: "bottom" },
      order: { const: "ownerChoice" },
    },
  });
  assert.equal(
    schema.$defs.scopedTopNSearchPublicFilter.additionalProperties,
    false,
  );
  assert.equal(schema.$defs.scopedTopNSearchPublicFilter.minProperties, 1);
  assert.deepEqual(
    Object.keys(schema.$defs.scopedTopNSearchPublicFilter.properties),
    ["categories", "colorsAny", "typesAny", "nameNot"],
  );
  assert.deepEqual(schema.$defs.scopedTopNSearchChooserOnlyFilter, {
    type: "object",
    additionalProperties: false,
    maxProperties: 0,
  });
});

test("SUP-003J schema authorizes only scoped start-of-game stage search request and selected:start-of-game playSelected", async () => {
  const schemaPath = path.join(repoRoot, "contracts/effect-dsl.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const request = schema.$defs.scopedTopNSearchRequest;

  const startOfGameVariant = request.oneOf.find(
    (variant) => variant?.properties?.destination?.const === "stageArea",
  );
  assert.ok(startOfGameVariant);
  assert.deepEqual(startOfGameVariant.required, [
    "zone",
    "player",
    "filter",
    "min",
    "max",
    "destination",
    "revealTo",
    "shuffleAfter",
  ]);
  assert.deepEqual(startOfGameVariant.properties.zone, { const: "deck" });
  assert.deepEqual(startOfGameVariant.properties.player, { const: "self" });
  assert.deepEqual(startOfGameVariant.properties.min, { const: 0 });
  assert.deepEqual(startOfGameVariant.properties.max, { const: 1 });
  assert.deepEqual(startOfGameVariant.properties.destination, {
    const: "stageArea",
  });
  assert.deepEqual(startOfGameVariant.properties.revealTo, {
    const: "chooserOnly",
  });
  assert.deepEqual(startOfGameVariant.properties.shuffleAfter, {
    const: false,
  });
  assert.equal(startOfGameVariant.properties.lookCount, undefined);
  assert.equal(startOfGameVariant.properties.remainingCards, undefined);
  assert.equal(
    startOfGameVariant.properties.filter.$ref,
    "#/$defs/scopedStartOfGameStageSearchFilter",
  );

  assert.deepEqual(schema.$defs.scopedStartOfGameStageSearchFilter, {
    type: "object",
    additionalProperties: false,
    required: ["categories", "typesAny"],
    properties: {
      categories: {
        type: "array",
        prefixItems: [{ const: "stage" }],
        items: false,
        minItems: 1,
        maxItems: 1,
      },
      typesAny: {
        type: "array",
        items: { type: "string", minLength: 1 },
        minItems: 1,
      },
    },
  });

  const playSelected = schema.$defs.effect.oneOf.find(
    (variant) => variant?.properties?.type?.const === "playSelected",
  );
  assert.ok(playSelected);
  assert.deepEqual(playSelected.properties.selection, {
    anyOf: [
      { $ref: "#/$defs/handSelectionId" },
      { const: "selected:start-of-game" },
    ],
  });
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

test("SUP-002H scoped setBasePower fixtures remain schema-authorability-only", async () => {
  const fixturePaths = [
    "fixtures/effect-dsl/valid/scoped-set-base-power-permanent.json",
    "fixtures/effect-dsl/valid/scoped-set-base-power-permanent-no-filter.json",
  ];

  for (const relativePath of fixturePaths) {
    const fixture = JSON.parse(
      await readFile(path.join(repoRoot, relativePath), "utf8"),
    );
    assert.equal(fixture.implementationStatus, "unsupported");
    assert.equal(fixture.metadata.generatedBy, undefined);
    assert.equal(fixture.metadata.reviewedBy, undefined);
    assert.equal(fixture.metadata.reviewedAt, undefined);
    assert.equal(fixture.metadata.sourceCardVersion, undefined);
    assert.equal(fixture.metadata.supportStatus, undefined);
  }
});

test("SUP-002H setBasePower schema authorizes only all self character targets with optional typesAny", async () => {
  const schemaPath = path.join(repoRoot, "contracts/effect-dsl.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const setBasePowerEffect = schema.$defs.effect.oneOf.find(
    (variant) => variant?.properties?.type?.const === "setBasePower",
  );

  assert.ok(setBasePowerEffect);
  assert.deepEqual(setBasePowerEffect.required, [
    "type",
    "target",
    "value",
    "duration",
  ]);
  assert.equal(setBasePowerEffect.properties.value.type, "integer");
  assert.deepEqual(setBasePowerEffect.properties.duration, {
    const: { type: "permanent" },
  });

  const targetRef = setBasePowerEffect.properties.target.$ref;
  assert.equal(targetRef, "#/$defs/scopedSetBasePowerTarget");

  const targetSchema = schema.$defs.scopedSetBasePowerTarget;
  const targetProperties = targetSchema.properties;
  assert.deepEqual(targetProperties.type, { const: "all" });
  assert.deepEqual(targetProperties.zone, { const: "characterArea" });
  assert.deepEqual(targetProperties.player, { const: "self" });

  assert.deepEqual(targetProperties.filter, {
    $ref: "#/$defs/scopedSetBasePowerFilter",
  });
  const filter = schema.$defs.scopedSetBasePowerFilter;
  assert.deepEqual(filter.required, ["typesAny"]);
  assert.deepEqual(Object.keys(filter.properties), ["typesAny"]);
});

test("TYP-012B schema-valid permanent protection fixture remains authorability-only", async () => {
  const fixturePath = path.join(
    repoRoot,
    "fixtures/effect-dsl/valid/permanent-trash-count-keyword-protection-sequence.json",
  );
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

  assert.equal(fixture.implementationStatus, "unsupported");
  assert.equal(fixture.metadata.generatedBy, undefined);
  assert.equal(fixture.metadata.reviewedBy, undefined);
  assert.equal(fixture.metadata.reviewedAt, undefined);
  assert.equal(fixture.metadata.sourceCardVersion, undefined);
  assert.equal(fixture.metadata.supportStatus, undefined);
});

test("SUP-001A DON fieldCount fixtures remain schema-authorability-only", async () => {
  const fixturePaths = [
    "fixtures/effect-dsl/valid/don-field-count-self-lte.json",
    "fixtures/effect-dsl/valid/don-field-count-opponent-eq.json",
    "fixtures/effect-dsl/valid/don-field-count-self-gte.json",
  ];

  for (const relativePath of fixturePaths) {
    const fixture = JSON.parse(
      await readFile(path.join(repoRoot, relativePath), "utf8"),
    );
    assert.equal(fixture.implementationStatus, "unsupported");
    assert.equal(fixture.metadata.generatedBy, undefined);
    assert.equal(fixture.metadata.reviewedBy, undefined);
    assert.equal(fixture.metadata.reviewedAt, undefined);
    assert.equal(fixture.metadata.sourceCardVersion, undefined);
    assert.equal(fixture.metadata.supportStatus, undefined);
  }
});

test("SUP-001A keeps DON field count on existing fieldCount condition", async () => {
  const schemaPath = path.join(repoRoot, "contracts/effect-dsl.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const conditionVariants = schema.$defs.condition.oneOf;
  const conditionTypes = conditionVariants
    .map((variant) => variant?.properties?.type?.const)
    .filter((value) => typeof value === "string");

  assert.ok(conditionTypes.includes("fieldCount"));
  assert.ok(!conditionTypes.includes("donFieldCount"));
  assert.ok(!conditionTypes.includes("donOnFieldCount"));
});

test("SUP-002A authorizes optional trashFromHand only as an OptionalCost", async () => {
  const schemaPath = path.join(repoRoot, "contracts/effect-dsl.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const optionalCostTypes = schema.$defs.optionalCost.oneOf
    .map((variant) => variant?.properties?.type?.const)
    .filter((value) => typeof value === "string");
  const nonOptionalCostTypes = schema.$defs.cost.oneOf
    .map((variant) => variant?.properties?.type?.const)
    .filter((value) => typeof value === "string");
  const optionalHandTrashCost = schema.$defs.optionalCost.oneOf.find(
    (variant) => variant?.properties?.type?.const === "trashFromHand",
  );

  assert.ok(optionalCostTypes.includes("trashFromHand"));
  assert.ok(!nonOptionalCostTypes.includes("trashFromHand"));
  assert.equal(optionalHandTrashCost?.required.includes("chooser"), true);
  assert.equal(optionalHandTrashCost?.properties?.count?.minimum, 1);
  assert.deepEqual(optionalHandTrashCost?.properties?.optional, {
    const: true,
  });
});

test("SUP-003A authorizes scoped optional choose-one trash costs only as an OptionalCost", async () => {
  const schemaPath = path.join(repoRoot, "contracts/effect-dsl.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const optionalCostTypes = schema.$defs.optionalCost.oneOf
    .map((variant) => variant?.properties?.type?.const)
    .filter((value) => typeof value === "string");
  const nonOptionalCostTypes = schema.$defs.cost.oneOf
    .map((variant) => variant?.properties?.type?.const)
    .filter((value) => typeof value === "string");
  const optionalChooseOneCost = schema.$defs.optionalCost.oneOf.find(
    (variant) => variant?.properties?.type?.const === "chooseOne",
  );

  assert.ok(optionalCostTypes.includes("chooseOne"));
  assert.ok(!nonOptionalCostTypes.includes("chooseOne"));
  assert.ok(!nonOptionalCostTypes.includes("trashFromField"));
  assert.deepEqual(optionalChooseOneCost?.required, [
    "type",
    "options",
    "optional",
  ]);
  assert.deepEqual(optionalChooseOneCost?.properties?.optional, {
    const: true,
  });
  assert.equal(optionalChooseOneCost?.properties?.options?.minItems, 1);
  assert.equal(
    optionalChooseOneCost?.properties?.options?.items?.$ref,
    "#/$defs/scopedOptionalChooseOneTrashCostAlternative",
  );

  const fieldTrash =
    schema.$defs.scopedOptionalChooseOneTrashCostAlternative.oneOf.find(
      (variant) => variant?.properties?.type?.const === "trashFromField",
    );
  assert.ok(fieldTrash);
  assert.deepEqual(fieldTrash.required, [
    "type",
    "count",
    "chooser",
    "filter",
    "optional",
  ]);
  assert.equal(fieldTrash.properties.count.minimum, 1);
  assert.deepEqual(fieldTrash.properties.chooser, { const: "self" });
  assert.deepEqual(fieldTrash.properties.optional, { const: true });
  assert.equal(
    fieldTrash.properties.filter.$ref,
    "#/$defs/scopedOptionalFieldTrashCostFilter",
  );
  assert.deepEqual(schema.$defs.scopedOptionalFieldTrashCostFilter, {
    type: "object",
    additionalProperties: false,
    required: ["categories", "typesAny"],
    properties: {
      categories: {
        type: "array",
        prefixItems: [{ const: "character" }],
        items: false,
        minItems: 1,
        maxItems: 1,
      },
      typesAny: {
        type: "array",
        items: { type: "string", minLength: 1 },
        minItems: 1,
      },
    },
  });
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
