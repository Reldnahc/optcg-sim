import { expect, test } from "vitest";

import type {
  Cardinality,
  CardFilter,
  CardId,
  ExactCardinality,
  CardSelectionRequest,
  Condition,
  Cost,
  Duration,
  Effect,
  EffectBlock,
  EffectCategory,
  EffectDefinition,
  EffectDefinitionMetadata,
  EffectId,
  EffectOption,
  FailurePolicy,
  ReplacementTrigger,
  SearchRequest,
  SelectionSetId,
  SequencedEffect,
  SourcePresencePolicy,
  Target,
  TargetRequest,
  UpToCardinality,
  Trigger,
} from "./index.js";

test("effect support contracts compile with canonical representative values", () => {
  const filter: CardFilter = {
    categories: ["character"],
    colorsAny: ["red"],
    colorsAll: ["red"],
    cost: { op: "lte", value: 5 },
    hasKeywords: ["rush"],
  };

  const targetRequest: TargetRequest = {
    timing: "onActivation",
    chooser: "self",
    zone: "characterArea",
    player: "opponent",
    filter,
    min: 1,
    max: 1,
    allowFewerIfUnavailable: false,
    visibility: "public",
  };
  const target: Target = { type: "choose", request: targetRequest };
  const cost: Cost = {
    type: "trashFromHand",
    count: 1,
    chooser: "self",
    filter,
  };

  const zoneSelection: CardSelectionRequest = {
    timing: "onResolution",
    chooser: "self",
    player: "self",
    zone: "deck",
    min: 0,
    max: 1,
    allowFewerIfUnavailable: true,
  };
  const setSelection: CardSelectionRequest = {
    timing: "onResolution",
    chooser: "self",
    set: "set-1" as SelectionSetId,
    min: 1,
    max: 1,
    allowFewerIfUnavailable: false,
  };
  const exactOne: ExactCardinality<1> = { mode: "exact", min: 1, max: 1 };
  const upToThree: UpToCardinality = { mode: "upTo", min: 0, max: 3 };
  const invalidExactTwo: ExactCardinality<2> = {
    mode: "exact",
    min: 2,
    // @ts-expect-error exact cardinality requires min and max to match.
    max: 1,
  };
  // @ts-expect-error exported general cardinality rejects malformed exact ranges.
  const invalidGeneralExact: Cardinality = {
    mode: "exact",
    min: 1,
    max: 2,
  };

  const duration: Duration = {
    type: "whileConditionTrue",
    condition: { type: "yourTurn" },
  };
  const search: SearchRequest = {
    zone: "deck",
    player: "self",
    filter,
    min: 0,
    max: 1,
    destination: "hand",
    revealTo: "bothPlayers",
    shuffleAfter: true,
  };
  const replacement: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    to: "trash",
    target: { type: "self" },
  };
  const effect: Effect = {
    type: "sequence",
    effects: [
      { connector: "always", effect: { type: "search", request: search } },
      { connector: "ifPreviousSucceeded", effect: { type: "trash", target } },
    ],
  };

  const metadata: EffectDefinitionMetadata = {
    sourceTextHash: "hash",
    rulesVersion: "v6",
    effectDefinitionsVersion: "v1",
    tested: true,
    generatedBy: "manual",
    reviewedBy: "reviewer",
    reviewedAt: "2026-05-03T00:00:00.000Z",
  };
  const block: EffectBlock = {
    id: "effect-1" as EffectId,
    category: "auto",
    trigger: { type: "onPlay" },
    conditionTiming: "activation",
    cost,
    effect,
  };
  const definition: EffectDefinition = {
    cardId: "OP01-001" as CardId,
    implementationStatus: "implemented-dsl",
    effects: [block],
    metadata,
  };

  const failurePolicy: FailurePolicy = "doAsMuchAsPossible";
  const sourcePolicy: SourcePresencePolicy = "mustRemainInSameZone";
  const category: EffectCategory = "activate";
  const trigger: Trigger = { type: "activateMain" };
  const condition: Condition = {
    type: "attachedDonCount",
    target,
    op: "gte",
    value: 1,
  };
  const option: EffectOption = {
    id: "opt-1",
    effect: { type: "draw", count: 1, player: "self" },
  };
  const segment: SequencedEffect = { connector: "then", effect: option.effect };

  const firstEffect = definition.effects[0];
  expect(firstEffect).toBeDefined();
  if (!firstEffect) {
    throw new Error("expected effect block");
  }
  expect(firstEffect.id).toBe("effect-1" as EffectId);
  expect(zoneSelection.zone).toBe("deck");
  expect(setSelection.set).toBe("set-1");
  expect(duration.type).toBe("whileConditionTrue");
  expect(replacement.type).toBe("wouldMoveZone");
  expect(failurePolicy).toBe("doAsMuchAsPossible");
  expect(sourcePolicy).toBe("mustRemainInSameZone");
  expect(category).toBe("activate");
  expect(trigger.type).toBe("activateMain");
  expect(condition.type).toBe("attachedDonCount");
  expect(segment.connector).toBe("then");
  expect(exactOne.max).toBe(1);
  expect(upToThree.mode).toBe("upTo");
  void invalidExactTwo;
  void invalidGeneralExact;
});

