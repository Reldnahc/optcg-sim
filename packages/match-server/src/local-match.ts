import {
  applyAction,
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  canonicalSerializeStateValue,
  createInitialState,
  enterMainPhase,
  filterStateForPlayer,
  getLegalActions,
  respondToMulliganDecision,
  startMulliganFlow,
} from "@optcg/engine-core";
import { createHash } from "node:crypto";
import type { DevPoneglyphFetch } from "@optcg/card-support";
import type {
  CardId,
  EngineError,
  EngineResult,
  GameState,
  MatchCardManifest,
  MatchId,
  PlayerId,
  DecisionId,
  DecisionResponse,
  InstanceId,
  VariantKey,
} from "@optcg/types";
import type { RedisMode } from "./redis-config.js";

import { createDefaultDevMatchSetup } from "./default-dev-manifest.js";
import { recordActionTimingSpan } from "./action-timing-log.js";
import { cardName } from "./dev-card-utils.js";
import {
  buildLocalDevCardCatalog,
  buildLocalDevCardCatalogForPlayer,
} from "./local-card-catalog.js";
import { cardVariantOverridesForSetup } from "./local-card-variants.js";
import type {
  DevMatchSnapshot,
  DevPlayerSnapshot,
  DevVisibleAction,
  DevVisibleCardCatalog,
} from "./dev-snapshot-types.js";
import {
  cancelRollbackConsent,
  compactRollbackForState,
  cloneGameStateForRollback,
  createLocalRollbackState,
  recordRollbackPoint,
  requestRollbackConsent,
  resolveRollbackConsent,
  rollbackView,
  type LocalRollbackState,
  type CancelLocalDevRollbackInput,
  type RequestLocalDevRollbackInput,
} from "./local-rollback.js";
import {
  completeReplayOperation,
  replayAdvanceToMainPhaseOperation,
  replayDecisionOperation,
  replayLegalActionOperation,
  selectedDonReplayInput,
  type AppliedLocalDevReplayOperation,
  type ReplayOperationFactory,
} from "./local-match-replay-operation.js";
import { visibleAction } from "./local-match-visible-action.js";
import { createPayCostInteraction } from "./pay-cost-interaction.js";

export type {
  CancelLocalDevRollbackInput,
  RequestLocalDevRollbackInput,
} from "./local-rollback.js";
export { isDevMatchSetup } from "./local-match-setup-validation.js";

export interface DevMatchPlayerSetup {
  playerId: PlayerId;
  leaderCardId: CardId;
  leaderLifeCount: number;
  leaderVariantIndex?: number;
  deckCardIds: CardId[];
  deckVariantIndexes?: Array<number | undefined>;
  donDeckCardIds: CardId[];
}

export interface DevMatchSetup {
  matchId: MatchId;
  firstPlayerId: PlayerId;
  playerOrder: readonly [PlayerId, PlayerId];
  players: readonly [DevMatchPlayerSetup, DevMatchPlayerSetup];
  cardManifest: MatchCardManifest;
  rngSeed: number | bigint | string;
  lobbyId?: string;
  shuffleDecks?: boolean;
  rollback?: Parameters<typeof createLocalRollbackState>[0];
}

export interface LocalDevMatch {
  state: GameState;
  rollback: LocalRollbackState;
  cardVariantOverrides: Record<InstanceId, VariantKey>;
  playerLabels?: DevMatchSnapshot["playerLabels"];
}

export interface CreatePremadeDevMatchSetupOptions {
  readonly fetchCard?: DevPoneglyphFetch;
  readonly baseUrl?: string;
  readonly redisUrl?: string;
  readonly redisMode?: RedisMode;
  readonly matchId?: MatchId;
  readonly lobbyId?: string;
}

export interface ApplyLocalDevActionInput {
  playerId: PlayerId;
  actionIndex: number;
  expectedStateSeq?: number;
  selectedDonInstanceIds?: readonly InstanceId[];
  includeSnapshot?: boolean;
}

