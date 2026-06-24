import {
  applyAction,
  getLegalActions,
  respondToMulliganDecision,
} from "@optcg/engine-core";
import type {
  Action,
  CardInstance,
  DecisionId,
  DecisionResponse,
  EngineResult,
  GameState,
  InstanceId,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { actionDecisionPayment } from "../dev-action-payment.js";
import { recordActionTimingSpan } from "../action-timing-log.js";
import { cardName } from "../dev-card-utils.js";
import { actionLabel } from "../local-dev-action-labels.js";
import type { DevVisibleAction } from "../dev-snapshot-types.js";
import {
  advanceToMainPhase,
  liveEngineOptions,
  timedStateHash,
} from "./engine-flow.js";

export type ExecutableDevAction = DevVisibleAction & {
  apply: (
    state: GameState,
    input?: { readonly selectedDonInstanceIds?: readonly InstanceId[] },
  ) => EngineResult;
  decisionId?: DecisionId;
  response?: DecisionResponse;
  deterministicAction?: (input?: {
    readonly selectedDonInstanceIds?: readonly InstanceId[];
  }) => Action;
};

const responseKeyForDecisionResponse = (
  response: DecisionResponse | undefined,
): string | undefined => {
  if (response === undefined) {
    return undefined;
  }
  switch (response.type) {
    case "payment":
      return response.optionId;
    case "paymentDeclined":
      return "decline";
    case "optionalActivation":
      return response.choice;
    case "lifeTrigger":
      return response.choice;
    case "replacement":
      return response.replacementId ?? "decline";
    case "chooseQuantity":
      return String(response.quantity);
    case "effectOption":
      return response.optionId;
    case "effectOptionDeclined":
      return "decline";
    case "mulligan":
      return response.keep ? "keep" : "mulligan";
    case "loopCount":
      return String(response.count);
    case "rollbackConsent":
      return response.allow ? "allow" : "deny";
    case "cards":
    case "targets":
    case "orderedIds":
    case "topBottomPlacement":
      return undefined;
  }
};

const visibleAction = (
  state: GameState,
  action: LegalAction,
): Omit<ExecutableDevAction, "index" | "apply"> => {
  const placement = actionPlacement(state, action);
  const attachment = actionAttachment(action);
  const attack = actionAttack(action);
  const counter = actionCounter(state, action);
  const decisionPayment = actionDecisionPayment(state, action);
  return {
    type: action.type,
    label: actionLabel(state, action),
    ...(() => {
      const responseKey =
        action.type === "respondToDecision"
          ? responseKeyForDecisionResponse(action.response)
          : undefined;
      return responseKey === undefined ? {} : { responseKey };
    })(),
    ...(decisionPayment === undefined ? {} : { decisionPayment }),
    ...(placement === undefined
      ? {}
      : { placement: { instanceId: placement } }),
    ...(attachment === undefined ? {} : { attachment }),
    ...(attack === undefined ? {} : { attack }),
    ...(counter === undefined ? {} : { counter }),
  };
};

const actionPlacement = (
  state: GameState,
  action: LegalAction,
): CardInstance["instanceId"] | undefined => {
  switch (action.type) {
    case "playCard":
    case "useCounter":
      return action.cardInstanceId;
    case "activateEffect":
      return action.source.instanceId;
    case "attachDon":
      return action.target.instanceId;
    case "declareAttack":
      return action.attacker.instanceId;
    case "activateBlocker":
      return action.blocker.instanceId;
    case "concede":
    case "endMainPhase":
      return undefined;
    case "respondToDecision":
      return action.response.type === "optionalActivation" &&
        state.pendingDecision?.type === "chooseOptionalActivation" &&
        state.pendingDecision.id === action.decisionId
        ? state.pendingDecision.source.instanceId
        : undefined;
  }
};

const actionAttachment = (
  action: LegalAction,
): DevVisibleAction["attachment"] | undefined => {
  if (action.type === "attachDon") {
    if (action.donInstanceId === undefined) {
      return undefined;
    }
    return {
      donInstanceId: action.donInstanceId,
      targetInstanceId: action.target.instanceId,
    };
  }
  if (
    action.type === "respondToDecision" &&
    action.response.type === "payment" &&
    action.response.selectedDonInstanceIds?.length === 1 &&
    action.response.selectedCardInstanceIds?.length === 1
  ) {
    const donInstanceId = action.response.selectedDonInstanceIds[0];
    const targetInstanceId = action.response.selectedCardInstanceIds[0];
    if (donInstanceId === undefined || targetInstanceId === undefined) {
      return undefined;
    }
    return {
      donInstanceId,
      targetInstanceId,
    };
  }
  return undefined;
};

const actionAttack = (
  action: LegalAction,
): DevVisibleAction["attack"] | undefined => {
  if (action.type !== "declareAttack") {
    return undefined;
  }
  return {
    attackerInstanceId: action.attacker.instanceId,
    targetInstanceId: action.target.instanceId,
  };
};

const actionCounter = (
  state: GameState,
  action: LegalAction,
): DevVisibleAction["counter"] | undefined => {
  if (action.type !== "useCounter") {
    return undefined;
  }
  const counterCard = Object.values(state.players)
    .flatMap((player) => player.hand)
    .find((card) => card.instanceId === action.cardInstanceId);
  const amount =
    counterCard === undefined
      ? undefined
      : state.cardManifest.cards[counterCard.cardId]?.counter;
  return {
    cardInstanceId: action.cardInstanceId,
    targetInstanceId: action.target.instanceId,
    ...(amount === undefined ? {} : { amount }),
  };
};

const mulliganActions = (
  state: GameState,
  playerId: PlayerId,
): ExecutableDevAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "mulligan" ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  return [
    {
      index: 0,
      type: "respondToDecision",
      label: "Keep hand",
      responseKey: "keep",
      decisionId: decision.id,
      response: { type: "mulligan", keep: true },
      deterministicAction: () => ({
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "mulligan", keep: true },
      }),
      apply: (currentState) =>
        respondToMulliganDecision(currentState, {
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "mulligan", keep: true },
        }),
    },
    {
      index: 1,
      type: "respondToDecision",
      label: "Mulligan hand",
      responseKey: "mulligan",
      decisionId: decision.id,
      response: { type: "mulligan", keep: false },
      deterministicAction: () => ({
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "mulligan", keep: false },
      }),
      apply: (currentState) =>
        respondToMulliganDecision(currentState, {
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "mulligan", keep: false },
        }),
    },
  ];
};

