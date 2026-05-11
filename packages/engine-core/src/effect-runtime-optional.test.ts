import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, GameState } from "@optcg/types";

import { getLegalActions } from "./actions.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
import {
  addExtraDeckCard,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";
import {
  queueingState,
  setupOnPlayDefinition,
} from "./effect-runtime-trigger-queueing-test-support.js";

const setupOptionalOnPlayDefinition = (
  state: GameState,
  played: ReturnType<typeof queueingState>["played"],
  mutate?: (definition: EffectDefinition) => EffectDefinition,
): EffectDefinition => {
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const base = reviewedOnPlayDrawDefinition(played.cardId, supportCard.support);
  const optional: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "onPlay effect"),
        optional: true,
      },
    ],
  };
  const definition = mutate === undefined ? optional : mutate(optional);
  setupOnPlayDefinition(state, played, definition, "def-optional-on-play");
  return definition;
};

test("supported optional On Play draw creates one private choosing-player decision without drawing or queueing", () => {
  const { state, played } = queueingState();
  const p1State = must(state.players[p1], "p1");
  const beforeDeckLength = p1State.deck.length;
  const beforeHandLength = p1State.hand.length;
  setupOptionalOnPlayDefinition(state, played);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.type, "decisionCreated");
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["decisionCreated"],
  );
  const decision = result.state.pendingDecision;
  assert.ok(decision);
  assert.equal(decision.type, "chooseOptionalActivation");
  assert.equal(decision.playerId, p1);
  assert.equal(decision.effectId, "OP01-015:auto-on-play-1");
  assert.deepEqual(decision.options, ["activate", "decline"]);
  assert.deepEqual(decision.visibility, { type: "private", playerId: p1 });
  assert.equal(decision.source.instanceId, played.instanceId);
  assert.equal(decision.source.cardId, played.cardId);
  const resultP1 = must(result.state.players[p1], "result p1");
  assert.equal(resultP1.deck.length, beforeDeckLength);
  assert.equal(resultP1.hand.length, beforeHandLength);
});

test("optional activation decision events and state hash are deterministic", () => {
  const run = () => {
    const { state, played } = queueingState();
    setupOptionalOnPlayDefinition(state, played);
    return processEffectRuntime(state);
  };

  const first = run();
  const second = run();

  assert.equal(first.errors, undefined);
  assert.deepEqual(first.events, second.events);
  assert.equal(first.stateHash, second.stateHash);
  assert.equal(first.stateHash, hashCanonicalStateValue(first.state));
  assert.deepEqual(
    first.events.map((event) => event.type),
    ["decisionCreated"],
  );
  const createdEvent = must(first.events[0], "decisionCreated event");
  const journalEvent = must(first.state.eventJournal.at(-1), "journal event");
  assert.equal(createdEvent.createdAtStateSeq, first.state.seq);
  assert.equal(createdEvent.seq, journalEvent.seq);
});

test("wrong-player legal actions and PlayerView hide private optional decision details", () => {
  const { state, played } = queueingState();
  setupOptionalOnPlayDefinition(state, played);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  const decision = must(result.state.pendingDecision, "optional decision");
  const opponentActions = getLegalActions(result.state, p2).filter(
    (action) => action.type === "respondToDecision",
  );
  const choosingActions = getLegalActions(result.state, p1);
  assert.deepEqual(
    choosingActions.filter((action) => action.type === "respondToDecision"),
    [],
  );
  assert.deepEqual(opponentActions, []);

  const choosingView = filterStateForPlayer(result.state, p1);
  const opponentView = filterStateForPlayer(result.state, p2);
  assert.deepEqual(choosingView.pendingDecision, {
    id: decision.id,
    type: "chooseOptionalActivation",
    playerId: p1,
    prompt: "Choose whether to activate this optional effect.",
    causedBy: { type: "ruleProcess", name: "effectRuntime:onPlayOptional" },
  });
  assert.equal(opponentView.pendingDecision, undefined);
  assert.deepEqual(
    choosingView.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  assert.deepEqual(
    opponentView.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  const opponentSerialized = JSON.stringify(opponentView);
  assert.equal(opponentSerialized.includes(String(decision.id)), false);
  assert.equal(opponentSerialized.includes("chooseOptionalActivation"), false);
  assert.equal(opponentSerialized.includes("OP01-015:auto-on-play-1"), false);
});

test("unsupported optional On Play shapes fail closed without mutation", () => {
  const cases: Array<{
    name: string;
    mutate: (definition: EffectDefinition) => EffectDefinition;
  }> = [
    {
      name: "wrong draw count",
      mutate: (definition) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            effect: { type: "draw", count: 2, player: "self" },
          },
        ],
      }),
    },
    {
      name: "wrong player",
      mutate: (definition) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            effect: { type: "draw", count: 1, player: "opponent" },
          },
        ],
      }),
    },
    {
      name: "once per turn",
      mutate: (definition) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            oncePerTurn: true,
          },
        ],
      }),
    },
    {
      name: "costed",
      mutate: (definition) => ({
        ...definition,
        effects: [
          {
            ...must(definition.effects[0], "effect"),
            cost: { type: "custom", action: "unsupported-cost" },
          },
        ],
      }),
    },
  ];

  for (const testCase of cases) {
    const { state, played } = queueingState();
    setupOptionalOnPlayDefinition(state, played, testCase.mutate);
    const before = JSON.stringify(state);

    const result = processEffectRuntime(state);

    assert.deepEqual(
      result.errors,
      [
        {
          type: "effectRuntimeError",
          effectId: "on-play-trigger-queueing",
          details: { reason: "unsupported-on-play-definition" },
        },
      ],
      testCase.name,
    );
    assert.deepEqual(result.events, [], testCase.name);
    assert.equal(JSON.stringify(state), before, testCase.name);
    assert.equal(JSON.stringify(result.state), before, testCase.name);
  }
});

test("non-optional no-choice On Play draw behavior remains unchanged", () => {
  const { state, played } = queueingState();
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const topDeck = must(p1State.deck[0], "top deck");
  const beforeDeckLength = p1State.deck.length;
  const beforeHandLength = p1State.hand.length;
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-required-on-play",
  );

  const queued = processEffectRuntime(state);
  const resolved = processEffectRuntime(queued.state);

  assert.equal(queued.errors, undefined);
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(resolved.state.effectQueue, []);
  assert.deepEqual(
    [...queued.events, ...resolved.events].map((event) => event.type),
    [
      "effectQueued",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  const resultP1 = must(resolved.state.players[p1], "result p1");
  assert.equal(resultP1.deck.length, beforeDeckLength - 1);
  assert.equal(resultP1.hand.length, beforeHandLength + 1);
  assert.equal(
    must(resultP1.hand[resultP1.hand.length - 1], "drawn").instanceId,
    topDeck.instanceId,
  );
});
