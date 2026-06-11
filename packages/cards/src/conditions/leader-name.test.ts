import { describe, expect, it } from "vitest";

import { parseConditionExpression } from "../segments/composed-expression.js";
import { parseLifeCountCondition } from "./life-count.js";
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

  it("parses leader attribute predicates through reusable card filters", () => {
    expect(
      parseLeaderNameCondition({
        text: "your Leader has the <Slash> attribute",
      }),
    ).toEqual({
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], attributesAny: ["slash"] },
      },
      evidence: [
        "condition:leaderIdentity",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:attribute",
      ],
      rest: "",
    });
  });

  it("parses leader type alternatives through reusable card filters", () => {
    expect(
      parseLeaderNameCondition({
        text: "your Leader has the {FILM} or {Straw Hat Crew} type",
      }),
    ).toEqual({
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          typesAny: ["FILM", "Straw Hat Crew"],
        },
      },
      evidence: [
        "condition:leaderIdentity",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:type",
        "filter:type",
      ],
      rest: "",
    });
  });

  it("parses leader type-or-attribute alternatives through reusable card filters", () => {
    expect(
      parseLeaderNameCondition({
        text: "your Leader has the {FILM} type or the <Strike> attribute",
      }),
    ).toEqual({
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          anyOf: [{ typesAny: ["FILM"] }, { attributesAny: ["strike"] }],
        },
      },
      evidence: [
        "condition:leaderIdentity",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:anyOf",
        "filter:type",
        "filter:attribute",
      ],
      rest: "",
    });
  });

  it("parses mixed leader type-or-name alternatives through reusable anyOf filters", () => {
    expect(
      parseLeaderNameCondition({
        text: "your Leader has the {Red-Haired Pirates} type or is [Uta]",
      }),
    ).toEqual({
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          anyOf: [{ typesAny: ["Red-Haired Pirates"] }, { names: ["Uta"] }],
        },
      },
      evidence: [
        "condition:leaderIdentity",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:anyOf",
        "filter:type",
        "filter:name",
      ],
      rest: "",
    });
  });

  it("parses leader card-name includes as a reusable name filter", () => {
    expect(
      parseLeaderNameCondition({
        text: 'your Leader\'s card name includes "Ace"',
      }),
    ).toEqual({
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], nameContains: "Ace" },
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

  it("parses leader type-includes wording as a reusable type substring filter", () => {
    expect(
      parseLeaderNameCondition({
        text: 'your Leader\'s type includes "CP"',
      }),
    ).toEqual({
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], typesIncludeAny: ["CP"] },
      },
      evidence: [
        "condition:leaderIdentity",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:type",
      ],
      rest: "",
    });
  });

  it("parses OR leader identity as reusable name filter alternatives", () => {
    expect(
      parseLeaderNameCondition({
        text: "your Leader is [Sabo], [Portgas.D.Ace] or [Monkey.D.Luffy]",
      }),
    ).toEqual({
      condition: {
        type: "hasCardInZone",
        zone: "leaderArea",
        player: "self",
        filter: {
          categories: ["leader"],
          anyOf: [
            { names: ["Sabo"] },
            { names: ["Portgas.D.Ace"] },
            { names: ["Monkey.D.Luffy"] },
          ],
        },
      },
      evidence: [
        "condition:leaderIdentity",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:anyOf",
        "filter:name",
        "filter:name",
        "filter:name",
      ],
      rest: "",
    });
  });

  it("does not swallow following and-conditions into a quoted leader type", () => {
    expect(
      parseConditionExpression(
        `your Leader's type includes "Whitebeard Pirates" and you have 2 or less Life cards`,
        [parseLifeCountCondition, parseLeaderNameCondition],
      ),
    ).toMatchObject({
      condition: {
        type: "and",
        conditions: [
          {
            type: "hasCardInZone",
            zone: "leaderArea",
            player: "self",
            filter: {
              categories: ["leader"],
              typesIncludeAny: ["Whitebeard Pirates"],
            },
          },
          {
            type: "lifeCount",
            player: "self",
            op: "lte",
            value: 2,
          },
        ],
      },
    });
  });
});
