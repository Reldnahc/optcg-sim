import { describe, expect, test } from "vitest";
import type {
  DecisionId,
  DeterministicMatchEntry,
  StateSeq,
} from "@optcg/types";

import {
  makeMainPhaseLegalActionState,
  toDecisionId,
} from "../action-dispatcher-test-support.js";
import { createInput, p1, p2 } from "../action-test-fixtures.js";
import { createInitialState } from "../setup/initial-state.js";
import { startMulliganFlow } from "../setup/mulligan.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { applyDeterministicOperation } from "./deterministic-operation.js";

const verification = (
  stateSeqBefore: StateSeq,
): DeterministicMatchEntry["verification"] => ({
  stateSeqBefore,
  actionSeqBefore: 0,
  stateHashBefore: "before",
  stateSeqAfter: (Number(stateSeqBefore) + 1) as StateSeq,
  actionSeqAfter: 1,
  stateHashAfter: "after",
  hashScope: "gameplay-v1",
});

describe("applyDeterministicOperation", () => {
  test("applies exact action objects without legal action index lookup", () => {
    const initialState = makeMainPhaseLegalActionState();
    const entry: DeterministicMatchEntry = {
      formatVersion: "deterministic-entry-v1",
      matchId: initialState.matchId,
      entrySeq: 0,
      kind: "action",
      playerId: initialState.turn.turnPlayerId,
      action: { type: "endMainPhase" },
      verification: verification(initialState.seq),
    };

    const result = applyDeterministicOperation(initialState, entry);

    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.label).toBe("endMainPhase");
      expect(result.result.errors).toBeUndefined();
      expect(result.result.state.seq).toBeGreaterThan(initialState.seq);
    }
  });

  test("applies exact decision responses by decision id", () => {
    const setup = createInitialState(createInput());
    const started = startMulliganFlow(setup);
    const decision = started.state.pendingDecision;
    if (decision === undefined) {
      throw new Error("Expected pending mulligan decision.");
    }
    const entry: DeterministicMatchEntry = {
      formatVersion: "deterministic-entry-v1",
      matchId: started.state.matchId,
      entrySeq: 0,
      kind: "decision",
      playerId: decision.playerId,
      decisionId: decision.id,
      response: { type: "mulligan", keep: true },
      verification: verification(started.state.seq),
    };

    const result = applyDeterministicOperation(started.state, entry);

    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.result.errors).toBeUndefined();
      expect(result.result.state.pendingDecision?.playerId).toBe(p2);
    }
  });

  test("rejects rollback restore entries without a checkpoint resolver", () => {
    const initialState = makeMainPhaseLegalActionState();
    const entry: DeterministicMatchEntry = {
      formatVersion: "deterministic-entry-v1",
      matchId: initialState.matchId,
      entrySeq: 0,
      kind: "system",
      operation: {
        type: "restoreRollbackPoint",
        rollbackPointId: "rollback:missing",
        requestedBy: p1,
        approvedBy: p2,
        restoredStateHash: "hash",
        restoredStateSeq: initialState.seq,
        restoredActionSeq: initialState.actionSeq,
      },
      verification: verification(initialState.seq),
    };

    const result = applyDeterministicOperation(initialState, entry);

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason).toMatch(/checkpoint/i);
    }
  });

  test("replays rollback consent requests as pending decisions", () => {
    const initialState = makeMainPhaseLegalActionState();
    const decisionId = toDecisionId("decision:rollback:point:1");
    const entry: DeterministicMatchEntry = {
      formatVersion: "deterministic-entry-v1",
      matchId: initialState.matchId,
      entrySeq: 0,
      kind: "system",
      operation: {
        type: "requestRollbackConsent",
        playerId: p1,
        rollbackPointId: "rollback:1",
        approvingPlayerId: p2,
        decisionId,
        prompt: "Allow rollback?",
      },
      verification: verification(initialState.seq),
    };

    const result = applyDeterministicOperation(initialState, entry);

    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.label).toBe("requestRollbackConsent");
      expect(result.result.state.pendingDecision).toMatchObject({
        id: decisionId,
        type: "rollbackConsent",
        playerId: p2,
        rollbackPointId: "rollback:1",
      });
    }
  });

  test("replays rollback consent cancellation by clearing pending decision", () => {
    const initialState = makeMainPhaseLegalActionState();
    initialState.pendingDecision = {
      id: "decision:rollback:point:1" as DecisionId,
      type: "rollbackConsent",
      playerId: p2,
      prompt: "Allow rollback?",
      causedBy: { type: "ruleProcess", name: "rollbackRequest" },
      visibility: { type: "private", playerId: p2 },
      rollbackPointId: "rollback:1",
    };
    const entry: DeterministicMatchEntry = {
      formatVersion: "deterministic-entry-v1",
      matchId: initialState.matchId,
      entrySeq: 0,
      kind: "system",
      operation: {
        type: "cancelRollbackConsent",
        playerId: p1,
        rollbackPointId: "rollback:1",
        decisionId: initialState.pendingDecision.id,
      },
      verification: verification(initialState.seq),
    };

    const result = applyDeterministicOperation(initialState, entry);

    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.label).toBe("cancelRollbackConsent");
      expect(result.result.state.pendingDecision).toBeUndefined();
      expect(result.result.stateHash).toBe(
        hashCanonicalStateValue(result.result.state),
      );
    }
  });
});
