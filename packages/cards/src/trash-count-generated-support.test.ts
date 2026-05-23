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

const baseCard = {
  behaviorHash: "sha256:behavior",
  cardDataVersion: "cards-v1",
  cardId: "CARD-021A-TRASH-BASE" as CardId,
  effectDefinitionsVersion: "effects-v1",
  rulesVersion: "rules-v1",
  sourceText: "[On Play] Draw 1 card.",
  sourceTextHash: "sha256:source",
};
const parserCertificationEvidence = {
  currentCertificationIds: listAllGeneratedSupportParserCertificationIds(),
} as const;

describe("trash-count generated support", () => {
  it.each([
    {
      cardId: "CARD-021A-TRASH-EVIDENCE-SELF" as CardId,
      sourceText:
        "[On Play] If you have 2 or more cards in your trash, draw 1 card.",
    },
    {
      cardId: "CARD-021A-TRASH-EVIDENCE-OPPONENT" as CardId,
      sourceText:
        "[On Play] If your opponent has 3 cards in their trash, draw 1 card.",
    },
  ])(
    "records condition:trashCount capability evidence when schema validation allows $cardId",
    ({ cardId, sourceText }) => {
      const index = buildGeneratedSupportIndex({
        cards: [{ ...baseCard, cardId, sourceText }],
        parserCertificationEvidence,
        validateEffectDefinition: () => ({ valid: true }),
      });

      expect(index.entries[0]).toMatchObject({
        blockers: [],
        cardId,
        missingCapabilityIds: [],
        parseStatus: "complete",
        status: "supported",
      });
      expect(index.entries[0]?.capabilityEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capabilityId: "condition:trashCount",
            component: "condition-expression",
          }),
        ]),
      );
    },
  );

  it("keeps trash-count conditional blocks supported when schema validation passes", () => {
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-021A-TRASH-SCHEMA-BLOCKED" as CardId,
          sourceText:
            "[On Play] If you have 2 or more cards in your trash, draw 1 card.",
        },
      ],
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [],
      cardId: "CARD-021A-TRASH-SCHEMA-BLOCKED",
      missingCapabilityIds: [],
      parseStatus: "complete",
      status: "supported",
    });
    expect(index.entries[0]?.capabilityEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "condition:trashCount",
          component: "condition-expression",
        }),
      ]),
    );
  });

  it("fails closed on missing condition:trashCount runtime capability", () => {
    const matrixWithoutTrashCount = {
      ...generatedSupportRuntimeCapabilityMatrix,
      capabilities: generatedSupportRuntimeCapabilityMatrix.capabilities.filter(
        (capability) => capability.id !== "condition:trashCount",
      ),
    };
    const index = buildGeneratedSupportIndex({
      cards: [
        {
          ...baseCard,
          cardId: "CARD-021A-TRASH-SCHEMA-BLOCKED-NO-CAP" as CardId,
          sourceText:
            "[On Play] If your opponent has 3 cards in their trash, draw 1 card.",
        },
      ],
      runtimeCapabilityMatrix: matrixWithoutTrashCount,
      parserCertificationEvidence,
      validateEffectDefinition,
    });

    expect(index.entries[0]).toMatchObject({
      blockers: [
        {
          capabilityId: "condition:trashCount",
          code: "missing-runtime-capability",
          component: "condition-expression",
        },
      ],
      cardId: "CARD-021A-TRASH-SCHEMA-BLOCKED-NO-CAP",
      missingCapabilityIds: ["condition:trashCount"],
      parseStatus: "complete",
      status: "unsupported",
    });
  });
});
