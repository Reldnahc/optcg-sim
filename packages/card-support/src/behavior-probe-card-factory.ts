import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import { materializeEffectDefinition } from "@optcg/cards";
import type {
  CardFilter,
  CardId,
  CardInstance,
  GameState,
  PlayerId,
} from "@optcg/types";

import { resolvedProbeCard } from "./behavior-probe-scenario-state.js";
import { profileForCardFilter } from "./behavior-probe-scenario-profiles.js";

export const addProbeHandCard = (
  state: GameState,
  playerId: PlayerId,
  params: {
    readonly cardId: CardId;
    readonly category: "character" | "event";
    readonly effectText?: string;
    readonly filter?: CardFilter;
  },
): CardInstance => {
  const player = must(state.players[playerId], `player ${String(playerId)}`);
  const profile =
    params.filter === undefined ? {} : profileForCardFilter(params.filter, 0);
  const cardId = profile.cardId ?? params.cardId;
  state.cardManifest.cards[cardId] =
    state.cardManifest.cards[cardId] ??
    resolvedProbeCard({
      cardId,
      category: profile.category ?? params.category,
      effectText: params.effectText ?? "",
      profile,
    });
  const card: CardInstance = {
    instanceId: `${String(cardId)}:instance` as CardInstance["instanceId"],
    cardId,
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

export const addSupportedEventCard = (params: {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly cardId: CardId;
  readonly effectText: string;
  readonly sourceTextHash: string;
}): CardInstance => {
  const materialized = materializeEffectDefinition(
    params.cardId,
    [params.effectText],
    params.sourceTextHash,
    {
      effectDefinitionsVersion: "behavior-probe",
      rulesVersion: "behavior-probe",
    },
    { evaluateRuntimeSupport: evaluateEffectBlockRuntimeSupport },
  );
  const definition = must(
    materialized.definition,
    `${String(params.cardId)} event definition`,
  );
  const effectDefinitionId = `${String(params.cardId)}.behavior-probe`;
  params.state.cardManifest.effectDefinitions = {
    ...params.state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  params.state.cardManifest.cards[params.cardId] = resolvedProbeCard({
    cardId: params.cardId,
    category: "event",
    effectText: params.effectText,
    support: {
      cardId: params.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "behavior-probe",
      cardDataVersion: "behavior-probe",
      sourceTextHash: params.sourceTextHash,
      behaviorHash: params.sourceTextHash,
      effectDefinitionId,
    },
  });
  return addProbeHandCard(params.state, params.playerId, {
    cardId: params.cardId,
    category: "event",
    effectText: params.effectText,
  });
};

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
