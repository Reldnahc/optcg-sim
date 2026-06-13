import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  EffectDslFieldRemovalProtection,
} from "@optcg/types";

import { computeView } from "../../view/compute-view.js";
import {
  deriveImplementedDslHandContinuousEffects,
  deriveImplementedDslPermanentContinuousEffects,
  isSupportedPermanentContinuousEffectBlock,
  isSupportedContinuousQueueEffect,
} from "./continuous.js";
import {
  battleRef,
  continuousPowerEffectRecord,
  createState,
  must,
  p1,
  p2,
  resolvedCard,
  setMainTurnAfterFirstTurn,
  toCardId,
  withCharacter,
} from "./continuous-test-helpers.js";

test("cannotAttack restriction on self prevents attacker legal targets", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  setMainTurnAfterFirstTurn(state);
  p1State.characters = [withCharacter(p1, toCardId("char-rush"), 0)];
  p2State.characters = [
    withCharacter(p2, toCardId("char-vanilla"), 0, { state: "rested" }),
  ];
  const attacker = must(p1State.characters[0], "attacker");
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state, { source: attacker }),
      id: "restrict-attack-self",
      modifier: {
        layer: "restriction",
        target: { type: "self" },
        operation: { type: "restriction", restriction: "cannotAttack" },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const view = computeView(state);
  assert.deepEqual(view.legalAttackTargets[attacker.instanceId], []);
});

test("cannotBlock all-opponent-character restriction disables blocker", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  setMainTurnAfterFirstTurn(state);
  p2State.characters = [withCharacter(p2, toCardId("char-blocker"), 0)];
  state.battle = {
    attacker: battleRef(p1State.leader),
    originalTarget: battleRef(p2State.leader),
    currentTarget: battleRef(p2State.leader),
    step: "block",
    damageCount: 1,
  };
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state),
      id: "restrict-block-all",
      modifier: {
        layer: "restriction",
        target: { type: "all", zone: "characterArea", player: "opponent" },
        operation: { type: "restriction", restriction: "cannotBlock" },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const blocker = must(p2State.characters[0], "blocker");
  const view = computeView(state);
  assert.equal(view.cards[blocker.instanceId]?.canBlock, false);
});

test("cannotBlock all-opponent-character restriction supports current power filter", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  setMainTurnAfterFirstTurn(state);
  p2State.characters = [
    withCharacter(p2, toCardId("char-blocker"), 0),
    withCharacter(p2, toCardId("char-blocker"), 1),
  ];
  const lowPowerBlocker = must(p2State.characters[0], "low power blocker");
  const printedPowerBlocker = must(
    p2State.characters[1],
    "printed power blocker",
  );
  state.battle = {
    attacker: battleRef(p1State.leader),
    originalTarget: battleRef(p2State.leader),
    currentTarget: battleRef(p2State.leader),
    step: "block",
    damageCount: 1,
  };
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state),
      id: "reduce-one-blocker",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "exactCard",
          card: { ...battleRef(lowPowerBlocker), zone: lowPowerBlocker.zone },
          binding: {
            family: "selectedTargets",
            saveResultAs: "continuous-current-power-test",
          },
          createdAtStateSeq: state.seq,
        },
        operation: { type: "addPower", value: -2000 },
      },
      duration: { type: "thisTurn" },
    },
    {
      ...continuousPowerEffectRecord(state),
      id: "restrict-low-current-power-blockers",
      modifier: {
        layer: "restriction",
        target: {
          type: "all",
          zone: "characterArea",
          player: "opponent",
          filter: {
            categories: ["character"],
            currentPower: { max: 2000 },
          },
        },
        operation: { type: "restriction", restriction: "cannotBlock" },
      },
      duration: { type: "thisTurn" },
    },
  ];

  assert.equal(
    isSupportedContinuousQueueEffect({
      type: "cannotBlock",
      target: {
        type: "all",
        zone: "characterArea",
        player: "opponent",
        filter: {
          categories: ["character"],
          currentPower: { max: 2000 },
        },
      },
      duration: { type: "thisTurn" },
    }),
    true,
  );
  const view = computeView(state);
  assert.equal(view.cards[lowPowerBlocker.instanceId]?.canBlock, false);
  assert.equal(view.cards[printedPowerBlocker.instanceId]?.canBlock, true);
});

