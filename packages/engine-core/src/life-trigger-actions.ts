import type {
  Action,
  CardInstance,
  ConfirmLifeTriggerDecision,
  EffectBlock,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { reindexZoneCards } from "./action-state.js";
import { resolveImplementedDslEffectDefinition } from "./effect-runtime.js";
import { assertGameStateInvariants } from "./invariants.js";

export const hasLifeTriggerText = (triggerText: string | undefined): boolean =>
  triggerText !== undefined && triggerText.trim().length > 0;

const isSupportedTriggerEffect = (effect: EffectBlock): boolean => {
  if (effect.category !== "auto") return false;
  if (effect.trigger.type !== "trigger") return false;
  if (
    effect.sourcePresencePolicy !== "resolveFromLastKnownInformation" &&
    effect.sourcePresencePolicy !== "noSourceRequired"
  ) {
    return false;
  }
  if (effect.effect.type !== "draw") return false;
  if (effect.effect.count !== 1 || effect.effect.player !== "self") {
    return false;
  }
  if (effect.cost !== undefined) return false;
  if (effect.condition !== undefined) return false;
  if (effect.optional !== undefined && effect.optional) return false;
  if (effect.oncePerTurn !== undefined && effect.oncePerTurn) return false;
  return true;
};

const hasUnsupportedShape = (effect: EffectBlock): boolean =>
  effect.effect.type !== "draw" ||
  effect.cost !== undefined ||
  effect.condition !== undefined ||
  effect.conditionTiming !== undefined ||
  effect.failurePolicy !== undefined ||
  effect.optional !== undefined ||
  effect.oncePerTurn !== undefined;

const isExactSupportedTriggerDefinition = (
  effects: readonly EffectBlock[],
): boolean => {
  if (effects.length !== 1) {
    return false;
  }
  const effect = effects[0];
  if (effect === undefined) {
    return false;
  }
  if (hasUnsupportedShape(effect)) {
    return false;
  }
  return isSupportedTriggerEffect(effect);
};

export const getSupportedLifeTriggerDecision = (
  state: GameState,
  damagedPlayerId: PlayerId,
  card: CardInstance,
): ConfirmLifeTriggerDecision | undefined => {
  const resolved = state.cardManifest.cards[card.cardId];
  if (resolved === undefined || !hasLifeTriggerText(resolved.triggerText)) {
    return undefined;
  }
  const lookup = resolveImplementedDslEffectDefinition(
    resolved,
    state.cardManifest,
  );
  if (
    !lookup.ok ||
    !isExactSupportedTriggerDefinition(lookup.definition.effects)
  ) {
    return undefined;
  }
  return {
    id: toDecisionId(
      `decision:life-trigger:${String(card.instanceId)}:${String(state.seq + 1)}`,
    ),
    type: "confirmLifeTrigger",
    playerId: damagedPlayerId,
    prompt: "Activate life trigger?",
    causedBy: { type: "ruleProcess", name: "battle:lifeTriggerDecision" },
    visibility: { type: "public" },
    card: {
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: damagedPlayerId,
    },
    options: ["activateTrigger", "addToHand"],
  };
};

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const isCardInNormalZone = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): boolean =>
  Object.values(state.players).some((player) => {
    if (player.leader.instanceId === instanceId) return true;
    if (player.stage?.instanceId === instanceId) return true;
    return (
      player.deck.some((card) => card.instanceId === instanceId) ||
      player.donDeck.some((card) => card.instanceId === instanceId) ||
      player.hand.some((card) => card.instanceId === instanceId) ||
      player.trash.some((card) => card.instanceId === instanceId) ||
      player.characters.some((card) => card.instanceId === instanceId) ||
      player.costArea.some((card) => card.instanceId === instanceId) ||
      player.life.some((lifeCard) => lifeCard.card.instanceId === instanceId)
    );
  });

export const applyLifeTriggerDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "confirmLifeTrigger") {
    return null;
  }
  if (action.response.type !== "lifeTrigger") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be lifeTrigger for confirmLifeTrigger.",
      ),
    );
  }
  if (action.response.choice !== "addToHand") {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger activation is unsupported."),
    );
  }
  if (decision.card.playerId !== decision.playerId) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger card player does not match decision."),
    );
  }
  if (state.cardManifest.cards[decision.card.cardId] === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger card metadata is missing."),
    );
  }
  if (isCardInNormalZone(state, decision.card.instanceId)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger card is stale for current state."),
    );
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Life Trigger decision player is missing."),
    );
  }

  const movedCard: CardInstance = {
    instanceId: decision.card.instanceId,
    cardId: decision.card.cardId,
    owner: decision.playerId,
    controller: decision.playerId,
    attachedDon: [],
    zone: {
      zone: "hand",
      playerId: decision.playerId,
      slot: "hand",
      index: 0,
    },
  };
  const nextHand = reindexZoneCards(
    [movedCard, ...player.hand],
    "hand",
    decision.playerId,
    "hand",
  );
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: action.response.type,
    },
    { type: "private", playerId: decision.playerId },
  );
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      from: { zone: "life", playerId: decision.playerId, slot: "life" },
      to: movedCard.zone,
      reason: "battleDamage",
    },
    { type: "public" },
  );
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      instanceId: movedCard.instanceId,
      cardId: movedCard.cardId,
      from: { zone: "life", playerId: decision.playerId, slot: "life" },
      to: movedCard.zone,
      reason: "lifeTriggerDeclined",
    },
    { type: "private", playerId: decision.playerId },
  );

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [decision.playerId]: {
        ...player,
        hand: nextHand,
      },
    },
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};
