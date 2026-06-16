import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardRef,
  Effect,
  EffectTextSpanId,
  SelectionId,
  SelectionSetId,
} from "@optcg/types";

import {
  applyAction,
  getLegalActions,
  must,
  p1,
  processEffectRuntime,
} from "../effect-runtime-queue/test-support.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";
import {
  markTopDeckAsSearchCandidates,
  respondWithCards,
  respondWithOrderedIds,
  sequenceQueueState,
} from "./search-reveal-test-support.js";

const revealThenSelectFromSetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => {
  const lookedSet = "set:bot-search-candidates" as SelectionSetId;
  const selection = "revealSelection:bot-search" as SelectionId;
  return {
    type: "sequence",
    effects: [
      {
        id: "reveal-search-cards",
        connector: "always",
        effect: {
          type: "revealTop",
          player: "self",
          zone: "deck",
          count: 3,
          saveAs: lookedSet,
          visibility: "chooserOnly",
        },
      },
      {
        id: "choose-search-card",
        connector: "then",
        effect: {
          type: "selectFromSet",
          set: lookedSet,
          chooser: "self",
          min: 0,
          max: 1,
          filter: {},
          saveAs: selection,
        },
      },
      {
        id: "add-search-card",
        connector: "ifPreviousSucceeded",
        effect: {
          type: "moveSelected",
          selection,
          from: lookedSet,
          to: "hand",
        },
      },
    ],
  };
};

const revealSelectMoveThenOrderRemainderSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => {
  const lookedSet = "set:spotlight-search-candidates" as SelectionSetId;
  const selection = "revealSelection:spotlight-search" as SelectionId;
  return {
    type: "sequence",
    effects: [
      {
        id: "reveal-search-cards",
        connector: "always",
        effect: {
          type: "revealTop",
          player: "self",
          zone: "deck",
          count: 3,
          saveAs: lookedSet,
          visibility: "chooserOnly",
        },
        presentation: {
          textKind: "effect",
          spanIds: ["span:search:selection"] as EffectTextSpanId[],
        },
      },
      {
        id: "choose-search-card",
        connector: "then",
        effect: {
          type: "selectFromSet",
          set: lookedSet,
          chooser: "self",
          min: 0,
          max: 1,
          filter: {},
          saveAs: selection,
        },
        presentation: {
          textKind: "effect",
          spanIds: ["span:search:selection"] as EffectTextSpanId[],
        },
      },
      {
        id: "add-search-card",
        connector: "ifPreviousSucceeded",
        effect: {
          type: "moveSelected",
          selection,
          from: lookedSet,
          to: "hand",
        },
        presentation: {
          textKind: "effect",
          spanIds: ["span:search:selection"] as EffectTextSpanId[],
        },
      },
      {
        id: "order-search-remainder",
        connector: "then",
        effect: {
          type: "placeSetRemainder",
          set: lookedSet,
          owner: "self",
          destination: "deck",
          position: "bottom",
          order: "chooser",
        },
        presentation: {
          textKind: "effect",
          spanIds: ["span:search:remaining"] as EffectTextSpanId[],
        },
      },
    ],
  };
};

const setSearchSpotlightPresentation = (state: {
  effectQueue: Array<{ source: CardRef; presentation?: unknown }>;
}): void => {
  const entry = must(state.effectQueue[0], "queued search entry");
  entry.presentation = {
    source: entry.source,
    textKind: "effect",
    activeSpanIds: [
      "span:search:selection",
      "span:search:remaining",
    ] as EffectTextSpanId[],
  };
};

const spotlightSpanTimeline = (
  state: Parameters<typeof filterStateForPlayer>[0],
) =>
  filterStateForPlayer(state, p1).effectSpotlightHistory?.entries.map(
    (entry) => ({
      activeSpanIds: entry.kind === "combat" ? [] : entry.active.activeSpanIds,
      status: entry.status,
    }),
  );

test("sequence select-card pauses expose a legal action for automated players", () => {
  const { state } = sequenceQueueState(revealThenSelectFromSetSequence(), 3);
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pending decision");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.request.set, "set:bot-search-candidates");

  const actions = getLegalActions(paused.state, p1).filter(
    (action) =>
      action.type === "respondToDecision" && action.decisionId === decision.id,
  );

  assert.equal(actions.length, 1);
  const action = must(actions[0], "sequence select action");
  assert.equal(action.type, "respondToDecision");
  assert.equal(action.response.type, "cards");
  assert.deepEqual(
    action.response.cards.map((card) => card.instanceId),
    decision.candidates
      .slice(0, decision.request.max)
      .map((candidate) => candidate.card.instanceId),
  );
  const resolved = applyAction(paused.state, action);
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
});

test("search spotlight history orders selection before remainder across real sequence pauses", () => {
  const { state } = sequenceQueueState(
    revealSelectMoveThenOrderRemainderSequence(),
    3,
  );
  markTopDeckAsSearchCandidates(state, 3);
  setSearchSpotlightPresentation(state);

  const selecting = processEffectRuntime(state);
  assert.equal(selecting.errors, undefined);
  assert.equal(selecting.state.pendingDecision?.type, "selectCards");
  assert.deepEqual(spotlightSpanTimeline(selecting.state), [
    { activeSpanIds: ["span:search:selection"], status: "pending" },
  ]);

  const ordering = respondWithCards(selecting.state);
  assert.equal(ordering.errors, undefined);
  assert.equal(ordering.state.pendingDecision?.type, "orderCards");
  assert.deepEqual(spotlightSpanTimeline(ordering.state), [
    { activeSpanIds: ["span:search:selection"], status: "resolved" },
    { activeSpanIds: ["span:search:remaining"], status: "pending" },
  ]);

  const resolved = respondWithOrderedIds(ordering.state);
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(spotlightSpanTimeline(resolved.state), [
    { activeSpanIds: ["span:search:selection"], status: "resolved" },
    { activeSpanIds: ["span:search:remaining"], status: "resolved" },
  ]);
});
