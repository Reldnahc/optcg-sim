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
  ReplacementTrigger,
} from "@optcg/types";

import {
  fieldProbeSource,
  installProbeSourceMetadata,
  resolvedProbeCard,
  setupProbeMainState,
} from "./behavior-probe-scenario-state.js";
import { profileForCardFilter } from "./behavior-probe-scenario-profiles.js";

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

export const runReplacementScenario = (
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
  state.turn.phase = "main";
  const replacement = replacementTriggerForDefinition(input.definition);
  const protectsSelf = replacementTargetsSelf(replacement);
  if (!protectsSelf) {
    addProbeFieldCharacter(state, p1, {
      cardId: "probe-replacement-protected-target" as CardId,
      ...(input.setupFilters[0] === undefined
        ? {}
        : { filter: input.setupFilters[0] }),
    });
  }
  const player = must(state.players[p1], `player ${String(p1)}`);
  const source = fieldProbeSource(player);
  if (source === undefined) {
    return failedProbeFielding(state, input.setupFilters.length);
  }
  const koEvent = addOpponentKoEventCard(state);
  return drainRuntime(
    applyAction(state, {
      type: "playCard",
      cardInstanceId: koEvent.instanceId,
    }),
    input.setupFilters.length,
  );
};

const replacementTriggerForDefinition = (
  definition: EffectDefinition,
): ReplacementTrigger | undefined => {
  const trigger = definition.effects.find(
    (effect) => effect.trigger.type === "replacement",
  )?.trigger;
  return trigger?.type === "replacement" ? trigger.replacement : undefined;
};

const replacementTargetsSelf = (
  replacement: ReplacementTrigger | undefined,
): boolean => {
  if (replacement === undefined) {
    return false;
  }
  if (replacement.type === "anyOf") {
    return replacement.replacements.every(replacementTargetsSelf);
  }
  if (
    replacement.type === "wouldBeKOd" ||
    replacement.type === "wouldBeRested" ||
    replacement.type === "wouldBeTrashed" ||
    replacement.type === "wouldMoveZone" ||
    replacement.type === "wouldTakeDamage"
  ) {
    return replacement.target.type === "self";
  }
  return false;
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

const addProbeFieldCharacter = (
  state: GameState,
  playerId: PlayerId,
  params: {
    readonly cardId: CardId;
    readonly filter?: CardFilter;
  },
): CardInstance => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  const profile =
    params.filter === undefined
      ? undefined
      : profileForCardFilter(params.filter, 0);
  const cardId = profile?.cardId ?? params.cardId;
  state.cardManifest.cards[cardId] = resolvedProbeCard({
    cardId,
    category: "character",
    effectText: "",
    ...(profile === undefined ? {} : { profile }),
  });
  const card: CardInstance = {
    instanceId:
      `${String(params.cardId)}:instance` as CardInstance["instanceId"],
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

const addProbeHandCard = (
  state: GameState,
  playerId: PlayerId,
  params: {
    readonly cardId: CardId;
    readonly category: "event";
    readonly effectText: string;
  },
): CardInstance => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
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

const addOpponentKoEventCard = (state: GameState): CardInstance => {
  const cardId = "probe-replacement-ko-event" as CardId;
  const effectText = "[Main] K.O. up to 1 of your opponent's Characters.";
  const materialized = materializeEffectDefinition(
    cardId,
    [effectText],
    "behavior-probe-replacement-ko-event",
    {
      effectDefinitionsVersion: "behavior-probe",
      rulesVersion: "behavior-probe",
    },
    { evaluateRuntimeSupport: evaluateEffectBlockRuntimeSupport },
  );
  const definition = must(
    materialized.definition,
    "replacement K.O. event definition",
  );
  const effectDefinitionId = "probe-replacement-ko-event.behavior-probe";
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
      sourceTextHash: "behavior-probe-replacement-ko-event",
      behaviorHash: "behavior-probe-replacement-ko-event",
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