test("preventBlockerActivation on current attacker disables defender blockers", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  setMainTurnAfterFirstTurn(state);
  p1State.characters = [withCharacter(p1, toCardId("char-rush"), 0)];
  p2State.characters = [withCharacter(p2, toCardId("char-blocker"), 0)];
  const attacker = must(p1State.characters[0], "attacker");
  const blocker = must(p2State.characters[0], "blocker");
  state.battle = {
    attacker: battleRef(attacker),
    originalTarget: battleRef(p2State.leader),
    currentTarget: battleRef(p2State.leader),
    step: "block",
    damageCount: 1,
  };

  const withoutRestriction = computeView(state);
  assert.equal(withoutRestriction.cards[blocker.instanceId]?.canBlock, true);

  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state, { source: attacker }),
      id: "restrict-current-attacker-blocker-activation",
      modifier: {
        layer: "restriction",
        target: {
          type: "exactCard",
          card: {
            instanceId: attacker.instanceId,
            cardId: attacker.cardId,
            playerId: p1,
            zone: attacker.zone,
          },
          binding: {
            family: "selectedTargets",
            saveResultAs: "selected:blocker-restricted-attacker",
            objectIndex: 0,
          },
          createdAtStateSeq: state.seq,
        },
        operation: {
          type: "restriction",
          restriction: "preventBlockerActivation",
        },
      },
      duration: { type: "thisTurn" },
    },
  ];

  const withRestriction = computeView(state);
  assert.equal(withRestriction.cards[blocker.instanceId]?.canBlock, false);
  assert.deepEqual(withRestriction.cards[attacker.instanceId]?.restrictions, [
    "no-blocker",
  ]);
});

test("continuous support accepts all rested character filters for refresh restrictions", () => {
  assert.equal(
    isSupportedContinuousQueueEffect({
      type: "cannotBecomeActive",
      target: {
        type: "all",
        player: "opponent",
        zone: "characterArea",
        filter: {
          categories: ["character"],
          state: "rested",
          cost: { max: 7 },
        },
      },
      duration: { type: "untilStartOfNextTurn", player: "opponent" },
    }),
    true,
  );
});

test("modifyPower exactCard uses effect value without mutating canonical power", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  setMainTurnAfterFirstTurn(state);
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  const source = must(p1State.characters[0], "source");
  const manifestBefore = structuredClone(
    must(state.cardManifest.cards[source.cardId], "source manifest"),
  );
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state, { source }),
      id: "power-2000-exact",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "exactCard",
          card: {
            instanceId: source.instanceId,
            cardId: source.cardId,
            playerId: p1,
            zone: source.zone,
          },
          binding: {
            family: "selectedTargets",
            saveResultAs: "s",
            objectIndex: 0,
          },
          createdAtStateSeq: state.seq,
        },
        operation: { type: "addPower", value: 2000 },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const view = computeView(state);
  assert.equal(view.cards[source.instanceId]?.currentPower, 5000);
  assert.equal(
    state.cardManifest.cards[source.cardId]?.power,
    manifestBefore.power,
  );
});

test("filtered all modifier applies only to matching cards", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const c0 = withCharacter(p1, toCardId("char-vanilla"), 0);
  const c1 = withCharacter(p1, toCardId("char-rush"), 1);
  p1State.characters = [c0, c1];
  state.cardManifest.cards[toCardId("char-rush")] = {
    ...must(state.cardManifest.cards[toCardId("char-rush")], "rush"),
    power: 4000,
  };
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state),
      id: "filtered-all-power",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: { power: { op: "eq", value: 4000 } },
        },
        operation: { type: "addPower", value: 1000 },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const view = computeView(state);
  assert.equal(view.cards[c0.instanceId]?.currentPower, 3000);
  assert.equal(view.cards[c1.instanceId]?.currentPower, 5000);
});

test("exact-card modifier stops applying when target leaves bound zone", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const c0 = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [c0];
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state, { source: c0 }),
      id: "exact-zone-bound",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "exactCard",
          card: {
            instanceId: c0.instanceId,
            cardId: c0.cardId,
            playerId: p1,
            zone: c0.zone,
          },
          binding: {
            family: "selectedTargets",
            saveResultAs: "s",
            objectIndex: 0,
          },
          createdAtStateSeq: state.seq,
        },
        operation: { type: "addPower", value: 1000 },
      },
      duration: { type: "thisTurn" },
    },
  ];
  assert.equal(computeView(state).cards[c0.instanceId]?.currentPower, 4000);
  p1State.characters = [];
  p1State.costArea.push({
    ...c0,
    zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
  });
  const view = computeView(state);
  assert.equal(view.cards[c0.instanceId], undefined);
});

