import {
  applyAction,
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  createInitialState,
  enterMainPhase,
  filterStateForPlayer,
  getLegalActions,
  hashCanonicalStateValue,
  respondToMulliganDecision,
  startMulliganFlow,
} from "@optcg/engine-core";
import type { DevPoneglyphFetch } from "@optcg/cards";
import type {
  CardId,
  EngineError,
  EngineResult,
  GameState,
  LegalAction,
  MatchCardManifest,
  MatchId,
  PlayerId,
  CardInstance,
  DecisionId,
  DecisionResponse,
  PaymentOption,
} from "@optcg/types";

import { createDefaultDevMatchSetup } from "./default-dev-manifest.js";
import { actionDecisionPayment } from "./dev-action-payment.js";
import { allPlayerCards, cardName } from "./dev-card-utils.js";
import {
  buildLocalDevCardCatalog,
  buildLocalDevCardCatalogForPlayer,
} from "./local-card-catalog.js";
import type {
  DevMatchSnapshot,
  DevPlayerSnapshot,
  DevVisibleAction,
  DevVisibleCardCatalog,
} from "./dev-snapshot-types.js";
import {
  cancelRollbackConsent,
  cloneGameState,
  createLocalRollbackState,
  recordRollbackPoint,
  requestRollbackConsent,
  resolveRollbackConsent,
  rollbackView,
  type LocalRollbackState,
  type CancelLocalDevRollbackInput,
  type RequestLocalDevRollbackInput,
} from "./local-rollback.js";

export type {
  CancelLocalDevRollbackInput,
  RequestLocalDevRollbackInput,
} from "./local-rollback.js";

export interface DevMatchPlayerSetup {
  playerId: PlayerId;
  leaderCardId: CardId;
  leaderLifeCount: number;
  deckCardIds: CardId[];
  donDeckCardIds: CardId[];
}

export interface DevMatchSetup {
  matchId: MatchId;
  firstPlayerId: PlayerId;
  playerOrder: readonly [PlayerId, PlayerId];
  players: readonly [DevMatchPlayerSetup, DevMatchPlayerSetup];
  cardManifest: MatchCardManifest;
  rngSeed: number | bigint | string;
  shuffleDecks?: boolean;
  rollback?: Parameters<typeof createLocalRollbackState>[0];
}

export interface LocalDevMatch {
  state: GameState;
  rollback: LocalRollbackState;
}

export interface CreatePremadeDevMatchSetupOptions {
  readonly fetchCard?: DevPoneglyphFetch;
  readonly baseUrl?: string;
  readonly redisUrl?: string;
  readonly matchId?: MatchId;
}

export interface ApplyLocalDevActionInput {
  playerId: PlayerId;
  actionIndex: number;
  expectedStateSeq?: number;
}

export interface ApplyLocalDevDecisionInput {
  playerId: PlayerId;
  decisionId: DecisionId;
  response: DecisionResponse;
}

export interface ApplyLocalDevActionResult {
  snapshot: DevMatchSnapshot;
  errors: string[];
}

type ExecutableDevAction = DevVisibleAction & {
  apply: (state: GameState) => EngineResult;
  decisionId?: DecisionId;
  response?: DecisionResponse;
};

const visibleAction = (
  state: GameState,
  action: LegalAction,
): Omit<ExecutableDevAction, "index" | "apply"> => {
  const placement = actionPlacement(action);
  const attachment = actionAttachment(action);
  const attack = actionAttack(action);
  const counter = actionCounter(action);
  const decisionPayment = actionDecisionPayment(state, action);
  return {
    type: action.type,
    label: actionLabel(state, action),
    ...(decisionPayment === undefined ? {} : { decisionPayment }),
    ...(placement === undefined
      ? {}
      : { placement: { instanceId: placement } }),
    ...(attachment === undefined ? {} : { attachment }),
    ...(attack === undefined ? {} : { attack }),
    ...(counter === undefined ? {} : { counter }),
  };
};

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const createdAt = "2026-05-04T00:00:00.000Z";

