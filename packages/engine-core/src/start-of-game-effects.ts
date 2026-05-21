import type {
  CardId,
  CardInstance,
  CardRef,
  Effect,
  EffectBlock,
  EngineError,
  EngineEvent,
  GameState,
  MatchCardManifest,
  PlayerId,
  PlayerState,
  RngState,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "./action-results.js";
import {
  cardMatchesSearchFilter,
  reindexZoneCards,
  toCardRef,
} from "./action-state.js";
import { resolveImplementedDslEffectDefinition } from "./effect-runtime.js";

type SearchEffect = Extract<Effect, { type: "search" }>;

export interface StartOfGameSelectionInput {
  playerId: PlayerId;
  selectedInstanceId?: CardInstance["instanceId"];
}

export interface ApplyStartOfGameEffectsInput {
  players: Record<PlayerId, PlayerState>;
  manifest: MatchCardManifest;
  selections?: readonly StartOfGameSelectionInput[];
  rng: RngState;
}

type StartOfGameEffectPlan = {
  sourceCardId: CardId;
  sourcePlayerId: PlayerId;
  search: SearchEffect["request"];
  triggerBlockId: EffectBlock["id"];
};

const stageSearchPlan = (effect: Effect): SearchEffect["request"] | null => {
  if (effect.type !== "sequence") {
    return null;
  }
  const segments = effect.effects;
  const search = segments.find((segment) => segment.effect.type === "search");
  const play = segments.find(
    (segment) => segment.effect.type === "playSelected",
  );
  if (
    search === undefined ||
    play === undefined ||
    search.effect.type !== "search" ||
    play.effect.type !== "playSelected"
  ) {
    return null;
  }
  const request = search.effect.request;
  if (
    request.zone !== "deck" ||
    request.player !== "self" ||
    request.min !== 0 ||
    request.max !== 1 ||
    request.destination !== "stageArea"
  ) {
    return null;
  }
  if (
    request.filter.categories === undefined ||
    request.filter.categories.length !== 1 ||
    request.filter.categories[0] !== "stage" ||
    request.filter.typesAny === undefined ||
    request.filter.typesAny.length < 1
  ) {
    return null;
  }
  return request;
};

const collectStartOfGamePlans = (
  players: Record<PlayerId, PlayerState>,
  manifest: MatchCardManifest,
): StartOfGameEffectPlan[] => {
  const plans: StartOfGameEffectPlan[] = [];
  for (const [playerId, player] of Object.entries(players) as [
    PlayerId,
    PlayerState,
  ][]) {
    const resolved = manifest.cards[player.leader.cardId];
    if (resolved === undefined) {
      continue;
    }
    const definitionLookup = resolveImplementedDslEffectDefinition(
      resolved,
      manifest,
    );
    if (!definitionLookup.ok) {
      continue;
    }
    for (const block of definitionLookup.definition.effects) {
      if (block.trigger.type !== "startOfGame") {
        continue;
      }
      const request = stageSearchPlan(block.effect);
      if (request === null) {
        continue;
      }
      plans.push({
        sourceCardId: player.leader.cardId,
        sourcePlayerId: playerId,
        search: request,
        triggerBlockId: block.id,
      });
    }
  }
  return plans;
};

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const stageCandidateRefs = (
  player: PlayerState,
  manifest: MatchCardManifest,
  search: SearchEffect["request"],
): CardRef[] =>
  player.deck
    .filter((card) =>
      cardMatchesSearchFilter(manifest.cards[card.cardId], search.filter),
    )
    .map((card) => toCardRef(card, player.playerId));

export const applyStartOfGameEffects = (
  input: ApplyStartOfGameEffectsInput,
): {
  events: EngineEvent[];
  errors?: readonly [EngineError, ...EngineError[]];
  players: Record<PlayerId, PlayerState>;
  rng: RngState;
} => {
  const plans = collectStartOfGamePlans(input.players, input.manifest).sort(
    (a, b) => a.sourcePlayerId.localeCompare(b.sourcePlayerId),
  );
  const plannedPlayers = new Set(plans.map((plan) => plan.sourcePlayerId));
  const seenSelectionPlayers = new Set<PlayerId>();
  for (const selection of input.selections ?? []) {
    if (!plannedPlayers.has(selection.playerId)) {
      return {
        players: input.players,
        rng: input.rng,
        events: [],
        errors: invalidDecision("start-of-game selection player is invalid"),
      };
    }
    if (seenSelectionPlayers.has(selection.playerId)) {
      return {
        players: input.players,
        rng: input.rng,
        events: [],
        errors: invalidDecision("start-of-game duplicate selection for player"),
      };
    }
    seenSelectionPlayers.add(selection.playerId);
  }
  const byPlayer = new Map(
    (input.selections ?? []).map((selection) => [
      selection.playerId,
      selection.selectedInstanceId,
    ]),
  );
  const nextPlayers: Record<PlayerId, PlayerState> = { ...input.players };
  const stubState = {
    seq: 0,
    eventJournal: [],
  } as unknown as GameState;
  const events: EngineEvent[] = [];
  for (const plan of plans) {
    const player = nextPlayers[plan.sourcePlayerId];
    if (player === undefined) {
      return {
        players: input.players,
        rng: input.rng,
        events: [],
        errors: invalidDecision("start-of-game player missing"),
      };
    }
    const candidates = stageCandidateRefs(player, input.manifest, plan.search);
    const selectedId = byPlayer.get(plan.sourcePlayerId);
    if (selectedId === undefined) {
      appendEvent(
        stubState,
        events,
        "decisionCreated",
        {
          decisionType: "selectCards",
          playerId: plan.sourcePlayerId,
          effectId: plan.triggerBlockId,
        },
        { type: "private", playerId: plan.sourcePlayerId },
      );
      appendEvent(
        stubState,
        events,
        "decisionResolved",
        {
          decisionType: "selectCards",
          selectedCount: 0,
          playerId: plan.sourcePlayerId,
          effectId: plan.triggerBlockId,
        },
        { type: "private", playerId: plan.sourcePlayerId },
      );
      continue;
    }
    const selected = candidates.find(
      (candidate) => candidate.instanceId === selectedId,
    );
    if (selected === undefined) {
      return {
        players: input.players,
        rng: input.rng,
        events: [],
        errors: invalidDecision("start-of-game selected card is invalid"),
      };
    }
    const deckIndex = player.deck.findIndex(
      (card) => card.instanceId === selected.instanceId,
    );
    if (deckIndex < 0) {
      return {
        players: input.players,
        rng: input.rng,
        events: [],
        errors: invalidDecision("start-of-game selected card became stale"),
      };
    }
    const selectedCard = player.deck[deckIndex];
    if (selectedCard === undefined) {
      return {
        players: input.players,
        rng: input.rng,
        events: [],
        errors: invalidDecision("start-of-game selected card missing"),
      };
    }
    appendEvent(
      stubState,
      events,
      "decisionCreated",
      {
        decisionType: "selectCards",
        playerId: plan.sourcePlayerId,
        effectId: plan.triggerBlockId,
      },
      { type: "private", playerId: plan.sourcePlayerId },
    );

    let nextPlayer: PlayerState = {
      ...player,
      trash: [...player.trash],
    };
    if (player.stage !== undefined) {
      if (player.stage.attachedDon.length > 0) {
        return {
          players: input.players,
          rng: input.rng,
          events: [],
          errors: invalidDecision("start-of-game stage replacement is unsafe"),
        };
      }
      const trashed = {
        ...player.stage,
        zone: {
          zone: "trash" as const,
          playerId: player.playerId,
          slot: "trash" as const,
          index: 0,
        },
      };
      nextPlayer = {
        ...nextPlayer,
        trash: reindexZoneCards(
          [trashed, ...nextPlayer.trash],
          "trash",
          player.playerId,
          "trash",
        ),
      };
      appendEvent(
        stubState,
        events,
        "cardTrashed",
        {
          playerId: player.playerId,
          instanceId: player.stage.instanceId,
          cardId: player.stage.cardId,
          reason: "ruleProcessStageReplacement",
        },
        { type: "public" },
      );
    }
    const nextDeck = reindexZoneCards(
      nextPlayer.deck.filter((_, index) => index !== deckIndex),
      "deck",
      player.playerId,
      "deck",
    );
    const nextStage: CardInstance = {
      ...selectedCard,
      attachedDon: [],
      state: "active",
      zone: {
        zone: "stageArea" as const,
        playerId: player.playerId,
        slot: "stage" as const,
        index: 0,
      },
    };
    nextPlayers[player.playerId] = {
      ...nextPlayer,
      deck: nextDeck,
      stage: nextStage,
    };
    appendEvent(
      stubState,
      events,
      "decisionResolved",
      {
        decisionType: "selectCards",
        selectedCount: 1,
        playerId: player.playerId,
        effectId: plan.triggerBlockId,
      },
      { type: "private", playerId: player.playerId },
    );
    appendEvent(
      stubState,
      events,
      "cardMoved",
      {
        instanceId: selectedCard.instanceId,
        cardId: selectedCard.cardId,
        from: selectedCard.zone,
        to: nextStage.zone,
        reason: "startOfGamePlaySelectedStage",
      },
      { type: "public" },
    );
    appendEvent(
      stubState,
      events,
      "cardPlayed",
      {
        playerId: player.playerId,
        instanceId: selectedCard.instanceId,
        cardId: selectedCard.cardId,
        category: "stage",
      },
      { type: "public" },
    );
  }
  return {
    players: nextPlayers,
    rng: input.rng,
    events: events.map((event, index) => ({
      ...event,
      seq: index + 1,
      createdAtStateSeq: toStateSeq(0),
    })),
  };
};
