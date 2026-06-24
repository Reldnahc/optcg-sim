import type {
  DeterministicCheckpoint,
  DeterministicMatchEntry,
  EngineResult,
  GameState,
  TimerState,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  applyDeterministicOperation,
  type DeterministicCheckpointResolver,
} from "./deterministic-operation.js";

export type DeterministicEntryApplyResult =
  | {
      readonly status: "applied";
      readonly state: GameState;
      readonly stateHash: string;
      readonly label: string;
    }
  | {
      readonly status: "failed";
      readonly reason: string;
    };

const stableGameplayTimers = (timers: TimerState): TimerState => ({
  ...(timers.drainingPlayerId === undefined
    ? {}
    : { drainingPlayerId: timers.drainingPlayerId }),
  players: Object.fromEntries(
    Object.entries(timers.players).map(([playerId, timer]) => [
      playerId,
      { ...timer, remainingMs: 0, isRunning: false },
    ]),
  ),
  ...(timers.disconnects === undefined
    ? {}
    : {
        disconnects: Object.fromEntries(
          Object.entries(timers.disconnects).map(([playerId, timer]) => {
            const {
              currentDisconnectElapsedMs: _elapsed,
              disconnectStartedRemainingMs: _startedRemaining,
              ...stableTimer
            } = timer;
            return [
              playerId,
              {
                ...stableTimer,
                remainingMs: 0,
                isRunning: false,
              },
            ];
          }),
        ),
      }),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stableGameplayCardManifest = (
  manifest: GameState["cardManifest"],
): GameState["cardManifest"] => {
  const clone = structuredClone(manifest);
  if (!isRecord(clone)) {
    return clone;
  }
  if (!isRecord(clone.cards)) {
    return clone;
  }
  clone.cards = Object.fromEntries(
    Object.entries(clone.cards).map(([cardId, card]) => {
      if (!isRecord(card)) {
        return [cardId, card];
      }
      const { variants: _variants, ...stableCard } = card;
      return [cardId, stableCard];
    }),
  ) as GameState["cardManifest"]["cards"];
  return clone;
};

export const hashReplayStateForScope = (
  state: GameState,
  hashScope: DeterministicMatchEntry["verification"]["hashScope"],
): string => {
  if (hashScope === "gameplay-v1") {
    const clone = structuredClone(state);
    clone.timers = stableGameplayTimers(clone.timers);
    clone.cardManifest = stableGameplayCardManifest(clone.cardManifest);
    return hashCanonicalStateValue(clone);
  }
  return hashCanonicalStateValue(state);
};

export const checkpointResolverFromList = (
  checkpoints: readonly DeterministicCheckpoint[],
): DeterministicCheckpointResolver => {
  const byId = new Map(
    checkpoints.map((checkpoint) => [checkpoint.checkpointId, checkpoint]),
  );
  return (checkpointId) => byId.get(checkpointId);
};

const engineErrorsText = (
  errors: NonNullable<EngineResult["errors"]>,
): string =>
  errors
    .map((error) => ("reason" in error ? error.reason : error.type))
    .join("; ");

export const applyDeterministicEntry = (
  state: GameState,
  entry: DeterministicMatchEntry,
  checkpoints?: DeterministicCheckpointResolver,
): DeterministicEntryApplyResult => {
  const beforeHash = hashReplayStateForScope(
    state,
    entry.verification.hashScope,
  );
  if (state.seq !== entry.verification.stateSeqBefore) {
    return {
      status: "failed",
      reason: `State sequence before mismatch: expected ${String(
        entry.verification.stateSeqBefore,
      )}, got ${String(state.seq)}.`,
    };
  }
  if (state.actionSeq !== entry.verification.actionSeqBefore) {
    return {
      status: "failed",
      reason: `Action sequence before mismatch: expected ${String(
        entry.verification.actionSeqBefore,
      )}, got ${String(state.actionSeq)}.`,
    };
  }
  if (beforeHash !== entry.verification.stateHashBefore) {
    return {
      status: "failed",
      reason: "State hash before deterministic entry does not match.",
    };
  }

  const applied = applyDeterministicOperation(state, entry, checkpoints);
  if (applied.status === "failed") {
    return applied;
  }
  if (applied.result.errors !== undefined && applied.result.errors.length > 0) {
    return {
      status: "failed",
      reason: engineErrorsText(applied.result.errors),
    };
  }

  const after = applied.result.state;
  const afterHash = hashReplayStateForScope(
    after,
    entry.verification.hashScope,
  );
  if (after.seq !== entry.verification.stateSeqAfter) {
    return {
      status: "failed",
      reason: `State sequence after mismatch: expected ${String(
        entry.verification.stateSeqAfter,
      )}, got ${String(after.seq)}.`,
    };
  }
  if (after.actionSeq !== entry.verification.actionSeqAfter) {
    return {
      status: "failed",
      reason: `Action sequence after mismatch: expected ${String(
        entry.verification.actionSeqAfter,
      )}, got ${String(after.actionSeq)}.`,
    };
  }
  if (afterHash !== entry.verification.stateHashAfter) {
    return {
      status: "failed",
      reason: "State hash after deterministic entry does not match.",
    };
  }

  return {
    status: "applied",
    state: after,
    stateHash: afterHash,
    label: applied.label,
  };
};