const phaseActions = (
  state: GameState,
  playerId: PlayerId,
): ExecutableDevAction[] => {
  if (
    state.status.type !== "active" ||
    state.pendingDecision !== undefined ||
    state.turn.turnPlayerId !== playerId ||
    state.turn.phase === "main" ||
    state.battle !== undefined
  ) {
    return [];
  }
  return [
    {
      index: 0,
      type: "advanceToMainPhase",
      label: "Advance to main phase",
      apply: advanceToMainPhase,
    },
  ];
};

const rollbackConsentActions = (
  state: GameState,
  playerId: PlayerId,
): ExecutableDevAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "rollbackConsent" ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  return [
    {
      index: 0,
      type: "respondToDecision",
      label: "Allow rollback",
      responseKey: "allow",
      decisionId: decision.id,
      response: { type: "rollbackConsent", allow: true },
      apply: (currentState) => ({
        state: currentState,
        events: [],
        stateHash: timedStateHash("legalActionCurrentState", currentState),
      }),
    },
    {
      index: 1,
      type: "respondToDecision",
      label: "Deny rollback",
      responseKey: "deny",
      decisionId: decision.id,
      response: { type: "rollbackConsent", allow: false },
      apply: (currentState) => ({
        state: currentState,
        events: [],
        stateHash: timedStateHash("legalActionCurrentState", currentState),
      }),
    },
  ];
};

const setupStartOfGameActions = (
  state: GameState,
  playerId: PlayerId,
): ExecutableDevAction[] => {
  const decision = state.pendingDecision;
  if (
    state.status.type !== "setup" ||
    decision === undefined ||
    decision.type !== "selectCards" ||
    decision.playerId !== playerId ||
    decision.request.set === undefined ||
    !String(decision.request.set).startsWith("set:setup-start-of-game:")
  ) {
    return [];
  }
  return [
    {
      index: 0,
      type: "respondToDecision",
      label: "Skip setup Stage",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
      deterministicAction: () => ({
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [] },
      }),
      apply: (currentState) =>
        applyAction(currentState, {
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "cards", cards: [] },
        }),
    },
    ...decision.candidates.map((candidate) => ({
      index: 0,
      type: "respondToDecision" as const,
      label: `Play ${cardName(state, candidate.card.cardId)} during setup`,
      decisionId: decision.id,
      response: { type: "cards" as const, cards: [candidate.card] },
      deterministicAction: () => ({
        type: "respondToDecision" as const,
        decisionId: decision.id,
        response: { type: "cards" as const, cards: [candidate.card] },
      }),
      apply: (currentState: GameState) =>
        applyAction(currentState, {
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "cards", cards: [candidate.card] },
        }),
    })),
  ];
};

export const executableActions = (
  state: GameState,
  playerId: PlayerId,
): ExecutableDevAction[] => {
  const legalActions = recordActionTimingSpan(
    "executableActions:getLegalActions",
    () =>
      getLegalActions(state, playerId, {
        profileSpan: recordActionTimingSpan,
      }),
  );
  const rawActions = recordActionTimingSpan(
    "executableActions:decorateLegalActions",
    () =>
      legalActions.map(
        (action): Omit<ExecutableDevAction, "index"> => ({
          ...visibleAction(state, action),
          ...(action.type === "respondToDecision"
            ? { decisionId: action.decisionId, response: action.response }
            : {}),
          deterministicAction: (input) =>
            action.type === "attachDon" &&
            input?.selectedDonInstanceIds !== undefined &&
            input.selectedDonInstanceIds.length > 0
              ? {
                  ...action,
                  selectedDonInstanceIds: [...input.selectedDonInstanceIds],
                }
              : action,
          apply: (currentState, input) =>
            applyAction(
              currentState,
              action.type === "attachDon" &&
                input?.selectedDonInstanceIds !== undefined &&
                input.selectedDonInstanceIds.length > 0
                ? {
                    ...action,
                    selectedDonInstanceIds: [...input.selectedDonInstanceIds],
                  }
                : action,
              liveEngineOptions,
            ),
        }),
      ),
  );
  const actions = [
    ...setupStartOfGameActions(state, playerId),
    ...mulliganActions(state, playerId),
    ...rollbackConsentActions(state, playerId),
    ...phaseActions(state, playerId),
    ...rawActions,
  ];
  return actions.map((action, index) => ({ ...action, index }));
};
