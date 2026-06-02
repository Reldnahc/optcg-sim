import type {
  Action,
  CardId,
  CardRef,
  DecisionId,
  Effect,
  EffectBlock,
  EngineError,
  EngineEvent,
  GameState,
  MatchCardManifest,
  PlayerId,
  PlayerState,
  SearchRequest,
} from "@optcg/types";

import { appendEvent, toDecisionId, toStateSeq } from "../action-results.js";
import {
  cardMatchesSearchFilter,
  reindexZoneCards,
  toCardRef,
  zonesEqual,
} from "../action-state.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { resolveImplementedDslEffectDefinition } from "../effect-runtime.js";
import type { PreMulliganSetupGameState } from "./initial-state.js";

export type StartOfGameEffectPlan = {
  sourceCardId: CardId;
  sourcePlayerId: PlayerId;
  search: SearchRequest;
  triggerBlockId: EffectBlock["id"];
};

const setupDecisionSetPrefix = "set:setup-start-of-game:";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const setupRuntimeError = (
  reason: string,
): readonly [EngineError, ...EngineError[]] => [
  {
    type: "effectRuntimeError",
    effectId: "setup:start-of-game",
    details: { reason },
  },
];

const isCardRefLike = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate["instanceId"] !== "string" ||
    typeof candidate["cardId"] !== "string" ||
    typeof candidate["playerId"] !== "string"
  ) {
    return false;
  }
  if (
    "zone" in candidate &&
    candidate["zone"] !== undefined &&
    (typeof candidate["zone"] !== "object" || candidate["zone"] === null)
  ) {
    return false;
  }
  return true;
};

const stageSearchPlan = (effect: Effect): SearchRequest | null => {
  if (effect.type !== "sequence") {
    return null;
  }
  if (effect.effects.length !== 2) {
    return null;
  }
  const first = effect.effects[0];
  const second = effect.effects[1];
  if (
    first === undefined ||
    second === undefined ||
    first.effect.type !== "search" ||
    second.effect.type !== "playSelected"
  ) {
    return null;
  }
  const request = first.effect.request;
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

export const isSupportedStartOfGameEffectBlock = (
  block: EffectBlock,
): boolean =>
  block.category === "auto" &&
  block.trigger.type === "startOfGame" &&
  block.cost === undefined &&
  block.condition === undefined &&
  block.conditionTiming === undefined &&
  block.failurePolicy === undefined &&
  block.optional !== true &&
  block.sourcePresencePolicy === "noSourceRequired" &&
  stageSearchPlan(block.effect) !== null;

const findStageCandidates = (
  player: PlayerState,
  manifest: MatchCardManifest,
  search: SearchRequest,
): CardRef[] =>
  player.deck
    .filter((card) => {
      const resolved = manifest.cards[card.cardId];
      return (
        resolved !== undefined &&
        cardMatchesSearchFilter(resolved, search.filter)
      );
    })
    .map((card) => toCardRef(card, player.playerId));

const createSetupDecisionId = (playerId: PlayerId, index: number): DecisionId =>
  toDecisionId(`decision:setup:start-of-game:${playerId}:${String(index)}`);

export const collectStartOfGamePlans = (
  players: Record<PlayerId, PlayerState>,
  manifest: MatchCardManifest,
  playerOrder: readonly [PlayerId, PlayerId],
): {
  plans: StartOfGameEffectPlan[];
  errors?: readonly [EngineError, ...EngineError[]];
} => {
  const plans: StartOfGameEffectPlan[] = [];
  for (const playerId of playerOrder) {
    const player = players[playerId];
    if (player === undefined) {
      continue;
    }
    const resolved = manifest.cards[player.leader.cardId];
    if (resolved === undefined) {
      continue;
    }
    if (resolved.support.status !== "implemented-dsl") {
      continue;
    }
    const lookup = resolveImplementedDslEffectDefinition(resolved, manifest);
    if (!lookup.ok) {
      return { plans: [], errors: [lookup.error] };
    }
    for (const block of lookup.definition.effects) {
      if (block.trigger.type !== "startOfGame") {
        continue;
      }
      const request = stageSearchPlan(block.effect);
      if (request === null) {
        return {
          plans: [],
          errors: setupRuntimeError("unsupported start-of-game effect shape"),
        };
      }
      plans.push({
        sourceCardId: player.leader.cardId,
        sourcePlayerId: playerId,
        search: request,
        triggerBlockId: block.id,
      });
    }
  }
  return { plans };
};

const setupDecisionForPlan = (
  state: PreMulliganSetupGameState,
  plans: readonly StartOfGameEffectPlan[],
  index: number,
): NonNullable<GameState["pendingDecision"]> | undefined => {
  for (let planIndex = index; planIndex < plans.length; planIndex += 1) {
    const plan = plans[planIndex];
    if (plan === undefined) {
      break;
    }
    const player = state.players[plan.sourcePlayerId];
    if (player === undefined) {
      return undefined;
    }
    const candidates = findStageCandidates(
      player,
      state.cardManifest,
      plan.search,
    );
    if (candidates.length === 0) {
      continue;
    }
    if (state.setupContinuation !== undefined) {
      state.setupContinuation.nextStartOfGamePlanIndex = planIndex;
    }
    return {
      id: createSetupDecisionId(plan.sourcePlayerId, planIndex),
      type: "selectCards",
      playerId: plan.sourcePlayerId,
      prompt: "Select up to 1 Stage card to play during setup.",
      causedBy: { type: "ruleProcess", name: "setup:startOfGame" },
      visibility: { type: "private", playerId: plan.sourcePlayerId },
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "self",
        zone: "deck",
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "privateToChooser",
        filter: plan.search.filter,
        set: `${setupDecisionSetPrefix}${String(planIndex)}` as never,
      },
      candidates: candidates.map((card) => ({
        card,
        visibility: { type: "private", playerId: plan.sourcePlayerId },
      })),
    };
  }
  if (state.setupContinuation !== undefined) {
    state.setupContinuation.nextStartOfGamePlanIndex = plans.length;
  }
  return undefined;
};

