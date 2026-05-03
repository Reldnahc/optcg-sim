import { expect, test } from "vitest";

import type {
  Action,
  CardRef,
  DecisionId,
  DecisionResponse,
  PendingDecision,
  PlayerId,
} from "./index.js";

test("decision concern contracts compile", () => {
  const player = "player-1" as PlayerId;
  const source: CardRef = {
    instanceId: "instance-1" as CardRef["instanceId"],
    cardId: "OP01-001" as CardRef["cardId"],
    playerId: player,
  };
  const response: DecisionResponse = { type: "mulligan", keep: false };
  const action: Action = {
    type: "respondToDecision",
    decisionId: "decision-1" as DecisionId,
    response,
  };
  const pending: PendingDecision = {
    id: "decision-2" as DecisionId,
    type: "mulligan",
    playerId: player,
    prompt: "Mulligan?",
    causedBy: { type: "playerAction", actionId: "action-1" },
    visibility: { type: "private", playerId: player },
    options: ["keep", "mulligan"],
  };

  expect(source.playerId).toBe(player);
  expect(action.type).toBe("respondToDecision");
  expect(pending.type).toBe("mulligan");
});
