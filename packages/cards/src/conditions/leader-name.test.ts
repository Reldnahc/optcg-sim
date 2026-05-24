import { describe, expect, it } from "vitest";

import { parseLeaderNameCondition } from "./leader-name.js";

describe("leader name condition parser", () => {
  it("parses your Leader identity as a reusable condition primitive", () => {
    expect(parseLeaderNameCondition({ text: "your Leader is [Imu]" })).toEqual({
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], names: ["Imu"] },
      },
      evidence: [
        "condition:leaderIdentity",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:name",
      ],
      rest: "",
    });
  });
});
