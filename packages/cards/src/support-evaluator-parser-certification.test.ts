import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import type { EffectDefinition, PoneglyphCardDetail } from "@optcg/types";

import {
  buildGeneratedSupportIndex,
  type EffectDefinitionValidationResult,
} from "./generated-support-index.js";
import { normalizePoneglyphCardDetail } from "./normalization.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";
import { evaluateGeneratedSupportPlayability } from "./support-evaluator.js";

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
  if (valid) return { valid: true };
  return {
    errors: (validateSchema.errors ?? []).map((error) =>
      `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
    ),
    valid: false,
  };
};

function cardNoun(count: number): "card" | "cards" {
  return count === 1 ? "card" : "cards";
}

const sup003hRepresentativeComposedText =
  "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.\n[Activate: Main] [Once Per Turn] You may trash 1 of your {Celestial Dragons} type Characters or 1 card from your hand: Draw 1 card.";

function createSup003HRepresentativeCard(cardNumber: string) {
  return normalizePoneglyphCardDetail({
    ...loadOp03044Fixture(),
    card_number: cardNumber,
    effect: sup003hRepresentativeComposedText,
    name: "SUP-003H representative multiline leader composition",
  });
}

describe("support evaluator parser certification evidence", () => {
  it("supports SUP-003H representative multiline leader composition with separated non-runtime and runtime evidence", () => {
    const card = createSup003HRepresentativeCard(
      "SUP-003H-EVAL-REPRESENTATIVE",
    );

    const evaluation = evaluateGeneratedSupportPlayability({
      card,
      cardDataVersion: "2026-05-21",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: card.behaviorHash,
      expectedSourceTextHash: card.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [],
      parseStatus: "complete",
      playable: true,
      status: "supported",
    });
    expect(evaluation.parserRuleIds).toEqual(
      expect.arrayContaining([
        "exact:external-deck-rule:category-cost-gte-in-your-deck",
        "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck",
        "exact:activate-main:once-per-turn:optional-choose-one-trash-self-field-type-or-hand:draw-n:self",
        "line-separated-effect-blocks:v1",
      ]),
    );
    expect(evaluation.nonRuntimeEvidence).toEqual([
      {
        categoryPlural: "Events",
        comparator: "gte",
        deckScope: "your-deck",
        nonRuntimeClassification: "external-deck-construction-rule",
        normalizedCategory: "event",
        parserRuleId: "exact:external-deck-rule:category-cost-gte-in-your-deck",
        threshold: 2,
      },
    ]);
    expect(
      evaluation.capabilityEvidence.some(
        (evidence) =>
          evidence.capabilityId === "selectCards:deck:self:stage:typesAny:max1",
      ),
    ).toBe(true);
    expect(
      evaluation.capabilityEvidence.some(
        (evidence) =>
          evidence.capabilityId ===
          "payCost:chooseOne:optional:trashFromField-or-trashFromHand:self",
      ),
    ).toBe(true);
    expect(
      evaluation.capabilityEvidence.some((evidence) =>
        evidence.capabilityId.startsWith("metadata:"),
      ),
    ).toBe(false);
  });

  it.each([
    {
      drawCount: 1,
      fieldType: "Celestial Dragons",
      stageType: "Mary Geoise",
      threshold: 2,
    },
    { drawCount: 2, fieldType: "Navy", stageType: "Dressrosa", threshold: 3 },
  ])(
    "supports parameterized SUP-003H multiline composition matrix (threshold=%i stage=%s field=%s draw=%i)",
    ({ drawCount, fieldType, stageType, threshold }) => {
      const card = normalizePoneglyphCardDetail({
        ...loadOp03044Fixture(),
        card_number: `SUP-003H-EVAL-MATRIX-${String(threshold)}-${String(drawCount)}`,
        effect:
          `Under the rules of this game, you cannot include Events with a cost of ${String(threshold)} or more in your deck and at the start of the game, play up to 1 {${stageType}} type Stage card from your deck.\n` +
          `[Activate: Main] [Once Per Turn] You may trash 1 of your {${fieldType}} type Characters or 1 card from your hand: Draw ${String(drawCount)} ${cardNoun(drawCount)}.`,
        name: "SUP-003H matrix composition",
      });
      const evaluation = evaluateGeneratedSupportPlayability({
        card,
        cardDataVersion: "2026-05-21",
        effectDefinitionsVersion: "generated-support-v1",
        expectedBehaviorHash: card.behaviorHash,
        expectedSourceTextHash: card.sourceTextHash,
        rulesVersion: "generated-support-v1",
        validateEffectDefinition,
      });
      expect(evaluation).toMatchObject({
        blockers: [],
        parseStatus: "complete",
        playable: true,
        status: "supported",
      });
      expect(evaluation.parserRuleIds).toEqual(
        expect.arrayContaining([
          "exact:external-deck-rule:category-cost-gte-in-your-deck",
          "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck",
          "exact:activate-main:once-per-turn:optional-choose-one-trash-self-field-type-or-hand:draw-n:self",
          "line-separated-effect-blocks:v1",
        ]),
      );
      expect(evaluation.nonRuntimeEvidence).toEqual([
        {
          categoryPlural: "Events",
          comparator: "gte",
          deckScope: "your-deck",
          nonRuntimeClassification: "external-deck-construction-rule",
          normalizedCategory: "event",
          parserRuleId:
            "exact:external-deck-rule:category-cost-gte-in-your-deck",
          threshold,
        },
      ]);
    },
  );

  it("fails closed when start-of-game runtime capability evidence is absent for SUP-003H composed multiline text", () => {
    const card = createSup003HRepresentativeCard(
      "SUP-003H-EVAL-MISSING-START-OF-GAME-CAP",
    );
    const runtimeCapabilityMatrix = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "selectCards:deck:self:stage:typesAny:max1",
      ),
    };

    const evaluation = evaluateGeneratedSupportPlayability({
      card,
      cardDataVersion: "2026-05-21",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: card.behaviorHash,
      expectedSourceTextHash: card.sourceTextHash,
      rulesVersion: "generated-support-v1",
      runtimeCapabilityMatrix,
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      parseStatus: "complete",
      playable: false,
      status: "unsupported",
    });
    expect(evaluation.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "selectCards:deck:self:stage:typesAny:max1",
          code: "missing-runtime-capability",
        }),
      ]),
    );
    expect(evaluation.missingCapabilityIds).toContain(
      "selectCards:deck:self:stage:typesAny:max1",
    );
  });

  it("fails closed when Activate Main runtime capability evidence is absent for SUP-003H composed multiline text", () => {
    const card = createSup003HRepresentativeCard(
      "SUP-003H-EVAL-MISSING-ACTIVATE-MAIN-CAP",
    );
    const runtimeCapabilityMatrix = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !==
          "payCost:chooseOne:optional:trashFromField-or-trashFromHand:self",
      ),
    };

    const evaluation = evaluateGeneratedSupportPlayability({
      card,
      cardDataVersion: "2026-05-21",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: card.behaviorHash,
      expectedSourceTextHash: card.sourceTextHash,
      rulesVersion: "generated-support-v1",
      runtimeCapabilityMatrix,
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      parseStatus: "complete",
      playable: false,
      status: "unsupported",
    });
    expect(evaluation.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId:
            "payCost:chooseOne:optional:trashFromField-or-trashFromHand:self",
          code: "missing-runtime-capability",
        }),
      ]),
    );
    expect(evaluation.missingCapabilityIds).toContain(
      "payCost:chooseOne:optional:trashFromField-or-trashFromHand:self",
    );
  });

  it("fails closed when deck-rule parser certification evidence is missing for SUP-003H composed multiline text", () => {
    const card = createSup003HRepresentativeCard(
      "SUP-003H-EVAL-MISSING-DECK-RULE-CERT",
    );
    const evaluation = evaluateGeneratedSupportPlayability({
      card,
      cardDataVersion: "2026-05-21",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: card.behaviorHash,
      expectedSourceTextHash: card.sourceTextHash,
      parserCertificationEvidence: {
        currentCertificationIds: [],
      },
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    const index = buildGeneratedSupportIndex({
      cards: [
        {
          behaviorHash: card.behaviorHash,
          cardDataVersion: "2026-05-21",
          cardId: card.cardId,
          category: card.category,
          effectDefinitionsVersion: "generated-support-v1",
          printedKeywords: card.printedKeywords,
          rulesVersion: "generated-support-v1",
          sourceText: card.raw.effect ?? "",
          sourceTextHash: card.sourceTextHash,
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: [],
      },
      validateEffectDefinition,
    });
    expect(index.entries[0]).toMatchObject({
      parseStatus: "complete",
      status: "unsupported",
    });
    expect(index.entries[0]?.support).toBeUndefined();
    expect(index.entries[0]?.effectDefinition).toBeUndefined();
    expect(index.entries[0]?.effectDefinitionId).toBeUndefined();

    expect(evaluation).toMatchObject({
      parseStatus: "complete",
      status: "unsupported",
    });
    expect(evaluation.support).toBeUndefined();
    expect(evaluation.effectDefinition).toBeUndefined();
    expect(evaluation.effectDefinitionId).toBeUndefined();
    const blockerMessages = evaluation.blockers
      .filter(
        (blocker) =>
          blocker.code === "unsupported-primitive" &&
          blocker.component ===
            "external-deck-rule-category-cost-gte-in-your-deck",
      )
      .map((blocker) => blocker.message);
    expect(
      blockerMessages.some((message) =>
        message.includes(
          "Missing parser certification non-runtime:external-deck-construction-rule",
        ),
      ),
    ).toBe(true);
  });

  it("fails closed at generated-support index level when deck-rule parser certification evidence is stale for SUP-003H composed multiline text", () => {
    const card = createSup003HRepresentativeCard(
      "SUP-003H-INDEX-STALE-DECK-RULE-CERT",
    );
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          behaviorHash: card.behaviorHash,
          cardDataVersion: "2026-05-21",
          cardId: card.cardId,
          category: card.category,
          effectDefinitionsVersion: "generated-support-v1",
          printedKeywords: card.printedKeywords,
          rulesVersion: "generated-support-v1",
          sourceText: card.raw.effect ?? "",
          sourceTextHash: card.sourceTextHash,
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: [],
        staleCertificationIds: ["non-runtime:external-deck-construction-rule"],
      },
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      parseStatus: "complete",
      status: "unsupported",
    });
    expect(index.entries[0]?.support).toBeUndefined();
    expect(index.entries[0]?.effectDefinition).toBeUndefined();
    expect(index.entries[0]?.effectDefinitionId).toBeUndefined();
    const blockerMessages = (index.entries[0]?.blockers ?? [])
      .filter(
        (blocker) =>
          blocker.code === "unsupported-primitive" &&
          blocker.component ===
            "external-deck-rule-category-cost-gte-in-your-deck",
      )
      .map((blocker) => blocker.message);
    expect(
      blockerMessages.some((message) =>
        message.includes(
          "Stale parser certification non-runtime:external-deck-construction-rule",
        ),
      ),
    ).toBe(true);
  });

  it.each([
    {
      cardNumber: "SUP-003F-EVAL-ACTIVATE-MAIN-CHOOSE-ONE",
      effect:
        "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards.",
      expectedParserRuleId:
        "exact:activate-main:once-per-turn:optional-choose-one-trash-self-field-type-or-hand:draw-n:self",
      name: "Activate Main Choose One Optional Trash Draw Candidate",
    },
    {
      cardNumber: "SUP-002E-EVAL-OPTIONAL-TRASH-KO",
      effect:
        "[On Play] You may trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a base cost of 5 or less.",
      expectedParserRuleId:
        "exact:on-play:optional-trash-n-from-hand:ko-up-to-1-opponent-character-base-cost-n-or-less",
      name: "Optional Trash K.O. Candidate",
    },
    {
      cardNumber: "SUP-002F-EVAL-BASE-POWER",
      effect:
        "[Your Turn] If you have 10 or more cards in your trash, set the base power of all of your {Five Elders} type Characters to 7000.",
      expectedParserRuleId:
        "exact:conditional-continuous:condition:base-power:self-character-type:direct",
      name: "Conditional Base Power Candidate",
    },
    {
      cardNumber: "SUP-002G-EVAL-FILTERED-SEARCH",
      effect:
        "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
      expectedParserRuleId:
        "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
      name: "Filtered Top-N Search Candidate",
    },
    {
      cardNumber: "SUP-002G-EVAL-RETURN-DON-SEARCH-TRASH",
      effect:
        "[On Play] DON!! −1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
      expectedParserRuleId:
        "exact:on-play:return-don-top-n-search:any-card:hand:bottom-owner-choice:trash-hand",
      name: "Return DON Search Trash Candidate",
    },
    {
      cardNumber: "SUP-003G-EVAL-START-STAGE",
      effect:
        "at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
      expectedParserRuleId:
        "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck",
      name: "Start Of Game Stage Candidate",
    },
  ])(
    "supplies current parser certification evidence for $cardNumber",
    ({ cardNumber, effect, expectedParserRuleId, name }) => {
      const card = normalizePoneglyphCardDetail({
        ...loadOp03044Fixture(),
        card_number: cardNumber,
        effect,
        name,
      });

      const evaluation = evaluateGeneratedSupportPlayability({
        card,
        cardDataVersion: "2026-05-13",
        effectDefinitionsVersion: "generated-support-v1",
        expectedBehaviorHash: card.behaviorHash,
        expectedSourceTextHash: card.sourceTextHash,
        rulesVersion: "generated-support-v1",
        validateEffectDefinition,
      });

      expect(evaluation).toMatchObject({
        blockers: [],
        parseStatus: "complete",
        playable: true,
        status: "supported",
      });
      expect(evaluation.parserRuleIds).toContain(expectedParserRuleId);
    },
  );

  it("requires activate-main colon/draw parser certification IDs for SUP-003F generated support while evaluator default path remains supported", () => {
    const card = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "SUP-003F-EVAL-CERT-COLON-DRAW",
      effect:
        "[Activate: Main] [Once Per Turn] You may trash 2 of your {Navy} type Characters or 1 card from your hand: Draw 3 cards.",
      name: "Activate Main Certification Colon Draw Candidate",
    });

    const staleIndex = buildGeneratedSupportIndex({
      cards: [
        {
          behaviorHash: card.behaviorHash,
          cardDataVersion: "2026-05-21",
          cardId: card.cardId,
          category: card.category,
          effectDefinitionsVersion: "generated-support-v1",
          printedKeywords: card.printedKeywords,
          rulesVersion: "generated-support-v1",
          sourceText: card.raw.effect ?? "",
          sourceTextHash: card.sourceTextHash,
        },
      ],
      parserCertificationEvidence: {
        currentCertificationIds: [],
        staleCertificationIds: [
          "cost-body-separator:colon",
          "body-action:draw-n",
        ],
      },
      validateEffectDefinition,
    });

    expect(staleIndex.entries[0]).toMatchObject({
      parseStatus: "complete",
      status: "unsupported",
    });
    const staleMessages = (staleIndex.entries[0]?.blockers ?? [])
      .filter((blocker) => blocker.code === "unsupported-primitive")
      .map((blocker) => blocker.message);
    expect(
      staleMessages.some((message) =>
        message.includes(
          "Stale parser certification cost-body-separator:colon",
        ),
      ),
    ).toBe(true);
    expect(
      staleMessages.some((message) =>
        message.includes("Stale parser certification body-action:draw-n"),
      ),
    ).toBe(true);

    const evaluation = evaluateGeneratedSupportPlayability({
      card,
      cardDataVersion: "2026-05-21",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: card.behaviorHash,
      expectedSourceTextHash: card.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });
    expect(evaluation).toMatchObject({
      blockers: [],
      parseStatus: "complete",
      playable: true,
      status: "supported",
    });
  });

  it("classifies external deck-construction text as parsed non-runtime evidence without unparsed-span blockers", () => {
    const card = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "SUP-003E-EVAL",
      effect:
        "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck.",
      name: "SUP-003E non-runtime external deck rule",
    });

    const evaluation = evaluateGeneratedSupportPlayability({
      card,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: card.behaviorHash,
      expectedSourceTextHash: card.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      nonRuntimeEvidence: [
        {
          categoryPlural: "Events",
          comparator: "gte",
          deckScope: "your-deck",
          nonRuntimeClassification: "external-deck-construction-rule",
          normalizedCategory: "event",
          parserRuleId:
            "exact:external-deck-rule:category-cost-gte-in-your-deck",
          threshold: 2,
        },
      ],
      parseStatus: "complete",
      parserRuleIds: [
        "exact:external-deck-rule:category-cost-gte-in-your-deck",
      ],
      playable: false,
      status: "unsupported",
    });
    expect(evaluation.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported-primitive",
          component: "metadata:external-deck-construction-rule",
        }),
      ]),
    );
    expect(evaluation.blockers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unparsed-span" }),
      ]),
    );
  });

  it("preserves external deck-rule non-runtime evidence when mixed with supported runtime lines", () => {
    const card = normalizePoneglyphCardDetail({
      ...loadOp03044Fixture(),
      card_number: "SUP-003E-EVAL-MIXED",
      effect:
        "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck.\n[On Play] Draw 1 card.",
      name: "SUP-003E mixed non-runtime and runtime evidence",
    });

    const evaluation = evaluateGeneratedSupportPlayability({
      card,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      expectedBehaviorHash: card.behaviorHash,
      expectedSourceTextHash: card.sourceTextHash,
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [],
      nonRuntimeEvidence: [
        {
          categoryPlural: "Events",
          comparator: "gte",
          deckScope: "your-deck",
          nonRuntimeClassification: "external-deck-construction-rule",
          normalizedCategory: "event",
          parserRuleId:
            "exact:external-deck-rule:category-cost-gte-in-your-deck",
          threshold: 2,
        },
      ],
      parseStatus: "complete",
      parserRuleIds: [
        "exact:external-deck-rule:category-cost-gte-in-your-deck",
        "exact:on-play:draw-n:self",
        "line-separated-effect-blocks:v1",
      ],
      playable: true,
      status: "supported",
    });
  });
});

function loadOp03044Fixture(): PoneglyphCardDetail {
  const source = readFileSync(
    path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
    "utf8",
  );
  return JSON.parse(source) as PoneglyphCardDetail;
}
