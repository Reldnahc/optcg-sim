import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  CardRef,
  Condition,
  ContinuousEffectRecord,
  Effect,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
  Protection,
  QueueEntryId,
  TimingWindowId,
} from "@optcg/types";

import { resolveSupportedVanillaBattle } from "../actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import { applyDeclareAttack } from "../battle/actions.js";
import {
  cardRef,
  effectDefinition,
  setupAttackState,
} from "../battle/test-fixtures.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { computeView } from "../compute-view.js";
import { executeSelectedTargetEffectPrimitive } from "../runtime/primitives/execute.js";
import { filterStateForPlayer } from "../filter-state-for-player.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
} from "../play-card/core.js";
import { setupFullCharacterPlayState } from "../play-card/test-fixtures.js";

const toEffectId = (value: string): EffectId => value as EffectId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const syntheticCondition: Condition = {
  type: "trashCount",
  player: "self",
  op: "gte",
  value: 7,
};

const syntheticFieldRemovalProtection = (): Protection => ({
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

const koChooseEffect = (): Extract<Effect, { type: "ko" }> => ({
  type: "ko",
  target: {
    type: "choose",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zone: "characterArea",
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public",
    },
  },
});

const fieldRemovalQueueEntry = (
  state: GameState,
  source: CardInstance,
): EffectQueueEntry => ({
  id: toQueueEntryId("queue-entry:synthetic-field-removal"),
  state: "pending",
  timingWindowId: "timing-window:synthetic-field-removal" as TimingWindowId,
  generation: 0,
  controllerId: source.controller,
  source: cardRef(source, source.controller),
  sourceSnapshot: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    ownerId: source.owner,
    controllerId: source.controller,
    zone: source.zone,
    category: "character",
    colors: ["red"],
    power: 7000,
    keywords: [],
  },
  effectBlockId: toEffectId("synthetic-effect:opponent-field-removal"),
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 1,
  queuedAtStateSeq: state.seq,
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "synthetic-field-removal-proof" },
});

const continuousKeywordGrant = (
  state: GameState,
  source: CardInstance,
): ContinuousEffectRecord => ({
  id: `synthetic-conditional-blocker:${String(source.instanceId)}`,
  source: cardRef(source, source.controller),
  sourceSnapshot: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    ownerId: source.owner,
    controllerId: source.controller,
    zone: source.zone,
    category: "character",
    colors: ["red"],
    power: 3000,
    keywords: [],
  },
  controller: source.controller,
  modifier: {
    layer: "keywordAdd",
    target: { type: "self" },
    operation: { type: "addKeyword", keyword: "blocker" },
  },
  condition: syntheticCondition,
  duration: { type: "whileSourceOnField" },
  createdBy: {
    type: "ruleProcess",
    name: "synthetic-condition-keyword-composition",
  },
  createdAtStateSeq: state.seq,
});

const continuousProtectionGrant = (
  state: GameState,
  source: CardInstance,
): ContinuousEffectRecord => ({
  id: `synthetic-conditional-protection:${String(source.instanceId)}`,
  source: cardRef(source, source.controller),
  sourceSnapshot: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    ownerId: source.owner,
    controllerId: source.controller,
    zone: source.zone,
    category: "character",
    colors: ["red"],
    power: 3000,
    keywords: [],
  },
  controller: source.controller,
  modifier: {
    layer: "protection",
    target: { type: "self" },
    operation: {
      type: "protection",
      protection: syntheticFieldRemovalProtection(),
    },
  },
  condition: syntheticCondition,
  duration: { type: "permanent" },
  createdBy: {
    type: "ruleProcess",
    name: "synthetic-condition-protection-composition",
  },
  createdAtStateSeq: state.seq,
});

const composeSyntheticCharacter = (
  state: GameState,
  source: CardInstance,
): void => {
  state.continuousEffects = [
    continuousKeywordGrant(state, source),
    continuousProtectionGrant(state, source),
  ];
};

const addSelfTrashMarkers = (
  state: GameState,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], "trash marker player");
  player.trash = Array.from({ length: count }, (_, index): CardInstance => {
    const cardId = toCardId(
      `synthetic-trash-marker-${String(playerId)}-${String(index)}`,
    );
    state.cardManifest.cards[cardId] = resolvedCard({
      cardId,
      category: "character",
      power: 1000,
    });
    return {
      instanceId: `synthetic-trash-marker:${String(playerId)}:${String(
        index,
      )}` as CardInstance["instanceId"],
      cardId,
      owner: playerId,
      controller: playerId,
      zone: { zone: "trash", playerId, slot: "trash", index },
      state: "active",
      attachedDon: [],
    };
  });
};

