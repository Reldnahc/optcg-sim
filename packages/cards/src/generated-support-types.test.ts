import { describe, expect, it } from "vitest";
import type { CardId, EffectDefinition, EffectId } from "@optcg/types";

import {
  buildGeneratedSupportComponentEvidenceSnapshot,
  findGeneratedSupportComponentEvidenceByParserRuleId,
  generatedSupportComponentEvidenceCategories,
  generatedSupportComponentEvidenceInventory,
  listPlannedMissingRuntimeCapabilityIdsForParserRuleId,
  listRequiredRuntimeCapabilityIdsForParserRuleId,
  generatedSupportSchemaGateIds,
  generatedSupportMetadataGateIds,
  generatedSupportRuntimeCapabilityGateIds,
  generatedSupportSourceIntegrityGateIds,
  generatedSupportParserResultStatuses,
  isCompleteGeneratedSupportParseResult,
  listComponentEvidenceIdsForParserRuleIds,
  type GeneratedSupportBlocker,
  type GeneratedSupportComponentEvidenceCategory,
  type GeneratedSupportParserResult,
  type GeneratedSupportUnparsedSpan,
} from "./generated-support-types.js";

const cardId = "CARD-008A-001" as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

const effectDefinition: EffectDefinition = {
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      category: "auto",
      effect: { count: 1, player: "self", type: "draw" },
      id: toEffectId("CARD-008A-001:auto-on-play-draw-1"),
      trigger: { type: "onPlay" },
    },
  ],
  metadata: {
    effectDefinitionsVersion: "generated-support-test",
    generatedBy: "rule-parser",
    reviewer: "certified-parser-rule:CARD-008B",
    rulesVersion: "rules-test",
    sourceTextHash: "sha256:source",
    tested: true,
  },
};

