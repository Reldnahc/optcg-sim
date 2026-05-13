import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition, VariantKey } from "@optcg/types";

import { normalizePoneglyphCardDetail } from "./normalization.js";
import type { EffectDefinitionValidationResult } from "./generated-support-index.js";
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

describe("support evaluator", () => {
  it("evaluates checked-in OP03-044 Kaya fixture as generated-support playable", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
        "utf8",
      ),
    ) as unknown;
    const normalized = normalizePoneglyphCardDetail(fixture);

    expect(normalized.cardId).toBe("OP03-044");
    expect(normalized.category).toBe("character");
    expect(normalized.colors).toEqual(["blue"]);
    expect(normalized.cost).toBe(1);
    expect(normalized.power).toBe(0);
    expect(normalized.counter).toBe(2000);
    expect(normalized.types).toEqual(["East Blue"]);
    expect(normalized.triggerText).toBeUndefined();
    expect(normalized.effectText).toBe(
      "[On Play] Draw 2 cards and trash 2 cards from your hand.",
    );

    const evaluation = evaluateGeneratedSupportPlayability({
      card: normalized,
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(evaluation).toMatchObject({
      blockers: [],
      cardId: "OP03-044",
      effectDefinitionId: "op03-044.generated-support",
      parseStatus: "complete",
      playable: true,
      status: "supported",
      support: {
        cardId: "OP03-044",
        effectDefinitionId: "op03-044.generated-support",
        status: "implemented-dsl",
        tested: true,
      },
    });
    expect(evaluation.effectDefinition).toBeDefined();
    expect(evaluation.capabilityEvidence.length).toBeGreaterThan(0);
  });

  it("returns unsupported with blocker evidence for text that is not fully covered", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
        "utf8",
      ),
    ) as unknown;
    const baseline = normalizePoneglyphCardDetail(fixture);

    const unsupported = evaluateGeneratedSupportPlayability({
      card: {
        ...baseline,
        behaviorHash: "sha256:behavior-unsupported",
        cardId: "CARD-011A-001" as CardId,
        name: "Unsupported Template Candidate",
        sourceTextHash: "sha256:source",
        variants: [
          { variantIndex: 0, variantKey: "CARD-011A-001:v0" as VariantKey },
        ],
        effectText: "[On Play] Draw 1 card. Then rest 1 DON!!.",
      },
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(unsupported.playable).toBe(false);
    expect(unsupported.status).toBe("unsupported");
    expect(unsupported.parseStatus).toBe("partial");
    expect(unsupported.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unparsed-span" }),
      ]),
    );
    expect(unsupported.effectDefinition).toBeUndefined();
    expect(unsupported.support).toBeUndefined();
  });

  it("keeps EB01-023/OP04-014 semantics by requiring generated-support contract evidence", () => {
    const fixture = JSON.parse(
      readFileSync(
        path.join(repoRoot, "fixtures/poneglyph/cards/OP03-044.kaya.json"),
        "utf8",
      ),
    ) as unknown;
    const baseline = normalizePoneglyphCardDetail(fixture);

    const eb01023 = evaluateGeneratedSupportPlayability({
      card: {
        ...baseline,
        behaviorHash: "sha256:eb01-023-behavior",
        cardId: "EB01-023" as CardId,
        effectText: "[On Play] Draw 1 card.",
        sourceTextHash: "sha256:eb01-023-source",
      },
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });
    const op04014 = evaluateGeneratedSupportPlayability({
      card: {
        ...baseline,
        behaviorHash: "sha256:op04-014-behavior",
        cardId: "OP04-014" as CardId,
        effectText: "[Banish]",
        sourceTextHash: "sha256:op04-014-source",
      },
      cardDataVersion: "2026-05-13",
      effectDefinitionsVersion: "generated-support-v1",
      rulesVersion: "generated-support-v1",
      validateEffectDefinition,
    });

    expect(eb01023.playable).toBe(true);
    expect(eb01023.effectDefinitionId).toBe("eb01-023.generated-support");
    expect(op04014.playable).toBe(false);
    expect(op04014.status).toBe("unsupported");
    expect(op04014.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unparsed-span" }),
      ]),
    );
  });
});
