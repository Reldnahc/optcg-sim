import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardId,
  CardInstance,
  CardRef,
  DecisionId,
  DecisionResponse,
  EffectDefinition,
  EffectId,
  EngineEvent,
  EngineResult,
  EffectQueueEntry,
  EngineError,
  GameState,
  InstanceId,
  QueueEntryId,
  StateSeq,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedMainEventDrawDefinition,
  reviewedOnPlayDrawDefinition,
  toCardId,
} from "./action-test-fixtures.js";
import { applyAction, getLegalActions } from "./actions.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
import { applyPlayCard, applyPlayCardDecisionResponse } from "./play-card.js";
import { setupMainPlayState } from "./play-card-test-fixtures.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const publicCharacterTargetRequest = (
  overrides: Partial<TargetRequest> = {},
): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "opponent",
  zone: "characterArea",
  min: 1,
  max: 1,
  allowFewerIfUnavailable: false,
  visibility: "public",
  ...overrides,
});

const queuedTargetEffect = (): EffectQueueEntry => ({
  id: toQueueEntryId("queue-entry-select-targets"),
  state: "pending",
  timingWindowId: toTimingWindowId("timing-window-select-targets"),
  generation: 1,
  controllerId: p1,
  source: {
    instanceId: toInstanceId("select-targets-source"),
    cardId: toCardId("select-targets-source-card"),
    playerId: p1,
    zone: { zone: "leaderArea", playerId: p1, slot: "leader", index: 0 },
  },
  sourceSnapshot: {
    instanceId: toInstanceId("select-targets-source"),
    cardId: toCardId("select-targets-source-card"),
    ownerId: p1,
    controllerId: p1,
    zone: { zone: "leaderArea", playerId: p1, slot: "leader", index: 0 },
    category: "leader",
    colors: ["red"],
    keywords: [],
  },
  effectBlockId: toEffectId("effect-select-targets"),
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 1,
  queuedAtStateSeq: toStateSeq(1),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "selectTargets:test" },
});

const setupSelectTargetsDecision = (
  request: TargetRequest = publicCharacterTargetRequest(),
  cardIds: readonly CardId[] = [toCardId("target-a"), toCardId("target-b")],
): { state: GameState; targets: CardRef[]; queueEntry: EffectQueueEntry } => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2 state");
  state.cardManifest.cards[toCardId("select-targets-source-card")] =
    resolvedCard({
      cardId: toCardId("select-targets-source-card"),
      category: "leader",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-select-targets",
        rulesVersion: "select-targets-rules",
        sourceTextHash: "select-targets-source",
      },
    });
  const support = must(
    state.cardManifest.cards[toCardId("select-targets-source-card")]?.support,
    "source support",
  );
  const baseDefinition = reviewedOnPlayDrawDefinition(
    toCardId("select-targets-source-card"),
    support,
  );
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-select-targets": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: toEffectId("effect-select-targets"),
          effect: { type: "ko", target: { type: "choose", request } },
        },
      ],
    },
  };
  const targets = cardIds.map((cardId, index) => {
    state.cardManifest.cards[cardId] = resolvedCard({
      cardId,
      category: "character",
      cost: index + 1,
      power: 3000 + index * 1000,
    });
    const source = must(p2State.hand[index], `p2 hand ${String(index)}`);
    return {
      ...source,
      cardId,
      owner: p2,
      controller: p2,
      zone: {
        zone: "characterArea" as const,
        playerId: p2,
        slot: "character" as const,
        index,
      },
      attachedDon: [],
      state: "active" as const,
    };
  });
  p2State.characters = targets;
  p2State.hand = p2State.hand.slice(cardIds.length).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));

  const queueEntry = queuedTargetEffect();
  state.effectQueue = [queueEntry];
  const candidateRefs = targets.map((target) => ({
    instanceId: target.instanceId,
    cardId: target.cardId,
    playerId: p2,
    zone: target.zone,
  }));
  state.pendingDecision = {
    id: toDecisionId("decision:selectTargets:queue-entry-select-targets"),
    type: "selectTargets",
    playerId: p1,
    prompt: "Select targets.",
    causedBy: {
      type: "effect",
      queueEntryId: queueEntry.id,
      effectId: queueEntry.effectBlockId,
    },
    visibility: { type: "public" },
    request,
    candidates: candidateRefs.map((card) => ({
      card,
      visibility: { type: "public" },
    })),
  };
  return { state, targets: candidateRefs, queueEntry };
};