export interface ApplyLocalDevDecisionInput {
  playerId: PlayerId;
  decisionId: DecisionId;
  response: DecisionResponse;
  includeSnapshot?: boolean;
}

export interface ApplyLocalDevActionResult {
  stateSeq: number;
  actionSeq: number;
  replay?: AppliedLocalDevReplayOperation;
  snapshot?: DevMatchSnapshot;
  errors: string[];
}

type ExecutableDevAction = DevVisibleAction & {
  apply: (
    state: GameState,
    input?: Pick<ApplyLocalDevActionInput, "selectedDonInstanceIds">,
  ) => EngineResult;
  replayOperation?: ReplayOperationFactory;
  decisionId?: DecisionId;
  response?: DecisionResponse;
};

const timedStateHash = (name: string, value: unknown): string => {
  const serialized = recordActionTimingSpan(`hash:${name}:serialize`, () =>
    canonicalSerializeStateValue(value),
  );
  return recordActionTimingSpan(`hash:${name}:sha256`, () =>
    createHash("sha256").update(serialized, "utf8").digest("hex"),
  );
};

const liveEngineOptions = {
  includeStateHash: false,
  profileSpan: recordActionTimingSpan,
  validateInvariants: false,
} as const;

const localActionResult = (
  match: LocalDevMatch,
  errors: string[],
  includeSnapshot = true,
  replay?: AppliedLocalDevReplayOperation,
): ApplyLocalDevActionResult => ({
  stateSeq: match.state.seq,
  actionSeq: match.state.actionSeq,
  ...(replay === undefined ? {} : { replay }),
  ...(includeSnapshot
    ? {
        snapshot: recordActionTimingSpan("getLocalDevSnapshot", () =>
          getLocalDevSnapshot(match),
        ),
      }
    : {}),
  errors,
});

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
  let currentHash = "";
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
          stateHash: currentHash,
        },
        events,
      );
    }

    if (current.turn.phase === "refresh") {
      const result = recordActionTimingSpan("advanceRefreshPhase", () =>
        advanceRefreshPhase(current, liveEngineOptions),
      );
      events.push(...result.events);
      if (result.errors !== undefined && result.errors.length > 0) {
        return combinedEngineResult(result, events);
      }
      current = result.state;
      currentHash = result.stateHash;
      continue;
    }

    if (current.turn.phase === "draw") {
      const result = recordActionTimingSpan("advanceDrawPhase", () =>
        advanceDrawPhase(current, liveEngineOptions),
      );
      events.push(...result.events);
      if (result.errors !== undefined && result.errors.length > 0) {
        return combinedEngineResult(result, events);
      }
      current = result.state;
      currentHash = result.stateHash;
      continue;
    }

    if (current.turn.phase === "don") {
      const donResult = recordActionTimingSpan("advanceDonPhase", () =>
        advanceDonPhase(current, liveEngineOptions),
      );
      events.push(...donResult.events);
      if (donResult.errors !== undefined && donResult.errors.length > 0) {
        return combinedEngineResult(donResult, events);
      }
      current = donResult.state;
      currentHash = donResult.stateHash;
      if (current.pendingDecision !== undefined) {
        continue;
      }
      const mainResult = recordActionTimingSpan("enterMainPhase", () =>
        enterMainPhase(current, liveEngineOptions),
      );
      events.push(...mainResult.events);
      if (mainResult.errors !== undefined && mainResult.errors.length > 0) {
        return combinedEngineResult(mainResult, events);
      }
      current = mainResult.state;
      currentHash = mainResult.stateHash;
      continue;
    }

    return combinedEngineResult(
      {
        state: current,
        events,
        stateHash: currentHash,
      },
      events,
    );
  }
  return combinedEngineResult(
    {
      state: current,
      events,
      stateHash: currentHash,
    },
    events,
  );
};

