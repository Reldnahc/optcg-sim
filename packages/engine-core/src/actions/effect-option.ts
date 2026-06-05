import type {
  Action,
  EngineError,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { toEngineResult } from "../action-results.js";
import { resumeSequenceFrameAfterEffectOption } from "../effect-runtime-sequence/frames.js";
import { createSupportedTrashFromHandChoiceDecision } from "../runtime/primitives/trash-from-hand.js";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

export const getChooseEffectOptionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "chooseEffectOption" ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  return decision.options.map((option) => ({
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "effectOption", optionId: option.id },
  }));
};

export const applyChooseEffectOptionDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "chooseEffectOption") {
    return null;
  }
  const response: unknown = action.response;
  if (typeof response !== "object" || response === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response must be an object for chooseEffectOption."),
    );
  }
  if ((response as { type?: unknown }).type !== "effectOption") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be effectOption for chooseEffectOption.",
      ),
    );
  }
  const optionId = (response as { optionId?: unknown }).optionId;
  if (
    typeof optionId !== "string" ||
    !decision.options.some((option) => option.id === optionId)
  ) {
    return toEngineResult(
      state,
      [],
      invalidDecision("effectOption optionId must match a decision option."),
    );
  }

  const resumed = resumeSequenceFrameAfterEffectOption(
    state,
    decision,
    optionId,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumed === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("chooseEffectOption decision is stale."),
    );
  }
  return resumed.ok
    ? toEngineResult(resumed.state, resumed.events)
    : toEngineResult(state, [], [resumed.error]);
};
