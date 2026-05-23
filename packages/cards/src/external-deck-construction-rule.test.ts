import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition } from "@optcg/types";
import { buildGeneratedSupportIndex } from "./generated-support-index.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";
import { donMinusDrawParserCertificationIds } from "./don-minus-draw-evidence.js";

import {
  externalDeckConstructionRuleParserRuleId,
  parseExternalDeckConstructionRuleClause,
} from "./external-deck-construction-rule.js";

describe("external deck construction rule", () => {
  it.each([
    {
      sourceText:
        "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck.",
      expectedEvidence: {
        categoryPlural: "Events",
        comparator: "gte",
        deckScope: "your-deck",
        nonRuntimeClassification: "external-deck-construction-rule",
        normalizedCategory: "event",
        parserRuleId: "exact:external-deck-rule:category-cost-gte-in-your-deck",
        threshold: 2,
      },
    },
    {
      sourceText:
        "Under the rules of this game, you cannot include Events with a cost of 3 or more in your deck.",
      expectedEvidence: {
        categoryPlural: "Events",
        comparator: "gte",
        deckScope: "your-deck",
        nonRuntimeClassification: "external-deck-construction-rule",
        normalizedCategory: "event",
        parserRuleId: "exact:external-deck-rule:category-cost-gte-in-your-deck",
        threshold: 3,
      },
    },
    {
      sourceText:
        "Under the rules of this game, you cannot include Stages with a cost of 1 or more in your deck.",
      expectedEvidence: {
        categoryPlural: "Stages",
        comparator: "gte",
        deckScope: "your-deck",
        nonRuntimeClassification: "external-deck-construction-rule",
        normalizedCategory: "stage",
        parserRuleId: "exact:external-deck-rule:category-cost-gte-in-your-deck",
        threshold: 1,
      },
    },
    {
      sourceText:
        "Under the rules of this game, you cannot include Events with a cost of 0 or more in your deck.",
      expectedEvidence: {
        categoryPlural: "Events",
        comparator: "gte",
        deckScope: "your-deck",
        nonRuntimeClassification: "external-deck-construction-rule",
        normalizedCategory: "event",
        parserRuleId: "exact:external-deck-rule:category-cost-gte-in-your-deck",
        threshold: 0,
      },
    },
  ])(
    "parses supported non-runtime deck-rule evidence for $sourceText",
    ({ expectedEvidence, sourceText }) => {
      expect(parseExternalDeckConstructionRuleClause(sourceText)).toEqual({
        nonRuntimeEvidence: expectedEvidence,
        parserRuleId: externalDeckConstructionRuleParserRuleId,
      });
    },
  );

  it.each([
    "Under the rules of this game, you cannot include Characters with a cost of 2 or more in your deck.",
    "Under the rules of this game, you cannot include Events with a cost of 2 or less in your deck.",
    "Under the rules of this game, you cannot include Events with a cost of or more in your deck.",
    "Under the rules of this game, you cannot include Events with a cost of 2 or more in your hand.",
    "Under the rules of this game, you cannot include any Events you want in your deck.",
  ])("fails closed for unsupported deck-rule wording: %s", (sourceText) => {
    expect(parseExternalDeckConstructionRuleClause(sourceText)).toBeUndefined();
  });

  it("keeps external deck-rule evidence non-runtime when combined with a supported runtime line", () => {
    const currentCertificationIds = [
      "non-runtime:external-deck-construction-rule",
      ...donMinusDrawParserCertificationIds,
    ] as const;
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          behaviorHash: "sha256:behavior",
          cardDataVersion: "cards-v1",
          cardId: "CARD-025C-EXTERNAL-DECK-RULE" as CardId,
          effectDefinitionsVersion: "effects-v1",
          rulesVersion: "rules-v1",
          sourceText: [
            "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck.",
            "[On Play] DON!! -1: Draw 1 card.",
          ].join("\n"),
          sourceTextHash: "sha256:source",
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds,
      },
      validateEffectDefinition: (definition: EffectDefinition) => {
        void definition;
        return { valid: true };
      },
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      parseStatus: "complete",
      parserRuleIds: [
        "exact:external-deck-rule:category-cost-gte-in-your-deck",
        "component:cost:return-don:self:count-exact",
        "exact:on-play:draw-n:self",
        "exact:on-play:return-don-draw-n:self",
        "line-separated-effect-blocks:v1",
      ],
      status: "supported",
    });
    expect(index.entries[0]?.missingCapabilityIds).toEqual([]);
  });

  it("supports shared draw body primitive under different certified entry-point wrappers", () => {
    const drawWrapperCertifications = [
      "trigger-wrapper:on-play",
      "trigger-wrapper:trigger",
      "body-action:draw-n",
      "source-presence-policy:must-remain-in-same-zone",
      "source-presence-policy:no-source-required",
    ] as const;
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          behaviorHash: "sha256:behavior-a",
          cardDataVersion: "cards-v1",
          cardId: "CARD-025C-ENTRY-ON-PLAY" as CardId,
          effectDefinitionsVersion: "effects-v1",
          rulesVersion: "rules-v1",
          sourceText: "[On Play] Draw 2 cards.",
          sourceTextHash: "sha256:source-a",
        },
        {
          behaviorHash: "sha256:behavior-b",
          cardDataVersion: "cards-v1",
          cardId: "CARD-025C-ENTRY-TRIGGER" as CardId,
          effectDefinitionsVersion: "effects-v1",
          rulesVersion: "rules-v1",
          sourceText: "[Trigger] Draw 2 cards.",
          sourceTextHash: "sha256:source-b",
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: [...drawWrapperCertifications],
      },
      validateEffectDefinition: (definition: EffectDefinition) => {
        void definition;
        return { valid: true };
      },
    });

    expect(index.entries.map((entry) => entry.status)).toEqual([
      "supported",
      "supported",
    ]);
    expect(index.entries[0]).toMatchObject({
      componentEvidenceIds: ["on-play-draw"],
      parserRuleIds: ["exact:on-play:draw-n:self"],
    });
    expect(index.entries[1]).toMatchObject({
      componentEvidenceIds: ["trigger-draw"],
      parserRuleIds: ["exact:trigger:draw-n:self"],
    });
    for (const entry of index.entries) {
      expect(entry.capabilityEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capabilityId: "effect:draw:self:count:positive-safe-integer",
          }),
        ]),
      );
    }
    expect(
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) =>
          capability.id === "effect:draw:self:count:positive-safe-integer",
      )?.supportedParserRuleIds,
    ).toEqual(
      expect.arrayContaining([
        "exact:on-play:draw-n:self",
        "exact:trigger:draw-n:self",
      ]),
    );
  });

  it("does not mint wrapper or entry-point adapter evidence from standalone keyword text", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          behaviorHash: "sha256:behavior-keyword",
          cardDataVersion: "cards-v1",
          cardId: "CARD-025C-STANDALONE-KEYWORD" as CardId,
          category: "character",
          effectDefinitionsVersion: "effects-v1",
          printedKeywords: ["rush"],
          rulesVersion: "rules-v1",
          sourceText: "[Rush]",
          sourceTextHash: "sha256:source-keyword",
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: [
          "keyword:rush:printed",
          "source-presence-policy:none-for-keyword",
        ],
      },
      validateEffectDefinition: (definition: EffectDefinition) => {
        void definition;
        return { valid: true };
      },
    });

    expect(index.entries[0]).toMatchObject({
      componentEvidenceIds: ["keyword-rush"],
      parseStatus: "complete",
      parserRuleIds: ["exact:keyword:rush:standalone"],
      status: "supported",
    });
  });
});