const autoAdvanceMandatoryTurnFlow = (result: EngineResult): EngineResult => {
  if (result.errors !== undefined && result.errors.length > 0) {
    return result;
  }
  const advanced = recordActionTimingSpan("advanceToMainPhase", () =>
    advanceToMainPhase(result.state),
  );
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
    ...(options.lobbyId === undefined ? {} : { lobbyId: options.lobbyId }),
    ...(options.fetchCard === undefined
      ? {}
      : { fetchCard: options.fetchCard }),
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.redisUrl === undefined ? {} : { redisUrl: options.redisUrl }),
    ...(options.redisMode === undefined
      ? {}
      : { redisMode: options.redisMode }),
  });
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
  const cardVariantOverrides = cardVariantOverridesForSetup(setup);
  if (setupState.pendingDecision !== undefined) {
    return { state: setupState, rollback, cardVariantOverrides };
  }
  const started = startMulliganFlow(setupState);
  assertEngineResult(started, "Local dev match boot");
  return { state: started.state, rollback, cardVariantOverrides };
};

export const createRecoveredLocalDevMatch = ({
  cardVariantOverrides,
  rollback,
  state,
}: Pick<
  LocalDevMatch,
  "cardVariantOverrides" | "rollback" | "state"
>): LocalDevMatch => ({
  state: structuredClone(state),
  rollback: structuredClone(rollback),
  cardVariantOverrides: structuredClone(cardVariantOverrides),
});

export const setLocalDevMatchPlayerLabels = (
  match: LocalDevMatch,
  playerLabels: DevMatchSnapshot["playerLabels"],
): void => {
  if (playerLabels === undefined || Object.keys(playerLabels).length === 0) {
    delete match.playerLabels;
    return;
  }
  match.playerLabels = structuredClone(playerLabels);
};

