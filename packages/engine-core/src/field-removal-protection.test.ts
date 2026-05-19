import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardId,
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EffectId,
  EngineResult,
  GameState,
  Protection,
  QueueEntryId,
  ReplacementProcess,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { computeView } from "./compute-view.js";
import { applyFieldRemovalProtection } from "./field-removal-protection.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import { effectDefinition } from "./battle-actions-test-fixtures.js";
import {
  buildSelectedTargetKoReplacementProcess,
  executeSelectedTargetEffectPrimitive,
  executeUnreplacedSelectedTargetKoProcess,
} from "./effect-runtime-primitives.js";
import { applyPlayCard, applyPlayCardDecisionResponse } from "./play-card.js";
import { setupFullCharacterPlayState } from "./play-card-test-fixtures.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const publicCharacterRequest = (
  overrides: Partial<TargetRequest> = {},
): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "opponent",
  zone: "characterArea",
  min: 1,
  max: 1,
  allowFewerIfUnavailable: false,
  visibility: "public",
  ...overrides,
});

const koChooseEffect = (): Extract<Effect, { type: "ko" }> => ({
  type: "ko",
  target: { type: "choose", request: publicCharacterRequest() },
});

const fieldRemovalProtection = (
  overrides: Partial<
    Extract<Protection, { process: "fieldRemoval" }>["fieldRemoval"]
  > = {},
): Protection => ({
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
    ...overrides,
  },
});

const setupFieldRemovalProtectionState = () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.hand[0], "source");
  const targetHand = must(p2State.hand[0], "target");
  const don = must(p2State.donDeck[0], "p2 don");

  const sourceOnField: CardInstance = {
    ...source,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: state.turn.globalTurn,
  };
  const target: CardInstance = {
    ...targetHand,
    cardId: toCardId("field-removal-protected-target"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "rested",
    attachedDon: [don.instanceId],
    turnPlayed: state.turn.globalTurn,
  };

  p1State.characters = [sourceOnField];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p2State.characters = [target];
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  p2State.donDeck = p2State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  p2State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
      state: "active",
    },
  ];

  state.cardManifest.cards[sourceOnField.cardId] = resolvedCard({
    cardId: sourceOnField.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });

  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-field-removal-protection"),
    state: "pending",
    timingWindowId: "window-field-removal-protection" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: {
      instanceId: sourceOnField.instanceId,
      cardId: sourceOnField.cardId,
      playerId: p1,
      zone: sourceOnField.zone,
    },
    sourceSnapshot: {
      instanceId: sourceOnField.instanceId,
      cardId: sourceOnField.cardId,
      ownerId: sourceOnField.owner,
      controllerId: sourceOnField.controller,
      zone: sourceOnField.zone,
      category: "character",
      colors: ["red"],
      power: 5000,
      keywords: [],
    },
    effectBlockId: toEffectId("field-removal-protection-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "field-removal-test" },
  };

  const targetRef: CardRef = {
    instanceId: target.instanceId,
    cardId: target.cardId,
    playerId: p2,
    zone: target.zone,
  };

  return { state, entry, sourceOnField, target, targetRef };
};

const protectTargetFromOpponentEffectRemoval = (
  state: ReturnType<typeof createActiveState>,
  target: CardInstance,
  protection: Protection = fieldRemovalProtection(),
) => {
  state.continuousEffects = [
    {
      id: `field-removal-protection:${String(target.instanceId)}`,
      source: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: target.controller,
        zone: target.zone,
      },
      sourceSnapshot: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        ownerId: target.owner,
        controllerId: target.controller,
        zone: target.zone,
        category: "character",
        colors: ["red"],
        power: 3000,
        keywords: [],
      },
      controller: target.controller,
      modifier: {
        layer: "protection",
        target: { type: "self" },
        operation: { type: "protection", protection },
      },
      duration: { type: "permanent" },
      createdBy: { type: "ruleProcess", name: "field-removal-test" },
      createdAtStateSeq: state.seq,
    },
  ];
};