const attachReviewedKoReplacementDefinition = (
  state: GameState,
  target: CardRef,
): EffectDefinition["effects"][number] => {
  const support = {
    cardId: target.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "replacement-rules",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "replacement-source-hash",
    behaviorHash: "replacement-behavior-hash",
    effectDefinitionId: `definition:${String(target.cardId)}:replacement`,
  };
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    support,
  });
  const effectBlock: EffectDefinition["effects"][number] = {
    id: toEffectId("replacement:would-be-ko-draw-1"),
    category: "replacement",
    trigger: {
      type: "replacement",
      replacement: { type: "wouldBeKOd", target: { type: "self" } },
    },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when: { type: "wouldBeKOd", target: { type: "self" } },
      instead: { type: "draw", count: 1, player: "self" },
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: target.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: support.sourceTextHash,
        rulesVersion: support.rulesVersion,
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-11T00:00:00.000Z",
      },
    },
  };
  return effectBlock;
};

const respondWithTargets = (
  decisionId: DecisionId,
  targets: readonly CardRef[],
): Extract<Action, { type: "respondToDecision" }> => ({
  type: "respondToDecision",
  decisionId,
  response: { type: "targets", targets: [...targets] },
});

const applyPlayCardTestAction = (
  state: GameState,
  action:
    | Extract<Action, { type: "playCard" }>
    | Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  if (action.type === "playCard") {
    return applyPlayCard(state, action);
  }
  const result = applyPlayCardDecisionResponse(state, action);
  assert.ok(result !== null, "expected play-card decision response");
  return result;
};

const payFirstTwoDon = (state: GameState): EngineResult => {
  const player = must(state.players[p1], "p1");
  return applyPlayCardTestAction(state, {
    type: "respondToDecision",
    decisionId: must(state.pendingDecision, "pay decision").id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [
        must(player.costArea[0], "don0").instanceId,
        must(player.costArea[1], "don1").instanceId,
      ],
    },
  });
};

const assertEventsAppendToJournal = (
  result: EngineResult,
  label: string,
): void => {
  const assertStrictlyIncreasing = (
    events: readonly EngineEvent[],
    eventLabel: string,
  ): void => {
    for (let index = 1; index < events.length; index += 1) {
      const previous = must(events[index - 1], `${eventLabel} previous event`);
      const current = must(events[index], `${eventLabel} current event`);
      assert.ok(
        current.seq > previous.seq,
        `${eventLabel} seq must increase at index ${String(index)}`,
      );
    }
  };

  assertStrictlyIncreasing(result.events, `${label} result events`);
  assertStrictlyIncreasing(result.state.eventJournal, `${label} journal`);
  assert.deepEqual(
    result.state.eventJournal
      .slice(result.state.eventJournal.length - result.events.length)
      .map((event) => event.id),
    result.events.map((event) => event.id),
    `${label} events must append to journal in order`,
  );
};

const eventReplaySnapshot = (
  result: EngineResult,
  expectedTypes: readonly string[],
  label: string,
) => {
  assert.deepEqual(
    result.events.map((event) => event.type),
    expectedTypes,
  );
  assertEventsAppendToJournal(result, label);
  return {
    eventSeq: result.events.map((event) => event.seq),
    eventTypes: result.events.map((event) => event.type),
    journalSeq: result.state.eventJournal.map((event) => event.seq),
  };
};

