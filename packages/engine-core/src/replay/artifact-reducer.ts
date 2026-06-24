import type {
  Action,
  DecisionId,
  DecisionResponse,
  GameState,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";

export interface ReplayArtifactStateFrame {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly state: GameState;
  readonly stateHash: string;
}

export type ReplayArtifactReconstructionResult =
  | {
      readonly status: "ready";
      readonly frames: readonly ReplayArtifactStateFrame[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly actionIndex?: number | undefined;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const replayActionFromEntry = (
  entry: unknown,
):
  | { readonly status: "ready"; readonly action: Action; readonly label: string }
  | { readonly status: "failed"; readonly reason: string } => {
  if (!isRecord(entry) || !isRecord(entry["envelope"])) {
    return { status: "failed", reason: "Replay entry is missing an envelope." };
  }
  const request = entry["envelope"]["request"];
  if (!isRecord(request) || typeof request["type"] !== "string") {
    return {
      status: "failed",
      reason: "Replay entry is missing a request type.",
    };
  }
  const type = request["type"];
  if (type === "endMainPhase") {
    return { status: "ready", action: { type }, label: type };
  }
  if (type === "playCard" && typeof request["cardInstanceId"] === "string") {
    return {
      status: "ready",
      action: {
        type,
        cardInstanceId: request["cardInstanceId"] as InstanceId,
      },
      label: type,
    };
  }
  if (type === "concede" && typeof request["playerId"] === "string") {
    return {
      status: "ready",
      action: {
        type,
        playerId: request["playerId"] as PlayerId,
      },
      label: type,
    };
  }
  if (
    type === "respondToDecision" &&
    typeof request["decisionId"] === "string" &&
    isRecord(request["response"])
  ) {
    return {
      status: "ready",
      action: {
        type,
        decisionId: request["decisionId"] as DecisionId,
        response: request["response"] as unknown as DecisionResponse,
      },
      label: type,
    };
  }
  return { status: "failed", reason: `Unsupported replay action ${type}.` };
};

export const reconstructReplayArtifactStates = ({
  deterministicEntries,
  expectedFinalStateHash,
  initialState,
}: {
  readonly initialState: GameState;
  readonly deterministicEntries: readonly unknown[];
  readonly expectedFinalStateHash?: string | undefined;
}): ReplayArtifactReconstructionResult => {
  const stateHash = hashCanonicalStateValue(initialState);
  const frames: ReplayArtifactStateFrame[] = [
    {
      index: 0,
      actionIndex: null,
      label: "Initial state",
      state: structuredClone(initialState),
      stateHash,
    },
  ];
  let current = structuredClone(initialState);
  for (const [actionIndex, entry] of deterministicEntries.entries()) {
    const decoded = replayActionFromEntry(entry);
    if (decoded.status === "failed") {
      return { status: "failed", reason: decoded.reason, actionIndex };
    }
    const result = applyAction(current, decoded.action);
    if (result.errors !== undefined) {
      return {
        status: "failed",
        reason: result.errors
          .map((error) =>
            "reason" in error ? String(error.reason) : String(error.type),
          )
          .join("; "),
        actionIndex,
      };
    }
    current = result.state;
    frames.push({
      index: frames.length,
      actionIndex,
      label: decoded.label,
      state: structuredClone(current),
      stateHash: result.stateHash,
    });
  }
  const finalStateHash = frames.at(-1)?.stateHash ?? stateHash;
  if (
    expectedFinalStateHash !== undefined &&
    expectedFinalStateHash !== finalStateHash
  ) {
    return {
      status: "failed",
      reason: "Replay reconstruction final hash mismatch.",
    };
  }
  return { status: "ready", frames };
};