export const createStartOfGameSetupDecision = (
  state: PreMulliganSetupGameState,
  plans: readonly StartOfGameEffectPlan[],
  index: number,
): {
  pendingDecision?: NonNullable<GameState["pendingDecision"]>;
  errors?: readonly [EngineError, ...EngineError[]];
} => {
  if (!Number.isInteger(index) || index < 0) {
    return { errors: setupRuntimeError("setup plan index is invalid") };
  }
  const pendingDecision = setupDecisionForPlan(state, plans, index);
  return pendingDecision === undefined ? {} : { pendingDecision };
};

const applyStageSelection = (
  state: PreMulliganSetupGameState,
  player: PlayerState,
  selected: CardRef | undefined,
  events: EngineEvent[],
):
  | { player: PlayerState }
  | { error: readonly [EngineError, ...EngineError[]] } => {
  if (selected === undefined) {
    return { player };
  }
  const deckIndex = player.deck.findIndex(
    (card) => card.instanceId === selected.instanceId,
  );
  if (deckIndex < 0) {
    return {
      error: invalidDecision("start-of-game selected card became stale"),
    };
  }
  const selectedCard = player.deck[deckIndex];
  if (selectedCard === undefined) {
    return { error: invalidDecision("start-of-game selected card missing") };
  }
  let nextPlayer: PlayerState = player;
  if (player.stage !== undefined) {
    if (player.stage.attachedDon.length > 0) {
      return {
        error: invalidDecision("start-of-game stage replacement is unsafe"),
      };
    }
    const movement = moveConcreteCardsToTrash(state, events, [player.stage], {
      cardMovedPayloadShape: "zoneRefs",
      cardMovedVisibility: { type: "public" },
      cardTrashedVisibility: { type: "public" },
      emitCardTrashed: true,
      includeCardIdentityInCardMoved: true,
      playerId: player.playerId,
      reason: "ruleProcessStageReplacement",
      sourceZone: "stageArea",
    });
    const movedPlayer = movement.state.players[player.playerId];
    if (movedPlayer === undefined) {
      return { error: invalidDecision("start-of-game player missing") };
    }
    nextPlayer = movedPlayer;
  }

  const nextDeck = reindexZoneCards(
    nextPlayer.deck.filter((_, index) => index !== deckIndex),
    "deck",
    player.playerId,
    "deck",
  );
  const nextStage = {
    ...selectedCard,
    attachedDon: [],
    state: "active" as const,
    zone: {
      zone: "stageArea" as const,
      playerId: player.playerId,
      slot: "stage" as const,
      index: 0,
    },
  };
  appendEvent(
    state,
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
    state,
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

  return {
    player: {
      ...nextPlayer,
      deck: nextDeck,
      stage: nextStage,
    },
  };
};

export const isStartOfGameSetupDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is Extract<
  NonNullable<GameState["pendingDecision"]>,
  { type: "selectCards" }
> =>
  decision.type === "selectCards" &&
  decision.request.set !== undefined &&
  String(decision.request.set).startsWith(setupDecisionSetPrefix);

export const applyStartOfGameSetupDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): null | {
  events: EngineEvent[];
  errors?: readonly [EngineError, ...EngineError[]];
  state: PreMulliganSetupGameState;
  shouldFinalizeSetup: boolean;
} => {
  const pending = state.pendingDecision;
  if (pending === undefined || !isStartOfGameSetupDecision(pending)) {
    return null;
  }
  const setupState = state as PreMulliganSetupGameState;
  const continuation = setupState.setupContinuation;
  if (continuation === undefined) {
    return {
      state: setupState,
      events: [],
      errors: invalidDecision("setup continuation missing"),
      shouldFinalizeSetup: false,
    };
  }
  if (
    !Number.isInteger(continuation.nextStartOfGamePlanIndex) ||
    continuation.nextStartOfGamePlanIndex < 0
  ) {
    return {
      state: setupState,
      events: [],
      errors: invalidDecision("setup continuation index is invalid"),
      shouldFinalizeSetup: false,
    };
  }
  const plansResult = collectStartOfGamePlans(
    setupState.players,
    setupState.cardManifest,
    continuation.playerOrder,
  );
  if (plansResult.errors !== undefined) {
    return {
      state: setupState,
      events: [],
      errors: plansResult.errors,
      shouldFinalizeSetup: false,
    };
  }
  const plans = plansResult.plans;
  const currentPlan = plans[continuation.nextStartOfGamePlanIndex];
  if (
    currentPlan === undefined ||
    currentPlan.sourcePlayerId !== pending.playerId
  ) {
    return {
      state: setupState,
      events: [],
      errors: invalidDecision("setup decision is stale"),
      shouldFinalizeSetup: false,
    };
  }
  if (
    pending.id !==
    createSetupDecisionId(
      pending.playerId,
      continuation.nextStartOfGamePlanIndex,
    )
  ) {
    return {
      state: setupState,
      events: [],
      errors: invalidDecision("setup decision id does not match continuation"),
      shouldFinalizeSetup: false,
    };
  }
  if (action.response.type !== "cards") {
    return {
      state: setupState,
      events: [],
      errors: invalidDecision(
        "Response type must be cards for setup selection",
      ),
      shouldFinalizeSetup: false,
    };
  }
  const responseCards = action.response.cards;
  if (!Array.isArray(responseCards) || responseCards.length > 1) {
    return {
      state: setupState,
      events: [],
      errors: invalidDecision("setup selection must choose up to one card"),
      shouldFinalizeSetup: false,
    };
  }
  const selected = responseCards[0];
  if (selected !== undefined && !isCardRefLike(selected)) {
    return {
      state: setupState,
      events: [],
      errors: invalidDecision("start-of-game selected card is invalid"),
      shouldFinalizeSetup: false,
    };
  }
  const candidate =
    selected === undefined
      ? undefined
      : pending.candidates.find(
          (entry: { card: CardRef }) =>
            entry.card.instanceId === selected.instanceId &&
            entry.card.cardId === selected.cardId &&
            entry.card.playerId === selected.playerId &&
            ((entry.card.zone === undefined && selected.zone === undefined) ||
              (entry.card.zone !== undefined &&
                selected.zone !== undefined &&
                zonesEqual(entry.card.zone, selected.zone))),
        )?.card;
  if (selected !== undefined && candidate === undefined) {
    return {
      state: setupState,
      events: [],
      errors: invalidDecision("start-of-game selected card is invalid"),
      shouldFinalizeSetup: false,
    };
  }

  const player = setupState.players[pending.playerId];
  if (player === undefined) {
    return {
      state: setupState,
      events: [],
      errors: invalidDecision("setup decision player missing"),
      shouldFinalizeSetup: false,
    };
  }

  const events: EngineEvent[] = [];
  appendEvent(
    setupState,
    events,
    "decisionResolved",
    {
      decisionId: pending.id,
      decisionType: pending.type,
      playerId: pending.playerId,
      responseType: "cards",
      selectedCount: selected === undefined ? 0 : 1,
    },
    pending.visibility,
  );
  const selectedResult = applyStageSelection(
    setupState,
    player,
    candidate,
    events,
  );
  if ("error" in selectedResult) {
    return {
      state: setupState,
      events: [],
      errors: selectedResult.error,
      shouldFinalizeSetup: false,
    };
  }

  const nextState: PreMulliganSetupGameState = {
    ...setupState,
    seq: toStateSeq(setupState.seq + 1),
    actionSeq: setupState.actionSeq + 1,
    players: {
      ...setupState.players,
      [pending.playerId]: selectedResult.player,
    },
    eventJournal: [...setupState.eventJournal],
  };
  delete nextState.pendingDecision;
  nextState.setupContinuation = {
    ...continuation,
    nextStartOfGamePlanIndex: continuation.nextStartOfGamePlanIndex + 1,
  };

  const nextPlansResult = collectStartOfGamePlans(
    nextState.players,
    nextState.cardManifest,
    continuation.playerOrder,
  );
  if (nextPlansResult.errors !== undefined) {
    return {
      state: nextState,
      events,
      errors: nextPlansResult.errors,
      shouldFinalizeSetup: false,
    };
  }

  const nextDecisionResult = createStartOfGameSetupDecision(
    nextState,
    nextPlansResult.plans,
    nextState.setupContinuation.nextStartOfGamePlanIndex,
  );
  if (nextDecisionResult.errors !== undefined) {
    return {
      state: nextState,
      events,
      errors: nextDecisionResult.errors,
      shouldFinalizeSetup: false,
    };
  }
  if (nextDecisionResult.pendingDecision !== undefined) {
    nextState.pendingDecision = nextDecisionResult.pendingDecision;
    appendEvent(
      setupState,
      events,
      "decisionCreated",
      {
        decisionId: nextDecisionResult.pendingDecision.id,
        decisionType: nextDecisionResult.pendingDecision.type,
        playerId: nextDecisionResult.pendingDecision.playerId,
      },
      nextDecisionResult.pendingDecision.visibility,
    );
    nextState.eventJournal = [...nextState.eventJournal, ...events];
    return {
      state: nextState,
      events,
      shouldFinalizeSetup: false,
    };
  }

  nextState.eventJournal = [...nextState.eventJournal, ...events];
  return {
    state: nextState,
    events,
    shouldFinalizeSetup: true,
  };
};
