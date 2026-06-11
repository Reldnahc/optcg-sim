import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect, EffectDefinition, GameState } from "@optcg/types";

import {
  applyAction,
  createActiveState,
  getLegalActions,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
  p2,
} from "./effect-runtime-queue/test-support.js";

const choiceEffect = (
  options?: Extract<Effect, { type: "choice" }>["options"],
  chooser: Extract<Effect, { type: "choice" }>["chooser"] = "self",
): Effect => ({
  type: "choice",
  chooser,
  min: 1,
  max: 1,
  options: options ?? [
    {
      id: "draw-zero",
      label: "Draw 0 cards.",
      effect: { type: "draw", player: "self", count: 0 },
    },
    {
      id: "draw-one",
      label: "Draw 1 card.",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const setupChoiceState = (effect: Effect = choiceEffect()): GameState => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

  const effectDefinitionId = "def-choice";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "choice-rules",
      sourceTextHash: "choice-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-choice"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-choice"),
      timingWindowId: toTimingWindowId("window-choice"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "choice effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "choice-test" },
    },
  ];
  return state;
};

test("choice effect creates an effect option decision and resolves the selected option", () => {
  const state = setupChoiceState();
  const beforeHand = must(state.players[p1], "p1 before").hand.length;
  const beforeDeck = must(state.players[p1], "p1 before").deck.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "choice decision");

  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "chooseEffectOption");
  assert.equal(decision.playerId, p1);
  assert.deepEqual(
    decision.options.map((option) => option.id),
    ["draw-zero", "draw-one"],
  );
  assert.deepEqual(
    getLegalActions(paused.state, p1).filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "effectOption", optionId: "draw-zero" },
      },
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "effectOption", optionId: "draw-one" },
      },
    ],
  );

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "effectOption", optionId: "draw-one" },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  const afterP1 = must(resolved.state.players[p1], "p1 after");
  assert.equal(afterP1.hand.length, beforeHand + 1);
  assert.equal(afterP1.deck.length, beforeDeck - 1);
});

test("choice effect can give the option decision to the opponent", () => {
  const state = setupChoiceState(choiceEffect(undefined, "opponent"));

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "choice decision");

  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "chooseEffectOption");
  assert.equal(decision.playerId, p2);
  assert.deepEqual(
    getLegalActions(paused.state, p1).filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  assert.deepEqual(
    getLegalActions(paused.state, p2).filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "effectOption", optionId: "draw-zero" },
      },
      {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "effectOption", optionId: "draw-one" },
      },
    ],
  );
});

test("optional choice effect decline clears the decision and resumes later independent segments", () => {
  const state = setupChoiceState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "choice",
          chooser: "self",
          min: 0,
          max: 1,
          options: [
            {
              id: "draw-zero",
              label: "Draw 0 cards.",
              effect: { type: "draw", player: "self", count: 0 },
            },
            {
              id: "draw-two",
              label: "Draw 2 cards.",
              effect: { type: "draw", player: "self", count: 2 },
            },
          ],
        },
      },
      {
        connector: "always",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  });
  const beforeHand = must(state.players[p1], "p1 before").hand.length;
  const beforeDeck = must(state.players[p1], "p1 before").deck.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "choice decision");

  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "chooseEffectOption");
  assert.equal(decision.min, 0);
  assert.deepEqual(decision.defaultResponse, { type: "effectOptionDeclined" });

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "effectOptionDeclined" },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
    ],
  );
  assert.deepEqual(resolved.events[0]?.payload, {
    decisionId: decision.id,
    decisionType: "chooseEffectOption",
    playerId: p1,
    responseType: "effectOptionDeclined",
  });
  const afterP1 = must(resolved.state.players[p1], "p1 after");
  assert.equal(afterP1.hand.length, beforeHand + 1);
  assert.equal(afterP1.deck.length, beforeDeck - 1);
});

test("choice option can pause for its own nested decision and resume", () => {
  const state = setupChoiceState(
    choiceEffect([
      {
        id: "draw",
        label: "Draw 1 card.",
        effect: { type: "draw", player: "self", count: 1 },
      },
      {
        id: "draw-trash",
        label: "Draw 1 card and trash 1 card from your hand.",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", player: "self", count: 1 },
            },
            {
              connector: "then",
              effect: {
                type: "trashFromHand",
                player: "self",
                chooser: "self",
                count: 1,
              },
            },
          ],
        },
      },
    ]),
  );

  const paused = processEffectRuntime(state);
  const choiceDecision = must(paused.state.pendingDecision, "choice decision");
  const selectedOption = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: choiceDecision.id,
    response: { type: "effectOption", optionId: "draw-trash" },
  });
  const trashDecision = must(
    selectedOption.state.pendingDecision,
    "trash decision",
  );

  assert.equal(selectedOption.errors, undefined);
  assert.equal(trashDecision.type, "selectCards");
  assert.equal(trashDecision.candidates.length, 5);

  const firstCandidate = must(trashDecision.candidates[0], "trash candidate");
  const resolved = applyAction(selectedOption.state, {
    type: "respondToDecision",
    decisionId: trashDecision.id,
    response: { type: "cards", cards: [firstCandidate.card] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
});

test("choice option can pause for target selection and resume field movement", () => {
  const state = setupChoiceState(
    choiceEffect([
      {
        id: "draw",
        label: "Draw 1 card.",
        effect: { type: "draw", player: "self", count: 1 },
      },
      {
        id: "return",
        label:
          "Return up to 1 of your opponent's Characters to the owner's hand.",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "select:return",
              connector: "always",
              saveResultAs: "selected:return",
              effect: {
                type: "selectTargets",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "opponent",
                  zone: "characterArea",
                  min: 0,
                  max: 1,
                  allowFewerIfUnavailable: true,
                  visibility: "public",
                  filter: { categories: ["character"] },
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "bounce",
                destination: "hand",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: "selected:return",
                  },
                  zone: "characterArea",
                  player: "opponent",
                  visibility: "publicOnly",
                  onFailure: "failClosed",
                },
              },
            },
          ],
        },
      },
    ]),
  );
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
  });
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));

  const paused = processEffectRuntime(state);
  const choiceDecision = must(paused.state.pendingDecision, "choice decision");
  const selectedOption = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: choiceDecision.id,
    response: { type: "effectOption", optionId: "return" },
  });
  const targetDecision = must(
    selectedOption.state.pendingDecision,
    "target decision",
  );
  assert.equal(selectedOption.errors, undefined);
  assert.equal(targetDecision.type, "selectTargets");

  const resolved = applyAction(selectedOption.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: {
      type: "targets",
      targets: [
        {
          instanceId: target.instanceId,
          cardId: target.cardId,
          playerId: p2,
          zone: target.zone,
        },
      ],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(
    must(resolved.state.players[p2], "p2 after").hand.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );
});