const installOnKODrawOne = (
  state: GameState,
  source: CardInstance,
  effectDefinitionId: string,
): EffectDefinition => {
  const definition = effectDefinition(source.cardId, { type: "onKO" });
  const onKOEffect = must(definition.effects[0], "On K.O. effect");
  const onKODefinition: EffectDefinition = {
    ...definition,
    effects: [
      {
        ...onKOEffect,
        sourcePresencePolicy: "resolveFromDestinationZone",
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    onKODefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: onKODefinition,
  };
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 3000,
    effectText: "[On K.O.] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: onKODefinition.metadata.rulesVersion,
      sourceTextHash: onKODefinition.metadata.sourceTextHash,
    },
  });
  return onKODefinition;
};

const selectedTargetRef = (target: CardInstance): CardRef => ({
  instanceId: target.instanceId,
  cardId: target.cardId,
  playerId: target.controller,
  zone: target.zone,
});

const applyPlayCardTestAction = (
  state: GameState,
  action:
    | Extract<Action, { type: "playCard" }>
    | Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  if (action.type === "playCard") {
    return applyPlayCard(state, action);
  }
  const result = applyPlayCardDecisionResponse(state, action);
  assert.ok(result !== null, "expected play-card decision response");
  return result;
};

const assertStrictlyIncreasingEventSeq = (
  result: EngineResult,
  previousJournalLength: number,
): void => {
  assert.deepEqual(
    result.events.map((event) => event.seq),
    result.events.map((_, index) => previousJournalLength + index + 1),
  );
  assert.deepEqual(result.state.eventJournal.slice(-result.events.length), [
    ...result.events,
  ]);
};

const assertDeterministicResult = (
  result: EngineResult,
  replay: EngineResult,
): void => {
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
  assert.equal(replay.stateHash, result.stateHash);
  assert.deepEqual(replay.events, result.events);
};

const eventIndex = (
  events: readonly EngineEvent[],
  type: EngineEvent["type"],
): number => {
  const index = events.findIndex((event) => event.type === type);
  assert.notEqual(index, -1, `missing ${type}`);
  return index;
};

test("below threshold has no conditional Blocker grant and no opponent-effect removal protection", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.characters[0], "opponent effect source");
  const target = must(p2State.characters[0], "synthetic composed target");
  addSelfTrashMarkers(state, p2, 6);
  composeSyntheticCharacter(state, target);
  const view = computeView(state);
  const beforeJournalLength = state.eventJournal.length;

  assert.equal(
    view.cards[target.instanceId]?.keywords.includes("blocker"),
    false,
  );
  assert.equal(view.cards[target.instanceId]?.canBlock, false);
  assert.deepEqual(view.cards[target.instanceId]?.protectedFrom ?? [], []);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    fieldRemovalQueueEntry(state, source),
    koChooseEffect(),
    [selectedTargetRef(target)],
  );
  const replay = executeSelectedTargetEffectPrimitive(
    structuredClone(state),
    fieldRemovalQueueEntry(state, source),
    koChooseEffect(),
    [selectedTargetRef(target)],
  );
  const nextP2 = must(result.state.players[p2], "result p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardKOd", "cardMoved"],
  );
  assertStrictlyIncreasingEventSeq(result, beforeJournalLength);
  assertDeterministicResult(result, replay);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === target.instanceId),
    true,
  );
});