const invalidResponseCases: Array<{
  name: string;
  response: (targets: readonly CardRef[]) => DecisionResponse;
  reason: string;
}> = [
  {
    name: "wrong response type",
    response: (targets) => ({ type: "cards", cards: [must(targets[0], "t0")] }),
    reason: "Response type must be targets for selectTargets.",
  },
  {
    name: "malformed target element",
    response: () => ({
      type: "targets",
      targets: [null as unknown as CardRef],
    }),
    reason: "Response targets must be CardRef values.",
  },
  {
    name: "malformed target zone",
    response: (targets) => ({
      type: "targets",
      targets: [
        {
          ...must(targets[0], "t0"),
          zone: null,
        } as unknown as CardRef,
      ],
    }),
    reason: "Response targets must be CardRef values.",
  },
  {
    name: "duplicate target",
    response: (targets) => ({
      type: "targets",
      targets: [must(targets[0], "t0"), must(targets[0], "t0")],
    }),
    reason: "Selected targets must not contain duplicates.",
  },
  {
    name: "non-candidate target",
    response: (targets) => ({
      type: "targets",
      targets: [
        {
          ...must(targets[0], "t0"),
          instanceId: toInstanceId("forged-target"),
        },
      ],
    }),
    reason: "Selected targets must be active target candidates.",
  },
  {
    name: "too few targets",
    response: () => ({ type: "targets", targets: [] }),
    reason: "Selected target count is below the required minimum.",
  },
  {
    name: "too many targets",
    response: (targets) => ({
      type: "targets",
      targets: [must(targets[0], "t0"), must(targets[1], "t1")],
    }),
    reason: "Selected target count exceeds the allowed maximum.",
  },
];

test("getLegalActions exposes one executable selectTargets response only to the decision player", () => {
  const { state, targets } = setupSelectTargetsDecision();
  const decision = must(state.pendingDecision, "pending decision");

  assert.deepEqual(
    getLegalActions(state, p1).filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "targets", targets: [targets[0]] },
      },
    ],
  );
  assert.deepEqual(
    getLegalActions(state, p2).filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
});

test("getLegalActions exposes an empty selectTargets response when min is zero", () => {
  const { state } = setupSelectTargetsDecision(
    publicCharacterTargetRequest({ min: 0, max: 1 }),
  );
  const decision = must(state.pendingDecision, "pending decision");

  assert.deepEqual(
    getLegalActions(state, p1).filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "targets", targets: [] },
      },
    ],
  );
});

test("PlayerView hides zero-target selectTargets internals while exposing the response affordance", () => {
  const { state } = setupSelectTargetsDecision(
    publicCharacterTargetRequest({ min: 0, max: 1 }),
  );
  const decision = must(state.pendingDecision, "pending decision");
  const chooserView = filterStateForPlayer(state, p1);
  const opponentView = filterStateForPlayer(state, p2);

  assert.deepEqual(chooserView.pendingDecision, {
    id: decision.id,
    type: "selectTargets",
    playerId: p1,
    prompt: "Select targets.",
    causedBy: { type: "ruleProcess", name: "privateCausality" },
  });
  assert.deepEqual(
    chooserView.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [{ type: "respondToDecision", decisionId: decision.id }],
  );
  assert.equal(opponentView.pendingDecision, undefined);
  assert.deepEqual(
    opponentView.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  assert.equal(JSON.stringify(chooserView).includes("candidates"), false);
  assert.equal(JSON.stringify(chooserView).includes("request"), false);
  assert.equal(JSON.stringify(chooserView).includes("queueEntryId"), false);
});

test("valid selectTargets response resolves queued KO with stable replay event order and state hash", () => {
  const runScript = () => {
    const { state, targets, queueEntry } = setupSelectTargetsDecision();
    const decision = must(state.pendingDecision, "pending decision");
    const selected = must(targets[1], "target 1");

    const result = applyAction(
      state,
      respondWithTargets(decision.id, [selected]),
    );

    assert.equal(result.errors, undefined);
    assert.equal(result.state.pendingDecision, undefined);
    assert.deepEqual(result.state.effectQueue, []);
    assertEventsAppendToJournal(result, "selectTargets KO");
    assert.deepEqual(
      must(result.state.players[p2], "result p2").characters.map(
        (card) => card.instanceId,
      ),
      [must(targets[0], "target 0").instanceId],
    );
    assert.deepEqual(
      must(result.state.players[p2], "result p2").trash.map(
        (card) => card.instanceId,
      ),
      [selected.instanceId],
    );
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
      playerId: decision.playerId,
      responseType: "targets",
    });
    assert.deepEqual(result.events[3]?.payload, {
      queueEntryId: queueEntry.id,
      timingWindowId: queueEntry.timingWindowId,
      generation: queueEntry.generation,
      effectBlockId: queueEntry.effectBlockId,
      sourcePresencePolicy: queueEntry.sourcePresencePolicy,
      orderingGroup: queueEntry.orderingGroup,
      status: "resolved",
    });
    assert.equal(result.state.actionSeq, state.actionSeq + 1);
    assert.equal(result.stateHash, hashCanonicalStateValue(result.state));

    return {
      eventTypes: result.events.map((event) => event.type),
      eventSeq: result.events.map((event) => event.seq),
      journalSeq: result.state.eventJournal.map((event) => event.seq),
      stateHash: result.stateHash,
    };
  };

  const first = runScript();
  const second = runScript();
  assert.deepEqual(first.eventTypes, second.eventTypes);
  assert.deepEqual(first.eventSeq, second.eventSeq);
  assert.deepEqual(first.journalSeq, second.journalSeq);
  assert.equal(first.stateHash, second.stateHash);
});

