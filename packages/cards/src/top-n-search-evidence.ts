import type { GeneratedSupportComponentEvidenceInventoryEntry } from "./generated-support-types.js";
import type { RuntimeCapabilityRecord } from "./runtime-capability-matrix.js";
import {
  returnDonTopNAnyCardSearchTrashParserRuleId,
  topNAnyCardSearchParserRuleId,
  topNFilteredSearchParserRuleId,
} from "./top-n-search-components.js";

export const topNSearchParserRuleIds = [
  topNAnyCardSearchParserRuleId,
  topNFilteredSearchParserRuleId,
  returnDonTopNAnyCardSearchTrashParserRuleId,
] as const;

export const topNFilteredSearchParserCertificationIds = [
  "wrapper:on-play",
  "target-owner:self",
  "target-zone:deck",
  "target-object-kind:card",
  "search-window:top-n",
  "visibility:selected-card:both-players",
  "cardinality:up-to-one",
  "filter:type",
  "filter:optional-color",
  "filter:optional-name-exclusion",
  "destination:add-selected-to-hand",
  "ordering:remainder-bottom-owner-choice",
  "composition:filtered-top-n-search",
] as const;

export const topNAnyCardSearchParserCertificationIds = [
  "wrapper:on-play",
  "target-owner:self",
  "target-zone:deck",
  "target-object-kind:card",
  "search-window:top-n",
  "visibility:selected-card:chooser-only",
  "cardinality:up-to-one",
  "filter:any-card-empty",
  "destination:add-selected-to-hand",
  "ordering:remainder-bottom-owner-choice",
  "composition:any-card-top-n-search",
] as const;

export const returnDonTopNAnyCardSearchTrashParserCertificationIds = [
  ...topNAnyCardSearchParserCertificationIds,
  "cost:return-don:self:count-exact",
  "effect:trash-from-hand:self:count-positive",
  "composition:return-don-any-card-search-trash-hand",
] as const;

export const topNSearchParserCertificationIds = [
  ...topNFilteredSearchParserCertificationIds,
  ...returnDonTopNAnyCardSearchTrashParserCertificationIds,
] as const;

const topNSearchBaseComponents = [
  "wrapper",
  "body-action",
  "cardinality",
  "target",
  "chooser",
  "source-presence-policy",
  "schema-gate",
  "runtime-capability-gate",
  "source-integrity-gate",
  "generated-support-metadata-gate",
] as const;

const topNSearchBaseGates = {
  generatedSupportMetadata: ["generated-support-metadata-required"],
  runtimeCapability: ["runtime-capability-matrix-v1"],
  schema: ["effect-definition-schema-v1"],
  sourceIntegrity: ["source-text-hash-current", "behavior-hash-current"],
} as const;

export const topNSearchComponentEvidenceInventoryEntries = [
  {
    components: topNSearchBaseComponents,
    gates: topNSearchBaseGates,
    parserRuleId: topNFilteredSearchParserRuleId,
    parserCertificationIds: topNFilteredSearchParserCertificationIds,
    runtimeCapabilityIds: [
      "category:auto",
      "trigger:onPlay",
      "sourcePresencePolicy:mustRemainInSameZone",
      "effect:search:self:deck:lookCount-positive:max1:hand",
      "searchFilter:categories-colorsAny-typesAny-nameNot",
      "searchReveal:selected:bothPlayers",
      "searchHiddenInfo:unselected-candidates-private",
      "searchRemainder:deck-bottom:ownerChoice",
    ],
    shapeId: "on-play-top-n-filtered-search",
  },
  {
    components: topNSearchBaseComponents,
    gates: topNSearchBaseGates,
    parserRuleId: topNAnyCardSearchParserRuleId,
    parserCertificationIds: topNAnyCardSearchParserCertificationIds,
    runtimeCapabilityIds: [
      "category:auto",
      "trigger:onPlay",
      "sourcePresencePolicy:mustRemainInSameZone",
      "effect:search:self:deck:lookCount-positive:max1:hand",
      "searchFilter:any-card-empty",
      "searchReveal:selected:chooserOnly",
      "searchHiddenInfo:unselected-candidates-private",
      "searchRemainder:deck-bottom:ownerChoice",
    ],
    shapeId: "on-play-top-n-any-card-search",
  },
  {
    components: [
      "wrapper",
      "sequence",
      "cost",
      "body-action",
      "cardinality",
      "chooser",
      "source-presence-policy",
      "schema-gate",
      "runtime-capability-gate",
      "source-integrity-gate",
      "generated-support-metadata-gate",
    ],
    gates: {
      ...topNSearchBaseGates,
      schema: ["effect-definition-schema-v1", "sequenced-effect-schema-v1"],
    },
    parserRuleId: returnDonTopNAnyCardSearchTrashParserRuleId,
    parserCertificationIds:
      returnDonTopNAnyCardSearchTrashParserCertificationIds,
    runtimeCapabilityIds: [
      "category:auto",
      "trigger:onPlay",
      "sourcePresencePolicy:mustRemainInSameZone",
      "effect:search:self:deck:lookCount-positive:max1:hand",
      "searchFilter:any-card-empty",
      "searchReveal:selected:chooserOnly",
      "searchHiddenInfo:unselected-candidates-private",
      "searchRemainder:deck-bottom:ownerChoice",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sequence:genericFrames",
    ],
    shapeId: "on-play-return-don-top-n-any-card-search-trash-from-hand",
  },
] as const satisfies readonly GeneratedSupportComponentEvidenceInventoryEntry[];

