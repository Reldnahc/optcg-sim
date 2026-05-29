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

  it("parses field Leader power predicates as current power unless base is explicit", () => {
    const currentPower = parseLeaderNameCondition({
      text: "your Leader has the {Straw Hat Crew} type with 5000 power",
    });
    expect(currentPower).toMatchObject({
      condition: {
        filter: {
          categories: ["leader"],
          typesAny: ["Straw Hat Crew"],
          currentPower: { op: "eq", value: 5000 },
        },
      },
    });
    expect(currentPower?.evidence).toContain("filter:currentPower");

    const basePower = parseLeaderNameCondition({
      text: "your Leader has the {Straw Hat Crew} type with 5000 base power",
    });
    expect(basePower).toMatchObject({
      condition: {
        filter: {
          categories: ["leader"],
          typesAny: ["Straw Hat Crew"],
          power: { op: "eq", value: 5000 },
        },
      },
    });
    expect(basePower?.evidence).toContain("filter:power");
  });
});