test("paid reviewed target KO Main Event keeps repeated replay order and hash stable through target resolution", () => {
  const paidTypes = [
    "costPaid",
    "decisionResolved",
    "cardMoved",
    "cardTrashed",
    "cardPlayed",
    "ruleProcessingChecked",
    "effectQueued",
    "decisionCreated",
  ];
  const resolvedTypes = [
    "decisionResolved",
    "cardKOd",
    "cardMoved",
    "effectResolved",
    "ruleProcessingChecked",
  ];
  const runScript = () => {
    const state = setupMainPlayState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    const eventCard = must(p1State.hand[0], "event");
    const targetSource = must(p2State.hand.shift(), "target source");
    const target: CardInstance = {
      ...targetSource,
      zone: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 0,
      },
      attachedDon: [],
    };
    p2State.characters = [target];
    p2State.hand = p2State.hand.map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p2, slot: "hand", index },
    }));
    state.cardManifest.cards[target.cardId] = resolvedCard({
      cardId: target.cardId,
      category: "character",
    });
    const implemented = resolvedCard({
      cardId: eventCard.cardId,
      category: "event",
      cost: 2,
      effectText: "[Main] K.O. up to 1 of your opponent's Characters.",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-main-event-ko",
      },
    });
    const definition = reviewedMainEventDrawDefinition(
      implemented.cardId,
      implemented.support,
    );
    state.cardManifest.cards[eventCard.cardId] = implemented;
    state.cardManifest.effectDefinitionsVersion = "0.1.0";
    state.cardManifest.effectDefinitions = {
      "def-main-event-ko": {
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "main effect"),
            id: "OP01-040:event-main-ko-1" as (typeof definition.effects)[number]["id"],
            oncePerTurn: true,
            effect: {
              type: "ko",
              target: {
                type: "choose",
                request: publicCharacterTargetRequest({
                  allowFewerIfUnavailable: true,
                  min: 0,
                }),
              },
            },
          },
        ],
      },
    };
    const opened = applyPlayCardTestAction(state, {
      type: "playCard",
      cardInstanceId: eventCard.instanceId,
    });
    assert.equal(opened.errors, undefined);
    assert.equal(opened.state.pendingDecision?.type, "payCost");

    const paid = payFirstTwoDon(opened.state);
    assert.equal(paid.errors, undefined);
    assert.equal(paid.state.pendingDecision?.type, "selectTargets");
    const targetDecision = must(paid.state.pendingDecision, "target decision");
    assert.equal(targetDecision.type, "selectTargets");
    const publicCandidate = must(
      targetDecision.candidates[0],
      "public target candidate",
    );
    assert.equal(publicCandidate.card.instanceId, target.instanceId);

    const resolved = applyAction(paid.state, {
      type: "respondToDecision",
      decisionId: targetDecision.id,
      response: { type: "targets", targets: [publicCandidate.card] },
    });
    assert.equal(resolved.errors, undefined);
    assert.equal(resolved.state.pendingDecision, undefined);
    assert.deepEqual(
      must(resolved.state.players[p2], "resolved p2").characters,
      [],
    );
    assert.equal(
      must(must(resolved.state.players[p2], "resolved p2").trash[0], "ko trash")
        .instanceId,
      target.instanceId,
    );
    assert.deepEqual(resolved.state.oncePerTurn, [
      {
        cardInstanceId: eventCard.instanceId,
        effectId: "OP01-040:event-main-ko-1",
        turnNumber: state.turn.globalTurn,
        usedAtStateSeq: toStateSeq(paid.state.seq + 1),
      },
    ]);

    const repeatState = {
      ...paid.state,
      oncePerTurn: [
        {
          cardInstanceId: eventCard.instanceId,
          effectId: "OP01-040:event-main-ko-1",
          turnNumber: state.turn.globalTurn,
          usedAtStateSeq: toStateSeq(paid.state.seq),
        },
      ],
    };
    const repeat = applyAction(repeatState, {
      type: "respondToDecision",
      decisionId: targetDecision.id,
      response: { type: "targets", targets: [publicCandidate.card] },
    });
    assert.deepEqual(repeat.events, []);
    assert.ok(repeat.errors !== undefined);
    assert.deepEqual(repeat.state, repeatState);
    assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
    return {
      paid: eventReplaySnapshot(paid, paidTypes, "paid Main Event target KO"),
      resolved: eventReplaySnapshot(
        resolved,
        resolvedTypes,
        "resolved Main Event target KO",
      ),
      stateHash: resolved.stateHash,
    };
  };

  const first = runScript();
  const second = runScript();
  assert.deepEqual(first.paid, second.paid);
  assert.deepEqual(first.resolved, second.resolved);
  assert.equal(first.stateHash, second.stateHash);
});

