import assert from "node:assert/strict";

import { test } from "vitest";

import type { CardFilter } from "@optcg/types";

import {
  cardMatchesHandSelectionFilter,
  isSupportedHandSelectionCardFilter,
} from "./action-state.js";
import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";

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