const describeEngineError = (error: EngineError): string => {
  switch (error.type) {
    case "illegalAction":
    case "invalidDecisionResponse":
      return error.reason;
    case "invariantViolation":
      return error.invariant;
    case "unsupportedCard":
      return String(error.cardId);
    case "effectRuntimeError":
      return error.details === undefined
        ? error.effectId
        : `${error.effectId}: ${JSON.stringify(error.details)}`;
    case "loopDetected":
      return JSON.stringify(error.signature);
  }
};

const assertEngineResult = (result: EngineResult, context: string): void => {
  if (result.errors !== undefined && result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      first === undefined
        ? `${context} failed with an unknown engine error.`
        : `${context} failed: ${describeEngineError(first)}`,
    );
  }
};

const combinedEngineResult = (
  result: EngineResult,
  events: EngineResult["events"],
): EngineResult => ({
  ...result,
  events,
});

const advanceToMainPhase = (state: GameState): EngineResult => {
  const events: EngineResult["events"] = [];
  let current = state;
  for (let stepCount = 0; stepCount < 4; stepCount += 1) {
    if (
      current.turn.phase === "main" ||
      current.status.type !== "active" ||
      current.pendingDecision !== undefined ||
      current.battle !== undefined
    ) {
      return combinedEngineResult(
        {
          state: current,
          events,
          stateHash: hashCanonicalStateValue(current),
        },
        events,
      );
    }

    if (current.turn.phase === "refresh") {
      const result = advanceRefreshPhase(current);
      events.push(...result.events);
      if (result.errors !== undefined && result.errors.length > 0) {
        return combinedEngineResult(result, events);
      }
      current = result.state;
      continue;
    }

    if (current.turn.phase === "draw") {
      const result = advanceDrawPhase(current);
      events.push(...result.events);
      if (result.errors !== undefined && result.errors.length > 0) {
        return combinedEngineResult(result, events);
      }
      current = result.state;
      continue;
    }

    if (current.turn.phase === "don") {
      const donResult = advanceDonPhase(current);
      events.push(...donResult.events);
      if (donResult.errors !== undefined && donResult.errors.length > 0) {
        return combinedEngineResult(donResult, events);
      }
      current = donResult.state;
      if (current.pendingDecision !== undefined) {
        continue;
      }
      const mainResult = enterMainPhase(current);
      events.push(...mainResult.events);
      if (mainResult.errors !== undefined && mainResult.errors.length > 0) {
        return combinedEngineResult(mainResult, events);
      }
      current = mainResult.state;
      continue;
    }

    return combinedEngineResult(
      {
        state: current,
        events,
        stateHash: hashCanonicalStateValue(current),
      },
      events,
    );
  }
  return combinedEngineResult(
    {
      state: current,
      events,
      stateHash: hashCanonicalStateValue(current),
    },
    events,
  );
};

const autoAdvanceMandatoryTurnFlow = (result: EngineResult): EngineResult => {
  if (result.errors !== undefined && result.errors.length > 0) {
    return result;
  }
  const advanced = advanceToMainPhase(result.state);
  return combinedEngineResult(advanced, [...result.events, ...advanced.events]);
};

export const createPremadeDevMatchSetup = async (
  options: CreatePremadeDevMatchSetupOptions = {},
): Promise<DevMatchSetup> => {
  return createDefaultDevMatchSetup({
    matchId: options.matchId ?? ("dev-local-match" as MatchId),
    firstPlayerId: p1,
    playerOrder: [p1, p2],
    createdAt,
    ...(options.fetchCard === undefined
      ? {}
      : { fetchCard: options.fetchCard }),
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.redisUrl === undefined ? {} : { redisUrl: options.redisUrl }),
  });
};

export const isDevMatchSetup = (value: unknown): value is DevMatchSetup => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const players = candidate["players"];
  const order = candidate["playerOrder"];
  const manifest = candidate["cardManifest"];
  return (
    typeof candidate["matchId"] === "string" &&
    typeof candidate["firstPlayerId"] === "string" &&
    (typeof candidate["rngSeed"] === "string" ||
      typeof candidate["rngSeed"] === "number") &&
    Array.isArray(order) &&
    order.length === 2 &&
    order.every((playerId) => typeof playerId === "string") &&
    Array.isArray(players) &&
    players.length === 2 &&
    players.every(isDevMatchPlayerSetup) &&
    isMatchCardManifest(manifest) &&
    (candidate["shuffleDecks"] === undefined ||
      typeof candidate["shuffleDecks"] === "boolean")
  );
};