test.each(invalidResponseCases)(
  "invalid selectTargets $name leaves once-per-turn unchanged",
  ({ response }) => {
    const { state, targets } = setupSelectTargetsDecision();
    state.oncePerTurn = [
      {
        cardInstanceId: toInstanceId("existing-card"),
        effectId: toEffectId("existing-effect"),
        turnNumber: state.turn.globalTurn,
        usedAtStateSeq: state.seq,
      },
    ];
    const decision = must(state.pendingDecision, "pending decision");
    const before = structuredClone(state.oncePerTurn);

    const result = applyAction(state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: response(targets),
    });

    assert.ok(result.errors !== undefined);
    assert.deepEqual(result.state.oncePerTurn, before);
  },
);

test.each(invalidResponseCases)(
  "rejects selectTargets $name without mutating state",
  ({ response, reason }) => {
    const { state, targets } = setupSelectTargetsDecision();
    const decision = must(state.pendingDecision, "pending decision");
    const before = structuredClone(state);
    const beforeHash = hashCanonicalStateValue(state);

    const result = applyAction(state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: response(targets),
    });

    assert.deepEqual(result.errors, [
      { type: "invalidDecisionResponse", reason } satisfies EngineError,
    ]);
    assert.deepEqual(result.events, []);
    assert.deepEqual(result.state, before);
    assert.equal(result.stateHash, beforeHash);
    assert.deepEqual(state, before);
  },
);

test("rejects selectTargets response when a candidate is no longer legal in current state", () => {
  const { state, targets } = setupSelectTargetsDecision(
    publicCharacterTargetRequest({
      filter: { categories: ["character"], power: { min: 4000 } },
    }),
  );
  const decision = must(state.pendingDecision, "pending decision");
  const p2State = must(state.players[p2], "p2 state");
  p2State.characters = p2State.characters.map((character) =>
    character.instanceId === targets[1]?.instanceId
      ? { ...character, cardId: toCardId("target-b-event") }
      : character,
  );
  state.cardManifest.cards[toCardId("target-b-event")] = resolvedCard({
    cardId: toCardId("target-b-event"),
    category: "event",
    power: 5000,
  });
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = applyAction(
    state,
    respondWithTargets(decision.id, [must(targets[1], "target 1")]),
  );

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Selected targets must be current legal targets.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
});

