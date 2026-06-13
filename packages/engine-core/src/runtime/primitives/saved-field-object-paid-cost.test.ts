import assert from "node:assert/strict";
import { test } from "vitest";

import type { SequenceSavedResultReference } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import { resolveSavedFieldObjectKoSelection } from "./target-ko.js";

test("saved field-object resolution can consume field cards selected by a paid cost", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const target = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 5000,
  });

  const savedReferences: Record<string, SequenceSavedResultReference> = {
    paidCost: {
      kind: "paidCost",
      paidCost: true,
      selectedCards: [
        {
          instanceId: target.instanceId,
          cardId: target.cardId,
          playerId: p1,
          zone: target.zone,
        },
      ],
    },
  };

  const resolved = resolveSavedFieldObjectKoSelection({
    controllerId: p1,
    savedReferences,
    state,
    target: {
      type: "savedFieldObject",
      binding: { family: "paidCost", saveResultAs: "paidCost" },
      zones: ["leaderArea", "characterArea"],
      player: "self",
      visibility: "publicOnly",
      onFailure: "failClosed",
    },
  });

  assert.deepEqual(resolved, {
    ok: true,
    selectedTargets: [
      {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p1,
        zone: target.zone,
      },
    ],
  });
});