test("exact-card modifier fails closed when stored zone provenance mismatches", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const c0 = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [c0];
  state.continuousEffects = [
    {
      ...continuousPowerEffectRecord(state, { source: c0 }),
      id: "exact-zone-mismatch",
      modifier: {
        layer: "powerAdd",
        target: {
          type: "exactCard",
          card: {
            instanceId: c0.instanceId,
            cardId: c0.cardId,
            playerId: p1,
            zone: {
              zone: "leaderArea",
              playerId: p1,
              slot: "leader",
              index: 0,
            },
          },
          binding: {
            family: "selectedTargets",
            saveResultAs: "s",
            objectIndex: 0,
          },
          createdAtStateSeq: state.seq,
        },
        operation: { type: "addPower", value: 1000 },
      },
      duration: { type: "thisTurn" },
    },
  ];
  const view = computeView(state);
  assert.equal(view.cards[c0.instanceId]?.currentPower, 3000);
});

const reviewedProtection = (): EffectDslFieldRemovalProtection => ({
  process: "fieldRemoval",
  fieldRemoval: {
    processFamily: "fieldRemoval",
    classification: "moveFromFieldToTrash",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    targetScope: "thisCard",
    exclusions: {
      battleKO: "excluded",
      ruleProcessTrash: "excluded",
      controllerCost: "excluded",
      controllerOwnedEffect: "excluded",
      ambiguousCustomRemoval: "failClosed",
    },
  },
});

const reviewedPermanentDefinition = (cardId: CardId): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:blocker+protection" as EffectDefinition["effects"][number]["id"],
      category: "permanent",
      trigger: { type: "permanent" },
      condition: { type: "trashCount", player: "self", op: "gte", value: 7 },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "giveKeyword",
              target: { type: "self" },
              keyword: "blocker",
              duration: { type: "permanent" },
            },
          },
          {
            connector: "always",
            effect: {
              type: "giveProtection",
              target: { type: "self" },
              protection: reviewedProtection(),
              duration: { type: "permanent" },
            },
          },
        ],
      },
    },
  ],
  metadata: {
    sourceTextHash: "source-hash",
    rulesVersion: "r1",
    effectDefinitionsVersion: "fixture",
    tested: true,
    reviewer: "reviewer",
  },
});

const installPermanentDslCandidate = (
  state: ReturnType<typeof createState>,
  source: CardInstance,
  definition: EffectDefinition,
  supportOverrides?: Partial<
    NonNullable<
      ReturnType<typeof createState>["cardManifest"]["cards"][CardId]
    >["support"]
  >,
): void => {
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:test",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
      ...supportOverrides,
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:perm:test": definition,
  };
};

const withoutReviewer = (
  metadata: EffectDefinition["metadata"],
): EffectDefinition["metadata"] => {
  const { reviewer, ...rest } = metadata;
  void reviewer;
  return rest;
};

test("derives keyword and protection continuous records from one reviewed permanent sequence", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:1",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:perm:1": reviewedPermanentDefinition(source.cardId),
  };

  const derived = deriveImplementedDslPermanentContinuousEffects(state);
  assert.equal(derived.length, 2);
  const first = must(derived[0], "first derived");
  const second = must(derived[1], "second derived");
  assert.equal(first.condition?.type, "trashCount");
  assert.equal(second.condition?.type, "trashCount");
  assert.equal(first.source.instanceId, source.instanceId);
  assert.equal(second.source.instanceId, source.instanceId);
});

test("fails closed for unreviewed permanent metadata and unsupported keyword target", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:bad",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  const invalid = reviewedPermanentDefinition(source.cardId);
  invalid.metadata = withoutReviewer(invalid.metadata);
  const seq = invalid.effects[0]?.effect;
  if (seq?.type === "sequence") {
    const first = seq.effects[0];
    if (first?.effect.type === "giveKeyword") {
      first.effect.target = { type: "opponentLeader" };
    }
  }
  state.cardManifest.effectDefinitions = { "def:perm:bad": invalid };

  assert.throws(
    () => deriveImplementedDslPermanentContinuousEffects(state),
    /Unsupported continuous effect/i,
  );
});