test("rejects selectTargets response when the queued effect entry is no longer present", () => {
  const { state, targets } = setupSelectTargetsDecision();
  const decision = must(state.pendingDecision, "pending decision");
  state.effectQueue = [];
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = applyAction(
    state,
    respondWithTargets(decision.id, [must(targets[0], "target 0")]),
  );

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Selected targets must be current legal targets.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
  assert.deepEqual(
    getLegalActions(state, p1).filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
});

test("rejects selectTargets response for unsupported queued target effect without mutating state", () => {
  const { state, targets } = setupSelectTargetsDecision();
  const decision = must(state.pendingDecision, "pending decision");
  const definition = must(
    state.cardManifest.effectDefinitions?.["def-select-targets"],
    "definition",
  );
  state.cardManifest.effectDefinitions = {
    "def-select-targets": {
      ...definition,
      effects: [
        {
          ...must(definition.effects[0], "effect"),
          effect: { type: "draw", count: 1, player: "self" },
        },
      ],
    },
  };
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  assert.deepEqual(
    getLegalActions(state, p1).filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );

  const result = applyAction(
    state,
    respondWithTargets(decision.id, [must(targets[0], "target 0")]),
  );

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
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
});

test.each([
  {
    name: "private candidate visibility",
    request: publicCharacterTargetRequest({ visibility: "privateToChooser" }),
  },
  {
    name: "ambiguous candidate visibility",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zone: "characterArea",
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
    } satisfies TargetRequest,
  },
])("fails closed for $name in selectTargets legal actions", ({ request }) => {
  const { state, targets } = setupSelectTargetsDecision(request);
  const decision = must(state.pendingDecision, "pending decision");
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  assert.deepEqual(
    getLegalActions(state, p1).filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  assert.deepEqual(
    getLegalActions(state, p2).filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );

  const result = applyAction(
    state,
    respondWithTargets(decision.id, [must(targets[0], "target 0")]),
  );

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Selected targets must be current legal targets.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
});

test("fails closed for unsupported non-effect selectTargets causality", () => {
  const { state, targets } = setupSelectTargetsDecision();
  const decision = must(state.pendingDecision, "pending decision");
  state.pendingDecision = {
    ...decision,
    causedBy: { type: "ruleProcess", name: "unsupported-selectTargets-test" },
  };
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  assert.deepEqual(
    getLegalActions(state, p1).filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );

  const result = applyAction(
    state,
    respondWithTargets(decision.id, [must(targets[0], "target 0")]),
  );

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Selected targets must be current legal targets.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
});

test("allowFewerIfUnavailable permits fewer than min only when current candidates are below min", () => {
  const request = publicCharacterTargetRequest({
    min: 2,
    max: 2,
    allowFewerIfUnavailable: true,
  });
  const unavailable = setupSelectTargetsDecision(request, [
    toCardId("target-a"),
  ]);
  const unavailableDecision = must(
    unavailable.state.pendingDecision,
    "unavailable decision",
  );
  const accepted = applyAction(
    unavailable.state,
    respondWithTargets(unavailableDecision.id, [
      must(unavailable.targets[0], "unavailable target"),
    ]),
  );

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.deepEqual(accepted.state.effectQueue, []);

  const available = setupSelectTargetsDecision(request, [
    toCardId("target-a"),
    toCardId("target-b"),
  ]);
  const availableDecision = must(
    available.state.pendingDecision,
    "available decision",
  );
  const rejected = applyAction(
    available.state,
    respondWithTargets(availableDecision.id, [
      must(available.targets[0], "available target"),
    ]),
  );

  assert.deepEqual(rejected.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Selected target count is below the required minimum.",
    },
  ]);
});

test("selected-target continuation pauses for chooseReplacement without resolving the source effect", () => {
  const { state, targets } = setupSelectTargetsDecision();
  const decision = must(state.pendingDecision, "target decision");
  const target = must(targets[0], "target");
  const effectBlock = attachReviewedKoReplacementDefinition(state, target);

  const result = applyAction(state, respondWithTargets(decision.id, [target]));

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["decisionResolved", "decisionCreated"],
  );
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    false,
  );
  assert.equal(result.state.pendingDecision?.type, "chooseReplacement");
  assert.equal(result.state.pendingDecision.playerId, p2);
  assert.deepEqual(result.state.pendingDecision.replacementIds, [
    String(effectBlock.id),
  ]);
  assert.equal(
    result.state.eventJournal.some((event) => event.type === "effectResolved"),
    false,
  );
});
