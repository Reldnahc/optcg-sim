import { describe, expect, it } from "vitest";

import { parseCardFilterPredicates } from "./card-filter-predicates.js";

describe("card filter predicate parser", () => {
  it("parses type, category, power, and different-name predicates independently", () => {
    expect(
      parseCardFilterPredicates({
        text: "{Five Elders} type Character cards with 5000 power and different card names",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        typesAny: ["Five Elders"],
        power: { op: "eq", value: 5000 },
        custom: "differentNames",
      },
      evidence: [
        "filter:type",
        "filter:category:character",
        "filter:power",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
        "filter:differentNames",
      ],
      rest: "",
    });
  });

  it("parses category plus cost threshold without requiring a type predicate", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with a cost of 5 or more",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        cost: { min: 5 },
      },
      evidence: [
        "filter:category:character",
        "filter:cost",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses cost-prefix category wording as the same reusable cost predicate", () => {
    expect(
      parseCardFilterPredicates({
        text: "0 cost Characters",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        cost: { op: "eq", value: 0 },
      },
      evidence: [
        "filter:cost",
        "condition:comparator:eq",
        "condition:threshold:nonNegativeInteger",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("parses base cost as a reusable printed/base cost predicate", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with a base cost of 5 or less",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        baseCost: { max: 5 },
      },
      evidence: [
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses cost compared to Life count as a dynamic stat comparison", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with a cost equal to or less than the number of your opponent's Life cards",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        statComparisons: [
          {
            stat: "cost",
            op: "lte",
            value: {
              type: "countMatchingZoneCards",
              player: "opponent",
              zone: "life",
              per: 1,
              multiplier: 1,
            },
          },
        ],
      },
      evidence: [
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "valueSource:lifeCount:opponent",
      ],
      rest: "",
    });
  });

  it("parses shorthand self Life count wording as the same dynamic stat comparison", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with a cost equal to or less than your number of Life cards",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        statComparisons: [
          {
            stat: "cost",
            op: "lte",
            value: {
              type: "countMatchingZoneCards",
              player: "self",
              zone: "life",
              per: 1,
              multiplier: 1,
            },
          },
        ],
      },
      evidence: [
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "valueSource:lifeCount:self",
      ],
      rest: "",
    });
  });

  it("parses cost compared to total Life count as a reusable dynamic stat comparison", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with a cost equal to or less than the total of your and your opponent's Life cards",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        statComparisons: [
          {
            stat: "cost",
            op: "lte",
            value: {
              type: "countMatchingZoneCardsAcrossPlayers",
              players: ["self", "opponent"],
              zone: "life",
              per: 1,
              multiplier: 1,
            },
          },
        ],
      },
      evidence: [
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "valueSource:lifeCountTotal",
      ],
      rest: "",
    });
  });

  it("parses power thresholds as printed/base power predicates by default", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with 3000 power or less",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        power: { max: 3000 },
      },
      evidence: [
        "filter:category:character",
        "filter:power",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });

    expect(
      parseCardFilterPredicates({
        text: "Characters with 3000 power or more",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        power: { min: 3000 },
      },
      evidence: [
        "filter:category:character",
        "filter:power",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("can parse field-target power thresholds as current-power predicates", () => {
    expect(
      parseCardFilterPredicates(
        {
          text: "Characters with 3000 power or less",
        },
        { powerSemantics: "current" },
      ),
    ).toEqual({
      filter: {
        categories: ["character"],
        currentPower: { max: 3000 },
      },
      evidence: [
        "filter:category:character",
        "filter:currentPower",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses attached DON count as a reusable field-card predicate", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with a DON!! card given",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        attachedDon: { min: 1 },
      },
      evidence: [
        "filter:category:character",
        "filter:attachedDon",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });

    expect(
      parseCardFilterPredicates({
        text: "Characters that has 2 or more DON!! cards given",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        attachedDon: { min: 2 },
      },
      evidence: [
        "filter:category:character",
        "filter:attachedDon",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses active Character predicates as reusable field-state filters", () => {
    expect(
      parseCardFilterPredicates(
        {
          text: "active Characters with 5000 power or less",
        },
        { powerSemantics: "current" },
      ),
    ).toEqual({
      filter: {
        categories: ["character"],
        state: "active",
        currentPower: { max: 5000 },
      },
      evidence: [
        "filter:state:active",
        "filter:category:character",
        "filter:currentPower",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses field-state bracketed names as reusable field filters", () => {
    expect(parseCardFilterPredicates({ text: "rested [Uta]" })).toEqual({
      filter: {
        categories: ["character"],
        names: ["Uta"],
        state: "rested",
      },
      evidence: [
        "filter:state:rested",
        "filter:category:character",
        "filter:name",
      ],
      rest: "",
    });

    expect(
      parseCardFilterPredicates({ text: "active [Monkey.D.Luffy]" }),
    ).toEqual({
      filter: {
        categories: ["character"],
        names: ["Monkey.D.Luffy"],
        state: "active",
      },
      evidence: [
        "filter:state:active",
        "filter:category:character",
        "filter:name",
      ],
      rest: "",
    });
  });

  it.each([
    ["<Special> attribute Characters", "special"],
    ["＜Special＞ attribute Characters", "special"],
  ])("parses %s as reusable attribute Character filters", (text, attribute) => {
    expect(parseCardFilterPredicates({ text })).toEqual({
      filter: {
        attributesAny: [attribute],
        categories: ["character"],
      },
      evidence: ["filter:attribute", "filter:category:character"],
      rest: "",
    });
  });

  it.each([
    ["Characters without the <Special> attribute", "special"],
    ["Characters without the \uFF1CSpecial\uFF1E attribute", "special"],
  ])(
    "parses %s as reusable negative attribute Character filters",
    (text, attribute) => {
      expect(parseCardFilterPredicates({ text })).toEqual({
        filter: {
          categories: ["character"],
          attributesNotAny: [attribute],
        },
        evidence: [
          "filter:category:character",
          "filter:attribute",
          "filter:negated",
        ],
        rest: "",
      });
    },
  );

  it("parses quoted type-including text and comma-separated current power predicates", () => {
    expect(
      parseCardFilterPredicates(
        {
          text: 'with a type including "Whitebeard Pirates", with 8000 power or more, gains [Rush]',
        },
        { powerSemantics: "current" },
      ),
    ).toEqual({
      filter: {
        typesIncludeAny: ["Whitebeard Pirates"],
        currentPower: { min: 8000 },
      },
      evidence: [
        "filter:type",
        "filter:currentPower",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: ", gains [Rush]",
    });
  });

  it("parses base power thresholds as printed/base power predicates", () => {
    expect(
      parseCardFilterPredicates({
        text: "Characters with 3000 base power or less",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        power: { max: 3000 },
      },
      evidence: [
        "filter:category:character",
        "filter:power",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses bracketed card names as a reusable name predicate", () => {
    expect(parseCardFilterPredicates({ text: "[Imu]" })).toEqual({
      filter: { names: ["Imu"] },
      evidence: ["filter:name"],
      rest: "",
    });
  });

  it("parses color plus type plus category predicates for searches", () => {
    expect(
      parseCardFilterPredicates({
        text: "green {East Blue} type card other than [Nami]",
      }),
    ).toEqual({
      filter: {
        colorsAny: ["green"],
        typesAny: ["East Blue"],
        nameNot: ["Nami"],
      },
      evidence: ["filter:color", "filter:type", "filter:nameNot"],
      rest: "",
    });
  });

  it("parses type-or-attribute alternatives separately from shared character predicates", () => {
    expect(
      parseCardFilterPredicates({
        text: "{Muggy Kingdom} type or <Slash> attribute Character card with a cost of 4 or less other than [Dracule Mihawk]",
      }),
    ).toEqual({
      filter: {
        anyOf: [{ typesAny: ["Muggy Kingdom"] }, { attributesAny: ["slash"] }],
        categories: ["character"],
        cost: { max: 4 },
        nameNot: ["Dracule Mihawk"],
      },
      evidence: [
        "filter:anyOf",
        "filter:type",
        "filter:attribute",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "filter:nameNot",
      ],
      rest: "",
    });
  });

  it("parses same-category type alternatives as one reusable typesAny filter", () => {
    expect(
      parseCardFilterPredicates({
        text: "{Alabasta} or {Straw Hat Crew} type Character card with a cost of 5 or less",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        typesAny: ["Alabasta", "Straw Hat Crew"],
        cost: { max: 5 },
      },
      evidence: [
        "filter:type",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("composes plural type alternatives with base-power thresholds", () => {
    expect(
      parseCardFilterPredicates({
        text: "{Amazon Lily} or {Kuja Pirates} type Characters with 5000 base power or more",
      }),
    ).toEqual({
      filter: {
        categories: ["character"],
        typesAny: ["Amazon Lily", "Kuja Pirates"],
        power: { min: 5000 },
      },
      evidence: [
        "filter:type",
        "filter:type",
        "filter:category:character",
        "filter:power",
        "condition:comparator:gte",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });

  it("parses multi-type Leader and Character predicates with either conjunction", () => {
    expect(
      parseCardFilterPredicates({
        text: "{Fish-Man} or {Merfolk} type Leader and Character cards",
      }),
    ).toEqual({
      filter: {
        categories: ["leader", "character"],
        typesAny: ["Fish-Man", "Merfolk"],
      },
      evidence: [
        "filter:type",
        "filter:type",
        "filter:category:leader",
        "filter:category:character",
      ],
      rest: "",
    });
  });

  it("parses typed Leader predicates without requiring a Character target", () => {
    expect(
      parseCardFilterPredicates({
        text: "{Supernovas} type Leader",
      }),
    ).toEqual({
      filter: {
        categories: ["leader"],
        typesAny: ["Supernovas"],
      },
      evidence: ["filter:type", "filter:category:leader"],
      rest: "",
    });
  });

  it("parses self exclusion separately from attribute, category, and cost predicates", () => {
    expect(
      parseCardFilterPredicates({
        text: "<Slash> attribute Character with a cost of 5 or less other than this Character",
      }),
    ).toEqual({
      filter: {
        attributesAny: ["slash"],
        categories: ["character"],
        cost: { max: 5 },
        excludeSelf: true,
      },
      evidence: [
        "filter:attribute",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "filter:excludeSelf",
      ],
      rest: "",
    });
  });

  it("parses attribute-only predicates separately from category predicates", () => {
    expect(
      parseCardFilterPredicates({
        text: "<Slash> attribute",
      }),
    ).toEqual({
      filter: { attributesAny: ["slash"] },
      evidence: ["filter:attribute"],
      rest: "",
    });
  });

  it("parses categoryless type alternatives as reusable type filters", () => {
    expect(
      parseCardFilterPredicates({
        text: "{FILM} or {Straw Hat Crew} type",
      }),
    ).toEqual({
      filter: { typesAny: ["FILM", "Straw Hat Crew"] },
      evidence: ["filter:type", "filter:type"],
      rest: "",
    });
  });

  it("parses categoryless type-or-attribute alternatives as reusable filters", () => {
    expect(
      parseCardFilterPredicates({
        text: "{FILM} type or the <Strike> attribute",
      }),
    ).toEqual({
      filter: {
        anyOf: [{ typesAny: ["FILM"] }, { attributesAny: ["strike"] }],
      },
      evidence: ["filter:anyOf", "filter:type", "filter:attribute"],
      rest: "",
    });
  });

  it("parses attribute-card or color-event alternatives as reusable filters", () => {
    expect(
      parseCardFilterPredicates({
        text: "<Slash> attribute card or green Event",
      }),
    ).toEqual({
      filter: {
        anyOf: [
          { attributesAny: ["slash"] },
          { colorsAny: ["green"], categories: ["event"] },
        ],
      },
      evidence: [
        "filter:anyOf",
        "filter:attribute",
        "filter:color",
        "filter:category:event",
      ],
      rest: "",
    });
  });

  it("parses plural generic type cards as reusable type filter data", () => {
    expect(parseCardFilterPredicates({ text: "{Navy} type cards" })).toEqual({
      filter: { typesAny: ["Navy"] },
      evidence: ["filter:type"],
      rest: "",
    });
  });

  it("parses attribute Leader predicates as generic card filters", () => {
    expect(
      parseCardFilterPredicates({ text: "<Slash> attribute Leader" }),
    ).toEqual({
      filter: { attributesAny: ["slash"], categories: ["leader"] },
      evidence: ["filter:attribute", "filter:category:leader"],
      rest: "",
    });
  });

  it("parses bracketed name lists with shared trailing predicates", () => {
    expect(
      parseCardFilterPredicates({
        text: "[Sabo], [Portgas.D.Ace], or [Monkey.D.Luffy] with a cost of 2",
      }),
    ).toEqual({
      filter: {
        anyOf: [
          { names: ["Sabo"] },
          { names: ["Portgas.D.Ace"] },
          { names: ["Monkey.D.Luffy"] },
        ],
        cost: { op: "eq", value: 2 },
      },
      evidence: [
        "filter:anyOf",
        "filter:name",
        "filter:name",
        "filter:name",
        "filter:cost",
        "condition:comparator:eq",
        "condition:threshold:positiveInteger",
      ],
      rest: "",
    });
  });
});

it("parses shorthand cost thresholds without 'of'", () => {
  expect(
    parseCardFilterPredicates({
      text: "Characters with a cost 5 or less",
    }),
  ).toEqual({
    filter: { categories: ["character"], cost: { max: 5 } },
    evidence: [
      "filter:category:character",
      "filter:cost",
      "condition:comparator:lte",
      "condition:threshold:positiveInteger",
    ],
    rest: "",
  });
});
