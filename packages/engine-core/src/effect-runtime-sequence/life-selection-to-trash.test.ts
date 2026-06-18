import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId, Effect, SelectionId } from "@optcg/types";

import {
  applyAction,
  must,
  p1,
  p2,
  processEffectRuntime,
} from "../effect-runtime-queue/test-support.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";
import { sequenceQueueState } from "./search-reveal-test-support.js";

const opponentLifeTrashSequence = (): Extract<Effect, { type: "sequence" }> => {
  const selection = "lifeSelection:opponent-life-to-trash" as SelectionId;
  return {
    type: "sequence",
    effects: [
      {
        connector: "always",
        saveResultAs: selection,
        effect: {
          type: "selectCards",
          zone: "life",
          player: "opponent",
          chooser: "self",
          min: 0,
          max: 1,
          saveAs: selection,
          visibility: "chooserOnly",
        },
      },
      {
        connector: "ifPossible",
        effect: {
          type: "moveSelected",
          selection,
          from: "life",
          to: "trash",
        },
      },
    ],
  };
};

test("sequence can select a hidden opponent Life card and trash it without leaking identity first", () => {
  const { state } = sequenceQueueState(opponentLifeTrashSequence(), 0);
  const opponent = must(state.players[p2], "p2");
  const selectedLife = must(opponent.life[1], "selected opponent life").card;
  selectedLife.cardId = "hidden-opponent-life-card" as CardId;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "Life selection");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p1);
  assert.equal(decision.request.zone, "life");
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    opponent.life.map((lifeCard) => lifeCard.card.instanceId),
  );

  const p1View = filterStateForPlayer(paused.state, p1);
  const serializedP1View = JSON.stringify(p1View.pendingDecision);
  assert.equal(serializedP1View.includes(String(selectedLife.cardId)), false);
  assert.equal(
    serializedP1View.includes(String(selectedLife.instanceId)),
    true,
  );

  const publicCandidate = must(
    p1View.pendingDecision?.type === "selectCards"
      ? p1View.pendingDecision.candidates[1]?.card
      : undefined,
    "public hidden Life candidate",
  );
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [publicCandidate] },
  });
  const resolvedOpponent = must(resolved.state.players[p2], "resolved p2");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(resolvedOpponent.trash[0]?.instanceId, selectedLife.instanceId);
  assert.equal(
    resolvedOpponent.life.some(
      (lifeCard) => lifeCard.card.instanceId === selectedLife.instanceId,
    ),
    false,
  );
  assert.equal(
    resolved.events.some(
      (event) =>
        event.type === "cardTrashed" &&
        JSON.stringify(event.payload).includes(String(selectedLife.cardId)),
    ),
    true,
  );
});