const isDevMatchPlayerSetup = (
  value: unknown,
): value is DevMatchPlayerSetup => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["playerId"] === "string" &&
    typeof candidate["leaderCardId"] === "string" &&
    Number.isInteger(candidate["leaderLifeCount"]) &&
    Array.isArray(candidate["deckCardIds"]) &&
    candidate["deckCardIds"].every((cardId) => typeof cardId === "string") &&
    Array.isArray(candidate["donDeckCardIds"]) &&
    candidate["donDeckCardIds"].every((cardId) => typeof cardId === "string")
  );
};

const isMatchCardManifest = (value: unknown): value is MatchCardManifest => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["manifestHash"] === "string" &&
    typeof candidate["source"] === "string" &&
    typeof candidate["cardDataVersion"] === "string" &&
    typeof candidate["effectDefinitionsVersion"] === "string" &&
    typeof candidate["customHandlerVersion"] === "string" &&
    typeof candidate["banlistVersion"] === "string" &&
    typeof candidate["cards"] === "object" &&
    candidate["cards"] !== null &&
    typeof candidate["createdAt"] === "string"
  );
};

const playerSetupById = (
  setup: DevMatchSetup,
): Record<PlayerId, DevMatchPlayerSetup> => ({
  [setup.players[0].playerId]: setup.players[0],
  [setup.players[1].playerId]: setup.players[1],
});

export const createLocalDevMatch = (setup: DevMatchSetup): LocalDevMatch => {
  const players = playerSetupById(setup);
  const firstPlayer = players[setup.playerOrder[0]];
  const secondPlayer = players[setup.playerOrder[1]];
  if (firstPlayer === undefined || secondPlayer === undefined) {
    throw new Error("Dev match setup must include both ordered players.");
  }
  const setupState = createInitialState({
    matchId: setup.matchId,
    firstPlayerId: setup.firstPlayerId,
    rngSeed: setup.rngSeed,
    playerOrder: setup.playerOrder,
    leaderCardIds: {
      [firstPlayer.playerId]: firstPlayer.leaderCardId,
      [secondPlayer.playerId]: secondPlayer.leaderCardId,
    },
    leaderLifeCounts: {
      [firstPlayer.playerId]: firstPlayer.leaderLifeCount,
      [secondPlayer.playerId]: secondPlayer.leaderLifeCount,
    },
    deckCardIds: {
      [firstPlayer.playerId]: firstPlayer.deckCardIds,
      [secondPlayer.playerId]: secondPlayer.deckCardIds,
    },
    donDeckCardIds: {
      [firstPlayer.playerId]: firstPlayer.donDeckCardIds,
      [secondPlayer.playerId]: secondPlayer.donDeckCardIds,
    },
    cardManifest: setup.cardManifest,
    shuffleDecks: setup.shuffleDecks ?? false,
  });
  const rollback = createLocalRollbackState(setup.rollback);
  if (setupState.pendingDecision !== undefined) {
    return { state: setupState, rollback };
  }
  const started = startMulliganFlow(setupState);
  assertEngineResult(started, "Local dev match boot");
  return { state: started.state, rollback };
};

const startMulliganAfterSetupIfReady = (result: EngineResult): EngineResult => {
  if (
    result.errors !== undefined ||
    result.state.status.type !== "setup" ||
    result.state.pendingDecision !== undefined ||
    result.state.setupContinuation !== undefined
  ) {
    return result;
  }
  const started = startMulliganFlow(
    result.state as Parameters<typeof startMulliganFlow>[0],
  );
  return combinedEngineResult(started, [...result.events, ...started.events]);
};

const instanceName = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): string => {
  for (const player of Object.values(state.players)) {
    const card = allPlayerCards(player).find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (card !== undefined) {
      return cardName(state, card.cardId);
    }
  }
  return String(instanceId);
};

const instanceNameWithCardId = (
  state: GameState,
  ref: { instanceId: CardInstance["instanceId"]; cardId: CardId },
): string => `${instanceName(state, ref.instanceId)} (${String(ref.cardId)})`;

