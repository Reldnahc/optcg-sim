import assert from "node:assert/strict";

import type {
  Action,
  CardId,
  CardInstance,
  CardRef,
  Condition,
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

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../action-test-fixtures.js";
import { effectDefinition } from "../battle/test-fixtures.js";
import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
} from "../play-card/core.js";
export const toCardId = (value: string): CardId => value as CardId;
export const toEffectId = (value: string): EffectId => value as EffectId;
export const toQueueEntryId = (value: string): QueueEntryId =>
  value as QueueEntryId;

export const publicCharacterRequest = (
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

export const koChooseEffect = (): Extract<Effect, { type: "ko" }> => ({
  type: "ko",
  target: { type: "choose", request: publicCharacterRequest() },
});

export const fieldRemovalProtection = (
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

export const permanentDslProtectionDefinition = (
  cardId: CardId,
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: toEffectId("permanent:dsl:field-removal-protection"),
      category: "permanent",
      trigger: { type: "permanent" },
      condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      effect: {
        type: "giveProtection",
        target: { type: "self" },
        protection: fieldRemovalProtection() as Extract<
          Effect,
          { type: "giveProtection" }
        >["protection"],
        duration: { type: "permanent" },
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

export const setupFieldRemovalProtectionState = () => {
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

export const protectTargetFromOpponentEffectRemoval = (
  state: ReturnType<typeof createActiveState>,
  target: CardInstance,
  protection: Protection = fieldRemovalProtection(),
  condition?: Condition,
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
      ...(condition === undefined ? {} : { condition }),
      createdBy: { type: "ruleProcess", name: "field-removal-test" },
      createdAtStateSeq: state.seq,
    },
  ];
};

export const appendSelfFieldRemovalProtection = (
  state: GameState,
  source: CardInstance,
  protection: Protection = fieldRemovalProtection(),
  condition?: Condition,
  duration: GameState["continuousEffects"][number]["duration"] = {
    type: "permanent",
  },
): void => {
  state.continuousEffects.push({
    id: `field-removal-protection:${String(source.instanceId)}`,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: source.controller,
      zone: source.zone,
    },
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
      operation: { type: "protection", protection },
    },
    duration,
    ...(condition === undefined ? {} : { condition }),
    createdBy: { type: "ruleProcess", name: "field-removal-test" },
    createdAtStateSeq: state.seq,
  });
};

export const moveP2HandCardToTrash = (state: GameState): void => {
  const p2State = must(state.players[p2], "p2");
  const trashCard = must(p2State.hand[0], "p2 trash seed");
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  p2State.trash = [
    {
      ...trashCard,
      zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
    },
  ];
};

export const replaceFieldRemovalAttemptPayload = (
  process: ReplacementProcess,
  fieldRemovalAttempt: unknown,
): ReplacementProcess => {
  const payload =
    typeof process.payload === "object" && process.payload !== null
      ? { ...process.payload, fieldRemovalAttempt }
      : { fieldRemovalAttempt };
  return { ...process, payload };
};

export const applyPlayCardTestAction = (
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

export const attachOnKODrawEffect = (
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

export const attachReviewedKoReplacement = (
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
export { createActiveState, must, p1, p2, resolvedCard };
