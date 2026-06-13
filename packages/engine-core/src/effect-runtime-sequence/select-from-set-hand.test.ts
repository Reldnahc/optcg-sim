import assert from "node:assert/strict";
import { test } from "vitest";
import type { SelectionId, SelectionSetId } from "@optcg/types";

import { toCardRef } from "../actions/state.js";
import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
} from "../effect-runtime-queue/test-support.js";
import { createSelectFromSetDecision } from "./selected-segments.js";

test("selectFromSet decision resolves candidates from a saved hand selection", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const matching = must(p1State.hand[0], "matching hand card");
  const excluded = must(p1State.hand[1], "excluded hand card");
  state.cardManifest.cards[matching.cardId] = resolvedCard({
    cardId: matching.cardId,
    category: "character",
    cost: 4,
  });
  state.cardManifest.cards[excluded.cardId] = resolvedCard({
    cardId: excluded.cardId,
    category: "character",
    cost: 6,
  });
  const revealed = "handSelection:revealed-hand-cards" as SelectionId;
  const revealedSet = "handSelection:revealed-hand-cards" as SelectionSetId;
  const chosen = "handSelection:chosen-revealed-hand-card" as SelectionId;

  const result = createSelectFromSetDecision({
    effect: {
      type: "selectFromSet",
      set: revealedSet,
      chooser: "self",
      min: 0,
      max: 1,
      filter: { cost: { max: 4 } },
      saveAs: chosen,
    },
    entry: queueDrawForP1(),
    index: 1,
    ledgers: {
      savedReferences: {
        [revealed]: {
          kind: "selectedCards",
          cards: [toCardRef(matching, p1), toCardRef(excluded, p1)],
        },
      },
      segmentResults: {},
    },
    state,
  });

  assert.equal(result.ok, true);
  const decision = result.state.pendingDecision;
  assert.equal(decision?.type, "selectCards");
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    [matching.instanceId],
  );
});