export const topNSearchRuntimeCapabilityRecords = [
  {
    description:
      "Search can look at a positive top-deck window for self, choose up to one card, and add the selected card to hand.",
    id: "effect:search:self:deck:lookCount-positive:max1:hand",
    kind: "effect",
    sinceStory: "SUP-002D",
    supported: true,
    supportedParserRuleIds: [
      topNFilteredSearchParserRuleId,
      topNAnyCardSearchParserRuleId,
      returnDonTopNAnyCardSearchTrashParserRuleId,
    ],
  },
  {
    description:
      "Top-deck search filters may be empty for any-card add-to-hand wording.",
    id: "searchFilter:any-card-empty",
    kind: "target",
    sinceStory: "SUP-002D",
    supported: true,
    supportedParserRuleIds: [
      topNAnyCardSearchParserRuleId,
      returnDonTopNAnyCardSearchTrashParserRuleId,
    ],
  },
  {
    description:
      "Top-deck search filters may compose color, type, and name-exclusion primitives.",
    id: "searchFilter:categories-colorsAny-typesAny-nameNot",
    kind: "target",
    sinceStory: "SUP-002D",
    supported: true,
    supportedParserRuleIds: [topNFilteredSearchParserRuleId],
  },
  {
    description:
      "Unselected top-deck search candidates remain private hidden information.",
    id: "searchHiddenInfo:unselected-candidates-private",
    kind: "decision",
    sinceStory: "SUP-002D",
    supported: true,
    supportedParserRuleIds: [
      topNFilteredSearchParserRuleId,
      topNAnyCardSearchParserRuleId,
      returnDonTopNAnyCardSearchTrashParserRuleId,
    ],
  },
  {
    description:
      "Top-deck search remainder cards can be placed on the bottom of deck in owner-chosen order.",
    id: "searchRemainder:deck-bottom:ownerChoice",
    kind: "effect",
    sinceStory: "SUP-002D",
    supported: true,
    supportedParserRuleIds: [
      topNFilteredSearchParserRuleId,
      topNAnyCardSearchParserRuleId,
      returnDonTopNAnyCardSearchTrashParserRuleId,
    ],
  },
  {
    description:
      "Search selected-card visibility can reveal the selected card to both players.",
    id: "searchReveal:selected:bothPlayers",
    kind: "decision",
    sinceStory: "SUP-002D",
    supported: true,
    supportedParserRuleIds: [topNFilteredSearchParserRuleId],
  },
  {
    description:
      "Search selected-card visibility can remain chooser-only for non-reveal wording.",
    id: "searchReveal:selected:chooserOnly",
    kind: "decision",
    sinceStory: "SUP-002D",
    supported: true,
    supportedParserRuleIds: [
      topNAnyCardSearchParserRuleId,
      returnDonTopNAnyCardSearchTrashParserRuleId,
    ],
  },
] as const satisfies readonly RuntimeCapabilityRecord[];