const responseLabel = (
  state: GameState,
  action: Extract<LegalAction, { type: "respondToDecision" }>,
): string => {
  if (String(action.decisionId).startsWith("decision:counterStep:pass:")) {
    return "End counter phase";
  }
  switch (action.response.type) {
    case "payment": {
      const option = paymentOptionForAction(state, action);
      if (option !== undefined && isDeterministicLifeToHandMoveCost(option)) {
        return "Pay cost";
      }
      const selectedDonCount =
        action.response.selectedDonInstanceIds?.length ?? 0;
      const selectedCardsCount =
        action.response.selectedCardInstanceIds?.length ?? 0;
      if (selectedDonCount > 0) {
        return `Pay cost with ${String(selectedDonCount)} DON!!`;
      }
      if (selectedCardsCount > 0) {
        return `Pay cost with ${String(selectedCardsCount)} card`;
      }
      return "Pay cost";
    }
    case "paymentDeclined":
      return "Decline cost";
    case "cards":
      return `Choose ${String(action.response.cards.length)} card`;
    case "targets":
      return `Choose ${String(action.response.targets.length)} target`;
    case "orderedIds":
      return "Confirm order";
    case "topBottomPlacement":
      return "Confirm top/bottom placement";
    case "optionalActivation":
      return action.response.choice === "activate"
        ? "Activate effect"
        : "Decline effect";
    case "effectOption":
      return `Choose option ${action.response.optionId}`;
    case "lifeTrigger":
      return action.response.choice === "activateTrigger"
        ? "Activate trigger"
        : "Add to hand";
    case "replacement":
      return "Use replacement";
    case "mulligan":
      return action.response.keep ? "Keep hand" : "Mulligan hand";
    case "loopCount":
      return `Choose loop count ${String(action.response.count)}`;
    case "rollbackConsent":
      return action.response.allow ? "Allow rollback" : "Deny rollback";
    case "chooseQuantity":
      return `Choose ${String(action.response.quantity)}`;
  }
};

const actionLabel = (state: GameState, action: LegalAction): string => {
  switch (action.type) {
    case "playCard":
      return `Play ${instanceName(state, action.cardInstanceId)}`;
    case "activateEffect":
      return "Activate effect";
    case "attachDon":
      return `Attach DON!! to ${cardName(state, action.target.cardId)}`;
    case "declareAttack":
      return `Attack with ${instanceNameWithCardId(
        state,
        action.attacker,
      )} into ${instanceNameWithCardId(state, action.target)}`;
    case "activateBlocker":
      return `Block with ${cardName(state, action.blocker.cardId)}`;
    case "useCounter":
      return `Counter with ${instanceName(state, action.cardInstanceId)}`;
    case "endMainPhase":
      return "End main phase";
    case "concede":
      return "Concede";
    case "respondToDecision":
      return responseLabel(state, action);
  }
};

const paymentOptionForAction = (
  state: GameState,
  action: Extract<LegalAction, { type: "respondToDecision" }>,
): PaymentOption | undefined => {
  if (action.response.type !== "payment") {
    return undefined;
  }
  const response = action.response;
  const pending = state.pendingDecision;
  if (
    pending === undefined ||
    pending.type !== "payCost" ||
    pending.id !== action.decisionId
  ) {
    return undefined;
  }
  return pending.paymentOptions.find(
    (option) => option.id === response.optionId,
  );
};

const isDeterministicLifeToHandMoveCost = (option: PaymentOption): boolean =>
  option.type === "moveCards" &&
  option.from.zone === "life" &&
  option.from.player === "self" &&
  option.from.position !== undefined &&
  option.to.zone === "hand" &&
  option.to.player === "self" &&
  option.to.position === undefined;

const actionPlacement = (
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
    case "respondToDecision":
      return undefined;
  }
};

