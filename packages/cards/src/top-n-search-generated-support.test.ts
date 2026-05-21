import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition } from "@optcg/types";

import {
  buildGeneratedSupportIndex,
  type EffectDefinitionValidationResult,
} from "./generated-support-index.js";
import {
  generatedSupportRuntimeCapabilityMatrix,
  hasRuntimeCapability,
} from "./runtime-capability-matrix.js";
import {
  returnDonTopNAnyCardSearchTrashParserCertificationIds,
  topNFilteredSearchParserCertificationIds,
  topNSearchParserCertificationIds,
} from "./top-n-search-evidence.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const schema = JSON.parse(
  readFileSync(path.join(repoRoot, "contracts/effect-dsl.schema.json"), "utf8"),
) as unknown;
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema as AnySchema);

const validateEffectDefinition = (
  definition: EffectDefinition,
): EffectDefinitionValidationResult => {
  const valid = validateSchema(definition);
  if (valid) {
    return { valid: true };
  }

  return {
    errors: (validateSchema.errors ?? []).map((error) =>
      `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
    ),
    valid: false,
  };
};

const baseCard = {
  behaviorHash: "sha256:sup-002g-behavior",
  cardDataVersion: "cards-sup-002g",
  cardId: "SUP-002G-GENERATED" as CardId,
  effectDefinitionsVersion: "effects-sup-002g",
  rulesVersion: "rules-sup-002g",
  sourceTextHash: "sha256:sup-002g-source",
};
const parserCertificationEvidence = {
  currentCertificationIds: topNSearchParserCertificationIds,
};

describe("SUP-002G top-N search generated support", () => {
  it.each([
    {
      cardId: "SUP-002G-FILTER-TYPE",
      expectedFilter: { typesAny: ["Five Elders"] },
      lookCount: 5,
      sourceText:
        "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    },
    {
      cardId: "SUP-002G-FILTER-COLOR-TYPE",
      expectedFilter: { colorsAny: ["yellow"], typesAny: ["East Blue"] },
      lookCount: 4,
      sourceText:
        "[On Play] Look at 4 cards from the top of your deck; reveal up to 1 yellow {East Blue} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    },
    {
      cardId: "SUP-002G-FILTER-TYPE-NAME",
      expectedFilter: { nameNot: ["Nami"], typesAny: ["East Blue"] },
      lookCount: 6,
      sourceText:
        "[On Play] Look at 6 cards from the top of your deck; reveal up to 1 {East Blue} type card other than [Nami] and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    },
    {
      cardId: "SUP-002G-FILTER-COLOR-TYPE-NAME",
      expectedFilter: {
        colorsAny: ["green"],
        nameNot: ["Nami"],
        typesAny: ["East Blue"],
      },
      lookCount: 7,
      sourceText:
        "[On Play] Look at 7 cards from the top of your deck; reveal up to 1 green {East Blue} type card other than [Nami] and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    },
  ])(
    "supports filtered reveal search matrix row $cardId with complete parser and SUP-002D runtime evidence",
    ({ cardId, expectedFilter, lookCount, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, cardId: cardId as CardId, sourceText }],
        parserCertificationEvidence,
        validateEffectDefinition,
      });

      const entry = index.entries[0];
      expect(entry).toMatchObject({
        blockers: [],
        missingCapabilityIds: [],
        parseStatus: "complete",
        parserRuleIds: [
          "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
        ],
        status: "supported",
        support: {
          status: "implemented-dsl",
          tested: true,
        },
      });
      expect(entry?.capabilityEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capabilityId:
              "effect:search:self:deck:lookCount-positive:max1:hand",
            parserRuleId:
              "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
          }),
          expect.objectContaining({
            capabilityId: "searchFilter:categories-colorsAny-typesAny-nameNot",
            parserRuleId:
              "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
          }),
          expect.objectContaining({
            capabilityId: "searchReveal:selected:bothPlayers",
            parserRuleId:
              "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
          }),
          expect.objectContaining({
            capabilityId: "searchRemainder:deck-bottom:ownerChoice",
            parserRuleId:
              "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
          }),
        ]),
      );
      expect(entry?.effectDefinition?.effects[0]?.effect).toEqual({
        request: {
          destination: "hand",
          filter: expectedFilter,
          lookCount,
          max: 1,
          min: 0,
          player: "self",
          remainingCards: {
            destination: "deck",
            order: "ownerChoice",
            position: "bottom",
          },
          revealTo: "bothPlayers",
          shuffleAfter: false,
          zone: "deck",
        },
        type: "search",
      });
    },
  );

  it("supports return-DON non-reveal any-card search and trailing hand trash through composed capability evidence", () => {
    const sourceText =
      "[On Play] DON!! -2: Look at 4 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 2 cards from your hand.";

    const index = buildGeneratedSupportIndex({
      cards: [{ ...baseCard, cardId: "SUP-002G-COSTED" as CardId, sourceText }],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    const entry = index.entries[0];
    expect(entry).toMatchObject({
      blockers: [],
      missingCapabilityIds: [],
      parseStatus: "complete",
      parserRuleIds: [
        "component:cost:return-don:self:count-exact",
        "exact:on-play:top-n-search:any-card:up-to-1:hand:bottom-owner-choice",
        "exact:on-play:return-don-top-n-search:any-card:hand:bottom-owner-choice:trash-hand",
      ],
      status: "supported",
    });
    expect(entry?.capabilityEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "payCost:returnDon:self:count-exact",
          parserRuleId: "component:cost:return-don:self:count-exact",
        }),
        expect.objectContaining({
          capabilityId: "searchFilter:any-card-empty",
          parserRuleId:
            "exact:on-play:top-n-search:any-card:up-to-1:hand:bottom-owner-choice",
        }),
        expect.objectContaining({
          capabilityId: "searchReveal:selected:chooserOnly",
          parserRuleId:
            "exact:on-play:top-n-search:any-card:up-to-1:hand:bottom-owner-choice",
        }),
        expect.objectContaining({
          capabilityId:
            "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
          parserRuleId:
            "exact:on-play:return-don-top-n-search:any-card:hand:bottom-owner-choice:trash-hand",
        }),
        expect.objectContaining({
          capabilityId: "sequence:genericFrames",
          parserRuleId:
            "exact:on-play:return-don-top-n-search:any-card:hand:bottom-owner-choice:trash-hand",
        }),
      ]),
    );
    expect(entry?.effectDefinition?.effects[0]).toMatchObject({
      cost: { chooser: "self", count: 2, type: "returnDon" },
      effect: {
        effects: [
          {
            effect: {
              request: {
                filter: {},
                lookCount: 4,
                revealTo: "chooserOnly",
                shuffleAfter: false,
              },
              type: "search",
            },
          },
          {
            effect: {
              chooser: "self",
              count: 2,
              player: "self",
              type: "trashFromHand",
            },
          },
        ],
        type: "sequence",
      },
    });
  });

  it("keeps complete search parse unsupported when SUP-002D search capability evidence is missing", () => {
    const matrixWithoutSearchCapability = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !==
          "effect:search:self:deck:lookCount-positive:max1:hand",
      ),
    };

    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          sourceText:
            "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 red {Straw Hat Crew} type card other than [Nami] and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutSearchCapability,
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "effect:search:self:deck:lookCount-positive:max1:hand",
          code: "missing-runtime-capability",
          component: "on-play-top-n-filtered-search",
        },
      ],
      missingCapabilityIds: [
        "effect:search:self:deck:lookCount-positive:max1:hand",
      ],
      parseStatus: "complete",
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });

  it("exposes SUP-002D runtime capability evidence for filtered and any-card top-N search rules", () => {
    const expectedCapabilities = [
      "category:auto",
      "trigger:onPlay",
      "sourcePresencePolicy:mustRemainInSameZone",
      "effect:search:self:deck:lookCount-positive:max1:hand",
      "searchFilter:categories-colorsAny-typesAny-nameNot",
      "searchFilter:any-card-empty",
      "searchReveal:selected:bothPlayers",
      "searchReveal:selected:chooserOnly",
      "searchHiddenInfo:unselected-candidates-private",
      "searchRemainder:deck-bottom:ownerChoice",
      "sequence:genericFrames",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "payCost:returnDon:self:count-exact",
      "returnDon:cost:self:count-exact",
    ];
    const filteredShapeId = "on-play-top-n-filtered-search";
    const anyCardShapeId = "on-play-top-n-any-card-search";
    const fullCompositionShapeId =
      "on-play-return-don-top-n-any-card-search-trash-from-hand";

    for (const capabilityId of expectedCapabilities) {
      expect(hasRuntimeCapability(capabilityId)).toBe(true);
    }
    expect(
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) =>
          capability.id ===
          "searchFilter:categories-colorsAny-typesAny-nameNot",
      )?.supportedComponentIds,
    ).toContain(filteredShapeId);
    expect(
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) => capability.id === "searchFilter:any-card-empty",
      )?.supportedComponentIds,
    ).toEqual(expect.arrayContaining([anyCardShapeId, fullCompositionShapeId]));
    expect(
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) => capability.id === "sequence:genericFrames",
      )?.supportedComponentIds,
    ).toContain(fullCompositionShapeId);
    expect(
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) => capability.id === "searchFilter:any-card-empty",
      )?.supportedParserRuleIds,
    ).toEqual(
      expect.arrayContaining([
        "exact:on-play:top-n-search:any-card:up-to-1:hand:bottom-owner-choice",
        "exact:on-play:return-don-top-n-search:any-card:hand:bottom-owner-choice:trash-hand",
      ]),
    );
    expect(
      generatedSupportRuntimeCapabilityMatrix.capabilities.find(
        (capability) =>
          capability.id ===
          "searchFilter:categories-colorsAny-typesAny-nameNot",
      )?.supportedParserRuleIds,
    ).toEqual(
      expect.arrayContaining([
        "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
      ]),
    );
  });

  it("fails closed when top-N search parser certification evidence is omitted", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          sourceText:
            "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
        },
      ],
      validateEffectDefinition,
    });

    for (const certificationId of topNFilteredSearchParserCertificationIds) {
      const blocker = index.entries[0]?.blockers.find((item) =>
        item.message.includes(certificationId),
      );
      expect(blocker).toMatchObject({
        code: "unsupported-primitive",
        diagnosticLayer: "review",
      });
    }
    expect(index.entries[0]).toMatchObject({
      parseStatus: "complete",
      status: "unsupported",
    });
  });

  it("fails closed when costed any-card search parser certification evidence is omitted", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          sourceText:
            "[On Play] DON!! -1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
        },
      ],
      validateEffectDefinition,
    });

    for (const certificationId of returnDonTopNAnyCardSearchTrashParserCertificationIds) {
      const blocker = index.entries[0]?.blockers.find((item) =>
        item.message.includes(certificationId),
      );
      expect(blocker).toMatchObject({
        code: "unsupported-primitive",
        diagnosticLayer: "review",
      });
    }
    expect(index.entries[0]).toMatchObject({
      parseStatus: "complete",
      status: "unsupported",
    });
  });

  it.each(topNSearchParserCertificationIds)(
    "fails closed when top-N search parser certification evidence is stale for %s",
    (staleId) => {
      const sourceText = topNFilteredSearchParserCertificationIds.includes(
        staleId as (typeof topNFilteredSearchParserCertificationIds)[number],
      )
        ? "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order."
        : "[On Play] DON!! -1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.";
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseCard,
            sourceText,
          },
        ],
        parserCertificationEvidence: {
          currentCertificationIds: topNSearchParserCertificationIds,
          staleCertificationIds: [staleId],
        },
        validateEffectDefinition,
      });

      const blocker = index.entries[0]?.blockers.find((item) =>
        item.message.includes(staleId),
      );
      expect(blocker).toMatchObject({
        code: "unsupported-primitive",
        diagnosticLayer: "review",
      });
      expect(blocker?.message).toContain("Stale parser certification");
      expect(index.entries[0]).toMatchObject({
        parseStatus: "complete",
        status: "unsupported",
      });
    },
  );
});