describe("generated support parser result contracts", () => {
  it("enumerates every fail-closed parser outcome required by the spec", () => {
    expect(generatedSupportParserResultStatuses).toEqual([
      "complete",
      "partial",
      "unsupportedPrimitive",
      "ambiguousWording",
      "staleHash",
      "customHandlerRequired",
    ]);
  });

  it("distinguishes complete parse output from every unsupported result", () => {
    const complete = {
      cardId,
      componentEvidenceIds: ["on-play-draw"],
      effectDefinition,
      parserRuleIds: ["exact:on-play:draw-1:self"],
      sourceText: "[On Play] Draw 1 card.",
      sourceTextHash: "sha256:source",
      status: "complete",
    } satisfies GeneratedSupportParserResult;

    const blocker = {
      code: "unparsed-span",
      message: "Unsupported remaining card text.",
      span: { end: 42, start: 27, text: "Then do a thing." },
    } satisfies GeneratedSupportBlocker;

    const partial = {
      blockers: [blocker],
      cardId,
      parsedComponentEvidenceIds: [],
      parsedRuleIds: ["exact:on-play:draw-1:self"],
      sourceText: "[On Play] Draw 1 card. Then do a thing.",
      sourceTextHash: "sha256:source",
      status: "partial",
      unparsedSpans: [blocker.span],
    } satisfies GeneratedSupportParserResult;

    expect(isCompleteGeneratedSupportParseResult(complete)).toBe(true);
    expect(isCompleteGeneratedSupportParseResult(partial)).toBe(false);
  });

  it("records blocker evidence for unsupported primitive, ambiguity, stale hash, and custom handler outcomes", () => {
    const unparsedSpan = {
      end: 25,
      start: 0,
      text: "[Activate: Main] Rest 2 DON!!",
    } satisfies GeneratedSupportUnparsedSpan;

    const results = [
      {
        blockers: [
          {
            code: "unsupported-primitive",
            component: "cost:restDon",
            message: "Generated support cannot certify this cost yet.",
          },
        ],
        cardId,
        sourceText: unparsedSpan.text,
        sourceTextHash: "sha256:source",
        status: "unsupportedPrimitive",
      },
      {
        blockers: [
          {
            code: "ambiguous-wording",
            message: "The target scope is ambiguous.",
            parserRuleId: "candidate:ambiguous-target",
          },
        ],
        cardId,
        sourceText: "K.O. up to 1 of your opponent's Characters.",
        sourceTextHash: "sha256:source",
        status: "ambiguousWording",
      },
      {
        blockers: [
          {
            code: "stale-hash",
            expectedHash: "sha256:old",
            message: "Poneglyph text hash changed.",
            receivedHash: "sha256:new",
          },
        ],
        cardId,
        sourceText: "[On Play] Draw 1 card.",
        sourceTextHash: "sha256:new",
        status: "staleHash",
      },
      {
        blockers: [
          {
            code: "custom-handler-required",
            component: "bespoke-ruling",
            message: "The effect requires reviewed custom handler support.",
          },
        ],
        cardId,
        sourceText: "This card has bespoke behavior.",
        sourceTextHash: "sha256:source",
        status: "customHandlerRequired",
      },
    ] satisfies readonly GeneratedSupportParserResult[];

    expect(results.map((result) => result.status)).toEqual([
      "unsupportedPrimitive",
      "ambiguousWording",
      "staleHash",
      "customHandlerRequired",
    ]);
    expect(results.every((result) => result.blockers.length > 0)).toBe(true);
  });

  it("defines all CARD-017A component evidence categories", () => {
    expect(generatedSupportComponentEvidenceCategories).toEqual([
      "wrapper",
      "body-action",
      "sequence",
      "cost",
      "condition",
      "cardinality",
      "target",
      "chooser",
      "duration",
      "modifier",
      "restriction",
      "saved-reference",
      "source-presence-policy",
      "keyword",
      "schema-gate",
      "runtime-capability-gate",
      "source-integrity-gate",
      "generated-support-metadata-gate",
    ] satisfies readonly GeneratedSupportComponentEvidenceCategory[]);
  });

  it("tracks supported parser-rule inventory with component evidence and gate links", () => {
    expect(generatedSupportComponentEvidenceInventory.length).toBeGreaterThan(
      0,
    );
    expect(
      generatedSupportComponentEvidenceInventory.every(
        (entry) =>
          entry.parserRuleId.length > 0 &&
          entry.shapeId.length > 0 &&
          entry.components.length > 0 &&
          entry.runtimeCapabilityIds.length > 0,
      ),
    ).toBe(true);
  });

  it("resolves component inventory from parser-rule transition IDs", () => {
    const evidence = findGeneratedSupportComponentEvidenceByParserRuleId(
      "exact:on-play:draw-n:self",
    );
    expect(evidence?.shapeId).toBe("on-play-draw");
    expect(
      listRequiredRuntimeCapabilityIdsForParserRuleId(
        "exact:on-play:draw-n:self",
      ),
    ).toContain("effect:draw:self:count:positive-safe-integer");
    expect(
      listPlannedMissingRuntimeCapabilityIdsForParserRuleId(
        "exact:on-play:draw-n:self",
      ),
    ).toEqual([]);
  });

  it("derives component evidence IDs from parser rule IDs", () => {
    expect(
      listComponentEvidenceIdsForParserRuleIds([
        "exact:on-play:draw-n:self",
        "exact:on-play:draw-n:self",
        "line-separated-effect-blocks:v1",
        "unknown:transition-only",
      ]),
    ).toEqual(["line-separated-effect-blocks-composition", "on-play-draw"]);
  });

  it("covers planned generated-support parser rules in migration inventory", () => {
    const parserRuleIds = generatedSupportComponentEvidenceInventory
      .map((entry) => entry.parserRuleId)
      .sort();
    expect(parserRuleIds).toEqual([
      "exact:condition:self-attached-don-count",
      "exact:condition:your-turn",
      "exact:keyword:banish:standalone",
      "exact:keyword:blocker:standalone",
      "exact:keyword:double-attack:standalone",
      "exact:keyword:rush-character:standalone",
      "exact:keyword:rush:standalone",
      "exact:on-play:cannot-attack:all:this-turn",
      "exact:on-play:cannot-attack:choose:this-turn",
      "exact:on-play:cannot-attack:self:this-turn",
      "exact:on-play:cannot-block:all:this-turn",
      "exact:on-play:cannot-block:choose:this-turn",
      "exact:on-play:cannot-block:self:this-turn",
      "exact:on-play:draw-n:self",
      "exact:on-play:draw-n:trash-m:hand:self",
      "exact:on-play:draw-up-to-n:self",
      "exact:on-play:modify-power:all:this-turn",
      "exact:on-play:modify-power:choose:this-turn",
      "exact:on-play:modify-power:self:this-battle",
      "exact:on-play:modify-power:self:this-turn",
      "exact:on-play:optional-effect:draw-1:self",
      "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
      "exact:on-play:select-1-opponent-character-target",
      "exact:on-play:select-1-opponent-character-then-ko-that-character",
      "exact:on-play:trash-2-from-hand:draw-1:self",
      "exact:when-attacking:draw-n:self",
      "exact:when-attacking:draw-n:trash-m:hand:self",
      "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      "line-separated-effect-blocks:v1",
    ]);
  });

  it("keeps CARD-014G choose templates blocked on zero-choice runtime capabilities", () => {
    const blockedRules = [
      {
        missingCapabilityId: "modifyPower:choose:thisTurn:zeroChoiceBranch",
        parserRuleId: "exact:on-play:modify-power:choose:this-turn",
      },
      {
        missingCapabilityId: "cannotAttack:choose:thisTurn:zeroChoiceBranch",
        parserRuleId: "exact:on-play:cannot-attack:choose:this-turn",
      },
      {
        missingCapabilityId: "cannotBlock:choose:thisTurn:zeroChoiceBranch",
        parserRuleId: "exact:on-play:cannot-block:choose:this-turn",
      },
    ] as const;

    for (const blockedRule of blockedRules) {
      const snapshot = buildGeneratedSupportComponentEvidenceSnapshot({
        parserRuleId: blockedRule.parserRuleId,
      });
      expect(snapshot.isSupportReady).toBe(false);
      expect(snapshot.missingRequirements).toContain("runtime-capability-gate");
      expect(snapshot.missingRuntimeCapabilityIds).toContain(
        blockedRule.missingCapabilityId,
      );
      expect(snapshot.runtimeCapabilityIds).toContain(
        blockedRule.missingCapabilityId,
      );
    }
  });

  it("keeps capability links aligned with parser-rule capability requirements for supported inventory entries", () => {
    const byRule = new Map(
      generatedSupportComponentEvidenceInventory.map((entry) => [
        entry.parserRuleId,
        entry.runtimeCapabilityIds,
      ]),
    );

    expect(byRule.get("exact:on-play:trash-2-from-hand:draw-1:self")).toEqual([
      "category:auto",
      "sequence:trashFromHand:draw",
      "effect:sequence:ordered",
      "trashFromHand:segment0:self:self:count-exact",
      "effect:draw:self:count:positive-safe-integer",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sequence:genericFrames",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ]);
    expect(byRule.get("line-separated-effect-blocks:v1")).toEqual([
      "composition:line-separated-effect-blocks:v1",
    ]);
    expect(
      byRule.get("exact:on-play:select-1-opponent-character-target"),
    ).toEqual([
      "category:auto",
      "selectTargets:field:public:character:max1",
      "savedSelectedTargets:producer",
      "sequence:genericFrames",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ]);
    expect(
      byRule.get(
        "exact:on-play:select-1-opponent-character-then-ko-that-character",
      ),
    ).toEqual([
      "category:auto",
      "selectTargets:field:public:character:max1",
      "savedSelectedTargets:producer",
      "savedFieldObject:consumer:generic",
      "effect:ko:saved-field-object:characterArea:public",
      "sequence:genericFrames",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:onPlay",
    ]);
  });

  it("captures all required gate families in the component inventory", () => {
    const gateCatalog = {
      metadata: new Set<string>(),
      runtimeCapability: new Set<string>(),
      schema: new Set<string>(),
      sourceIntegrity: new Set<string>(),
    };
    for (const entry of generatedSupportComponentEvidenceInventory) {
      for (const gate of entry.gates.generatedSupportMetadata) {
        gateCatalog.metadata.add(gate);
      }
      for (const gate of entry.gates.runtimeCapability) {
        gateCatalog.runtimeCapability.add(gate);
      }
      for (const gate of entry.gates.schema) {
        gateCatalog.schema.add(gate);
      }
      for (const gate of entry.gates.sourceIntegrity) {
        gateCatalog.sourceIntegrity.add(gate);
      }
    }

    expect([...gateCatalog.schema].sort()).toEqual(
      [...generatedSupportSchemaGateIds].sort(),
    );
    expect([...gateCatalog.runtimeCapability].sort()).toEqual(
      [...generatedSupportRuntimeCapabilityGateIds].sort(),
    );
    expect([...gateCatalog.sourceIntegrity].sort()).toEqual(
      [...generatedSupportSourceIntegrityGateIds].sort(),
    );
    expect([...gateCatalog.metadata].sort()).toEqual(
      [...generatedSupportMetadataGateIds].sort(),
    );
  });

  it("represents wrapper/body reuse without implying support when required gates are missing", () => {
    const supportedSnapshot = buildGeneratedSupportComponentEvidenceSnapshot({
      parserRuleId: "exact:on-play:draw-n:self",
    });
    expect(supportedSnapshot.isSupportReady).toBe(true);
    expect(supportedSnapshot.missingRequirements).toEqual([]);

    const unsupportedReuseSnapshot =
      buildGeneratedSupportComponentEvidenceSnapshot({
        override: {
          gates: { runtimeCapability: [] },
        },
        parserRuleId: "exact:on-play:draw-n:self",
      });
    expect(unsupportedReuseSnapshot.isSupportReady).toBe(false);
    expect(unsupportedReuseSnapshot.missingRequirements).toContain(
      "runtime-capability-gate",
    );
  });

  it("fails readiness when required base components are removed by override", () => {
    const snapshot = buildGeneratedSupportComponentEvidenceSnapshot({
      override: {
        components: [
          "schema-gate",
          "runtime-capability-gate",
          "source-integrity-gate",
          "generated-support-metadata-gate",
        ],
      },
      parserRuleId: "exact:on-play:draw-n:self",
    });

    expect(snapshot.isSupportReady).toBe(false);
    expect(snapshot.missingRequirements).toEqual(
      expect.arrayContaining([
        "wrapper",
        "body-action",
        "source-presence-policy",
      ]),
    );
  });

  it.each([
    "wrapper",
    "body-action",
    "source-presence-policy",
    "target",
    "duration",
    "modifier",
    "restriction",
    "condition",
    "cost",
    "sequence",
  ] as const)(
    "fails closed when required %s component evidence is removed",
    (removedComponent) => {
      const parserRuleIdByComponent: Record<
        GeneratedSupportComponentEvidenceCategory,
        string
      > = {
        "body-action": "exact:on-play:draw-n:self",
        cardinality: "exact:on-play:draw-up-to-n:self",
        chooser: "exact:on-play:draw-n:trash-m:hand:self",
        condition: "exact:condition:your-turn",
        cost: "exact:on-play:return-don-select-up-to-1-character-from-hand-play-selected",
        duration: "exact:on-play:modify-power:self:this-turn",
        "generated-support-metadata-gate": "exact:on-play:draw-n:self",
        keyword: "exact:keyword:blocker:standalone",
        modifier: "exact:on-play:modify-power:self:this-turn",
        "runtime-capability-gate": "exact:on-play:draw-n:self",
        restriction: "exact:on-play:cannot-attack:self:this-turn",
        "saved-reference":
          "exact:on-play:select-1-opponent-character-then-ko-that-character",
        "schema-gate": "exact:on-play:draw-n:self",
        sequence: "exact:on-play:draw-n:trash-m:hand:self",
        "source-integrity-gate": "exact:on-play:draw-n:self",
        "source-presence-policy": "exact:on-play:draw-n:self",
        target: "exact:on-play:select-1-opponent-character-target",
        wrapper: "exact:on-play:draw-n:self",
      };
      const parserRuleId = parserRuleIdByComponent[removedComponent];
      const base =
        findGeneratedSupportComponentEvidenceByParserRuleId(parserRuleId);
      expect(base).toBeDefined();
      if (base === undefined) {
        throw new Error(`Missing inventory entry for ${parserRuleId}.`);
      }

      const snapshot = buildGeneratedSupportComponentEvidenceSnapshot({
        override: {
          components: base.components.filter(
            (component) => component !== removedComponent,
          ),
        },
        parserRuleId,
      });

      expect(snapshot.isSupportReady).toBe(false);
      expect(snapshot.missingRequirements).toContain(removedComponent);
    },
  );

  it("requires source-presence-policy component when sourcePresencePolicy capability evidence exists", () => {
    const entriesWithSourcePresenceCapability =
      generatedSupportComponentEvidenceInventory.filter((entry) =>
        entry.runtimeCapabilityIds.some((capabilityId) =>
          capabilityId.startsWith("sourcePresencePolicy:"),
        ),
      );

    expect(entriesWithSourcePresenceCapability.length).toBeGreaterThan(0);
    expect(
      entriesWithSourcePresenceCapability.every((entry) =>
        (entry.components as readonly string[]).includes(
          "source-presence-policy",
        ),
      ),
    ).toBe(true);
  });

  it("keeps line-separated composition evidence free of wrapper/body/source-presence components", () => {
    const entry = generatedSupportComponentEvidenceInventory.find(
      (candidate) =>
        candidate.parserRuleId === "line-separated-effect-blocks:v1",
    );
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("Expected line-separated composition entry.");
    }

    const components = entry.components as readonly string[];
    expect(components).not.toContain("wrapper");
    expect(components).not.toContain("body-action");
    expect(components).not.toContain("source-presence-policy");
  });

  it("keeps keyword entries free of wrapper/body-action while retaining keyword/source-presence evidence", () => {
    const keywordEntries = generatedSupportComponentEvidenceInventory.filter(
      (entry) =>
        entry.parserRuleId.startsWith("exact:keyword:") &&
        (entry.runtimeCapabilityIds as readonly string[]).includes(
          "sourcePresencePolicy:none-for-keyword",
        ),
    );
    expect(keywordEntries.length).toBeGreaterThan(0);

    for (const entry of keywordEntries) {
      const components = entry.components as readonly string[];
      expect(components).toContain("keyword");
      expect(components).toContain("source-presence-policy");
      expect(components).not.toContain("wrapper");
      expect(components).not.toContain("body-action");
    }
  });
});
