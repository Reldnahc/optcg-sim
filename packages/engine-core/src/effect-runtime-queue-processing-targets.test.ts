import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";
import type {
  CardInstance,
  QueueEntryId,
} from "./effect-runtime-queue-processing-test-support.js";
import {
  hashCanonicalStateValue,
  applyAction,
  getLegalActions,
  must,
  p1,
  p2,
  processEffectRuntime,
  setupOnKODefinition,
  toDecisionId,
  toStateSeq,
  publicCharacterTargetRequest,
  targetSelectionQueueState,
  mixedOrderedDrawThenTargetState,
} from "./effect-runtime-queue-processing-test-support.js";
import { advanceEndPhase, advanceRefreshPhase } from "./phases.js";

const removeFieldCardsFromHands = (state: {
  players: Record<string, { hand: CardInstance[]; characters: CardInstance[] }>;
}): void => {
  for (const player of Object.values(state.players)) {
    const fieldIds = new Set(player.characters.map((card) => card.instanceId));
    player.hand = player.hand
      .filter((card) => !fieldIds.has(card.instanceId))
      .map((card, index) => ({
        ...card,
        zone: {
          zone: "hand" as const,
          playerId: must(card.zone.playerId, "hand player"),
          slot: "hand" as const,
          index,
        },
      }));
  }
};

const withQueuedEffect = (
  state: ReturnType<typeof targetSelectionQueueState>["state"],
  effect: Effect,
): void => {
  const definition = must(
    state.cardManifest.effectDefinitions?.["def-target-selection"],
    "target definition",
  );
  state.cardManifest.effectDefinitions = {
    "def-target-selection": {
      ...definition,
      effects: [
        {
          ...must(definition.effects[0], "target effect"),
          effect,
        },
      ],
    },
  };
};

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

test("selectTargets response resumes queued KO target effect in stable event order", () => {
  const { state, entry } = targetSelectionQueueState();
  removeFieldCardsFromHands(state);
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectTargets");
  const selected = must(decision.candidates[1], "second candidate").card;
  const beforeJournalLength = paused.state.eventJournal.length;

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [selected] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardKOd",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(result.events[0]?.payload, {
    decisionId: decision.id,
    decisionType: "selectTargets",
    playerId: p1,
    responseType: "targets",
  });
  assert.deepEqual(result.events[3]?.payload, {
    queueEntryId: entry.id,
    timingWindowId: entry.timingWindowId,
    generation: entry.generation,
    effectBlockId: entry.effectBlockId,
    sourcePresencePolicy: entry.sourcePresencePolicy,
    orderingGroup: entry.orderingGroup,
    status: "resolved",
  });
  assert.deepEqual(
    result.state.eventJournal.slice(beforeJournalLength),
    result.events,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("selectTargets response continuation is deterministic for identical queued target input", () => {
  const run = () => {
    const { state } = targetSelectionQueueState();
    removeFieldCardsFromHands(state);
    const paused = processEffectRuntime(state);
    const decision = must(paused.state.pendingDecision, "pending decision");
    assert.equal(decision.type, "selectTargets");
    return applyAction(paused.state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "targets",
        targets: [must(decision.candidates[0], "first candidate").card],
      },
    });
  };

  const first = run();
  const second = run();

  assert.equal(first.errors, undefined);
  assert.equal(second.errors, undefined);
  assert.deepEqual(first.events, second.events);
  assert.equal(first.stateHash, second.stateHash);
});

