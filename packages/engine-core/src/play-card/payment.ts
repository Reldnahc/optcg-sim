import type {
  Action,
  CardInstance,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  assertGameStateInvariantsIfEnabled,
  type EngineResultOptions,
  illegalAction,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import {
  getPlayCardDecisionId,
  getPlayCardDecisionPrompt,
  parsePlayCardDecisionInstanceId,
} from "./legal-actions.js";
import {
  canResolveDestinationConflict,
  getSupportedPlayMetadata,
  type SupportedPlayMetadata,
} from "./support.js";

type RespondToDecisionAction = Extract<Action, { type: "respondToDecision" }>;
type PaymentResponse = Extract<
  RespondToDecisionAction["response"],
  { type: "payment" }
>;
type PendingPayCostDecision = Extract<
  NonNullable<GameState["pendingDecision"]>,
  { type: "payCost" }
>;

export const createPlayCardPaymentDecisionResult = (params: {
  state: GameState;
  events: EngineEvent[];
  playerId: PlayerId;
  handCard: CardInstance;
  playCost: number;
  engineOptions?: EngineResultOptions;
}): EngineResult => {
  const {
    state,
    events,
    playerId,
    handCard,
    playCost,
    engineOptions = {},
  } = params;
  const decisionId = getPlayCardDecisionId(state, handCard);
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: decisionId,
    type: "payCost",
    playerId,
    prompt: getPlayCardDecisionPrompt(handCard),
    causedBy: {
      type: "playerAction",
      actionId: `action:${String(state.actionSeq + 1)}`,
    },
    visibility: { type: "public" },
    cost: { type: "restDon", count: playCost },
    paymentOptions: [{ id: "restDon", type: "restDon", count: playCost }],
  };
  appendEvent(
    state,
    events,
    "decisionCreated",
    { decisionId, decisionType: "payCost", playerId },
    { type: "public" },
  );
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    pendingDecision,
    eventJournal: [...state.eventJournal, ...events],
  };
  assertGameStateInvariantsIfEnabled(nextState, engineOptions);
  return toEngineResult(nextState, events, undefined, engineOptions);
};

export const isPlayCardPaymentDecisionId = (
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
): boolean => parsePlayCardDecisionInstanceId(decisionId) !== null;

type PlayCardPaymentContext =
  | {
      ok: true;
      decision: PendingPayCostDecision;
      response: PaymentResponse;
      player: GameState["players"][PlayerId];
      handIndex: number;
      handCard: CardInstance;
      supported: SupportedPlayMetadata;
    }
  | { ok: false; result: EngineResult };

export const getPlayCardPaymentContext = (
  state: GameState,
  action: RespondToDecisionAction,
): PlayCardPaymentContext => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "payCost") {
    return {
      ok: false,
      result: illegalAction(state, "Unsupported decision type."),
    };
  }
  if (action.response.type !== "payment") {
    return {
      ok: false,
      result: illegalAction(state, "Unsupported decision response."),
    };
  }
  const response = action.response;
  if (decision.playerId !== state.turn.turnPlayerId) {
    return {
      ok: false,
      result: illegalAction(state, "Decision player mismatch."),
    };
  }

  const playCardInstanceId = parsePlayCardDecisionInstanceId(decision.id);
  if (playCardInstanceId === null) {
    return {
      ok: false,
      result: illegalAction(state, "Unsupported payCost decision context."),
    };
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return {
      ok: false,
      result: illegalAction(state, "Decision player does not exist."),
    };
  }
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === playCardInstanceId,
  );
  if (handIndex < 0) {
    return {
      ok: false,
      result: illegalAction(state, "Decision card reference is stale."),
    };
  }
  const handCard = player.hand[handIndex];
  if (handCard === undefined) {
    return {
      ok: false,
      result: illegalAction(state, "Decision card not found."),
    };
  }
  const supported = getSupportedPlayMetadata(state, handCard);
  if (supported === null) {
    return {
      ok: false,
      result: illegalAction(state, "Decision card is unsupported."),
    };
  }

  return {
    ok: true,
    decision,
    response,
    player,
    handIndex,
    handCard,
    supported,
  };
};

type PlayCardPaymentSelection =
  | {
      ok: true;
      selectedDonInstanceIds: PaymentResponse["selectedDonInstanceIds"];
      nextCostArea: CardInstance[];
    }
  | { ok: false; result: EngineResult };

export const validatePlayCardPaymentSelection = (params: {
  state: GameState;
  response: PaymentResponse;
  player: GameState["players"][PlayerId];
  supported: SupportedPlayMetadata;
  playCost: number;
}): PlayCardPaymentSelection => {
  const { state, response, player, supported, playCost } = params;
  if (response.optionId !== "restDon") {
    return {
      ok: false,
      result: illegalAction(state, "Payment option mismatch."),
    };
  }
  const selected = response.selectedDonInstanceIds;
  if (selected === undefined || selected.length !== playCost) {
    return {
      ok: false,
      result: illegalAction(state, "Payment DON!! selection count mismatch."),
    };
  }
  if (new Set(selected).size !== selected.length) {
    return {
      ok: false,
      result: illegalAction(
        state,
        "Payment DON!! selection contains duplicates.",
      ),
    };
  }
  const costAreaById = new Map(
    player.costArea.map((card) => [card.instanceId, card]),
  );
  for (const donId of selected) {
    const don = costAreaById.get(donId);
    if (don === undefined || don.state !== "active") {
      return {
        ok: false,
        result: illegalAction(state, "Payment DON!! selection is invalid."),
      };
    }
  }
  if (!canResolveDestinationConflict(player, supported.category)) {
    return {
      ok: false,
      result: illegalAction(state, "playCard destination conflict is invalid."),
    };
  }

  const restedSet = new Set(selected);
  const nextCostArea = player.costArea.map((card) =>
    restedSet.has(card.instanceId)
      ? { ...card, state: "rested" as const }
      : card,
  );
  return { ok: true, selectedDonInstanceIds: selected, nextCostArea };
};
