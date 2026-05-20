import { describe, expect, it } from "vitest";

import {
  deriveConditionalConditionDiagnostics,
  parseConditionExpression,
} from "./conditional-parser-components.js";

describe("conditional parser components", () => {
  it("parses supported condition components and boolean connectors", () => {
    expect(parseConditionExpression("During your turn")).toMatchObject({
      component: { type: "yourTurn" },
      id: "condition:yourTurn",
      span: { end: 16, start: 0, text: "During your turn" },
      text: "During your turn",
      type: "supported",
    });
    expect(
      parseConditionExpression(
        "this Character has 2 or more DON!! cards attached",
      ),
    ).toMatchObject({
      component: {
        op: "gte",
        target: { type: "self" },
        type: "attachedDonCount",
        value: 2,
      },
      id: "condition:attachedDonCount:self:gte:2",
      text: "this Character has 2 or more DON!! cards attached",
      type: "supported",
    });
    expect(
      parseConditionExpression("your Leader is multicolored"),
    ).toMatchObject({
      component: {
        op: "gte",
        player: "self",
        type: "leaderColorCount",
        value: 2,
      },
      id: "condition:leaderColorCount:self:gte:2",
      text: "your Leader is multicolored",
      type: "supported",
    });
    expect(
      parseConditionExpression("your Leader has the {Straw Hat Crew} type"),
    ).toMatchObject({
      component: {
        filter: { categories: ["leader"], typesAny: ["Straw Hat Crew"] },
        player: "self",
        type: "hasCardInZone",
        zone: "leaderArea",
      },
      id: "condition:leaderType:Straw Hat Crew",
      text: "your Leader has the {Straw Hat Crew} type",
      type: "supported",
    });
    expect(
      parseConditionExpression("your Leader has the [Slash] attribute"),
    ).toMatchObject({
      component: {
        filter: { attributesAny: ["slash"], categories: ["leader"] },
        player: "self",
        type: "hasCardInZone",
        zone: "leaderArea",
      },
      id: "condition:leaderAttribute:slash",
      text: "your Leader has the [Slash] attribute",
      type: "supported",
    });
    expect(
      parseConditionExpression(
        "you have 5 or less cards in your hand and your opponent has 1 or more Life cards",
      ),
    ).toMatchObject({
      connector: "and",
      left: {
        component: { op: "lte", player: "self", type: "handCount", value: 5 },
        text: "you have 5 or less cards in your hand",
        type: "supported",
      },
      right: {
        component: {
          op: "gte",
          player: "opponent",
          type: "lifeCount",
          value: 1,
        },
        text: "your opponent has 1 or more Life cards",
        type: "supported",
      },
      type: "connector",
    });
    expect(
      parseConditionExpression(
        "your Leader is multicolored or During your turn",
      ),
    ).toMatchObject({
      connector: "or",
      left: { text: "your Leader is multicolored", type: "supported" },
      right: { text: "During your turn", type: "supported" },
      type: "connector",
    });
  });

  it("keeps comparator phrasing from being treated as mixed boolean connectors", () => {
    const diagnostics = deriveConditionalConditionDiagnostics(
      "your Leader is multicolored and you have 5 or less cards in your hand",
    );

    expect(diagnostics.hasAmbiguousMixedConnectors).toBe(false);
    expect(diagnostics.isFullySupportedConditionExpression).toBe(true);
    expect(diagnostics.traceComponents).toEqual([
      {
        id: "condition:leaderColorCount:self:gte:2",
        kind: "condition",
        span: {
          end: 27,
          start: 0,
          text: "your Leader is multicolored",
        },
        status: "supported",
        text: "your Leader is multicolored",
      },
      {
        id: "condition-connector:and:28-31",
        kind: "condition-connector",
        span: {
          end: 31,
          start: 28,
          text: "and",
        },
        status: "supported",
        text: "and",
      },
      {
        id: "condition:handCount:self:lte:5",
        kind: "condition",
        span: {
          end: 69,
          start: 32,
          text: "you have 5 or less cards in your hand",
        },
        status: "supported",
        text: "you have 5 or less cards in your hand",
      },
    ]);
    expect(diagnostics.unsupportedSyntaxFragments).toEqual([]);
  });

  it("fails closed for unsupported fragments and ambiguous hand wording", () => {
    expect(
      parseConditionExpression(
        "your Leader is multicolored and your opponent has one or more cards in your hand",
      ),
    ).toMatchObject({
      connector: "and",
      type: "connector",
    });
    expect(
      parseConditionExpression("your opponent has 3 cards in your hand"),
    ).toMatchObject({
      id: "condition:unsupported:0-38",
      text: "your opponent has 3 cards in your hand",
      type: "unsupported-fragment",
    });
    expect(
      parseConditionExpression(
        "your opponent has 3 or more cards in their hand",
      ),
    ).toMatchObject({
      component: { op: "gte", player: "opponent", type: "handCount", value: 3 },
      id: "condition:handCount:opponent:gte:3",
      text: "your opponent has 3 or more cards in their hand",
      type: "supported",
    });
    expect(
      parseConditionExpression("you have 2 or more cards in your trash"),
    ).toMatchObject({
      component: { op: "gte", player: "self", type: "trashCount", value: 2 },
      id: "condition:trashCount:self:gte:2",
      text: "you have 2 or more cards in your trash",
      type: "supported",
    });
    expect(
      parseConditionExpression("you have 6 or less cards in your trash"),
    ).toMatchObject({
      component: { op: "lte", player: "self", type: "trashCount", value: 6 },
      id: "condition:trashCount:self:lte:6",
      text: "you have 6 or less cards in your trash",
      type: "supported",
    });
    expect(
      parseConditionExpression(
        "your opponent has 5 or more cards in their trash",
      ),
    ).toMatchObject({
      component: {
        op: "gte",
        player: "opponent",
        type: "trashCount",
        value: 5,
      },
      id: "condition:trashCount:opponent:gte:5",
      text: "your opponent has 5 or more cards in their trash",
      type: "supported",
    });
    expect(
      parseConditionExpression(
        "your opponent has 7 or less cards in their trash",
      ),
    ).toMatchObject({
      component: {
        op: "lte",
        player: "opponent",
        type: "trashCount",
        value: 7,
      },
      id: "condition:trashCount:opponent:lte:7",
      text: "your opponent has 7 or less cards in their trash",
      type: "supported",
    });
    expect(
      parseConditionExpression("you have 4 cards in your trash"),
    ).toMatchObject({
      component: { op: "eq", player: "self", type: "trashCount", value: 4 },
      id: "condition:trashCount:self:eq:4",
      text: "you have 4 cards in your trash",
      type: "supported",
    });
    expect(
      parseConditionExpression("your opponent has 9 cards in their trash"),
    ).toMatchObject({
      component: {
        op: "eq",
        player: "opponent",
        type: "trashCount",
        value: 9,
      },
      id: "condition:trashCount:opponent:eq:9",
      text: "your opponent has 9 cards in their trash",
      type: "supported",
    });
    expect(
      parseConditionExpression("you have 5 or more cards in your hand or less"),
    ).toMatchObject({
      id: "condition:unsupported:0-45",
      text: "you have 5 or more cards in your hand or less",
      type: "unsupported-fragment",
    });
    const unsupportedUnless = parseConditionExpression(
      "Unless your Leader is multicolored",
    );
    expect(unsupportedUnless.type).toBe("unsupported-fragment");
    expect(unsupportedUnless.text).toBe("Unless your Leader is multicolored");
    expect(unsupportedUnless.id).toMatch(/^condition:unsupported:0-\d+$/);

    const unsupportedCost = parseConditionExpression(
      "DON!! -1 your Leader is multicolored",
    );
    expect(unsupportedCost.type).toBe("unsupported-fragment");
    expect(unsupportedCost.text).toBe("DON!! -1 your Leader is multicolored");
    expect(unsupportedCost.id).toMatch(/^condition:unsupported:0-\d+$/);
    expect(
      parseConditionExpression("you have one or more cards in your trash"),
    ).toMatchObject({
      text: "you have one or more cards in your trash",
      type: "unsupported-fragment",
    });
    expect(
      parseConditionExpression("you have 0 or more cards in your trash"),
    ).toMatchObject({
      text: "you have 0 or more cards in your trash",
      type: "unsupported-fragment",
    });
    expect(
      parseConditionExpression("you have -1 cards in your trash"),
    ).toMatchObject({
      text: "you have -1 cards in your trash",
      type: "unsupported-fragment",
    });
    expect(
      parseConditionExpression("you have 1.5 cards in your trash"),
    ).toMatchObject({
      text: "you have 1.5 cards in your trash",
      type: "unsupported-fragment",
    });
    expect(
      parseConditionExpression("you have 01 cards in your trash"),
    ).toMatchObject({
      text: "you have 01 cards in your trash",
      type: "unsupported-fragment",
    });
    expect(
      parseConditionExpression("you have 9007199254740992 cards in your trash"),
    ).toMatchObject({
      text: "you have 9007199254740992 cards in your trash",
      type: "unsupported-fragment",
    });
    expect(
      parseConditionExpression("you have 2 red cards in your trash"),
    ).toMatchObject({
      text: "you have 2 red cards in your trash",
      type: "unsupported-fragment",
    });
    expect(
      parseConditionExpression("you have 2 cards in your deck"),
    ).toMatchObject({
      text: "you have 2 cards in your deck",
      type: "unsupported-fragment",
    });
    expect(
      parseConditionExpression("your opponent has 2 cards in your trash"),
    ).toMatchObject({
      text: "your opponent has 2 cards in your trash",
      type: "unsupported-fragment",
    });
  });

  it("keeps supported child conditions recognized when connector expression is unsupported", () => {
    const diagnostics = deriveConditionalConditionDiagnostics(
      "your Leader is multicolored and your opponent has 3 or more cards in your hand",
    );

    expect(diagnostics.isFullySupportedConditionExpression).toBe(false);
    expect(diagnostics.hasSupportedConditionComponents).toBe(true);
    expect(diagnostics.traceComponents).toEqual([
      {
        id: "condition:leaderColorCount:self:gte:2",
        kind: "condition",
        span: {
          end: 27,
          start: 0,
          text: "your Leader is multicolored",
        },
        status: "supported",
        text: "your Leader is multicolored",
      },
      {
        id: "condition-connector:and:28-31",
        kind: "condition-connector",
        span: {
          end: 31,
          start: 28,
          text: "and",
        },
        status: "unsupported",
        text: "and",
      },
      {
        id: "condition:unsupported:32-78",
        kind: "condition",
        span: {
          end: 78,
          start: 32,
          text: "your opponent has 3 or more cards in your hand",
        },
        status: "unsupported",
        text: "your opponent has 3 or more cards in your hand",
      },
    ]);
    expect(diagnostics.unsupportedConditionFragments).toEqual([
      "your opponent has 3 or more cards in your hand",
    ]);
    expect(diagnostics.unsupportedSyntaxFragments).toEqual([
      "condition conjunction: and",
      "condition-fragment:unsupported",
    ]);
  });

  it("fails closed for mixed and/or connector chains without parentheses", () => {
    const diagnostics = deriveConditionalConditionDiagnostics(
      "your Leader is multicolored and During your turn or this Character has 1 or more DON!! cards attached",
    );

    expect(diagnostics.isFullySupportedConditionExpression).toBe(false);
    expect(diagnostics.hasSupportedConditionComponents).toBe(true);
    expect(diagnostics.traceComponents).toEqual([
      {
        id: "condition:leaderColorCount:self:gte:2",
        kind: "condition",
        span: {
          end: 27,
          start: 0,
          text: "your Leader is multicolored",
        },
        status: "supported",
        text: "your Leader is multicolored",
      },
      {
        id: "condition-connector:and:28-31",
        kind: "condition-connector",
        span: {
          end: 31,
          start: 28,
          text: "and",
        },
        status: "unsupported",
        text: "and",
      },
      {
        id: "condition:yourTurn",
        kind: "condition",
        span: {
          end: 48,
          start: 32,
          text: "During your turn",
        },
        status: "supported",
        text: "During your turn",
      },
      {
        id: "condition-connector:or:49-51",
        kind: "condition-connector",
        span: {
          end: 51,
          start: 49,
          text: "or",
        },
        status: "unsupported",
        text: "or",
      },
      {
        id: "condition:attachedDonCount:self:gte:1",
        kind: "condition",
        span: {
          end: 101,
          start: 52,
          text: "this Character has 1 or more DON!! cards attached",
        },
        status: "supported",
        text: "this Character has 1 or more DON!! cards attached",
      },
    ]);
    expect(diagnostics.unsupportedConditionFragments).toEqual([]);
    expect(diagnostics.unsupportedSyntaxFragments).toEqual([
      "condition-boundary:ambiguous-mixed-connectors",
    ]);
  });
});
