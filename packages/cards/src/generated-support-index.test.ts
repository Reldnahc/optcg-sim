import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnySchema } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type {
  CardId,
  EffectDefinition,
  ResolvedCard,
  VariantKey,
} from "@optcg/types";

import {
  buildGeneratedSupportIndex,
  toGeneratedSupportManifestEvidence,
  type EffectDefinitionValidationResult,
} from "./generated-support-index.js";
import { buildMatchCardManifest, validateDecklist } from "./manifest.js";
import { normalizePoneglyphCardDetail } from "./normalization.js";
import { generatedSupportRuntimeCapabilityMatrix } from "./runtime-capability-matrix.js";
import { listAllGeneratedSupportParserCertificationIds } from "./generated-support-types.js";

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
const parserCertificationEvidence = {
  currentCertificationIds: listAllGeneratedSupportParserCertificationIds(),
} as const;

const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId: "CARD-008C-001" as CardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceText: "[On Play] Draw 1 card.",
  sourceTextHash: "sha256:source",
};

describe("generated support index", () => {
  it("supports checked-in OP03-044 Kaya fixture via certified parser and runtime capability evidence", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
        "utf8",
      ),
    ) as unknown;
    const normalized = normalizePoneglyphCardDetail(fixture);
    const sourceText = normalized.effectText ?? "";

    const index = buildGeneratedSupportIndex({
      cards: [
        {
          behaviorHash: normalized.behaviorHash,
          cardDataVersion: "cards-v1",
          cardId: normalized.cardId,
          effectDefinitionsVersion: "effects-v1",
          rulesVersion: "rules-v1",
          sourceText,
          sourceTextHash: normalized.sourceTextHash,
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "OP03-044",
      effectDefinitionId: "op03-044.generated-support",
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:draw-n:trash-m:hand:self"],
      status: "supported",
    });
    expect(index.entries[0]?.capabilityEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "effect:sequence:ordered",
          parserRuleId: "exact:on-play:draw-n:trash-m:hand:self",
        }),
        expect.objectContaining({
          capabilityId:
            "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
          parserRuleId: "exact:on-play:draw-n:trash-m:hand:self",
        }),
      ]),
    );
  });

  it("supports standalone Blocker keyword text with runtime capability evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          category: "character",
          cardId: "CARD-012-001" as CardId,
          printedKeywords: ["blocker"],
          sourceText: "[Blocker]",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "CARD-012-001",
      parseStatus: "complete",
      parserRuleIds: ["exact:keyword:blocker:standalone"],
      status: "supported",
    });
    expect(index.entries[0]?.capabilityEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "keyword:blocker:printed",
          parserRuleId: "exact:keyword:blocker:standalone",
        }),
        expect.objectContaining({
          capabilityId: "sourcePresencePolicy:none-for-keyword",
          parserRuleId: "exact:keyword:blocker:standalone",
        }),
      ]),
    );
    expect(index.entries[0]?.support).toMatchObject({
      cardId: "CARD-012-001",
      status: "vanilla-confirmed",
      tested: true,
    });
    expect(index.entries[0]?.effectDefinition).toBeUndefined();
    expect(index.entries[0]?.effectDefinitionId).toBeUndefined();
    expect(index.effectDefinitions).toEqual({});
  });

  it("keeps standalone Blocker unsupported without normalized blocker keyword metadata", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-012-001" as CardId,
          sourceText: "[Blocker]",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          code: "unsupported-primitive",
          message:
            "Normalized card metadata does not satisfy certified Blocker keyword support preconditions.",
        },
      ],
      cardId: "CARD-012-001",
      parseStatus: "unsupportedPrimitive",
      status: "unsupported",
    });
  });

  it("supports EB01-017-shaped Blocker reminder text", () => {
    const sourceText =
      "[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)";
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          category: "character",
          cardId: "EB01-017" as CardId,
          printedKeywords: ["blocker"],
          sourceText,
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "EB01-017",
      parseStatus: "complete",
      parserRuleIds: ["exact:keyword:blocker:standalone"],
      status: "supported",
    });
  });

  it.each([
    {
      cardId: "OP01-025" as CardId,
      expectedCapabilityId: "keyword:rush:printed",
      expectedRuleId: "exact:keyword:rush:standalone",
      printedKeywords: ["rush"] as const,
      sourceText:
        "[Rush] (This card can attack on the turn in which it is played.)",
    },
    {
      cardId: "EB04-011-KEYWORD" as CardId,
      expectedCapabilityId: "keyword:rushCharacter:printed",
      expectedRuleId: "exact:keyword:rush-character:standalone",
      printedKeywords: ["rushCharacter"] as const,
      sourceText:
        "[Rush: Character] (This card can attack Characters on the turn in which it is played.)",
    },
    {
      cardId: "P-028" as CardId,
      expectedCapabilityId: "keyword:doubleAttack:printed",
      expectedRuleId: "exact:keyword:double-attack:standalone",
      printedKeywords: ["doubleAttack"] as const,
      sourceText: "[Double Attack] (This card deals 2 damage.)",
    },
    {
      cardId: "OP04-014" as CardId,
      expectedCapabilityId: "keyword:banish:printed",
      expectedRuleId: "exact:keyword:banish:standalone",
      printedKeywords: ["banish"] as const,
      sourceText:
        "[Banish] (When this card deals damage, the target card is trashed without activating its Trigger.)",
    },
  ])(
    "supports $cardId keyword text with runtime capability evidence",
    ({
      cardId,
      expectedCapabilityId,
      expectedRuleId,
      printedKeywords,
      sourceText,
    }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseCard,
            category: "character",
            cardId,
            printedKeywords,
            sourceText,
          },
        ],
        parserCertificationEvidence,
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        cardId,
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        status: "supported",
        support: {
          cardId,
          status: "vanilla-confirmed",
          tested: true,
        },
      });
      expect(index.entries[0]?.capabilityEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capabilityId: expectedCapabilityId,
            parserRuleId: expectedRuleId,
          }),
          expect.objectContaining({
            capabilityId: "sourcePresencePolicy:none-for-keyword",
            parserRuleId: expectedRuleId,
          }),
        ]),
      );
      expect(index.entries[0]?.effectDefinition).toBeUndefined();
      expect(index.effectDefinitions).toEqual({});
    },
  );

  it.each([
    {
      category: "event" as const,
      expectedLabel: "Rush",
      printedKeywords: ["rush"] as const,
      sourceText: "[Rush]",
    },
    {
      category: "character" as const,
      expectedLabel: "Rush",
      printedKeywords: [] as const,
      sourceText: "[Rush]",
    },
    {
      category: "character" as const,
      expectedLabel: "Rush: Character",
      printedKeywords: ["rush"] as const,
      sourceText: "[Rush: Character]",
    },
    {
      category: "event" as const,
      expectedLabel: "Rush: Character",
      printedKeywords: ["rushCharacter"] as const,
      sourceText: "[Rush: Character]",
    },
    {
      category: "character" as const,
      expectedLabel: "Double Attack",
      printedKeywords: ["rush"] as const,
      sourceText: "[Double Attack]",
    },
    {
      category: "event" as const,
      expectedLabel: "Double Attack",
      printedKeywords: ["doubleAttack"] as const,
      sourceText: "[Double Attack]",
    },
    {
      category: "character" as const,
      expectedLabel: "Banish",
      printedKeywords: ["rush"] as const,
      sourceText: "[Banish]",
    },
    {
      category: "event" as const,
      expectedLabel: "Banish",
      printedKeywords: ["banish"] as const,
      sourceText: "[Banish]",
    },
  ])(
    "keeps certified keyword unsupported when normalized metadata is mismatched (%o)",
    ({ category, expectedLabel, printedKeywords, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [
          {
            ...baseCard,
            category,
            cardId: "CARD-013B-MISMATCH" as CardId,
            printedKeywords,
            sourceText,
          },
        ],
        parserCertificationEvidence,
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [
          {
            code: "unsupported-primitive",
            message: `Normalized card metadata does not satisfy certified ${expectedLabel} keyword support preconditions.`,
          },
        ],
        parseStatus: "unsupportedPrimitive",
        status: "unsupported",
      });
    },
  );

  it("supports EB01-005-shaped empty effect text as vanilla-confirmed without generated EffectDefinition", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          category: "character",
          cardId: "EB01-005" as CardId,
          printedKeywords: [],
          sourceText: "",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "EB01-005",
      parseStatus: "complete",
      parserRuleIds: [],
      status: "supported",
      support: {
        cardId: "EB01-005",
        status: "vanilla-confirmed",
        tested: true,
      },
    });
    expect(index.entries[0]?.effectDefinition).toBeUndefined();
    expect(index.entries[0]?.effectDefinitionId).toBeUndefined();
    expect(index.effectDefinitions).toEqual({});
  });

  it("keeps empty effect text unsupported without normalized vanilla metadata", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "EB01-005" as CardId,
          sourceText: "",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          code: "unsupported-primitive",
          message:
            "Normalized card metadata does not satisfy certified empty-effect support preconditions.",
        },
      ],
      cardId: "EB01-005",
      parseStatus: "unsupportedPrimitive",
      status: "unsupported",
    });
  });

  it("creates supported evidence for exact complete-parse card text", () => {
    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({
      blockers: [],
      capabilityEvidence: [
        {
          capabilityId: "category:auto",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "effect:draw:self:count:positive-safe-integer",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "sourcePresencePolicy:mustRemainInSameZone",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "trigger:onPlay",
          parserRuleId: "exact:on-play:draw-n:self",
        },
      ],
      cardId: baseCard.cardId,
      effectDefinitionId: "card-008c-001.generated-support",
      parserRuleIds: ["exact:on-play:draw-n:self"],
      sourceTextHash: baseCard.sourceTextHash,
      status: "supported",
      support: {
        cardId: baseCard.cardId,
        effectDefinitionId: "card-008c-001.generated-support",
        status: "implemented-dsl",
        tested: true,
      },
    });
    expect(index.effectDefinitions["card-008c-001.generated-support"]).toEqual(
      index.entries[0]?.effectDefinition,
    );
    expect(
      index.effectDefinitions["card-008c-001.generated-support"]?.metadata,
    ).toMatchObject({
      generatedBy: "rule-parser",
      reviewer: "certified-parser-rule:CARD-009B",
      tested: true,
    });
  });

  it("keeps unparsed residue unsupported with blocker evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          sourceText: "[On Play] Draw 1 card. Then rest 1 DON!!.",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Unsupported card text remains after certified parsing.",
        },
      ],
      parserRuleIds: ["exact:on-play:draw-n:self"],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });

  it("keeps missing runtime capability unsupported", () => {
    const matrixWithoutDraw = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "effect:draw:self:count:positive-safe-integer",
      ),
    };

    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      runtimeCapabilityMatrix: matrixWithoutDraw,
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "effect:draw:self:count:positive-safe-integer",
          code: "missing-runtime-capability",
        },
      ],
      missingCapabilityIds: ["effect:draw:self:count:positive-safe-integer"],
      status: "unsupported",
    });
  });

  it("keeps invalid generated DSL unsupported when schema validation fails", () => {
    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      validateEffectDefinition: () => ({
        errors: ["/effects/0/effect/type failed schema validation"],
        valid: false,
      }),
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          code: "invalid-dsl-schema",
          message: "Generated DSL failed effect DSL schema validation.",
        },
      ],
      status: "unsupported",
    });
  });

  it("produces reproducible index output independent of input order", () => {
    const later = {
      ...baseCard,
      cardId: "CARD-008C-002" as CardId,
      sourceTextHash: "sha256:source-2",
    };
    const first = buildGeneratedSupportIndex({
      cards: [later, baseCard],
      parserCertificationEvidence,
      validateEffectDefinition,
    });
    const second = buildGeneratedSupportIndex({
      cards: [baseCard, later],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(first).toEqual(second);
    expect(first.entries.map((entry) => entry.cardId)).toEqual([
      "CARD-008C-001",
      "CARD-008C-002",
    ]);
  });

  it("emits generated support evidence that existing deck validation can consume", () => {
    const index = buildGeneratedSupportIndex({
      cards: [baseCard],
      parserCertificationEvidence,
      validateEffectDefinition,
    });
    const evidence = toGeneratedSupportManifestEvidence(index);
    expect(evidence.generatedSupport[baseCard.cardId]).toMatchObject({
      capabilityEvidence: [
        {
          capabilityId: "category:auto",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "effect:draw:self:count:positive-safe-integer",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "sourcePresencePolicy:mustRemainInSameZone",
          parserRuleId: "exact:on-play:draw-n:self",
        },
        {
          capabilityId: "trigger:onPlay",
          parserRuleId: "exact:on-play:draw-n:self",
        },
      ],
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:draw-n:self"],
      status: "supported",
    });
    const resolvedCard = createResolvedCard(baseCard.cardId, evidence);
    const leader = createVanillaLeader("CARD-008C-L" as CardId);
    const manifest = buildMatchCardManifest({
      cards: [leader, resolvedCard],
      createdAt: "2026-05-12T00:00:00.000Z",
      effectDefinitions: evidence.effectDefinitions,
      source: "manual-test",
      versions: {
        banlistVersion: "banlist-v1",
        cardDataVersion: baseCard.cardDataVersion,
        customHandlerVersion: "handlers-v1",
        effectDefinitionsVersion: baseCard.effectDefinitionsVersion,
        overlayVersion: "overlay-v1",
      },
    });

    const result = validateDecklist({
      deck: [
        { cardId: leader.cardId, quantity: 1 },
        { cardId: baseCard.cardId, quantity: 1 },
      ],
      expectedMainDeckSize: 1,
      format: "standard",
      manifest,
      mode: "ranked",
      overlayVersion: "overlay-v1",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("supports parameterized draw counts for complete parse cards", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-008C-010" as CardId,
          sourceText: "[On Play] Draw 3 cards.",
        },
        {
          ...baseCard,
          cardId: "CARD-008C-011" as CardId,
          sourceText: "[When Attacking] Draw 2 cards.",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries.map((entry) => entry.status)).toEqual([
      "supported",
      "supported",
    ]);
    expect(index.entries[0]?.effectDefinition?.effects[0]?.effect).toEqual({
      count: 3,
      player: "self",
      type: "draw",
    });
    expect(index.entries[1]?.effectDefinition?.effects[0]?.effect).toEqual({
      count: 2,
      player: "self",
      type: "draw",
    });
  });

  it.each([
    {
      cardId: "CARD-009B-010" as CardId,
      expectedRuleId: "exact:on-play:draw-n:trash-m:hand:self",
      sourceText: "[On Play] Draw 2 cards and trash 1 card from your hand.",
    },
    {
      cardId: "CARD-009B-011" as CardId,
      expectedRuleId: "exact:when-attacking:draw-n:trash-m:hand:self",
      sourceText:
        "[When Attacking] Draw 3 cards and trash 2 cards from your hand.",
    },
    {
      cardId: "CARD-009B-012" as CardId,
      expectedRuleId:
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      sourceText:
        "[When Attacking] [Once Per Turn] Draw 4 cards and trash 1 card from your hand.",
    },
  ])(
    "supports generated draw-then-trash template parse and capability evidence ($sourceText)",
    ({ cardId, expectedRuleId, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, cardId, sourceText }],
        parserCertificationEvidence,
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        parseStatus: "complete",
        parserRuleIds: [expectedRuleId],
        status: "supported",
      });
      expect(index.entries[0]?.capabilityEvidence.length).toBeGreaterThan(0);
    },
  );

  it("supports OP10-045 once-per-turn draw-then-trash template via parser+runtime capability evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "OP10-045" as CardId,
          sourceText:
            "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "OP10-045",
      parseStatus: "complete",
      parserRuleIds: [
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ],
      status: "supported",
      support: {
        cardId: "OP10-045",
        effectDefinitionId: "op10-045.generated-support",
        status: "implemented-dsl",
        tested: true,
      },
    });
    expect(index.entries[0]?.capabilityEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "effect:sequence:ordered",
          parserRuleId:
            "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        }),
        expect.objectContaining({
          capabilityId:
            "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
          parserRuleId:
            "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        }),
        expect.objectContaining({
          capabilityId: "trigger:whenAttacking:oncePerTurn",
          parserRuleId:
            "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
        }),
      ]),
    );
  });

  it("supports exact synthetic On Play trash-then-draw text with segment-0 trash capability evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-014C-SYNTHETIC" as CardId,
          sourceText: "[On Play] Trash 2 cards from your hand. Draw 1 card.",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "CARD-014C-SYNTHETIC",
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:trash-2-from-hand:draw-1:self"],
      status: "supported",
      support: {
        cardId: "CARD-014C-SYNTHETIC",
        effectDefinitionId: "card-014c-synthetic.generated-support",
        status: "implemented-dsl",
        tested: true,
      },
    });
    expect(index.entries[0]?.capabilityEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "sequence:trashFromHand:draw",
          parserRuleId: "exact:on-play:trash-2-from-hand:draw-1:self",
        }),
        expect.objectContaining({
          capabilityId: "trashFromHand:segment0:self:self:count-exact",
          parserRuleId: "exact:on-play:trash-2-from-hand:draw-1:self",
        }),
      ]),
    );
  });

  it.each([
    "[On Play] Trash 1 card from your hand and draw 2 cards.",
    "[On Play] Trash 1 card from your hand. Draw 1 card.",
    "[On Play] Trash 2 cards from your hand. Draw 2 cards.",
    "[On Play] You may trash 2 cards from your hand. Draw 1 card.",
    "[On Play] DON!! -1 Trash 2 cards from your hand. Draw 1 card.",
    "[On Play]: Trash 2 cards from your hand. Draw 1 card.",
    "[On Play] Trash 2 cards from your hand. Draw 1 card. Then draw 1 card.",
    "[When Attacking] Draw 2 cards and trash 1 card from your hand. Then draw 1 card.",
  ])(
    "keeps unsupported draw-then-trash near misses blocked (%s)",
    (sourceText) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, cardId: "CARD-009B-099" as CardId, sourceText }],
        parserCertificationEvidence,
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [{ code: "unparsed-span" }],
        parseStatus: "partial",
        status: "unsupported",
      });
    },
  );

  it("keeps exact synthetic trash-then-draw unsupported when segment-0 trash capability is missing", () => {
    const matrixWithoutSegment0Trash = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) =>
          capability.id !== "trashFromHand:segment0:self:self:count-exact",
      ),
    };
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-014C-MISSING-CAPABILITY" as CardId,
          sourceText: "[On Play] Trash 2 cards from your hand. Draw 1 card.",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutSegment0Trash,
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "trashFromHand:segment0:self:self:count-exact",
          code: "missing-runtime-capability",
          component: "on-play-trash-from-hand-then-draw",
        },
      ],
      missingCapabilityIds: ["trashFromHand:segment0:self:self:count-exact"],
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:trash-2-from-hand:draw-1:self"],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });

  it("keeps draw-then-trash unsupported when runtime sequence capability is missing", () => {
    const matrixWithoutSequence = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) => capability.id !== "effect:sequence:ordered",
      ),
    };
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-009B-100" as CardId,
          sourceText:
            "[When Attacking] Draw 2 cards and trash 1 card from your hand.",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutSequence,
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "effect:sequence:ordered",
          code: "missing-runtime-capability",
          component: "when-attacking-draw-then-trash-from-hand",
        },
      ],
      missingCapabilityIds: ["effect:sequence:ordered"],
      parseStatus: "complete",
      parserRuleIds: ["exact:when-attacking:draw-n:trash-m:hand:self"],
      status: "unsupported",
    });
  });

  it("keeps draw-then-trash supported when runtime capability lacks parser-rule evidence", () => {
    const matrixWithoutRuleEvidence = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.map(
        (capability) =>
          capability.id === "effect:sequence:ordered"
            ? { ...capability, supportedParserRuleIds: [] }
            : capability,
      ),
    };
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-009B-101" as CardId,
          sourceText: "[On Play] Draw 2 cards and trash 1 card from your hand.",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutRuleEvidence,
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      missingCapabilityIds: [],
      parseStatus: "complete",
      parserRuleIds: ["exact:on-play:draw-n:trash-m:hand:self"],
      status: "supported",
    });
  });

  it("keeps invalid draw counts unsupported with blocker evidence", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          sourceText: "[On Play] Draw 0 cards.",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          code: "unparsed-span",
          message: "Card text is not covered by certified parser rules.",
          span: {
            end: 23,
            start: 0,
            text: "[On Play] Draw 0 cards.",
          },
        },
      ],
      parseStatus: "partial",
      parserRuleIds: [],
      status: "unsupported",
    });
    expect(index.effectDefinitions).toEqual({});
  });
});

