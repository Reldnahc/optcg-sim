import assert from "node:assert/strict";

import type {
  CardInstance,
  CardSnapshot,
  EffectDefinition,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
} from "./action-test-fixtures.js";
import type { OnPlayTriggerQueueingFailureReason } from "./effect-runtime.js";
import type { processEffectRuntime } from "./effect-runtime.js";

export const toStateSeq = (value: number): StateSeq => value as StateSeq;

export const toSourceSnapshot = (
  card: CardInstance,
  ownerId: PlayerId,
  controllerId: PlayerId,
): CardSnapshot => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId,
  controllerId,
  zone: card.zone,
  category: card.zone.zone === "stageArea" ? "stage" : "character",
  colors: ["red"],
  keywords: [],
});

export const withCardInZone = (params: {
  state: ReturnType<typeof createActiveState>;
  playerId: PlayerId;
  card: CardInstance;
  zone: "characterArea" | "stageArea";
  index?: number;
}): CardInstance => {
  const { state, playerId, card, zone } = params;
  const index = params.index ?? 0;
  const placed: CardInstance =
    zone === "characterArea"
      ? {
          ...card,
          zone: { zone, playerId, slot: "character", index },
          attachedDon: [],
          state: "active",
          turnPlayed: state.turn.globalTurn,
        }
      : {
          ...card,
          zone: { zone, playerId, slot: "stage", index: 0 },
          attachedDon: [],
          state: "active",
        };
  const player = must(state.players[playerId], "player");
  if (zone === "characterArea") {
    player.characters = [...player.characters, placed];
  } else {
    player.stage = placed;
  }
  return placed;
};

export const appendCardPlayedEvent = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
  category: "character" | "stage",
) => {
  const event = {
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed" as const,
    payload: {
      playerId: card.zone.playerId,
      instanceId: card.instanceId,
      cardId: card.cardId,
      category,
    },
    visibility: { type: "public" as const },
    causedBy: { type: "ruleProcess" as const, name: "turnFlow" },
    createdAtStateSeq: state.seq,
  };
  state.eventJournal.push(event);
};

export const appendAttackDeclaredEvent = (
  state: ReturnType<typeof createActiveState>,
  attacker: CardInstance,
) => {
  const target = must(must(state.players[p2], "p2").leader, "p2 leader");
  const event = {
    id: toEngineEventId(`event:${String(state.seq)}:1:attackDeclared`),
    seq: state.eventJournal.length + 1,
    type: "attackDeclared" as const,
    payload: {
      attacker: {
        instanceId: attacker.instanceId,
        cardId: attacker.cardId,
        playerId: attacker.zone.playerId,
        zone: attacker.zone,
      },
      target: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
        zone: target.zone,
      },
    },
    visibility: { type: "public" as const },
    causedBy: { type: "ruleProcess" as const, name: "turnFlow" },
    createdAtStateSeq: state.seq,
  };
  state.eventJournal.push(event);
};

export const setupOnPlayDefinition = (
  state: ReturnType<typeof createActiveState>,
  played: CardInstance,
  definition: EffectDefinition,
  effectDefinitionId = "def-on-play",
): void => {
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[played.cardId] = resolvedCard({
    cardId: played.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

export const queueingState = (): {
  state: ReturnType<typeof createActiveState>;
  played: CardInstance;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "p1 hand source");
  const played = withCardInZone({
    state,
    playerId: p1,
    card: source,
    zone: "characterArea",
  });
  appendCardPlayedEvent(state, played, "character");
  return { state, played };
};

export const setupOnOpponentAttackDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  effectDefinitionId = "def-on-opponent-attack",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "on-opponent-attack-rules",
      sourceTextHash: "on-opponent-attack-source",
    },
  });
  const onPlay = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...onPlay,
    effects: [
      {
        ...must(onPlay.effects[0], "draw effect"),
        trigger: { type: "onOpponentAttack" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

export const setupWhenAttackingDefinition = (
  state: ReturnType<typeof createActiveState>,
  attacker: CardInstance,
  effectDefinitionId = "def-when-attacking",
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "when-attacking-rules",
      sourceTextHash: "when-attacking-source",
    },
  });
  const onPlay = reviewedOnPlayDrawDefinition(
    attacker.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...onPlay,
    effects: [
      {
        ...must(onPlay.effects[0], "draw effect"),
        trigger: { type: "whenAttacking" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[attacker.cardId] = supportCard;
  return definition;
};

export const attackQueueingState = (): {
  state: ReturnType<typeof createActiveState>;
  attacker: CardInstance;
  definition: EffectDefinition;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "hand source");
  const attacker = withCardInZone({
    state,
    playerId: p1,
    card: source,
    zone: "characterArea",
  });
  const definition = setupWhenAttackingDefinition(state, attacker);
  appendAttackDeclaredEvent(state, attacker);
  return { state, attacker, definition };
};

export const opponentAttackQueueingState = (): {
  state: ReturnType<typeof createActiveState>;
  attacker: CardInstance;
  target: CardInstance;
  definition: EffectDefinition;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;
  const definition = setupOnOpponentAttackDefinition(state, target);
  state.battle = {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
      zone: attacker.zone,
    },
    originalTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
      zone: target.zone,
    },
    currentTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
      zone: target.zone,
    },
    step: "counter",
    damageCount: 1,
  };
  appendAttackDeclaredEvent(state, attacker);
  return { state, attacker, target, definition };
};

export const expectOnPlayQueueingFailure = (
  result: ReturnType<typeof processEffectRuntime>,
  reason: OnPlayTriggerQueueingFailureReason,
): void => {
  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "on-play-trigger-queueing",
      details: { reason },
    },
  ]);
};