const replaceFieldRemovalAttemptPayload = (
  process: ReplacementProcess,
  fieldRemovalAttempt: unknown,
): ReplacementProcess => {
  const payload =
    typeof process.payload === "object" && process.payload !== null
      ? { ...process.payload, fieldRemovalAttempt }
      : { fieldRemovalAttempt };
  return { ...process, payload };
};

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

const attachOnKODrawEffect = (
  state: GameState,
  source: CardInstance,
  effectDefinitionId: string,
) => {
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
  return onKOEffect;
};

const attachReviewedKoReplacement = (
  state: GameState,
  target: CardInstance,
): EffectDefinition["effects"][number] => {
  const support = {
    cardId: target.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "replacement-rules",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "replacement-source-hash",
    behaviorHash: "replacement-behavior-hash",
    effectDefinitionId: `definition:${String(target.cardId)}:replacement`,
  };
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    support,
  });
  const effectBlock: EffectDefinition["effects"][number] = {
    id: toEffectId("replacement:would-be-ko-draw-1"),
    category: "replacement",
    trigger: {
      type: "replacement",
      replacement: { type: "wouldBeKOd", target: { type: "self" } },
    },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when: { type: "wouldBeKOd", target: { type: "self" } },
      instead: { type: "draw", count: 1, player: "self" },
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: target.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: support.sourceTextHash,
        rulesVersion: support.rulesVersion,
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-19T00:00:00.000Z",
      },
    },
  };
  return effectBlock;
};

test("computeView exposes supported field-removal protection without mutating state", () => {
  const { state, target } = setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(state, target);
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const view = computeView(state);

  assert.deepEqual(view.cards[target.instanceId]?.protectedFrom, [
    fieldRemovalProtection(),
  ]);
  assert.deepEqual(state, before);
  assert.equal(hashCanonicalStateValue(state), beforeHash);
});

test("opponent effect field removal is prevented for a protected Character before mutation", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(state, target);
  const before = structuredClone(state);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(hashCanonicalStateValue(result.state), result.stateHash);
  assert.deepEqual(state, before);
});

test("sixth-character overflow rule-process trash removes a protected Character without ordinary On K.O. triggers", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);
  const selectedCharacter = must(existingCharacters[2], "selected character");
  attachOnKODrawEffect(state, selectedCharacter, "def-overflow-on-ko-draw");
  protectTargetFromOpponentEffectRemoval(state, selectedCharacter);
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeDeckLength = beforeP1.deck.length;

  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "overflow decision");
  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: selectedCharacter.instanceId,
          cardId: selectedCharacter.cardId,
          playerId: p1,
          zone: selectedCharacter.zone,
        },
      ],
    },
  });
  const nextP1 = must(resolved.state.players[p1], "next p1");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    nextP1.characters.some(
      (card) => card.instanceId === selectedCharacter.instanceId,
    ),
    false,
  );
  assert.equal(nextP1.trash[0]?.instanceId, selectedCharacter.instanceId);
  assert.equal(nextP1.characters[4]?.instanceId, newCharacter.instanceId);
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
  assert.equal(nextP1.deck.length, beforeDeckLength);
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("controller-owned effect field removal is not blocked by opponent-effect protection", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  const p2Source = must(state.players[p2], "p2").leader;
  const selfControlledEntry: EffectQueueEntry = {
    ...entry,
    controllerId: p2,
    source: {
      instanceId: p2Source.instanceId,
      cardId: p2Source.cardId,
      playerId: p2,
      zone: p2Source.zone,
    },
    sourceSnapshot: {
      instanceId: p2Source.instanceId,
      cardId: p2Source.cardId,
      ownerId: p2Source.owner,
      controllerId: p2Source.controller,
      zone: p2Source.zone,
      category: "leader",
      colors: ["red"],
      power: 5000,
      keywords: [],
    },
  };
  protectTargetFromOpponentEffectRemoval(state, target);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    selfControlledEntry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardKOd", "cardMoved", "donReturned"],
  );
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(nextP2.trash[0]?.instanceId, target.instanceId);
});