function createResolvedCard(
  cardId: CardId,
  evidence: ReturnType<typeof toGeneratedSupportManifestEvidence>,
): ResolvedCard {
  const support = evidence.support[cardId];
  if (support === undefined) {
    throw new Error(`Missing support for ${String(cardId)}.`);
  }

  return {
    attributes: [],
    behaviorHash: support.behaviorHash,
    cardId,
    category: "character",
    colors: ["red"],
    cost: 1,
    errata: [],
    language: "en",
    legality: {
      standard: { max_copies: 4, status: "legal" },
    },
    name: "Generated Support Test Card",
    officialFaq: [],
    power: 1000,
    printedKeywords: [],
    released: true,
    set: "OP",
    setName: "Test Set",
    sourceTextHash: support.sourceTextHash,
    support,
    types: ["Test"],
    variants: [
      {
        variantIndex: 1,
        variantKey: `${String(cardId)}:v1` as VariantKey,
      },
    ],
  };
}

function createVanillaLeader(cardId: CardId): ResolvedCard {
  const behaviorHash = `sha256:behavior:${String(cardId)}`;
  const sourceTextHash = `sha256:source:${String(cardId)}`;

  return {
    attributes: [],
    behaviorHash,
    cardId,
    category: "leader",
    colors: ["red"],
    errata: [],
    language: "en",
    legality: {
      standard: { max_copies: 1, status: "legal" },
    },
    name: "Generated Support Test Leader",
    officialFaq: [],
    printedKeywords: [],
    released: true,
    set: "OP",
    setName: "Test Set",
    sourceTextHash,
    support: {
      behaviorHash,
      cardDataVersion: baseCard.cardDataVersion,
      cardId,
      rulesVersion: baseCard.rulesVersion,
      sourceTextHash,
      status: "vanilla-confirmed",
      tested: true,
    },
    types: ["Test"],
    variants: [
      {
        variantIndex: 1,
        variantKey: `${String(cardId)}:v1` as VariantKey,
      },
    ],
  };
}
