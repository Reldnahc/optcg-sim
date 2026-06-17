import assert from "node:assert/strict";

import { test } from "vitest";

import type { CardFilter } from "@optcg/types";

import {
  cardMatchesHandSelectionFilter,
  isSupportedHandSelectionCardFilter,
  toCardRef,
} from "./state.js";
import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";

test("hand-selection filters support separated anyOf type and attribute alternatives with shared suffix filters", () => {
  const filter: CardFilter = {
    anyOf: [{ typesAny: ["Muggy Kingdom"] }, { attributesAny: ["slash"] }],
    categories: ["character"],
    cost: { max: 4 },
    nameNot: ["Dracule Mihawk"],
  };
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const slashCharacter = must(player.hand[0], "slash character");
  const muggyCharacter = must(player.hand[1], "muggy character");
  const excludedCharacter = must(player.hand[2], "excluded character");
  const overCostCharacter = must(player.hand[3], "over-cost character");

  state.cardManifest.cards[slashCharacter.cardId] = {
    ...resolvedCard({
      cardId: slashCharacter.cardId,
      category: "character",
      cost: 4,
    }),
    attributes: ["slash"],
  };
  state.cardManifest.cards[muggyCharacter.cardId] = {
    ...resolvedCard({
      cardId: muggyCharacter.cardId,
      category: "character",
      cost: 4,
    }),
    types: ["Muggy Kingdom"],
  };
  state.cardManifest.cards[excludedCharacter.cardId] = {
    ...resolvedCard({
      cardId: excludedCharacter.cardId,
      category: "character",
      cost: 4,
    }),
    attributes: ["slash"],
    name: "Dracule Mihawk",
  };
  state.cardManifest.cards[overCostCharacter.cardId] = {
    ...resolvedCard({
      cardId: overCostCharacter.cardId,
      category: "character",
      cost: 5,
    }),
    types: ["Muggy Kingdom"],
  };

  assert.equal(isSupportedHandSelectionCardFilter(filter), true);
  assert.equal(
    cardMatchesHandSelectionFilter(state, p1, slashCharacter, filter),
    true,
  );
  assert.equal(
    cardMatchesHandSelectionFilter(state, p1, muggyCharacter, filter),
    true,
  );
  assert.equal(
    cardMatchesHandSelectionFilter(state, p1, excludedCharacter, filter),
    false,
  );
  assert.equal(
    cardMatchesHandSelectionFilter(state, p1, overCostCharacter, filter),
    false,
  );
});

test("hand-selection filters do not treat type-or-attribute alternatives as a card-id shortcut", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const unrelated = {
    ...must(player.hand[0], "unrelated"),
    cardId: toCardId("unrelated-character"),
  };

  state.cardManifest.cards[unrelated.cardId] = resolvedCard({
    cardId: unrelated.cardId,
    category: "character",
    cost: 4,
  });

  assert.equal(
    cardMatchesHandSelectionFilter(state, p1, unrelated, {
      anyOf: [{ typesAny: ["Muggy Kingdom"] }, { attributesAny: ["slash"] }],
      categories: ["character"],
      cost: { max: 4 },
    }),
    false,
  );
});

test("hand-selection filters can compare color against a saved returned field object", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const returnedSource = must(player.hand[0], "returned character source");
  const returned = {
    ...returnedSource,
    zone: {
      zone: "characterArea" as const,
      playerId: p1,
      slot: "character" as const,
      index: 0,
    },
  };
  player.characters = [returned];
  player.hand = player.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { ...card.zone, index },
  }));
  const sameColor = must(player.hand[0], "same color");
  const differentColor = must(player.hand[1], "different color");
  state.cardManifest.cards[returned.cardId] = {
    ...resolvedCard({ cardId: returned.cardId, category: "character" }),
    colors: ["red"],
  };
  state.cardManifest.cards[sameColor.cardId] = {
    ...resolvedCard({ cardId: sameColor.cardId, category: "character" }),
    colors: ["red"],
  };
  state.cardManifest.cards[differentColor.cardId] = {
    ...resolvedCard({ cardId: differentColor.cardId, category: "character" }),
    colors: ["green"],
  };
  const filter: CardFilter = {
    categories: ["character"],
    colorRelation: {
      type: "differentFromSavedFieldObject",
      binding: {
        family: "selectedTargets",
        saveResultAs: "selected:return-to-owner-hand",
      },
    },
  };
  const savedReferences = {
    "selected:return-to-owner-hand": {
      kind: "selectedTargets" as const,
      targets: [
        {
          binding: {
            family: "selectedTargets" as const,
            saveResultAs: "selected:return-to-owner-hand",
          },
          capturedAtStateSeq: state.seq,
          object: {
            cardId: returned.cardId,
            instanceId: returned.instanceId,
            playerId: p1,
            zone: returned.zone,
          },
          visibility: "public" as const,
        },
      ],
    },
  };

  assert.equal(isSupportedHandSelectionCardFilter(filter), true);
  assert.equal(
    cardMatchesHandSelectionFilter(
      state,
      p1,
      sameColor,
      filter,
      savedReferences,
    ),
    false,
  );
  assert.equal(
    cardMatchesHandSelectionFilter(
      state,
      p1,
      differentColor,
      filter,
      savedReferences,
    ),
    true,
  );
});

test("hand-selection filters can match card name against saved paid-cost cards", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const paidCard = must(player.hand[0], "paid cost card");
  const sameName = must(player.hand[1], "same name candidate");
  const differentName = must(player.hand[2], "different name candidate");
  state.cardManifest.cards[paidCard.cardId] = {
    ...resolvedCard({ cardId: paidCard.cardId, category: "character" }),
    name: "Sanji",
  };
  state.cardManifest.cards[sameName.cardId] = {
    ...resolvedCard({ cardId: sameName.cardId, category: "character" }),
    name: "Sanji",
  };
  state.cardManifest.cards[differentName.cardId] = {
    ...resolvedCard({ cardId: differentName.cardId, category: "character" }),
    name: "Nami",
  };
  const filter: CardFilter = {
    categories: ["character"],
    nameRelation: { type: "sameAsSavedCards", selection: "paidCost" },
  };
  const savedReferences = {
    paidCost: {
      kind: "paidCost" as const,
      paidCost: true,
      selectedCards: [toCardRef(paidCard, p1)],
    },
  };

  assert.equal(isSupportedHandSelectionCardFilter(filter), true);
  assert.equal(
    cardMatchesHandSelectionFilter(
      state,
      p1,
      sameName,
      filter,
      savedReferences,
    ),
    true,
  );
  assert.equal(
    cardMatchesHandSelectionFilter(
      state,
      p1,
      differentName,
      filter,
      savedReferences,
    ),
    false,
  );
});
