import type {
  CardInstance,
  GameState,
  PlayerId,
  SelectTargetsDecision,
  TargetCandidate,
} from "@optcg/types";

import { toDecisionId } from "../action-results.js";
import { counterTargetDecisionId } from "./counter-event-payment-context.js";
import type { SupportedCounterEventPower } from "./counter-event-support.js";

const counterEventTargetRequest = (): SelectTargetsDecision["request"] => ({
  timing: "onResolution",
  chooser: "self",
  player: "self",
  zones: ["leaderArea", "characterArea"],
  min: 0,
  max: 1,
  allowFewerIfUnavailable: true,
  visibility: "public",
  filter: { categories: ["leader", "character"] },
});

const counterEventTargetCandidates = (
  supportedTargets: readonly SupportedCounterEventPower[],
): TargetCandidate[] =>
  supportedTargets.map((supportedTarget) => ({
    card: supportedTarget.target,
    visibility: { type: "public" },
  }));

export const createCounterEventTargetDecision = (params: {
  counterEvent: CardInstance;
  decisionPlayerId: PlayerId;
  previousDecisionId: SelectTargetsDecision["id"];
  state: GameState;
  supportedTargets: readonly SupportedCounterEventPower[];
}): SelectTargetsDecision => ({
  id: toDecisionId(
    counterTargetDecisionId(
      String(params.counterEvent.instanceId),
      params.state.seq + 1,
    ),
  ),
  type: "selectTargets",
  playerId: params.decisionPlayerId,
  prompt: "Choose Counter target.",
  causedBy: { type: "decision", decisionId: params.previousDecisionId },
  visibility: { type: "public" },
  request: counterEventTargetRequest(),
  candidates: counterEventTargetCandidates(params.supportedTargets),
  defaultResponse: { type: "targets", targets: [] },
});
