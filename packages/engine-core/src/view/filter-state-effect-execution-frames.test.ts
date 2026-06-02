import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  DecisionId,
  EffectExecutionFrame,
  EffectId,
  GameState,
  QueueEntryId,
  SelectionSetId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  toStateSeq,
} from "../action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const representativeFrameForViewTest = (
  state: GameState,
): EffectExecutionFrame => {
  const p1State = must(state.players[p1], "p1 state");
  const hiddenDeckCard = must(p1State.deck[0], "p1 hidden deck");
  const selectionSetId = "set:hidden-frame" as SelectionSetId;
  const hiddenCardRef = {
    instanceId: hiddenDeckCard.instanceId,
    cardId: hiddenDeckCard.cardId,
    playerId: p1,
    zone: hiddenDeckCard.zone,
  };

  return {
    queueEntryId: toQueueEntryId("queue-entry:hidden-frame"),
    effectBlockId: "effect:hidden-frame" as EffectId,
    effectPath: ["effect", "sequence", "1"],
    nextSegmentIndex: 2,
    segmentResults: {
      hiddenSegment: {
        attempted: true,
        succeeded: true,
        changedState: false,
        selectedCards: [hiddenCardRef],
        selectedTargets: [],
        paidCost: false,
        playerDeclined: false,
      },
    },
    savedReferences: {
      hiddenSavedCard: {
        kind: "selectedCards",
        cards: [hiddenCardRef],
      },
    },
    transientSets: {
      [selectionSetId]: {
        id: selectionSetId,
        cards: [hiddenCardRef],
        origin: "topOfDeck",
        visibility: { type: "private", playerId: p1 },
        cleanupPolicy: "returnToOrigin",
      },
    },
    pendingDecision: {
      decisionId: toDecisionId("decision:hidden-frame"),
      causedBy: {
        type: "effect",
        queueEntryId: toQueueEntryId("queue-entry:hidden-frame"),
        effectId: "effect:hidden-frame" as EffectId,
      },
      createdAtStateSeq: toStateSeq(state.seq),
      resumeAtSegmentIndex: 2,
    },
  };
};

test("keeps serialized effect execution frame internals out of player views", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const hiddenDeckCard = must(p1State.deck[0], "p1 hidden deck");
  state.effectExecutionFrames = [representativeFrameForViewTest(state)];

  const forController = filterStateForPlayer(state, p1);
  const forOpponent = filterStateForPlayer(state, p2);

  for (const view of [forController, forOpponent]) {
    const raw = view as unknown as Record<string, unknown>;
    const serialized = JSON.stringify(view);
    assert.equal("effectExecutionFrames" in raw, false);
    assert.equal(serialized.includes("effectExecutionFrames"), false);
    assert.equal(serialized.includes("segmentResults"), false);
    assert.equal(serialized.includes("savedReferences"), false);
    assert.equal(serialized.includes("transientSets"), false);
    assert.equal(serialized.includes("resumeAtSegmentIndex"), false);
    assert.equal(serialized.includes("effect:hidden-frame"), false);
    assert.equal(serialized.includes(String(hiddenDeckCard.cardId)), false);
  }
});
