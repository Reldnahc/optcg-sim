import assert from "node:assert/strict";
import { test } from "vitest";

import type { QueueEntryId } from "./effect-runtime-queue-processing-test-support.js";
import {
  hashCanonicalStateValue,
  applyAction,
  getLegalActions,
  must,
  p1,
  processEffectRuntime,
  toDecisionId,
  toStateSeq,
  publicCharacterTargetRequest,
  targetSelectionQueueState,
  mixedOrderedDrawThenTargetState,
} from "./effect-runtime-queue-processing-test-support.js";

test("supported queued target request creates selectTargets decision without resolving the effect", () => {
  const { state, entry, request, targets } = targetSelectionQueueState();
  const beforeQueue = structuredClone(state.effectQueue);
  const beforeSeq = state.seq;
  const beforeJournalLength = state.eventJournal.length;

  const result = processEffectRuntime(state);

  const decision = must(result.state.pendingDecision, "pending decision");
  const decisionCreated = result.events.find(
    (event) => event.type === "decisionCreated",
  );

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "selectTargets");
  assert.equal(
    decision.id,
    toDecisionId("decision:selectTargets:queue-entry-target-selection"),
  );
  assert.equal(decision.playerId, p1);
  assert.equal(decision.prompt, "Select targets.");
  assert.deepEqual(decision.causedBy, {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  });
  assert.deepEqual(decision.request, request);
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    targets.map((target) => target.instanceId),
  );
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.visibility),
    [{ type: "public" }, { type: "public" }],
  );
  assert.deepEqual(result.state.effectQueue, beforeQueue);
  assert.equal(result.state.seq, toStateSeq(beforeSeq + 1));
  assert.equal(result.events.length, 1);
  assert.ok(decisionCreated !== undefined);
  assert.equal(decisionCreated.visibility.type, "public");
  assert.deepEqual(decisionCreated.causedBy, decision.causedBy);
  assert.deepEqual(decisionCreated.payload, {
    decisionId: decision.id,
    decisionType: "selectTargets",
    playerId: p1,
  });
  assert.deepEqual(
    result.state.eventJournal.slice(beforeJournalLength),
    result.events,
  );
  assert.deepEqual(
    getLegalActions(result.state, p1).filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "targets",
          targets: [must(decision.candidates[0], "first candidate").card],
        },
      },
    ],
  );
});

test("selectTargets decision creation is deterministic for identical queued target input", () => {
  const run = () => processEffectRuntime(targetSelectionQueueState().state);

  const first = run();
  const second = run();

  assert.equal(first.errors, undefined);
  assert.equal(second.errors, undefined);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.pendingDecision, second.state.pendingDecision);
  assert.equal(first.stateHash, second.stateHash);
});

test("unsupported queued target request fails closed without mutating state", () => {
  const { state } = targetSelectionQueueState(
    publicCharacterTargetRequest({ visibility: "privateToChooser" }),
  );
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 1,
      },
    },
  ]);
  assert.deepEqual(result.state, before);
  assert.equal(hashCanonicalStateValue(result.state), beforeHash);
});

test("ordered draw before target pause preserves prior runtime events in returned result", () => {
  const { state, drawEntry, targetEntry } = mixedOrderedDrawThenTargetState();
  const paused = processEffectRuntime(state);
  const pendingDecision = must(
    paused.state.pendingDecision,
    "choose order decision",
  );
  assert.equal(pendingDecision.type, "chooseTriggerOrder");
  const beforeJournalLength = paused.state.eventJournal.length;

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: {
      type: "orderedIds",
      ids: [drawEntry.id, targetEntry.id],
    },
  });

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
      "decisionCreated",
    ],
  );
  assert.equal(result.state.pendingDecision?.type, "selectTargets");
  assert.deepEqual(
    result.events
      .filter((event) => event.type === "effectResolved")
      .map(
        (event) =>
          (event.payload as { queueEntryId: QueueEntryId }).queueEntryId,
      ),
    [drawEntry.id],
  );
  assert.deepEqual(
    result.state.effectQueue.map((entry) => entry.id),
    [targetEntry.id],
  );
  assert.deepEqual(
    result.state.eventJournal.slice(beforeJournalLength),
    result.events,
  );
});

test("unsupported ordered target after draw fails closed without keeping partial draw mutation", () => {
  const { state, drawEntry, targetEntry } = mixedOrderedDrawThenTargetState(
    publicCharacterTargetRequest({ visibility: "privateToChooser" }),
  );
  const paused = processEffectRuntime(state);
  const pendingDecision = must(
    paused.state.pendingDecision,
    "choose order decision",
  );
  assert.equal(pendingDecision.type, "chooseTriggerOrder");
  const beforeP1 = structuredClone(must(paused.state.players[p1], "p1"));

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: pendingDecision.id,
    response: {
      type: "orderedIds",
      ids: [drawEntry.id, targetEntry.id],
    },
  });

  const afterP1 = must(result.state.players[p1], "p1 result");
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 2,
      },
    },
  ]);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["decisionResolved"],
  );
  assert.equal(afterP1.deck.length, beforeP1.deck.length);
  assert.equal(afterP1.hand.length, beforeP1.hand.length);
  assert.deepEqual(
    result.state.effectQueue.map((entry) => entry.id),
    [drawEntry.id, targetEntry.id],
  );
  assert.equal(result.state.pendingDecision, undefined);
});
