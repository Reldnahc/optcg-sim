export const sup001fConditionalModifyPowerComponentEvidenceInventoryEntry = {
  components: [
    "condition",
    "wrapper",
    "modifier",
    "duration",
    "target",
    "chooser",
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
  parserRuleId:
    "exact:when-attacking:conditional:modify-power:choose:this-turn",
  runtimeCapabilityIds: [
    "category:auto",
    "modifyPower:choose:thisTurn",
    "modifyPower:choose:thisTurn:zeroChoiceBranch",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:whenAttacking",
  ],
  shapeId: "when-attacking-conditional-modify-power-choose-this-turn",
} as const;