test("fails closed for unreviewed permanent metadata", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  const definition = reviewedPermanentDefinition(source.cardId);
  definition.metadata = withoutReviewer(definition.metadata);
  installPermanentDslCandidate(state, source, definition);
  assert.throws(
    () => deriveImplementedDslPermanentContinuousEffects(state),
    /stale or unreviewed definition/i,
  );
});

test("fails closed for missing effectDefinitionId when implemented-dsl text indicates candidate permanent support", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    effectText: "synthetic permanent effect text",
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  assert.throws(
    () => deriveImplementedDslPermanentContinuousEffects(state),
    /stale or missing support/i,
  );
});

test("derived DSL continuous keyword is removed when source leaves field", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  const definition = reviewedPermanentDefinition(source.cardId);
  const block = must(definition.effects[0], "permanent block");
  delete block.condition;
  block.effect = {
    type: "giveKeyword",
    target: { type: "self" },
    keyword: "blocker",
    duration: { type: "permanent" },
  };
  installPermanentDslCandidate(state, source, definition);
  const withSource = computeView(state);
  assert.equal(
    withSource.cards[source.instanceId]?.keywords.includes("blocker"),
    true,
  );

  p1State.characters = [];
  p1State.trash.push({
    ...source,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
  });
  const withoutSource = computeView(state);
  assert.equal(withoutSource.cards[source.instanceId], undefined);
});

test("derived DSL continuous keyword can target named cards and self separately", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  const named = withCharacter(p1, toCardId("Ohm"), 1);
  const other = withCharacter(p1, toCardId("char-straw-hat"), 2);
  p1State.characters = [source, named, other];
  state.cardManifest.cards[toCardId("Ohm")] = resolvedCard({
    cardId: toCardId("Ohm"),
    category: "character",
    power: 3000,
  });
  const definition = reviewedPermanentDefinition(source.cardId);
  const block = must(definition.effects[0], "permanent block");
  delete block.condition;
  block.effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "giveKeyword",
          target: {
            type: "all",
            zone: "characterArea",
            player: "self",
            filter: { categories: ["character"], names: ["Ohm"] },
          },
          keyword: "doubleAttack",
          duration: { type: "permanent" },
        },
      },
      {
        connector: "always",
        effect: {
          type: "giveKeyword",
          target: { type: "self" },
          keyword: "doubleAttack",
          duration: { type: "permanent" },
        },
      },
    ],
  };
  installPermanentDslCandidate(state, source, definition);

  const view = computeView(state);

  assert.equal(
    view.cards[source.instanceId]?.keywords.includes("doubleAttack"),
    true,
  );
  assert.equal(
    view.cards[named.instanceId]?.keywords.includes("doubleAttack"),
    true,
  );
  assert.equal(
    view.cards[other.instanceId]?.keywords.includes("doubleAttack"),
    false,
  );
});

test("derived DSL continuous self cost and power modifiers affect computed character view", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  const definition = reviewedPermanentDefinition(source.cardId);
  const block = must(definition.effects[0], "permanent block");
  delete block.condition;
  block.effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: 2000,
          duration: { type: "whileSourceOnField" },
        },
      },
      {
        connector: "always",
        effect: {
          type: "modifyCost",
          player: "self",
          target: { type: "self" },
          value: 5,
          duration: { type: "whileSourceOnField" },
        },
      },
    ],
  };
  installPermanentDslCandidate(state, source, definition);

  const view = computeView(state);

  assert.equal(view.cards[source.instanceId]?.basePower, 3000);
  assert.equal(view.cards[source.instanceId]?.currentPower, 5000);
  assert.equal(view.cards[source.instanceId]?.baseCost, 3);
  assert.equal(view.cards[source.instanceId]?.currentCost, 8);
});

test("fails closed for missing permanent definition", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:missing",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {};
  assert.throws(
    () => deriveImplementedDslPermanentContinuousEffects(state),
    /missing effect definition/i,
  );
});