test("selectTargets response queues On K.O. triggers before continuing runtime processing", () => {
  const { state } = targetSelectionQueueState();
  removeFieldCardsFromHands(state);
  const p2State = must(state.players[p2], "p2");
  const target = must(p2State.characters[0], "target");
  const drawCard = must(p2State.hand[0], "p2 draw card");
  const deckBuffer = must(p2State.hand[1], "p2 deck buffer");
  p2State.deck = [
    {
      ...drawCard,
      zone: { zone: "deck", playerId: p2, slot: "deck", index: 0 },
    },
    {
      ...deckBuffer,
      zone: { zone: "deck", playerId: p2, slot: "deck", index: 1 },
    },
  ];
  p2State.hand = p2State.hand.slice(2).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  setupOnKODefinition(state, target);
  const beforeP2Hand = p2State.hand.length;
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectTargets");

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "first candidate").card],
    },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardKOd",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
      "effectQueued",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  const targetKoResolvedIndex = result.events.findIndex(
    (event) => event.type === "effectResolved",
  );
  const onKOQueuedIndex = result.events.findIndex(
    (event) => event.type === "effectQueued",
  );
  const onKOResolvedIndex = result.events.findLastIndex(
    (event) => event.type === "effectResolved",
  );
  assert.ok(targetKoResolvedIndex >= 0);
  assert.ok(onKOQueuedIndex > targetKoResolvedIndex);
  assert.ok(onKOResolvedIndex > onKOQueuedIndex);
  assert.equal(
    must(result.state.players[p2], "result p2").hand.length,
    beforeP2Hand + 1,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
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

test("failed queued target decision creation does not consume once-per-turn", () => {
  const { state, entry } = targetSelectionQueueState(
    publicCharacterTargetRequest({ visibility: "privateToChooser" }),
  );
  const definition = must(
    state.cardManifest.effectDefinitions?.["def-target-selection"],
    "target definition",
  );
  state.cardManifest.effectDefinitions = {
    "def-target-selection": {
      ...definition,
      effects: [
        {
          ...must(definition.effects[0], "target effect"),
          oncePerTurn: true,
        },
      ],
    },
  };
  const before = structuredClone(state.oncePerTurn);

  const result = processEffectRuntime(state);

  assert.ok(result.errors !== undefined);
  assert.equal(result.state.effectQueue[0]?.id, entry.id);
  assert.deepEqual(result.state.oncePerTurn, before);
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

test("selectTargets response for cannotAttack choose creates exact-card continuous restriction", () => {
  const { state, entry } = targetSelectionQueueState();
  const definition = must(
    state.cardManifest.effectDefinitions?.["def-target-selection"],
    "target definition",
  );
  state.cardManifest.effectDefinitions = {
    "def-target-selection": {
      ...definition,
      effects: [
        {
          ...must(definition.effects[0], "target effect"),
          effect: {
            type: "cannotAttack",
            target: { type: "choose", request: publicCharacterTargetRequest() },
            duration: { type: "thisTurn" },
          },
        },
      ],
    },
  };
  removeFieldCardsFromHands(state);

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectTargets");
  const selected = must(decision.candidates[0], "first candidate").card;
  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [selected] },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.equal(result.state.continuousEffects.length, 1);
  const created = must(result.state.continuousEffects[0], "continuous effect");
  assert.equal(created.modifier.layer, "restriction");
  assert.equal(created.modifier.operation.type, "restriction");
  assert.equal(created.modifier.operation.restriction, "cannotAttack");
  assert.equal(created.modifier.target.type, "exactCard");
  assert.equal(created.modifier.target.card.instanceId, selected.instanceId);
  assert.equal(created.duration.type, "thisTurn");
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["decisionResolved", "effectResolved", "ruleProcessingChecked"],
  );
  assert.deepEqual(result.events[1]?.payload, {
    queueEntryId: entry.id,
    timingWindowId: entry.timingWindowId,
    generation: entry.generation,
    effectBlockId: entry.effectBlockId,
    sourcePresencePolicy: entry.sourcePresencePolicy,
    orderingGroup: entry.orderingGroup,
    status: "resolved",
  });
});

test("modifyPower self resolves without target decision and preserves queue determinism", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "modifyPower",
    target: { type: "self" },
    value: 1000,
    duration: { type: "thisTurn" },
  });
  const beforeQueue = structuredClone(state.effectQueue);
  const beforeHash = hashCanonicalStateValue(state);
  const result = processEffectRuntime(state);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.equal(result.state.continuousEffects.length, 1);
  const created = must(result.state.continuousEffects[0], "self modifier");
  assert.equal(created.modifier.layer, "powerAdd");
  assert.equal(created.modifier.target.type, "self");
  assert.equal(created.modifier.operation.type, "addPower");
  assert.equal(created.modifier.operation.value, 1000);
  assert.equal(created.duration.type, "thisTurn");
  assert.equal(created.createdAtStateSeq, state.seq);
  assert.notEqual(hashCanonicalStateValue(result.state), beforeHash);
  assert.deepEqual(beforeQueue.length, 1);
});

test("modifyPower all resolves without target decision", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "modifyPower",
    target: { type: "all", zone: "characterArea", player: "opponent" },
    value: 1000,
    duration: { type: "untilEndOfTurn", whoseTurn: "current" },
  });
  const result = processEffectRuntime(state);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.equal(result.state.continuousEffects.length, 1);
  assert.equal(result.state.continuousEffects[0]?.modifier.target.type, "all");
});

test("modifyPower choose creates exact-card continuous modifier bound to selected target", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "modifyPower",
    target: { type: "choose", request: publicCharacterTargetRequest() },
    value: 1000,
    duration: { type: "untilStartOfNextTurn", player: "self" },
  });
  removeFieldCardsFromHands(state);
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "selectTargets decision");
  assert.equal(decision.type, "selectTargets");
  const selected = must(decision.candidates[0], "selected").card;
  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [selected] },
  });
  assert.equal(result.errors, undefined);
  const created = must(result.state.continuousEffects[0], "continuous");
  assert.equal(created.modifier.layer, "powerAdd");
  assert.equal(created.modifier.target.type, "exactCard");
  assert.equal(created.modifier.target.card.instanceId, selected.instanceId);
  assert.equal(created.modifier.operation.type, "addPower");
  assert.equal(created.modifier.operation.value, 1000);
});

