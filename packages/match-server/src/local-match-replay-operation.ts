import type {
  Action,
  DecisionId,
  DecisionResponse,
  GameState,
} from "@optcg/types";

import type { ApplyLocalDevActionInput, LocalDevMatch } from "./local-match.js";

export type AppliedLocalDevReplayOperation =
  | {
      readonly kind: "action";
      readonly action: Action;
      readonly stateSeqBefore: number;
      readonly stateSeqAfter: number;
      readonly stateHashBefore: string;
      readonly stateHashAfter: string;
    }
  | {
      readonly kind: "system";
      readonly systemAction: "advanceToMainPhase";
      readonly stateSeqBefore: number;
      readonly stateSeqAfter: number;
      readonly stateHashBefore: string;
      readonly stateHashAfter: string;
    };

export type PendingReplayOperation =
  | { readonly kind: "action"; readonly action: Action }
  | { readonly kind: "system"; readonly systemAction: "advanceToMainPhase" };

export type ReplayOperationFactory = (
  input?: Pick<ApplyLocalDevActionInput, "selectedDonInstanceIds">,
) => PendingReplayOperation;

export const replayDecisionOperation = (
  decisionId: DecisionId,
  response: DecisionResponse,
): PendingReplayOperation => ({
  kind: "action",
  action: {
    type: "respondToDecision",
    decisionId,
    response,
  },
});

export const replayAdvanceToMainPhaseOperation =
  (): PendingReplayOperation => ({
    kind: "system",
    systemAction: "advanceToMainPhase",
  });

export const replayLegalActionOperation =
  (action: Action): ReplayOperationFactory =>
  (input) => ({
    kind: "action",
    action:
      action.type === "attachDon" &&
      input?.selectedDonInstanceIds !== undefined &&
      input.selectedDonInstanceIds.length > 0
        ? {
            ...action,
            selectedDonInstanceIds: [...input.selectedDonInstanceIds],
          }
        : action,
  });

export const selectedDonReplayInput = (
  input: Pick<ApplyLocalDevActionInput, "selectedDonInstanceIds">,
): Pick<ApplyLocalDevActionInput, "selectedDonInstanceIds"> | undefined =>
  input.selectedDonInstanceIds === undefined
    ? undefined
    : { selectedDonInstanceIds: input.selectedDonInstanceIds };

export const completeReplayOperation = ({
  match,
  operation,
  stateHash,
  stateHashBefore,
  stateSeqBefore,
}: {
  readonly match: LocalDevMatch;
  readonly operation: PendingReplayOperation | undefined;
  readonly stateSeqBefore: number;
  readonly stateHashBefore: string;
  readonly stateHash: (name: string, state: GameState) => string;
}): AppliedLocalDevReplayOperation | undefined =>
  operation === undefined
    ? undefined
    : {
        ...operation,
        stateSeqBefore,
        stateSeqAfter: match.state.seq,
        stateHashBefore,
        stateHashAfter: stateHash("replayAfter", match.state),
      };
