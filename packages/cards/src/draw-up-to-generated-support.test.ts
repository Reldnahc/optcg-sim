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
  type RuntimeCapabilityMatrix,
  type RuntimeCapabilityRecord,
} from "./runtime-capability-matrix.js";

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

const drawUpToCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId: "CARD-014D-001" as CardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceText: "[On Play] Draw up to 2 cards.",
  sourceTextHash: "sha256:draw-up-to-source",
};

describe("draw-up-to generated support", () => {
  it("creates supported evidence for exact On Play draw-up-to card text", () => {
    const index = buildGeneratedSupportIndex({
      cards: [drawUpToCard],
      validateEffectDefinition,
    });

    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({
      blockers: [],
      capabilityEvidence: [
        {
          capabilityId: "category:auto",
          parserRuleId: "exact:on-play:draw-up-to-n:self",
        },
        {
          capabilityId: "drawUpTo:self:chooseQuantity",
          parserRuleId: "exact:on-play:draw-up-to-n:self",
        },
        {
          capabilityId: "sourcePresencePolicy:mustRemainInSameZone",
          parserRuleId: "exact:on-play:draw-up-to-n:self",
        },
        {
          capabilityId: "trigger:onPlay",
          parserRuleId: "exact:on-play:draw-up-to-n:self",
        },
      ],
      cardId: drawUpToCard.cardId,
      effectDefinitionId: "card-014d-001.generated-support",
      parserRuleIds: ["exact:on-play:draw-up-to-n:self"],
      sourceTextHash: drawUpToCard.sourceTextHash,
      status: "supported",
      support: {
        cardId: drawUpToCard.cardId,
        effectDefinitionId: "card-014d-001.generated-support",
        status: "implemented-dsl",
        tested: true,
      },
    });
    expect(index.entries[0]?.effectDefinition?.effects).toEqual([
      {
        category: "auto",
        effect: { count: 2, player: "self", type: "drawUpTo" },
        id: "CARD-014D-001:auto-on-play-draw-up-to-2",
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      },
    ]);
  });

  it.each([
    {
      capabilityId: "drawUpTo:self:chooseQuantity",
      expectedMissingCapabilityIds: ["drawUpTo:self:chooseQuantity"],
      name: "chooseQuantity-backed drawUpTo capability",
      replacementCapability: undefined,
    },
    {
      capabilityId: "drawUpTo:self:chooseQuantity",
      expectedMissingCapabilityIds: ["drawUpTo:self:chooseQuantity"],
      name: "card-selection substitute capability",
      replacementCapability: {
        description:
          "Unsupported substitute that selects cards instead of choosing a draw quantity.",
        id: "selectCards:deck:self:up-to-n",
        kind: "decision",
        sinceStory: "CARD-014D",
        supported: true,
        supportedParserRuleIds: ["exact:on-play:draw-up-to-n:self"],
      } satisfies RuntimeCapabilityRecord,
    },
    {
      capabilityId: "sourcePresencePolicy:mustRemainInSameZone",
      expectedMissingCapabilityIds: [
        "sourcePresencePolicy:mustRemainInSameZone",
      ],
      name: "must-remain source policy capability",
      replacementCapability: undefined,
    },
  ])(
    "keeps draw-up-to text unsupported without $name",
    ({ capabilityId, expectedMissingCapabilityIds, replacementCapability }) => {
      const replacementCapabilities =
        replacementCapability === undefined ? [] : [replacementCapability];
      const matrix: RuntimeCapabilityMatrix = {
        ...generatedSupportRuntimeCapabilityMatrix,
        capabilities: [
          ...generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
            (capability) => capability.id !== capabilityId,
          ),
          ...replacementCapabilities,
        ],
      };

      const index = buildGeneratedSupportIndex({
        cards: [drawUpToCard],
        runtimeCapabilityMatrix: matrix,
        validateEffectDefinition,
      });

      expect(index.entries[0]).toMatchObject({
        blockers: expectedMissingCapabilityIds.map((missingCapabilityId) => ({
          capabilityId: missingCapabilityId,
          code: "missing-runtime-capability",
          component: "exact:on-play:draw-up-to-n:self",
        })),
        missingCapabilityIds: expectedMissingCapabilityIds,
        parserRuleIds: ["exact:on-play:draw-up-to-n:self"],
        status: "unsupported",
      });
    },
  );
});
