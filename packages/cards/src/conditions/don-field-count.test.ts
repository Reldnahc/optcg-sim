import { describe, expect, it } from "vitest";

import {
  donFieldCountConditionPrimitive,
  parseDonFieldCountCondition,
} from "./don-field-count.js";

describe("DON field count condition parser", () => {
  it("defines DON field count as a condition primitive parent", () => {
    expect(donFieldCountConditionPrimitive).toMatchObject({
      primitiveId: "condition:donFieldCount",
      matches: [{ id: "you-have-n-or-less-don-cards-on-your-field" }],
    });
  });

  it("parses self DON field lte condition", () => {
    expect(
      parseDonFieldCountCondition({
        text: "you have 6 or less DON!! cards on your field",
      }),
    ).toEqual({
      condition: {
        type: "fieldCount",
        player: "self",
        filter: {
          categories: ["don"],
        },
        op: "lte",
        value: 6,
      },
      evidence: [
        "condition:donFieldCount",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "player:self",
      ],
      rest: "",
    });
  });
});