test("controller-cost field removal classification is not blocked by opponent-effect protection", () => {
  const { state, target, targetRef } = setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(state, target);
  const process: ReplacementProcess = {
    id: "controller-cost-field-removal",
    type: "trash",
    source: targetRef,
    target: targetRef,
    payload: {
      fieldRemovalAttempt: {
        processFamily: "fieldRemoval",
        classification: "moveFromFieldToTrash",
        sourceKind: "cost",
        sourceControllerId: p2,
      },
    },
    causedBy: { type: "ruleProcess", name: "controller-cost-test" },
    usedReplacementIds: [],
  };

  const result = applyFieldRemovalProtection(state, target, process);

  assert.deepEqual(result, { ok: true, prevented: false });
});

test("supported would-be-KOd replacement decision opens before field-removal protection prevents removal", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  const replacement = attachReviewedKoReplacement(state, target);
  protectTargetFromOpponentEffectRemoval(state, target);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => [event.type, event.visibility]),
    [["decisionCreated", { type: "private", playerId: p2 }]],
  );
  const pendingDecision = must(
    result.state.pendingDecision,
    "replacement decision",
  );
  assert.equal(pendingDecision.type, "chooseReplacement");
  assert.deepEqual(pendingDecision.replacementIds, [String(replacement.id)]);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === target.instanceId),
    false,
  );
});

test.each([
  {
    name: "missing source controller",
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: "cardEffect",
    },
    reason: "missing-source-controller",
  },
  {
    name: "unsupported destination",
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToHand",
      sourceKind: "cardEffect",
      sourceControllerId: p1,
    },
    reason: "unsupported-field-removal-destination",
  },
  {
    name: "custom handler removal",
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: "custom",
      sourceControllerId: p1,
    },
    reason: "ambiguous-field-removal-source",
  },
  {
    name: "ambiguous process source",
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: "cardEffect",
      sourceControllerId: p1,
      ambiguous: true,
    },
    reason: "ambiguous-field-removal-source",
  },
] satisfies {
  name: string;
  fieldRemovalAttempt: unknown;
  reason: string;
}[])(
  "fails closed before mutation for $name",
  ({ fieldRemovalAttempt, reason }) => {
    const { state, entry, target, targetRef } =
      setupFieldRemovalProtectionState();
    protectTargetFromOpponentEffectRemoval(state, target);
    const process = replaceFieldRemovalAttemptPayload(
      buildSelectedTargetKoReplacementProcess(entry, targetRef, 0),
      fieldRemovalAttempt,
    );
    const before = structuredClone(state);
    const beforeHash = hashCanonicalStateValue(state);

    const result = executeUnreplacedSelectedTargetKoProcess(
      state,
      [],
      entry.effectBlockId,
      process,
    );

    assert.deepEqual(result, {
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason },
      },
    });
    assert.deepEqual(state, before);
    assert.equal(hashCanonicalStateValue(state), beforeHash);
  },
);

test("fails closed before mutation for malformed field-removal protection metadata", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(
    state,
    target,
    fieldRemovalProtection({
      sourceControllerRelation: "unknownController",
    }),
  );
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: entry.effectBlockId,
      details: { reason: "malformed-field-removal-protection" },
    },
  ]);
});

test("computeView fails closed for malformed field-removal protection metadata", () => {
  const { state, target } = setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(
    state,
    target,
    fieldRemovalProtection({
      sourceControllerRelation: "unknownController",
    }),
  );

  assert.throws(() => computeView(state), {
    name: "TypeError",
    message: `Unsupported continuous effect field-removal-protection:${String(
      target.instanceId,
    )}: malformed field-removal protection metadata.`,
  });
});
