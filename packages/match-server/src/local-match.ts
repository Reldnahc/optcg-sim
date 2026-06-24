import {
  applyAction,
  createInitialState,
  filterStateForPlayer,
  hashReplayStateForScope,
  respondToMulliganDecision,
  startMulliganFlow,
} from "@optcg/engine-core";
import type { DevPoneglyphFetch } from "@optcg/card-support";
import type {
  CardId,
  Action,
  DeterministicSystemOperation,
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
import {
  buildLocalDevCardCatalog,
  buildLocalDevCardCatalogForPlayer,
} from "./local-card-catalog.js";
import { cardVariantOverridesForSetup } from "./local-card-variants.js";
import type {
  DevMatchSnapshot,
  DevPlayerSnapshot,
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
import { executableActions } from "./local-match/actions.js";
import {
  assertEngineResult,
  autoAdvanceMandatoryTurnFlow,
  describeEngineError,
  liveEngineOptions,
  startMulliganAfterSetupIfReady,
  timedStateHash,
} from "./local-match/engine-flow.js";

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

export type LocalDeterministicOperation =
  | { readonly kind: "action"; readonly action: Action }
  | {
      readonly kind: "decision";
      readonly decisionId: DecisionId;
      readonly response: DecisionResponse;
    }
  | {
      readonly kind: "system";
      readonly operation: DeterministicSystemOperation;
    };

export interface ApplyLocalDevActionResult {
  stateSeq: number;
  actionSeq: number;
  stateHash: string;
  snapshot?: DevMatchSnapshot;
  errors: string[];
  deterministicOperation?: LocalDeterministicOperation;
}

const localActionResult = (
  match: LocalDevMatch,
  errors: string[],
  includeSnapshot = true,
  deterministicOperation?: LocalDeterministicOperation,
): ApplyLocalDevActionResult => ({
  stateSeq: match.state.seq,
  actionSeq: match.state.actionSeq,
  stateHash: hashReplayStateForScope(match.state, "gameplay-v1"),
  ...(includeSnapshot
    ? {
        snapshot: recordActionTimingSpan("getLocalDevSnapshot", () =>
          getLocalDevSnapshot(match),
        ),
      }
    : {}),
  errors,
  ...(deterministicOperation === undefined ? {} : { deterministicOperation }),
});

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const createdAt = "2026-05-04T00:00:00.000Z";

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
  return { view, actions };
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
    action.response !== undefined
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

  const deterministicAction = action.deterministicAction?.({
    ...(input.selectedDonInstanceIds === undefined
      ? {}
      : { selectedDonInstanceIds: input.selectedDonInstanceIds }),
  });
  const previousState = recordActionTimingSpan("cloneGameState", () =>
    cloneGameState(match.state),
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
    match.rollback = recordActionTimingSpan("recordRollbackPoint", () =>
      recordRollbackPoint(match.rollback, previousState, result.events),
    );
  }
  return localActionResult(
    match,
    errors,
    input.includeSnapshot,
    errors.length === 0 && deterministicAction !== undefined
      ? { kind: "action", action: deterministicAction }
      : undefined,
  );
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
    if (result.errors.length > 0) {
      return localActionResult(match, result.errors, input.includeSnapshot);
    }
    const operation: DeterministicSystemOperation | undefined =
      input.response.allow && result.rollbackRestore !== undefined
        ? {
            type: "restoreRollbackPoint",
            rollbackPointId: result.rollbackRestore.rollbackPointId,
            requestedBy: result.rollbackRestore.requestedBy,
            approvedBy: input.playerId,
            restoredStateHash: hashReplayStateForScope(
              result.state,
              "gameplay-v1",
            ),
            restoredStateSeq: result.state.seq,
            restoredActionSeq: result.state.actionSeq,
          }
        : result.rollbackCancel === undefined
          ? undefined
          : {
              type: "cancelRollbackConsent",
              playerId: result.rollbackCancel.playerId,
              rollbackPointId: result.rollbackCancel.rollbackPointId,
              ...(result.rollbackCancel.decisionId === undefined
                ? {}
                : { decisionId: result.rollbackCancel.decisionId }),
            };
    if (operation === undefined) {
      return localActionResult(
        match,
        ["Rollback consent resolved without deterministic rollback metadata."],
        input.includeSnapshot,
      );
    }
    return localActionResult(match, result.errors, input.includeSnapshot, {
      kind: "system",
      operation,
    });
  }

  const action = {
    type: "respondToDecision" as const,
    decisionId: input.decisionId,
    response: input.response,
  };
  const previousState = recordActionTimingSpan("cloneGameState", () =>
    cloneGameState(match.state),
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
    match.rollback = recordActionTimingSpan("recordRollbackPoint", () =>
      recordRollbackPoint(match.rollback, previousState, result.events),
    );
  }
  return localActionResult(
    match,
    errors,
    input.includeSnapshot,
    errors.length === 0
      ? {
          kind: "decision",
          decisionId: input.decisionId,
          response: input.response,
        }
      : undefined,
  );
};

export const requestLocalDevRollback = (
  match: LocalDevMatch,
  input: RequestLocalDevRollbackInput,
): ApplyLocalDevActionResult => {
  const result = requestRollbackConsent(match.state, match.rollback, input);
  match.state = result.state;
  match.rollback = result.rollback;
  if (result.errors.length > 0) {
    return localActionResult(match, result.errors);
  }
  if (result.rollbackRequest === undefined) {
    return localActionResult(match, [
      "Rollback request accepted without deterministic rollback metadata.",
    ]);
  }
  return localActionResult(match, result.errors, true, {
    kind: "system",
    operation: {
      type: "requestRollbackConsent",
      playerId: input.playerId,
      rollbackPointId: result.rollbackRequest.rollbackPointId,
      approvingPlayerId: result.rollbackRequest.approvingPlayerId,
      decisionId: result.rollbackRequest.decisionId,
      prompt: result.rollbackRequest.prompt,
    },
  });
};

export const cancelLocalDevRollback = (
  match: LocalDevMatch,
  input: CancelLocalDevRollbackInput,
): ApplyLocalDevActionResult => {
  const result = cancelRollbackConsent(match.state, match.rollback, input);
  match.state = result.state;
  match.rollback = result.rollback;
  if (result.errors.length > 0) {
    return localActionResult(match, result.errors);
  }
  if (result.rollbackCancel === undefined) {
    return localActionResult(match, [
      "Rollback cancellation accepted without deterministic rollback metadata.",
    ]);
  }
  return localActionResult(match, result.errors, true, {
    kind: "system",
    operation: {
      type: "cancelRollbackConsent",
      playerId: result.rollbackCancel.playerId,
      rollbackPointId: result.rollbackCancel.rollbackPointId,
      ...(result.rollbackCancel.decisionId === undefined
        ? {}
        : { decisionId: result.rollbackCancel.decisionId }),
    },
  });
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