test("at threshold grants Blocker eligibility during defender Block Step", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const defender = must(p2State.characters[0], "synthetic composed defender");
  defender.state = "active";
  addSelfTrashMarkers(state, p2, 7);
  composeSyntheticCharacter(state, defender);
  const view = computeView(state);

  assert.equal(view.cards[defender.instanceId]?.canBlock, false);

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  const replay = applyDeclareAttack(structuredClone(state), {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  const pending = must(opened.state.pendingDecision, "block decision");

  assert.equal(opened.errors, undefined);
  assert.equal(pending.type, "selectCards");
  assert.deepEqual(pending.candidates, [
    { card: cardRef(defender, p2), visibility: { type: "public" } },
  ]);
  assert.equal(
    computeView(opened.state).cards[defender.instanceId]?.canBlock,
    true,
  );
  assertDeterministicResult(opened, replay);
});

test("at threshold prevents supported opponent-effect field removal", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.characters[0], "opponent effect source");
  const target = must(p2State.characters[0], "synthetic composed target");
  addSelfTrashMarkers(state, p2, 7);
  composeSyntheticCharacter(state, target);
  const before = structuredClone(state);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    fieldRemovalQueueEntry(state, source),
    koChooseEffect(),
    [selectedTargetRef(target)],
  );
  const replay = executeSelectedTargetEffectPrimitive(
    structuredClone(state),
    fieldRemovalQueueEntry(state, source),
    koChooseEffect(),
    [selectedTargetRef(target)],
  );
  const nextP2 = must(result.state.players[p2], "result p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.deepEqual(state, before);
  assertDeterministicResult(result, replay);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === target.instanceId),
    false,
  );
});

test("battle K.O. remains allowed and resolves supported On K.O. draw one", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "synthetic composed target");
  addSelfTrashMarkers(state, p2, 7);
  composeSyntheticCharacter(state, target);
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  const onKODefinition = installOnKODrawOne(
    state,
    target,
    "synthetic-composition-on-ko-draw",
  );
  const onKOEffect = must(onKODefinition.effects[0], "On K.O. effect");
  const beforeJournalLength = state.eventJournal.length;
  const beforeDeckLength = p2State.deck.length;
  const beforeHandLength = p2State.hand.length;
  state.battle = {
    attacker: cardRef(attacker, p1),
    originalTarget: cardRef(target, p2),
    currentTarget: cardRef(target, p2),
    step: "counter",
    damageCount: 1,
  };

  const result = resolveSupportedVanillaBattle(state);
  const replay = resolveSupportedVanillaBattle(structuredClone(state));
  const nextP2 = must(result.state.players[p2], "result p2");
  const damageDealtIndex = eventIndex(result.events, "damageDealt");
  const cardKOdIndex = eventIndex(result.events, "cardKOd");
  const cardMovedIndex = eventIndex(result.events, "cardMoved");
  const effectQueuedIndex = eventIndex(result.events, "effectQueued");
  const cardDrawnIndex = eventIndex(result.events, "cardDrawn");
  const onKOResolvedIndex = result.events.findIndex(
    (event) =>
      event.type === "effectResolved" &&
      (event.payload as { effectBlockId?: unknown }).effectBlockId ===
        onKOEffect.id,
  );

  assert.equal(result.errors, undefined);
  assert.ok(damageDealtIndex < cardKOdIndex);
  assert.ok(cardKOdIndex < cardMovedIndex);
  assert.ok(cardMovedIndex < effectQueuedIndex);
  assert.ok(effectQueuedIndex < cardDrawnIndex);
  assert.ok(cardDrawnIndex < onKOResolvedIndex);
  assertStrictlyIncreasingEventSeq(result, beforeJournalLength);
  assertDeterministicResult(result, replay);
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "effectQueued" &&
        (event.payload as { sourcePresencePolicy?: unknown })
          .sourcePresencePolicy === "resolveFromDestinationZone",
    ),
    true,
  );
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(nextP2.deck.length, beforeDeckLength - 1);
  assert.equal(nextP2.hand.length, beforeHandLength + 1);
});

