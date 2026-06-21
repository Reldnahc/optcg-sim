import type {
  CardFilter,
  CardId,
  CardInstance,
  EffectBlock,
  EffectDefinition,
  GameState,
  PlayerId,
  Trigger,
  Zone,
} from "@optcg/types";

import {
  addProbeHandCard,
  addSupportedEventCard,
} from "./behavior-probe-card-factory.js";
import { resolvedProbeCard } from "./behavior-probe-scenario-state.js";
import { profileForCardFilter } from "./behavior-probe-scenario-profiles.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

export interface CardPlayedCandidateConfig {
  readonly playerId: PlayerId;
  readonly filter?: CardFilter;
  readonly sourceZone?: Zone;
}

export const cardPlayedCandidateConfig = (
  definition: EffectDefinition,
): CardPlayedCandidateConfig => {
  const trigger = cardPlayedTriggerForDefinition(definition);
  return {
    playerId: trigger?.player === "opponent" ? p2 : p1,
    ...optionalFilter(cardPlayedFilter(trigger)),
    ...optionalSourceZone(cardPlayedSourceZone(trigger)),
  };
};

export const installCardPlayedCandidate = (params: {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly filter?: CardFilter;
  readonly sourceZone?: Zone;
}): CardInstance => {
  if (params.sourceZone === "trash") {
    addProbeTrashCard(params);
    return addSupportedEventCard({
      state: params.state,
      playerId: params.playerId,
      cardId: "probe-card-played-trash-event" as CardId,
      effectText: "[Main] Play up to 1 Character card from your trash.",
      sourceTextHash: "behavior-probe-card-played-trash-event",
    });
  }
  return addProbeHandCard(params.state, params.playerId, {
    cardId: "probe-card-played-match" as CardId,
    category: "character",
    ...optionalFilter(params.filter),
  });
};

const cardPlayedTriggerForDefinition = (
  definition: EffectDefinition,
): Extract<Trigger, { type: "cardPlayed" }> | undefined => {
  for (const block of definition.effects) {
    const found = cardPlayedTriggerForBlock(block);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
};

const cardPlayedTriggerForBlock = (
  block: EffectBlock,
): Extract<Trigger, { type: "cardPlayed" }> | undefined =>
  cardPlayedTrigger(block.trigger);

const cardPlayedTrigger = (
  trigger: Trigger,
): Extract<Trigger, { type: "cardPlayed" }> | undefined => {
  if (trigger.type === "cardPlayed") {
    return trigger;
  }
  if (trigger.type === "anyOf") {
    for (const child of trigger.triggers) {
      const found = cardPlayedTrigger(child);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
};

const cardPlayedFilter = (
  trigger: Extract<Trigger, { type: "cardPlayed" }> | undefined,
): CardFilter | undefined =>
  trigger?.filter ??
  trigger?.anyOf?.find((candidate) => candidate.filter)?.filter;

const cardPlayedSourceZone = (
  trigger: Extract<Trigger, { type: "cardPlayed" }> | undefined,
): Zone | undefined =>
  trigger?.sourceZone ??
  trigger?.anyOf?.find((candidate) => candidate.sourceZone)?.sourceZone;

const optionalFilter = (
  filter: CardFilter | undefined,
): { readonly filter: CardFilter } | Record<string, never> =>
  filter === undefined ? {} : { filter };

const optionalSourceZone = (
  sourceZone: Zone | undefined,
): { readonly sourceZone: Zone } | Record<string, never> =>
  sourceZone === undefined ? {} : { sourceZone };

const addProbeTrashCard = (params: {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly filter?: CardFilter;
}): CardInstance => {
  const player = must(
    params.state.players[params.playerId],
    `player ${String(params.playerId)}`,
  );
  const profile =
    params.filter === undefined ? {} : profileForCardFilter(params.filter, 0);
  const cardId = profile.cardId ?? ("probe-card-played-trash" as CardId);
  params.state.cardManifest.cards[cardId] = resolvedProbeCard({
    cardId,
    category: profile.category ?? "character",
    effectText: "",
    profile,
  });
  const card: CardInstance = {
    instanceId:
      `${String(cardId)}:trash-instance` as CardInstance["instanceId"],
    cardId,
    owner: params.playerId,
    controller: params.playerId,
    zone: {
      zone: "trash",
      playerId: params.playerId,
      slot: "trash",
      index: player.trash.length,
    },
    state: "active",
    attachedDon: [],
    turnPlayed: 0,
  };
  player.trash = [...player.trash, card];
  return card;
};

const must = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Behavior probe missing ${label}.`);
  }
  return value;
};
