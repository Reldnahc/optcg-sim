export const donMinusDrawComponentEvidenceInventoryEntry = {
  components: [
    "wrapper",
    "cost",
    "body-action",
    "source-presence-policy",
    "schema-gate",
    "runtime-capability-gate",
    "source-integrity-gate",
    "generated-support-metadata-gate",
  ],
  gates: {
    generatedSupportMetadata: ["generated-support-metadata-required"],
    runtimeCapability: ["runtime-capability-matrix-v1"],
    schema: ["effect-definition-schema-v1"],
    sourceIntegrity: ["source-text-hash-current", "behavior-hash-current"],
  },
  parserRuleId: "exact:on-play:return-don-draw-n:self",
  runtimeCapabilityIds: [
    "category:auto",
    "returnDon:cost:self:count-exact",
    "payCost:returnDon:self:count-exact",
    "effect:draw:self:count:positive-safe-integer",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:onPlay",
  ],
  shapeId: "on-play-return-don-then-draw",
} as const;
