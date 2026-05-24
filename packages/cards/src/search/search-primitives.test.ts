import { describe, expect, it } from "vitest";

import {
  parseAddUpToAnyCardToHand,
  parseRevealUpToTypeCardToHand,
} from "./reveal-to-hand.js";
import { parseRestToBottomAnyOrder } from "./rest-bottom.js";
import { parseTopDeckLook } from "./top-of-deck.js";
import { parseTypeCardFilter } from "./type-card-filter.js";

describe("search reveal primitives", () => {
  it("parses top-of-deck look count independently from search body text", () => {
    expect(
      parseTopDeckLook({
        text: "Look at 5 cards from the top of your deck; reveal up to 1 card.",
      }),
    ).toEqual({
      count: 5,
      rest: "reveal up to 1 card.",
      evidence: ["look:topDeck", "zone:deck", "count:positiveInteger"],
    });
  });

  it("parses top-of-deck look count before add wording", () => {
    expect(
      parseTopDeckLook({
        text: "Look at 5 cards from the top of your deck and add up to 1 card to your hand.",
      }),
    ).toEqual({
      count: 5,
      rest: "add up to 1 card to your hand.",
      evidence: ["look:topDeck", "zone:deck", "count:positiveInteger"],
    });
  });

  it("parses typed-card filters independently from reveal wording", () => {
    expect(
      parseTypeCardFilter({
        text: "{Five Elders} type card and add it to your hand.",
      }),
    ).toEqual({
      filter: { typesAny: ["Five Elders"] },
      rest: " and add it to your hand.",
      evidence: ["filter:type"],
    });
  });

  it("parses reveal up-to typed-card selection into cardinality filter and hand destination", () => {
    expect(
      parseRevealUpToTypeCardToHand({
        text: "reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
      }),
    ).toEqual({
      filter: { typesAny: ["Five Elders"] },
      min: 0,
      max: 1,
      revealTo: "bothPlayers",
      rest: "Then, place the rest at the bottom of your deck in any order.",
      evidence: [
        "cardinality:upTo",
        "count:positiveInteger",
        "filter:type",
        "destination:hand",
        "reveal:bothPlayers",
      ],
    });
  });

  it("parses add up-to any-card selection as private search to hand", () => {
    expect(
      parseAddUpToAnyCardToHand({
        text: "add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
      }),
    ).toEqual({
      filter: {},
      min: 0,
      max: 1,
      revealTo: "chooserOnly",
      rest: "Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
      evidence: [
        "cardinality:upTo",
        "count:positiveInteger",
        "filter:any",
        "destination:hand",
        "reveal:chooserOnly",
      ],
    });
  });

  it("parses rest-to-bottom remainder policy independently from search selection", () => {
    expect(
      parseRestToBottomAnyOrder({
        text: "Then, place the rest at the bottom of your deck in any order.",
      }),
    ).toEqual({
      evidence: ["remaining:rest", "remaining:bottomDeck", "order:anyOrder"],
      rest: "",
    });
  });

  it("leaves trailing body text after rest-to-bottom remainder policy", () => {
    expect(
      parseRestToBottomAnyOrder({
        text: "Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
      }),
    ).toEqual({
      evidence: ["remaining:rest", "remaining:bottomDeck", "order:anyOrder"],
      rest: "trash 1 card from your hand.",
    });
  });
});
