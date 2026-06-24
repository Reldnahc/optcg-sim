import assert from "node:assert/strict";
import { test } from "vitest";

import type { DecisionId, EngineEventId, PendingDecision } from "@optcg/types";

import { p1 } from "../action-test-fixtures.js";
import {
  publicPendingDecisionIdForAnchor,
  publicPendingDecisionIdForPendingDecision,
} from "./public-pending-identity.js";

const decision = {
  id: "decision:raw-secret" as DecisionId,
  type: "mulligan",
  playerId: p1,
  prompt: "Keep or mulligan?",
  causedBy: { type: "ruleProcess", name: "test" },
  visibility: { type: "public" },
  options: ["keep", "mulligan"],
} satisfies PendingDecision;

test("public pending spotlight identity uses explicit decision anchor", () => {
  const publicId = publicPendingDecisionIdForPendingDecision({
    pending: {
      ...decision,
      decisionAnchorEventId: "event:decision-anchor" as EngineEventId,
    },
    recipientPlayerId: p1,
  });

  assert.equal(
    publicId,
    "spotlight:pending:event:decision-anchor:recipient:p1",
  );
  assert.equal(String(publicId).includes(String(decision.id)), false);
});

test("publicPendingDecisionIdForAnchor derives identity without raw decision id", () => {
  const publicId = publicPendingDecisionIdForAnchor({
    decisionAnchorEventId: "event:direct-anchor" as EngineEventId,
    playerId: p1,
  });

  assert.equal(publicId, "spotlight:pending:event:direct-anchor:recipient:p1");
  assert.equal(String(publicId).includes(String(decision.id)), false);
});

test("public pending spotlight identity has raw-id-free legacy fallback", () => {
  const publicId = publicPendingDecisionIdForPendingDecision({
    pending: decision,
    recipientPlayerId: p1,
  });

  assert.equal(publicId, "spotlight:pending:unanchored:recipient:p1");
  assert.equal(String(publicId).includes(String(decision.id)), false);
});