test("cannotBlock choose creates exact-card continuous restriction bound to selected target", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "cannotBlock",
    target: { type: "choose", request: publicCharacterTargetRequest() },
    duration: { type: "thisTurn" },
  });
  removeFieldCardsFromHands(state);
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "selectTargets decision");
  assert.equal(decision.type, "selectTargets");
  const selected = must(decision.candidates[0], "selected").card;
  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [selected] },
  });
  assert.equal(result.errors, undefined);
  const created = must(result.state.continuousEffects[0], "continuous");
  assert.equal(created.modifier.layer, "restriction");
  assert.equal(created.modifier.target.type, "exactCard");
  assert.equal(created.modifier.target.card.instanceId, selected.instanceId);
  assert.equal(created.modifier.operation.type, "restriction");
  assert.equal(created.modifier.operation.restriction, "cannotBlock");
});

test.each([
  {
    name: "modifyPower",
    effect: {
      type: "modifyPower",
      target: {
        type: "choose",
        request: publicCharacterTargetRequest({ min: 0, max: 1 }),
      },
      value: 1000,
      duration: { type: "thisTurn" },
    } satisfies Effect,
  },
  {
    name: "cannotAttack",
    effect: {
      type: "cannotAttack",
      target: {
        type: "choose",
        request: publicCharacterTargetRequest({ min: 0, max: 1 }),
      },
      duration: { type: "thisTurn" },
    } satisfies Effect,
  },
  {
    name: "cannotBlock",
    effect: {
      type: "cannotBlock",
      target: {
        type: "choose",
        request: publicCharacterTargetRequest({ min: 0, max: 1 }),
      },
      duration: { type: "thisTurn" },
    } satisfies Effect,
  },
])(
  "$name choose accepts zero targets as a deterministic no-op",
  ({ effect }) => {
    const run = () => {
      const { state, entry } = targetSelectionQueueState(
        publicCharacterTargetRequest({ min: 0, max: 1 }),
      );
      withQueuedEffect(state, effect);
      removeFieldCardsFromHands(state);
      const paused = processEffectRuntime(state);
      const decision = must(
        paused.state.pendingDecision,
        "selectTargets decision",
      );
      assert.equal(decision.type, "selectTargets");

      const result = applyAction(paused.state, {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "targets", targets: [] },
      });

      assert.equal(result.errors, undefined);
      assert.equal(result.state.pendingDecision, undefined);
      assert.deepEqual(result.state.effectQueue, []);
      assert.equal(result.state.continuousEffects.length, 0);
      assert.deepEqual(
        result.events.map((event) => event.type),
        ["decisionResolved", "effectResolved", "ruleProcessingChecked"],
      );
      assert.deepEqual(result.events[1]?.payload, {
        queueEntryId: entry.id,
        timingWindowId: entry.timingWindowId,
        generation: entry.generation,
        effectBlockId: entry.effectBlockId,
        sourcePresencePolicy: entry.sourcePresencePolicy,
        orderingGroup: entry.orderingGroup,
        status: "resolved",
      });
      assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
      return {
        eventTypes: result.events.map((event) => event.type),
        eventSeq: result.events.map((event) => event.seq),
        journalSeq: result.state.eventJournal.map((event) => event.seq),
        stateHash: result.stateHash,
      };
    };

    const first = run();
    const second = run();
    assert.deepEqual(first, second);
  },
);

test("multi-target choose continuous effect stores distinct exact-card binding objectIndex per target", () => {
  const { state } = targetSelectionQueueState(
    publicCharacterTargetRequest({ min: 2, max: 2 }),
  );
  withQueuedEffect(state, {
    type: "modifyPower",
    target: {
      type: "choose",
      request: publicCharacterTargetRequest({ min: 2, max: 2 }),
    },
    value: 1000,
    duration: { type: "thisTurn" },
  });
  removeFieldCardsFromHands(state);
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "selectTargets decision");
  assert.equal(decision.type, "selectTargets");
  const first = must(decision.candidates[0], "first candidate").card;
  const second = must(decision.candidates[1], "second candidate").card;
  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [first, second] },
  });
  assert.equal(result.errors, undefined);
  assert.equal(result.state.continuousEffects.length, 2);
  const record0 = must(result.state.continuousEffects[0], "record0");
  const record1 = must(result.state.continuousEffects[1], "record1");
  assert.equal(record0.modifier.target.type, "exactCard");
  assert.equal(record1.modifier.target.type, "exactCard");
  assert.equal(record0.modifier.target.card.instanceId, first.instanceId);
  assert.equal(record1.modifier.target.card.instanceId, second.instanceId);
  assert.equal(record0.modifier.target.binding.objectIndex, 0);
  assert.equal(record1.modifier.target.binding.objectIndex, 1);
});

