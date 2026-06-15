import { describe, expect, it } from "vitest";

import {
  parseTrashCountCondition,
  trashCountConditionPrimitive,
} from "./trash-count.js";

describe("trash count condition parser", () => {
  it("defines trash count as a primitive parent with match families", () => {
    expect(trashCountConditionPrimitive).toMatchObject({
      primitiveId: "condition:trashCount",
      matches: [
        {
          id: "you-have-n-or-more-cards-in-your-trash",
        },
        {
          id: "you-have-n-or-more-events-in-your-trash",
        },
        {
          id: "you-have-named-cards-in-your-trash",
        },
      ],
    });
  });

  it("parses self trash count thresholds", () => {
    expect(
      parseTrashCountCondition({
        text: "you have 7 or more cards in your trash",
      }),
    ).toEqual({
      condition: {
        type: "trashCount",
        player: "self",
        op: "gte",
        value: 7,
      },
      evidence: [
        "condition:trashCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
      ],
      rest: "",
    });
  });

  it("parses self Event trash count thresholds as a filtered condition", () => {
    expect(
      parseTrashCountCondition({
        text: "you have 4 or more Events in your trash",
      }),
    ).toEqual({
      condition: {
        type: "trashCount",
        player: "self",
        filter: { categories: ["event"] },
        op: "gte",
        value: 4,
      },
      evidence: [
        "condition:trashCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:category:event",
      ],
      rest: "",
    });
  });

  it("parses named trash presence as independent reusable trash count conditions", () => {
    expect(
      parseTrashCountCondition({
        text: "you have [Kuromarimo] and [Chess] in your trash",
      }),
    ).toEqual({
      condition: {
        type: "and",
        conditions: [
          {
            type: "trashCount",
            player: "self",
            filter: { names: ["Kuromarimo"] },
            op: "gte",
            value: 1,
          },
          {
            type: "trashCount",
            player: "self",
            filter: { names: ["Chess"] },
            op: "gte",
            value: 1,
          },
        ],
      },
      evidence: [
        "condition:trashCount",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
        "player:self",
        "filter:name",
        "filter:name",
        "composition:conditionAnd",
      ],
      rest: "",
    });
  });
});
