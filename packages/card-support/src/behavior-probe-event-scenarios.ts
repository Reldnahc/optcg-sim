import {
  applyAction,
  evaluateEffectBlockRuntimeSupport,
} from "@optcg/engine-core";
import { materializeEffectDefinition } from "@optcg/cards";
import type {
  CardFilter,
  CardId,
  CardInstance,
  EffectDefinition,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  fieldProbeSource,
  installProbeSourceMetadata,
  resolvedProbeCard,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

interface BehaviorProbeRunResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pendingDecisionDrained: boolean;
  readonly effectQueueDrained: boolean;
  readonly eventCount: number;
  readonly decisionsResolved: number;
  readonly setupFilterCount: number;
}

export const runCardPlayedScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  const played = addProbeHandCard(state, p1, {
    cardId: "probe-card-played-match" as CardId,
    category: "character",
  });
  return drainRuntime(
    applyAction(state, { type: "playCard", cardInstanceId: played.instanceId }),
    input.setupFilters.length,
  );
};

export const runEndOfYourTurnScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  return drainRuntime(
    applyAction(state, { type: "endMainPhase" }),
    input.setupFilters.length,
  );
};

export const runFieldRemovedScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  addProbeFieldCharacter(state, p2, "probe-field-removed-target" as CardId);
  const removalEvent = addFieldRemovalEventCard(state);
  return drainRuntime(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: removalEvent.instanceId,
    }),
    input.setupFilters.length,
  );
};

export const runOpponentActivatedScenario = (
  input: {
    readonly category: "character";
    readonly definition: EffectDefinition;
    readonly setupFilters: readonly CardFilter[];
    readonly text: string;
  },
  drainRuntime: (
    initialResult: EngineResult,
    setupFilterCount: number,
  ) => BehaviorProbeRunResult,
): BehaviorProbeRunResult => {
  const state = setupProbeMainState(input);
  installProbeSourceMetadata(state, "character", input.setupFilters);
  state.turn.turnPlayerId = p2;
  state.turn.playerTurnCounts[p2] = Math.max(
    state.turn.playerTurnCounts[p2] ?? 0,
    1,
  );
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  const event = addOpponentActivationEventCard(state);
  return drainRuntime(
    applyAction(state, { type: "playCard", cardInstanceId: event.instanceId }),
    input.setupFilters.length,
  );
};

const failedProbeFielding = (
  state: GameState,
  setupFilterCount: number,
): BehaviorProbeRunResult => ({
  ok: false,
  reason: "probe card could not be fielded",
  pendingDecisionDrained: state.pendingDecision === undefined,
  effectQueueDrained: state.effectQueue.length === 0,
  eventCount: 0,
  decisionsResolved: 0,
  setupFilterCount,
});

const addProbeHandCard = (
  state: GameState,
  playerId: PlayerId,
  params: {
    readonly cardId: CardId;
    readonly category: "character" | "event";
    readonly effectText?: string;
  },
): CardInstance => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  state.cardManifest.cards[params.cardId] =
    state.cardManifest.cards[params.cardId] ??
    resolvedProbeCard({
      cardId: params.cardId,
      category: params.category,
      effectText: params.effectText ?? "",
    });
  const card: CardInstance = {
    instanceId:
      `${String(params.cardId)}:instance` as CardInstance["instanceId"],
    cardId: params.cardId,
    owner: playerId,
    controller: playerId,
    zone: {
      zone: "hand",
      playerId,
      slot: "hand",
      index: player.hand.length,
    },
    state: "active",
    attachedDon: [],
    turnPlayed: 0,
  };
  player.hand = [...player.hand, card];
  return card;
};

const addProbeFieldCharacter = (
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
): CardInstance => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  state.cardManifest.cards[cardId] = resolvedProbeCard({
    cardId,
    category: "character",
    effectText: "",
  });
  const card: CardInstance = {
    instanceId: `${String(cardId)}:instance` as CardInstance["instanceId"],
    cardId,
    owner: playerId,
    controller: playerId,
    zone: {
      zone: "characterArea",
      playerId,
      slot: "character",
      index: player.characters.length,
    },
    state: "active",
    attachedDon: [],
    turnPlayed: 0,
  };
  player.characters = [...player.characters, card];
  return card;
};

const addFieldRemovalEventCard = (state: GameState): CardInstance => {
  const cardId = "probe-field-removal-event" as CardId;
  const effectText = "[Main] K.O. up to 1 of your opponent's Characters.";
  const materialized = materializeEffectDefinition(
    cardId,
    [effectText],
    "behavior-probe-field-removal-event",
    {
      effectDefinitionsVersion: "behavior-probe",
      rulesVersion: "behavior-probe",
    },
    { evaluateRuntimeSupport: evaluateEffectBlockRuntimeSupport },
  );
  const definition = must(
    materialized.definition,
    "field removal event definition",
  );
  const effectDefinitionId = "probe-field-removal-event.behavior-probe";
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[cardId] = resolvedProbeCard({
    cardId,
    category: "event",
    effectText,
    support: {
      cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "behavior-probe",
      cardDataVersion: "behavior-probe",
      sourceTextHash: "behavior-probe-field-removal-event",
      behaviorHash: "behavior-probe-field-removal-event",
      effectDefinitionId,
    },
  });
  return addProbeHandCard(state, p1, {
    cardId,
    category: "event",
    effectText,
  });
};

const addOpponentActivationEventCard = (state: GameState): CardInstance => {
  const cardId = "probe-opponent-activation-event" as CardId;
  const effectText = "[Main] Draw 1 card.";
  const materialized = materializeEffectDefinition(
    cardId,
    [effectText],
    "behavior-probe-opponent-activation-event",
    {
      effectDefinitionsVersion: "behavior-probe",
      rulesVersion: "behavior-probe",
    },
    { evaluateRuntimeSupport: evaluateEffectBlockRuntimeSupport },
  );
  const definition = must(
    materialized.definition,
    "opponent activation event definition",
  );
  const effectDefinitionId = "probe-opponent-activation-event.behavior-probe";
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[cardId] = resolvedProbeCard({
    cardId,
    category: "event",
    effectText,
    support: {
      cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "behavior-probe",
      cardDataVersion: "behavior-probe",
      sourceTextHash: "behavior-probe-opponent-activation-event",
      behaviorHash: "behavior-probe-opponent-activation-event",
      effectDefinitionId,
    },
  });
  return addProbeHandCard(state, p2, {
    cardId,
    category: "event",
    effectText,
  });
};

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
