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
        "exact:on-play:draw-n:self",
        "exact:when-attacking:draw-n:self",
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
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
        "exact:on-play:draw-n:self",
        "exact:when-attacking:draw-n:self",
        "line-separated-effect-blocks:v1",
      ],
    },
    {
      description:
        "Draw a positive safe-integer number of cards for the source controller.",
      id: "effect:draw:self:count:positive-safe-integer",
      kind: "effect",
      sinceStory: "CARD-009A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:self",
        "exact:when-attacking:draw-n:self",
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ],
    },
    {
      description:
        "Ordered sequence effects are executable by current runtime.",
      id: "effect:sequence:ordered",
      kind: "effect",
      sinceStory: "CARD-009B",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ],
    },
    {
      description:
        "Trash a positive safe-integer number of cards from self hand using owner choice.",
      id: "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      kind: "effect",
      sinceStory: "CARD-009B",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
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
        "exact:on-play:draw-n:self",
        "exact:when-attacking:draw-n:self",
        "exact:on-play:draw-n:trash-m:hand:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ],
    },
    {
      description: "On Play trigger timing is executable by current runtime.",
      id: "trigger:onPlay",
      kind: "trigger",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:on-play:draw-n:self",
        "exact:on-play:draw-n:trash-m:hand:self",
      ],
    },
    {
      description:
        "When Attacking trigger timing is executable by current runtime.",
      id: "trigger:whenAttacking",
      kind: "trigger",
      sinceStory: "CARD-008A",
      supported: true,
      supportedParserRuleIds: [
        "exact:when-attacking:draw-n:self",
        "exact:when-attacking:draw-n:trash-m:hand:self",
      ],
    },
    {
      description:
        "When Attacking once-per-turn trigger timing is executable by current runtime.",
      id: "trigger:whenAttacking:oncePerTurn",
      kind: "trigger",
      sinceStory: "CARD-009B",
      supported: true,
      supportedParserRuleIds: [
        "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
      ],
    },
  ],
  generatedAtStory: "CARD-009B",
  id: "generated-support-runtime-capabilities:v1",
} as const satisfies RuntimeCapabilityMatrix;

export const requiredGeneratedSupportCapabilityIds = [
  "category:auto",
  "composition:line-separated-effect-blocks:v1",
  "effect:draw:self:count:positive-safe-integer",
  "effect:sequence:ordered",
  "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
  "sourcePresencePolicy:mustRemainInSameZone",
  "trigger:onPlay",
  "trigger:whenAttacking",
  "trigger:whenAttacking:oncePerTurn",
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