const actionAttachment = (
  action: LegalAction,
): DevVisibleAction["attachment"] | undefined => {
  if (action.type !== "attachDon") {
    return undefined;
  }
  return {
    donInstanceId: action.donInstanceId,
    targetInstanceId: action.target.instanceId,
  };
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
  action: LegalAction,
): DevVisibleAction["counter"] | undefined => {
  if (action.type !== "useCounter") {
    return undefined;
  }
  return {
    cardInstanceId: action.cardInstanceId,
    targetInstanceId: action.target.instanceId,
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
      decisionId: decision.id,
      response: { type: "rollbackConsent", allow: true },
      apply: (currentState) => ({
        state: currentState,
        events: [],
        stateHash: hashCanonicalStateValue(currentState),
      }),
    },
    {
      index: 1,
      type: "respondToDecision",
      label: "Deny rollback",
      decisionId: decision.id,
      response: { type: "rollbackConsent", allow: false },
      apply: (currentState) => ({
        state: currentState,
        events: [],
        stateHash: hashCanonicalStateValue(currentState),
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
      apply: (currentState: GameState) =>
        applyAction(currentState, {
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "cards", cards: [candidate.card] },
        }),
    })),
  ];
};

const executableActions = (
  state: GameState,
  playerId: PlayerId,
): ExecutableDevAction[] => {
  const rawActions = getLegalActions(state, playerId).map(
    (action): Omit<ExecutableDevAction, "index"> => ({
      ...visibleAction(state, action),
      apply: (currentState) => applyAction(currentState, action),
    }),
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

const devPlayerSnapshot = (
  state: GameState,
  playerId: PlayerId,
): DevPlayerSnapshot => ({
  view: filterStateForPlayer(state, playerId),
  actions: executableActions(state, playerId).map(
    ({
      index,
      type,
      label,
      decisionPayment,
      attack,
      counter,
      placement,
      attachment,
    }) => ({
      index,
      type,
      label,
      ...(decisionPayment === undefined ? {} : { decisionPayment }),
      ...(attack === undefined ? {} : { attack }),
      ...(counter === undefined ? {} : { counter }),
      ...(placement === undefined ? {} : { placement }),
      ...(attachment === undefined ? {} : { attachment }),
    }),
  ),
});

const devPlayerSnapshots = (
  state: GameState,
): Record<PlayerId, DevPlayerSnapshot> =>
  Object.fromEntries(
    Object.keys(state.players).map((playerId) => [
      playerId,
      devPlayerSnapshot(state, playerId as PlayerId),
    ]),
  );

export const getLocalDevSnapshot = (
  match: LocalDevMatch,
): DevMatchSnapshot => ({
  stateSeq: match.state.seq,
  actionSeq: match.state.actionSeq,
  stateHash: hashCanonicalStateValue(match.state),
  status: match.state.status.type,
  turn: match.state.turn,
  activePlayerId:
    match.state.pendingDecision?.playerId ?? match.state.turn.turnPlayerId,
  players: devPlayerSnapshots(match.state),
  rollback: rollbackView(match.rollback, match.state),
});

export const getLocalDevSnapshotForPlayer = (
  match: LocalDevMatch,
  playerId: PlayerId,
): DevMatchSnapshot => {
  const player = devPlayerSnapshot(match.state, playerId);
  return {
    stateSeq: match.state.seq,
    actionSeq: match.state.actionSeq,
    stateHash: hashCanonicalStateValue(match.state),
    status: match.state.status.type,
    turn: match.state.turn,
    activePlayerId:
      match.state.pendingDecision?.playerId ?? match.state.turn.turnPlayerId,
    players: { [playerId]: player },
    rollback: rollbackView(match.rollback, match.state),
  };
};

export const applyLocalDevAction = (
  match: LocalDevMatch,
  input: ApplyLocalDevActionInput,
): ApplyLocalDevActionResult => {
  if (
    input.expectedStateSeq !== undefined &&
    input.expectedStateSeq !== match.state.seq
  ) {
    return {
      snapshot: getLocalDevSnapshot(match),
      errors: [
        `Action request is stale for ${String(
          input.playerId,
        )}; refresh the current match state.`,
      ],
    };
  }
  const action = executableActions(match.state, input.playerId).find(
    (candidate) => candidate.index === input.actionIndex,
  );
  if (action === undefined) {
    return {
      snapshot: getLocalDevSnapshot(match),
      errors: [
        `Action index ${String(input.actionIndex)} is not legal for ${String(
          input.playerId,
        )}.`,
      ],
    };
  }

  if (
    action.type === "respondToDecision" &&
    action.decisionId !== undefined &&
    action.response?.type === "rollbackConsent"
  ) {
    return applyLocalDevDecision(match, {
      playerId: input.playerId,
      decisionId: action.decisionId,
      response: action.response,
    });
  }

  const previousState = cloneGameState(match.state);
  const result = autoAdvanceMandatoryTurnFlow(
    startMulliganAfterSetupIfReady(action.apply(match.state)),
  );
  const errors = result.errors?.map(describeEngineError) ?? [];
  if (errors.length === 0) {
    match.state = result.state;
    match.rollback = recordRollbackPoint(
      match.rollback,
      previousState,
      result.events,
    );
  }
  return {
    snapshot: getLocalDevSnapshot(match),
    errors,
  };
};

export const applyLocalDevDecision = (
  match: LocalDevMatch,
  input: ApplyLocalDevDecisionInput,
): ApplyLocalDevActionResult => {
  const decision = match.state.pendingDecision;
  if (decision === undefined || decision.id !== input.decisionId) {
    return {
      snapshot: getLocalDevSnapshot(match),
      errors: [
        `Decision ${String(input.decisionId)} is not pending for ${String(
          input.playerId,
        )}.`,
      ],
    };
  }
  if (decision.playerId !== input.playerId) {
    return {
      snapshot: getLocalDevSnapshot(match),
      errors: [
        `Decision ${String(input.decisionId)} is not pending for ${String(
          input.playerId,
        )}.`,
      ],
    };
  }

  if (decision.type === "rollbackConsent") {
    if (input.response.type !== "rollbackConsent") {
      return {
        snapshot: getLocalDevSnapshot(match),
        errors: ["Rollback consent requires a rollbackConsent response."],
      };
    }
    const result = resolveRollbackConsent(match.state, match.rollback, {
      playerId: input.playerId,
      decisionId: input.decisionId,
      response: input.response,
    });
    match.state = result.state;
    match.rollback = result.rollback;
    return { snapshot: getLocalDevSnapshot(match), errors: result.errors };
  }

  const action = {
    type: "respondToDecision" as const,
    decisionId: input.decisionId,
    response: input.response,
  };
  const previousState = cloneGameState(match.state);
  const responseResult =
    decision.type === "mulligan"
      ? respondToMulliganDecision(match.state, action)
      : applyAction(match.state, action);
  const result = autoAdvanceMandatoryTurnFlow(
    startMulliganAfterSetupIfReady(responseResult),
  );
  const errors = result.errors?.map(describeEngineError) ?? [];
  if (errors.length === 0) {
    match.state = result.state;
    match.rollback = recordRollbackPoint(
      match.rollback,
      previousState,
      result.events,
    );
  }
  return {
    snapshot: getLocalDevSnapshot(match),
    errors,
  };
};

export const requestLocalDevRollback = (
  match: LocalDevMatch,
  input: RequestLocalDevRollbackInput,
): ApplyLocalDevActionResult => {
  const result = requestRollbackConsent(match.state, match.rollback, input);
  match.state = result.state;
  match.rollback = result.rollback;
  return { snapshot: getLocalDevSnapshot(match), errors: result.errors };
};

export const cancelLocalDevRollback = (
  match: LocalDevMatch,
  input: CancelLocalDevRollbackInput,
): ApplyLocalDevActionResult => {
  const result = cancelRollbackConsent(match.state, match.rollback, input);
  match.state = result.state;
  match.rollback = result.rollback;
  return { snapshot: getLocalDevSnapshot(match), errors: result.errors };
};

export const getLocalDevCardCatalog = (
  match: LocalDevMatch,
): DevVisibleCardCatalog =>
  buildLocalDevCardCatalog(match.state, getLocalDevSnapshot(match));

export const getLocalDevCardCatalogForPlayer = (
  match: LocalDevMatch,
  playerId: PlayerId,
): DevVisibleCardCatalog =>
  buildLocalDevCardCatalogForPlayer(
    match.state,
    getLocalDevSnapshotForPlayer(match, playerId),
    playerId,
  );