test("fails closed for untested support metadata", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  installPermanentDslCandidate(
    state,
    source,
    reviewedPermanentDefinition(source.cardId),
    { tested: false },
  );
  assert.throws(
    () => deriveImplementedDslPermanentContinuousEffects(state),
    /stale or missing support/i,
  );
});

test("fails closed for untested definition metadata", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  const definition = reviewedPermanentDefinition(source.cardId);
  definition.metadata.tested = false;
  installPermanentDslCandidate(state, source, definition);
  assert.throws(
    () => deriveImplementedDslPermanentContinuousEffects(state),
    /stale or unreviewed definition/i,
  );
});

test("fails closed for malformed protection metadata", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  const definition = reviewedPermanentDefinition(source.cardId);
  const seq = definition.effects[0]?.effect;
  if (seq?.type === "sequence") {
    const second = seq.effects[1];
    if (
      second?.effect.type === "giveProtection" &&
      second.effect.protection.process === "fieldRemoval"
    ) {
      second.effect.protection.fieldRemoval.sourceControllerRelation =
        "unknownController";
    }
  }
  installPermanentDslCandidate(state, source, definition);
  assert.throws(
    () => deriveImplementedDslPermanentContinuousEffects(state),
    /malformed field-removal protection metadata/i,
  );
});

test("fails closed for unsupported condition on permanent block", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  const definition = reviewedPermanentDefinition(source.cardId);
  const block = definition.effects[0];
  if (block !== undefined) {
    block.condition = { type: "custom", check: "unsupported" };
  }
  installPermanentDslCandidate(state, source, definition);
  assert.throws(
    () => deriveImplementedDslPermanentContinuousEffects(state),
    /unsupported condition/i,
  );
});

test("play-cost derivation ignores unsupported conditioned non-cost permanent hand blocks", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source: CardInstance = {
    instanceId: "p1:hand:0:char-vanilla" as CardInstance["instanceId"],
    cardId: toCardId("char-vanilla"),
    owner: p1,
    controller: p1,
    zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
    state: "active",
    attachedDon: [],
  };
  p1State.hand = [source];
  const definition = reviewedPermanentDefinition(source.cardId);
  const block = must(definition.effects[0], "permanent block");
  block.condition = { type: "custom", check: "unsupported" };
  block.effect = {
    type: "giveKeyword",
    target: { type: "self" },
    keyword: "blocker",
    duration: { type: "permanent" },
  };
  installPermanentDslCandidate(state, source, definition);

  assert.deepEqual(deriveImplementedDslHandContinuousEffects(state), []);
});

test("permanent support admission rejects unsupported conditions before materialization", () => {
  const sourceCardId = toCardId("char-vanilla");
  const definition = reviewedPermanentDefinition(sourceCardId);
  const block = must(definition.effects[0], "permanent block");
  block.condition = { type: "custom", check: "unsupported" };

  assert.equal(isSupportedPermanentContinuousEffectBlock(block), false);
});

test("fails closed for unsupported permanent shape", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  const definition = reviewedPermanentDefinition(source.cardId);
  definition.effects[0] = {
    ...must(definition.effects[0], "permanent block"),
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "ifYouDo",
          effect: {
            type: "giveKeyword",
            target: { type: "self" },
            keyword: "blocker",
            duration: { type: "permanent" },
          },
        },
      ],
    },
  };
  installPermanentDslCandidate(state, source, definition);
  assert.throws(
    () => deriveImplementedDslPermanentContinuousEffects(state),
    /unsupported permanent shape/i,
  );
});

test("derives permanent records without authorizing unrelated non-permanent blocks", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  const definition = reviewedPermanentDefinition(source.cardId);
  definition.effects.push({
    id: "unsupported:onko:custom" as never,
    category: "auto",
    trigger: { type: "onKO" },
    sourcePresencePolicy: "resolveFromDestinationZone",
    effect: { type: "custom", handler: "unsupported-handler" },
  });
  installPermanentDslCandidate(state, source, definition);

  const derived = deriveImplementedDslPermanentContinuousEffects(state);

  assert.equal(derived.length, 2);
  assert.equal(
    derived.every(
      (record) =>
        record.createdBy.type === "ruleProcess" &&
        record.createdBy.name ===
          "implemented-dsl-permanent-continuous-materialization",
    ),
    true,
  );
});