test("cannotBlock self with untilStartOfNextTurn resolves without decision", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "cannotBlock",
    target: { type: "self" },
    duration: { type: "untilStartOfNextTurn", player: "self" },
  });
  const result = processEffectRuntime(state);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.continuousEffects.length, 1);
  const continuousEffect = must(
    result.state.continuousEffects[0],
    "continuous cannotBlock effect",
  );
  assert.equal(continuousEffect.modifier.operation.type, "restriction");
  assert.equal(continuousEffect.modifier.operation.restriction, "cannotBlock");
});

test("unsupported duration thisAction fails closed for queued modifyPower", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "modifyPower",
    target: { type: "self" },
    value: 1000,
    duration: { type: "thisAction" },
  });
  const before = structuredClone(state);
  const result = processEffectRuntime(state);
  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, before);
});

test("supported duration whileConditionTrue creates conditional queued modifyPower", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "modifyPower",
    target: { type: "self" },
    value: 1000,
    duration: { type: "whileConditionTrue", condition: { type: "yourTurn" } },
  });
  const result = processEffectRuntime(state);
  const continuous = must(
    result.state.continuousEffects[0],
    "continuous effect",
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(continuous.duration.type, "whileConditionTrue");
  assert.deepEqual(continuous.condition, undefined);
});

test("unsupported turn-relative duration parameterization fails closed", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "cannotAttack",
    target: { type: "self" },
    duration: { type: "untilEndOfTurn", whoseTurn: "targetController" },
  });
  const before = structuredClone(state);
  const result = processEffectRuntime(state);
  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, before);
});

test("unsupported untilStartOfNextTurn playerRef parameterization fails closed", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "cannotAttack",
    target: { type: "self" },
    duration: { type: "untilStartOfNextTurn", player: "turnPlayer" },
  });
  const before = structuredClone(state);
  const result = processEffectRuntime(state);
  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, before);
});

test("unsupported restriction family fails closed", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "cannotBeAttacked",
    target: { type: "self" },
    duration: { type: "thisTurn" },
  });
  const before = structuredClone(state);
  const result = processEffectRuntime(state);
  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, before);
});

test("unsupported restriction target fails closed", () => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "cannotAttack",
    target: { type: "myLeader" },
    duration: { type: "thisTurn" },
  });
  const before = structuredClone(state);
  const result = processEffectRuntime(state);
  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, before);
});

test.each([
  { name: "opponentLeader", target: { type: "opponentLeader" } as const },
  { name: "attacker", target: { type: "attacker" } as const },
  { name: "attackTarget", target: { type: "attackTarget" } as const },
  { name: "blocker", target: { type: "blocker" } as const },
  { name: "triggerCard", target: { type: "triggerCard" } as const },
  {
    name: "savedFieldObject",
    target: {
      type: "savedFieldObject",
      binding: { family: "selectedTargets", saveResultAs: "x" },
      zone: "characterArea",
      player: "self",
      visibility: "publicOnly",
      onFailure: "failClosed",
    } as const,
  },
])("unsupported restriction target $name fails closed", ({ target }) => {
  const { state } = targetSelectionQueueState();
  withQueuedEffect(state, {
    type: "cannotAttack",
    target,
    duration: { type: "thisTurn" },
  });
  const before = structuredClone(state);
  const result = processEffectRuntime(state);
  assert.deepEqual(result.events, []);
  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, before);
});

test("continuous effect apply+expire remains deterministic in event order and final hash", () => {
  const run = () => {
    const { state } = targetSelectionQueueState();
    removeFieldCardsFromHands(state);
    withQueuedEffect(state, {
      type: "modifyPower",
      target: { type: "self" },
      value: 1000,
      duration: { type: "thisTurn" },
    });
    const applied = processEffectRuntime(state);
    assert.equal(applied.errors, undefined);
    const asEnd = {
      ...applied.state,
      turn: { ...applied.state.turn, phase: "end" as const },
    };
    const ended = advanceEndPhase(asEnd);
    assert.equal(ended.errors, undefined);
    const refreshed = advanceRefreshPhase(ended.state);
    assert.equal(refreshed.errors, undefined);
    return {
      applyEvents: applied.events.map((event) => event.type),
      endEvents: ended.events.map((event) => event.type),
      refreshEvents: refreshed.events.map((event) => event.type),
      finalHash: hashCanonicalStateValue(refreshed.state),
      finalContinuousCount: refreshed.state.continuousEffects.length,
    };
  };
  const first = run();
  const second = run();
  assert.deepEqual(first, second);
  assert.equal(first.finalContinuousCount, 0);
});