test("rule-process trash remains allowed and does not fire ordinary On K.O. triggers", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);
  const selectedCharacter = must(
    existingCharacters[2],
    "synthetic composed overflow target",
  );
  addSelfTrashMarkers(state, p1, 7);
  composeSyntheticCharacter(state, selectedCharacter);
  installOnKODrawOne(
    state,
    selectedCharacter,
    "synthetic-composition-rule-trash-on-ko-draw",
  );
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeDeckLength = beforeP1.deck.length;

  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "overflow decision");
  const beforeJournalLength = opened.state.eventJournal.length;
  const response: Extract<Action, { type: "respondToDecision" }> = {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [cardRef(selectedCharacter, p1)],
    },
  };

  const resolved = applyPlayCardTestAction(opened.state, response);
  const replay = applyPlayCardTestAction(
    structuredClone(opened.state),
    response,
  );
  const nextP1 = must(resolved.state.players[p1], "result p1");

  assert.equal(opened.errors, undefined);
  assert.equal(resolved.errors, undefined);
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  assert.equal(
    resolved.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "effectQueued"),
    false,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "effectResolved"),
    false,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "cardDrawn"),
    false,
  );
  assertStrictlyIncreasingEventSeq(resolved, beforeJournalLength);
  assertDeterministicResult(resolved, replay);
  assert.equal(
    nextP1.characters.some(
      (card) => card.instanceId === selectedCharacter.instanceId,
    ),
    false,
  );
  assert.equal(
    nextP1.trash.some(
      (card) => card.instanceId === selectedCharacter.instanceId,
    ),
    true,
  );
  assert.equal(nextP1.deck.length, beforeDeckLength);
});

test("composed fixture player views do not expose private hand deck or face-down life identities", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.characters[0], "opponent effect source");
  const target = must(p2State.characters[0], "synthetic composed target");
  const p1HiddenHand = must(p1State.hand[0], "p1 hidden hand");
  const p1HiddenDeck = must(p1State.deck[0], "p1 hidden deck");
  const p1HiddenLife = must(p1State.life[0], "p1 hidden life").card;
  const p2HiddenHand = must(p2State.hand[0], "p2 hidden hand");
  const p2HiddenDeck = must(p2State.deck[0], "p2 hidden deck");
  const p2HiddenLife = must(p2State.life[0], "p2 hidden life").card;
  p1HiddenHand.cardId = toCardId("synthetic-private-p1-hand");
  p1HiddenDeck.cardId = toCardId("synthetic-private-p1-deck");
  p1HiddenLife.cardId = toCardId("synthetic-private-p1-life");
  p2HiddenHand.cardId = toCardId("synthetic-private-p2-hand");
  p2HiddenDeck.cardId = toCardId("synthetic-private-p2-deck");
  p2HiddenLife.cardId = toCardId("synthetic-private-p2-life");
  addSelfTrashMarkers(state, p2, 7);
  composeSyntheticCharacter(state, target);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    fieldRemovalQueueEntry(state, source),
    koChooseEffect(),
    [selectedTargetRef(target)],
  );
  const p1View = JSON.stringify(filterStateForPlayer(result.state, p1));
  const p2View = JSON.stringify(filterStateForPlayer(result.state, p2));

  assert.equal(result.errors, undefined);
  assert.equal(p1View.includes("synthetic-private-p2-hand"), false);
  assert.equal(p1View.includes("synthetic-private-p1-deck"), false);
  assert.equal(p1View.includes("synthetic-private-p2-deck"), false);
  assert.equal(p1View.includes("synthetic-private-p1-life"), false);
  assert.equal(p1View.includes("synthetic-private-p2-life"), false);
  assert.equal(p2View.includes("synthetic-private-p1-hand"), false);
  assert.equal(p2View.includes("synthetic-private-p1-deck"), false);
  assert.equal(p2View.includes("synthetic-private-p2-deck"), false);
  assert.equal(p2View.includes("synthetic-private-p1-life"), false);
  assert.equal(p2View.includes("synthetic-private-p2-life"), false);
});

const listEngineProductionSources = async (
  directory: string,
): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listEngineProductionSources(entryPath);
      }
      if (
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.includes("test-fixtures") &&
        !entry.name.includes("test-support")
      ) {
        return [entryPath];
      }
      return [];
    }),
  );
  return nested.flat();
};

test("production engine source has no real-card ID or full-card text branch for the synthetic composition", async () => {
  const srcRoot = path.dirname(fileURLToPath(import.meta.url));
  const productionSources = await listEngineProductionSources(srcRoot);
  const forbiddenPatterns = [
    /@optcg\/cards/u,
    /\b(?:OP|ST)\d{2}-\d{3}\b/u,
    /If you have 7 or more cards in your trash/u,
    /If you have.*7 or more.*cards in your trash/u,
    /removed from the field/u,
  ];

  for (const sourcePath of productionSources) {
    const source = await readFile(sourcePath, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.equal(
        pattern.test(source),
        false,
        `production engine source must not branch on ${String(
          pattern,
        )}: ${path.relative(srcRoot, sourcePath)}`,
      );
    }
  }
});
