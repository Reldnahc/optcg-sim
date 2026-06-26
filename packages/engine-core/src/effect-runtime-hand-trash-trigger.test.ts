import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  EffectDefinition,
  EngineEvent,
  GameState,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toDecisionId,
  toEffectId,
  toEngineEventId,
  toStateSeq,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";

const toCardId = (value: string): CardId => value as CardId;

const setupHandTrashReactionSource = (): GameState => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const effectDefinitionId = "def-hand-trash-reaction";
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "reaction source"),
    zone: "characterArea",
  });
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "hand-trash-reaction-rules",
      sourceTextHash: "hand-trash-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-hand-trash-invalidate-self"),
        category: "auto",
        trigger: { type: "handTrashedByEffect", player: "self" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "invalidateEffects",
          target: { type: "self" },
          duration: { type: "thisTurn" },
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.eventJournal.push({
    id: toEngineEventId("event:hand-trash:source-played"),
    seq: 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: source.instanceId,
      cardId: source.cardId,
      category: "character",
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });
  return state;
};

const addHandTrashEvent = (
  state: GameState,
  options: {
    triggerSource?: "effect";
    sourceCardId?: CardId;
    sourceTypes?: string[];
    sourceCategory?: "leader" | "character" | "event" | "stage";
    createdAtStateSeq?: GameState["seq"];
  } = {},
): void => {
  const handCard = must(must(state.players[p1], "p1").hand[1], "hand card");
  const event: EngineEvent = {
    id: toEngineEventId("event:hand-trash:body"),
    seq: state.eventJournal.length + 1,
    type: "cardTrashed",
    payload: {
      playerId: p1,
      instanceId: handCard.instanceId,
      cardId: handCard.cardId,
      reason: "trashFromHand",
      ...options,
    },
    visibility: { type: "public" },
    causedBy: { type: "decision", decisionId: toDecisionId("decision:test") },
    createdAtStateSeq: options.createdAtStateSeq ?? state.seq,
  };
  state.eventJournal.push(event);
};

const addTypedSourceDefinition = (
  state: GameState,
  sourceCardId: CardId,
  types: string[],
): void => {
  state.cardManifest.cards[sourceCardId] = {
    ...resolvedCard({
      cardId: sourceCardId,
      category: "character",
    }),
    types,
  };
};

test("handTrashedByEffect queues and resolves after effect-body hand trash", () => {
  const state = setupHandTrashReactionSource();
  addHandTrashEvent(state, { triggerSource: "effect" });

  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  assert.deepEqual(
    queued.events.map((event) => event.type),
    ["effectQueued"],
  );
  assert.equal(queued.state.effectQueue.length, 1);

  const resolved = processEffectRuntime(queued.state);
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(resolved.state.continuousEffects.length, 1);
  assert.deepEqual(resolved.state.continuousEffects[0]?.modifier.operation, {
    type: "invalidateEffects",
  });
});

test("live handTrashedByEffect queueing preserves omitted state hash", () => {
  const state = setupHandTrashReactionSource();
  addHandTrashEvent(state, { triggerSource: "effect" });

  const result = processEffectRuntime(state, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});

test("handTrashedByEffect queues old decision-caused effect trash events", () => {
  const state = setupHandTrashReactionSource();
  state.seq = toStateSeq(10);
  addHandTrashEvent(state, {
    triggerSource: "effect",
    createdAtStateSeq: toStateSeq(1),
  });

  const queued = processEffectRuntime(state);

  assert.equal(queued.errors, undefined);
  assert.deepEqual(
    queued.events.map((event) => event.type),
    ["effectQueued"],
  );
  assert.equal(queued.state.effectQueue.length, 1);
});

test("handTrashedByEffect ignores untagged hand trash so costs do not trigger it", () => {
  const state = setupHandTrashReactionSource();
  addHandTrashEvent(state);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.continuousEffects.length, 0);
});

test("handTrashedByEffect source filters match effect source evidence per trashed card", () => {
  const state = setupHandTrashReactionSource();
  const source = must(must(state.players[p1], "p1").characters[0], "source");
  const effectDefinitionId = "def-hand-trash-source-filter-draw";
  const sourceCardId = toCardId("navy-effect-source");
  addTypedSourceDefinition(state, sourceCardId, ["Navy"]);
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "hand-trash-source-filter-rules",
      sourceTextHash: "hand-trash-source-filter-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-hand-trash-source-filter-draw"),
        category: "auto",
        trigger: {
          type: "handTrashedByEffect",
          player: "self",
          sourceFilter: { typesAny: ["Navy"] },
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  };
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  addHandTrashEvent(state, {
    triggerSource: "effect",
    sourceCardId,
    sourceTypes: ["Navy"],
    sourceCategory: "character",
  });
  addHandTrashEvent(state, {
    triggerSource: "effect",
    sourceCardId,
    sourceTypes: ["Navy"],
    sourceCategory: "character",
  });

  const queued = processEffectRuntime(state);

  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 2);
});

test("handTrashedByEffect source filters reject nonmatching effect source evidence", () => {
  const state = setupHandTrashReactionSource();
  const source = must(must(state.players[p1], "p1").characters[0], "source");
  const effectDefinitionId = "def-hand-trash-source-filter-reject";
  const sourceCardId = toCardId("non-navy-effect-source");
  addTypedSourceDefinition(state, sourceCardId, ["Straw Hat Crew"]);
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "hand-trash-source-filter-rules",
      sourceTextHash: "hand-trash-source-filter-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-hand-trash-source-filter-reject"),
        category: "auto",
        trigger: {
          type: "handTrashedByEffect",
          player: "self",
          sourceFilter: { typesAny: ["Navy"] },
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  };
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  addHandTrashEvent(state, {
    triggerSource: "effect",
    sourceCardId,
    sourceTypes: ["Straw Hat Crew"],
    sourceCategory: "character",
  });

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
});
