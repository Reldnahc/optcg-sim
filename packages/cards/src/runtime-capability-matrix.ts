export type RuntimeCapabilityKind =
  | "category"
  | "composition"
  | "effect"
  | "sourcePresencePolicy"
  | "trigger";

export interface RuntimeCapabilityRecord {
  id: string;
  kind: RuntimeCapabilityKind;
  description: string;
  supported: boolean;
  supportedParserRuleIds: readonly string[];
  sinceStory: string;
}

export interface RuntimeCapabilityMatrix {
  id: string;
  generatedAtStory: string;
  capabilities: readonly RuntimeCapabilityRecord[];
}

export const generatedSupportRuntimeCapabilityMatrix = {
  capabilities: [
    {
      description: "Automatic effect blocks are executable by current runtime.",
      id: "category:auto",
      kind: "category",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-1:self",
        "exact:when-attacking:draw-1:self",
      ],
    },
    {
      description:
        "Certified parser output may compose separate line-separated clauses as independent EffectBlocks.",
      id: "composition:line-separated-effect-blocks:v1",
      kind: "composition",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-1:self",
        "exact:when-attacking:draw-1:self",
        "line-separated-effect-blocks:v1",
      ],
    },
    {
      description: "Draw exactly one card for the source controller.",
      id: "effect:draw:self:count:1",
      kind: "effect",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-1:self",
        "exact:when-attacking:draw-1:self",
      ],
    },
    {
      description:
        "Source must remain in the same zone for generated simple character effects.",
      id: "sourcePresencePolicy:mustRemainInSameZone",
      kind: "sourcePresencePolicy",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-1:self",
        "exact:when-attacking:draw-1:self",
      ],
    },
    {
      description: "On Play trigger timing is executable by current runtime.",
      id: "trigger:onPlay",
      kind: "trigger",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: ["exact:on-play:draw-1:self"],
    },
    {
      description:
        "When Attacking trigger timing is executable by current runtime.",
      id: "trigger:whenAttacking",
      kind: "trigger",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: ["exact:when-attacking:draw-1:self"],
    },
  ],
  generatedAtStory: "CARD-008A",
  id: "generated-support-runtime-capabilities:v1",
} as const satisfies RuntimeCapabilityMatrix;

export const requiredGeneratedSupportCapabilityIds = [
  "category:auto",
  "composition:line-separated-effect-blocks:v1",
  "effect:draw:self:count:1",
  "sourcePresencePolicy:mustRemainInSameZone",
  "trigger:onPlay",
  "trigger:whenAttacking",
] as const;

export function listSupportedRuntimeCapabilityIds(
  matrix: RuntimeCapabilityMatrix = generatedSupportRuntimeCapabilityMatrix,
): readonly string[] {
  return matrix.capabilities
    .filter((capability) => capability.supported)
    .map((capability) => capability.id)
    .sort();
}

export function hasRuntimeCapability(
  capabilityId: string,
  matrix: RuntimeCapabilityMatrix = generatedSupportRuntimeCapabilityMatrix,
): boolean {
  return matrix.capabilities.some(
    (capability) => capability.id === capabilityId && capability.supported,
  );
}