const startMulliganAfterSetupIfReady = (result: EngineResult): EngineResult => {
  if (
    result.errors !== undefined ||
    result.state.status.type !== "setup" ||
    result.state.pendingDecision !== undefined
  ) {
    return result;
  }
  const started = startMulliganFlow(
    result.state as Parameters<typeof startMulliganFlow>[0],
  );
  return combinedEngineResult(started, [...result.events, ...started.events]);
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
      replayOperation: () =>
        replayDecisionOperation(decision.id, { type: "mulligan", keep: true }),
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
      replayOperation: () =>
        replayDecisionOperation(decision.id, {
          type: "mulligan",
          keep: false,
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
      replayOperation: replayAdvanceToMainPhaseOperation,
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
      replayOperation: () =>
        replayDecisionOperation(decision.id, { type: "cards", cards: [] }),
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
      replayOperation: () =>
        replayDecisionOperation(decision.id, {
          type: "cards",
          cards: [candidate.card],
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

const executableActions = (
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
          replayOperation: replayLegalActionOperation(action),
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

const devPlayerSnapshot = (
  state: GameState,
  playerId: PlayerId,
): DevPlayerSnapshot => {
  const view = recordActionTimingSpan("playerSnapshot:filterState", () =>
    filterStateForPlayer(state, playerId, { includeLegalActions: false }),
  );
  const actions = recordActionTimingSpan("playerSnapshot:actions", () =>
    executableActions(state, playerId).map(
      ({
        index,
        type,
        label,
        responseKey,
        decisionPayment,
        attack,
        counter,
        placement,
        attachment,
      }) => ({
        index,
        type,
        label,
        ...(responseKey === undefined ? {} : { responseKey }),
        ...(decisionPayment === undefined ? {} : { decisionPayment }),
        ...(attack === undefined ? {} : { attack }),
        ...(counter === undefined ? {} : { counter }),
        ...(placement === undefined ? {} : { placement }),
        ...(attachment === undefined ? {} : { attachment }),
      }),
    ),
  );
  const payCostInteraction =
    view.pendingDecision?.type === "payCost"
      ? createPayCostInteraction({
          decisionId: view.pendingDecision.id,
          actions,
        })
      : undefined;
  return {
    view,
    actions,
    ...(payCostInteraction === undefined ? {} : { payCostInteraction }),
  };
};

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
  stateHash: timedStateHash("snapshot", match.state),
  status: match.state.status.type,
  turn: match.state.turn,
  activePlayerId:
    match.state.pendingDecision?.playerId ?? match.state.turn.turnPlayerId,
  ...(match.playerLabels === undefined
    ? {}
    : { playerLabels: structuredClone(match.playerLabels) }),
  players: devPlayerSnapshots(match.state),
  rollback: rollbackView(match.rollback, match.state),
});

export const getLocalDevSnapshotForPlayer = (
  match: LocalDevMatch,
  playerId: PlayerId,
): DevMatchSnapshot => {
  const player = devPlayerSnapshot(match.state, playerId);
  const rollback = recordActionTimingSpan("playerSnapshot:rollbackView", () =>
    rollbackView(match.rollback, match.state),
  );
  return {
    stateSeq: match.state.seq,
    actionSeq: match.state.actionSeq,
    stateHash: "",
    status: match.state.status.type,
    turn: match.state.turn,
    activePlayerId:
      match.state.pendingDecision?.playerId ?? match.state.turn.turnPlayerId,
    ...(match.playerLabels === undefined
      ? {}
      : { playerLabels: structuredClone(match.playerLabels) }),
    players: { [playerId]: player },
    rollback,
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
    return localActionResult(
      match,
      [
        `Action request is stale for ${String(
          input.playerId,
        )}; refresh the current match state.`,
      ],
      input.includeSnapshot,
    );
  }
  const action = recordActionTimingSpan("executableActions", () =>
    executableActions(match.state, input.playerId).find(
      (candidate) => candidate.index === input.actionIndex,
    ),
  );
  if (action === undefined) {
    return localActionResult(
      match,
      [
        `Action index ${String(input.actionIndex)} is not legal for ${String(
          input.playerId,
        )}.`,
      ],
      input.includeSnapshot,
    );
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
      ...(input.includeSnapshot === undefined
        ? {}
        : { includeSnapshot: input.includeSnapshot }),
    });
  }

  const previousState = recordActionTimingSpan(
    "cloneGameStateForRollback",
    () => cloneGameStateForRollback(match.state),
  );
  const stateSeqBefore = match.state.seq;
  const stateHashBefore = timedStateHash("replayBefore", match.state);
  const replayOperation = action.replayOperation?.(
    selectedDonReplayInput(input),
  );
  const actionResult = recordActionTimingSpan("actionApply", () =>
    action.apply(match.state, {
      ...(input.selectedDonInstanceIds === undefined
        ? {}
        : { selectedDonInstanceIds: input.selectedDonInstanceIds }),
    }),
  );
  const mulliganResult = recordActionTimingSpan(
    "startMulliganAfterSetupIfReady",
    () => startMulliganAfterSetupIfReady(actionResult),
  );
  const result = recordActionTimingSpan("autoAdvanceMandatoryTurnFlow", () =>
    autoAdvanceMandatoryTurnFlow(mulliganResult),
  );
  const errors = result.errors?.map(describeEngineError) ?? [];
  if (errors.length === 0) {
    match.state = result.state;
    match.rollback = compactRollbackForState(
      recordActionTimingSpan("recordRollbackPoint", () =>
        recordRollbackPoint(match.rollback, previousState, result.events),
      ),
      match.state,
    );
  }
  const replay =
    errors.length === 0
      ? completeReplayOperation({
          match,
          operation: replayOperation,
          stateSeqBefore,
          stateHashBefore,
          stateHash: timedStateHash,
        })
      : undefined;
  return localActionResult(match, errors, input.includeSnapshot, replay);
};

export const applyLocalDevDecision = (
  match: LocalDevMatch,
  input: ApplyLocalDevDecisionInput,
): ApplyLocalDevActionResult => {
  const decision = match.state.pendingDecision;
  if (decision === undefined || decision.id !== input.decisionId) {
    return localActionResult(
      match,
      [
        `Decision ${String(input.decisionId)} is not pending for ${String(
          input.playerId,
        )}.`,
      ],
      input.includeSnapshot,
    );
  }
  if (decision.playerId !== input.playerId) {
    return localActionResult(
      match,
      [
        `Decision ${String(input.decisionId)} is not pending for ${String(
          input.playerId,
        )}.`,
      ],
      input.includeSnapshot,
    );
  }

  if (decision.type === "rollbackConsent") {
    if (input.response.type !== "rollbackConsent") {
      return localActionResult(
        match,
        ["Rollback consent requires a rollbackConsent response."],
        input.includeSnapshot,
      );
    }
    const rollbackResponse = input.response;
    const result = recordActionTimingSpan("resolveRollbackConsent", () =>
      resolveRollbackConsent(match.state, match.rollback, {
        playerId: input.playerId,
        decisionId: input.decisionId,
        response: rollbackResponse,
      }),
    );
    match.state = result.state;
    match.rollback = result.rollback;
    return localActionResult(match, result.errors, input.includeSnapshot);
  }

  const action = {
    type: "respondToDecision" as const,
    decisionId: input.decisionId,
    response: input.response,
  };
  const stateSeqBefore = match.state.seq;
  const stateHashBefore = timedStateHash("replayBefore", match.state);
  const previousState = recordActionTimingSpan(
    "cloneGameStateForRollback",
    () => cloneGameStateForRollback(match.state),
  );
  const responseResult = recordActionTimingSpan("decisionApply", () =>
    decision.type === "mulligan"
      ? respondToMulliganDecision(match.state, action)
      : applyAction(match.state, action, liveEngineOptions),
  );
  const mulliganResult = recordActionTimingSpan(
    "startMulliganAfterSetupIfReady",
    () => startMulliganAfterSetupIfReady(responseResult),
  );
  const result = recordActionTimingSpan("autoAdvanceMandatoryTurnFlow", () =>
    autoAdvanceMandatoryTurnFlow(mulliganResult),
  );
  const errors = result.errors?.map(describeEngineError) ?? [];
  if (errors.length === 0) {
    match.state = result.state;
    match.rollback = compactRollbackForState(
      recordActionTimingSpan("recordRollbackPoint", () =>
        recordRollbackPoint(match.rollback, previousState, result.events),
      ),
      match.state,
    );
  }
  const replay =
    errors.length === 0
      ? completeReplayOperation({
          match,
          operation: { kind: "action", action },
          stateSeqBefore,
          stateHashBefore,
          stateHash: timedStateHash,
        })
      : undefined;
  return localActionResult(match, errors, input.includeSnapshot, replay);
};

export const requestLocalDevRollback = (
  match: LocalDevMatch,
  input: RequestLocalDevRollbackInput,
): ApplyLocalDevActionResult => {
  const result = requestRollbackConsent(match.state, match.rollback, input);
  match.state = result.state;
  match.rollback = result.rollback;
  return localActionResult(match, result.errors);
};

export const cancelLocalDevRollback = (
  match: LocalDevMatch,
  input: CancelLocalDevRollbackInput,
): ApplyLocalDevActionResult => {
  const result = cancelRollbackConsent(match.state, match.rollback, input);
  match.state = result.state;
  match.rollback = result.rollback;
  return localActionResult(match, result.errors);
};

export const getLocalDevCardCatalog = (
  match: LocalDevMatch,
): DevVisibleCardCatalog =>
  buildLocalDevCardCatalog(
    match.state,
    getLocalDevSnapshot(match),
    match.cardVariantOverrides,
  );

export const getLocalDevCardCatalogForPlayer = (
  match: LocalDevMatch,
  playerId: PlayerId,
): DevVisibleCardCatalog =>
  buildLocalDevCardCatalogForPlayer(
    match.state,
    getLocalDevSnapshotForPlayer(match, playerId),
    playerId,
    match.cardVariantOverrides,
  );
