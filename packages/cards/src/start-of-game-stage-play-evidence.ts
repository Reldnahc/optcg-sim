import type { GeneratedSupportComponentEvidenceInventoryEntry } from "./generated-support-types.js";
import type { RuntimeCapabilityRecord } from "./runtime-capability-matrix.js";
import { startOfGameTypedStagePlayParserRuleId } from "./start-of-game-stage-play-components.js";

export const startOfGameStagePlayShapeId =
  "start-of-game-play-up-to-one-typed-stage-from-deck";

export const startOfGameStagePlayParserCertificationIds = [
  "wrapper:start-of-game",
  "body-action:play",
  "cardinality:up-to-one",
  "filter:typed-stage",
  "source:self-deck",
  "destination:stage-area",
  "saved-reference:selected-start-of-game",
  "source-presence-policy:must-remain-in-same-zone",
  "composition:start-of-game-stage-search-play-selected",
] as const;

export const startOfGameStagePlayRuntimeCapabilityIds = [
  "category:auto",
  "trigger:startOfGame",
  "startOfGame:setup-before-opening-draw",
  "selectCards:deck:self:stage:typesAny:max1",
  "playSelected:deck:stage:max1:ignoreCost",
  "setupHiddenInfo:deck-candidates:chooserOnly",
  "setupStagePlay:stageArea:replace-existing",
  "sourcePresencePolicy:mustRemainInSameZone",
] as const;

export const startOfGameStagePlayComponentEvidenceInventoryEntry = {
  components: [
    "wrapper",
    "sequence",
    "body-action",
    "cardinality",
    "target",
    "chooser",
    "saved-reference",
    "source-presence-policy",
    "schema-gate",
    "runtime-capability-gate",
    "source-integrity-gate",
    "generated-support-metadata-gate",
  ],
  gates: {
    generatedSupportMetadata: ["generated-support-metadata-required"],
    runtimeCapability: ["runtime-capability-matrix-v1"],
    schema: ["effect-definition-schema-v1", "sequenced-effect-schema-v1"],
    sourceIntegrity: ["source-text-hash-current", "behavior-hash-current"],
  },
  parserCertificationIds: startOfGameStagePlayParserCertificationIds,
  parserRuleId: startOfGameTypedStagePlayParserRuleId,
  runtimeCapabilityIds: startOfGameStagePlayRuntimeCapabilityIds,
  shapeId: startOfGameStagePlayShapeId,
} as const satisfies GeneratedSupportComponentEvidenceInventoryEntry;

export const startOfGameStagePlayRuntimeCapabilityRecords =
  startOfGameStagePlayRuntimeCapabilityIds
    .map(
      (id): RuntimeCapabilityRecord => ({
        description: describeStartOfGameStagePlayCapability(id),
        id,
        kind: toStartOfGameStagePlayCapabilityKind(id),
        sinceStory: "SUP-003D",
        supported: true,
        supportedParserRuleIds: [startOfGameTypedStagePlayParserRuleId],
      }),
    )
    .filter(
      ({ id }) =>
        id !== "category:auto" &&
        id !== "sourcePresencePolicy:mustRemainInSameZone",
    );

function describeStartOfGameStagePlayCapability(id: string): string {
  switch (id) {
    case "category:auto":
      return "Automatic generated effects are executable by current runtime.";
    case "trigger:startOfGame":
      return "Start-of-game generated effects can run during setup.";
    case "startOfGame:setup-before-opening-draw":
      return "Start-of-game setup effects run before opening draw.";
    case "selectCards:deck:self:stage:typesAny:max1":
      return "Setup search can choose up to one typed Stage from self deck.";
    case "playSelected:deck:stage:max1:ignoreCost":
      return "Setup play can play the selected deck Stage without cost.";
    case "setupHiddenInfo:deck-candidates:chooserOnly":
      return "Setup deck candidates remain chooser-only hidden information.";
    case "setupStagePlay:stageArea:replace-existing":
      return "Setup Stage play uses Stage Area placement and replacement rules.";
    case "sourcePresencePolicy:mustRemainInSameZone":
      return "Start-of-game generated setup support requires the source to remain in the same zone.";
    default:
      return "Start-of-game typed Stage play runtime capability.";
  }
}

function toStartOfGameStagePlayCapabilityKind(
  id: string,
): RuntimeCapabilityRecord["kind"] {
  if (id.startsWith("category:")) return "category";
  if (id.startsWith("trigger:")) return "trigger";
  if (id.startsWith("sourcePresencePolicy:")) return "sourcePresencePolicy";
  if (id.startsWith("setupHiddenInfo:")) return "decision";
  if (id.startsWith("selectCards:")) return "decision";
  if (id.startsWith("playSelected:")) return "effect";
  if (id.startsWith("setupStagePlay:")) return "effect";
  return "effect";
}