test("replacement effect contract supports reviewed would-be-KOd self draw shape", () => {
  const replacement: ReplacementTrigger = {
    type: "wouldBeKOd",
    target: { type: "self" },
  };
  const effect: Effect = {
    type: "replacement",
    when: replacement,
    instead: { type: "draw", count: 1, player: "self" },
  };
  const block: EffectBlock = {
    id: "replacement-1" as EffectId,
    category: "replacement",
    trigger: { type: "replacement", replacement },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect,
  };
  const definition: EffectDefinition = {
    cardId: "OP01-002" as CardId,
    implementationStatus: "implemented-dsl",
    effects: [block],
    metadata: {
      sourceTextHash: "hash",
      rulesVersion: "v6",
      effectDefinitionsVersion: "v1",
      tested: true,
      reviewedBy: "reviewer",
      reviewedAt: "2026-05-11T00:00:00.000Z",
    },
  };

  expect(definition.effects[0]?.category).toBe("replacement");
  expect(effect.when.type).toBe("wouldBeKOd");
});

test("deprecated CardFilter aliases are rejected by canonical contract", () => {
  // @ts-expect-error deprecated alias
  const cardIdAlias: CardFilter = { cardId: "OP01-001" };
  // @ts-expect-error deprecated alias
  const cardNameAlias: CardFilter = { cardName: "Luffy" };
  // @ts-expect-error deprecated alias
  const cardNameContainsAlias: CardFilter = { cardNameContains: "Luf" };
  // @ts-expect-error deprecated alias
  const cardNameNotAlias: CardFilter = { cardNameNot: ["Luffy"] };
  // @ts-expect-error deprecated alias
  const categoryAlias: CardFilter = { category: "character" };
  // @ts-expect-error deprecated alias
  const colorAlias: CardFilter = { color: "red" };
  // @ts-expect-error deprecated alias
  const colorIncludesAlias: CardFilter = { colorIncludes: ["red"] };
  // @ts-expect-error deprecated alias
  const typeAlias: CardFilter = { type: "Straw Hat" };
  // @ts-expect-error deprecated alias
  const typeIncludesAlias: CardFilter = { typeIncludes: ["Straw Hat"] };
  // @ts-expect-error deprecated alias
  const typeIncludesAnyAlias: CardFilter = { typeIncludesAny: ["Straw Hat"] };
  // @ts-expect-error deprecated alias
  const attributeAlias: CardFilter = { attribute: "strike" };
  // @ts-expect-error deprecated alias
  const costOpAlias: CardFilter = { costOp: "gte" };
  // @ts-expect-error deprecated alias
  const costValueAlias: CardFilter = { costValue: 3 };
  // @ts-expect-error deprecated alias
  const powerOpAlias: CardFilter = { powerOp: "gte" };
  // @ts-expect-error deprecated alias
  const powerValueAlias: CardFilter = { powerValue: 5000 };
  // @ts-expect-error deprecated alias
  const hasKeywordAlias: CardFilter = { hasKeyword: "rush" };
  // @ts-expect-error deprecated alias
  const lacksKeywordAlias: CardFilter = { lacksKeyword: "blocker" };

  void cardIdAlias;
  void cardNameAlias;
  void cardNameContainsAlias;
  void cardNameNotAlias;
  void categoryAlias;
  void colorAlias;
  void colorIncludesAlias;
  void typeAlias;
  void typeIncludesAlias;
  void typeIncludesAnyAlias;
  void attributeAlias;
  void costOpAlias;
  void costValueAlias;
  void powerOpAlias;
  void powerValueAlias;
  void hasKeywordAlias;
  void lacksKeywordAlias;
});
