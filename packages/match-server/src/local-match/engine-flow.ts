import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  canonicalSerializeStateValue,
  enterMainPhase,
  startMulliganFlow,
} from "@optcg/engine-core";
import { createHash } from "node:crypto";
import type { EngineError, EngineResult, GameState } from "@optcg/types";

import { recordActionTimingSpan } from "../action-timing-log.js";

export const timedStateHash = (name: string, value: unknown): string => {
  const serialized = recordActionTimingSpan(`hash:${name}:serialize`, () =>
    canonicalSerializeStateValue(value),
  );
  return recordActionTimingSpan(`hash:${name}:sha256`, () =>
    createHash("sha256").update(serialized, "utf8").digest("hex"),
  );
};

export const liveEngineOptions = {
  includeStateHash: false,
  profileSpan: recordActionTimingSpan,
  validateInvariants: false,
} as const;

export const describeEngineError = (error: EngineError): string => {
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

export const assertEngineResult = (
  result: EngineResult,
  context: string,
): void => {
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

export const advanceToMainPhase = (state: GameState): EngineResult => {
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

export const autoAdvanceMandatoryTurnFlow = (
  result: EngineResult,
): EngineResult => {
  if (result.errors !== undefined && result.errors.length > 0) {
    return result;
  }
  const advanced = recordActionTimingSpan("advanceToMainPhase", () =>
    advanceToMainPhase(result.state),
  );
  return combinedEngineResult(advanced, [...result.events, ...advanced.events]);
};

export const startMulliganAfterSetupIfReady = (
  result: EngineResult,
): EngineResult => {
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
