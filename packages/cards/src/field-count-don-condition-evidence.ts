export const fieldCountDonConditionComponentEvidenceInventoryEntry = {
  components: ["condition", "runtime-capability-gate"],
  gates: {
    generatedSupportMetadata: [],
    runtimeCapability: ["runtime-capability-matrix-v1"],
    schema: [],
    sourceIntegrity: [],
  },
  parserCertificationIds: [
    "condition:predicate",
    "condition:comparator-threshold",
    "condition:owner:self-or-opponent",
    "condition:zone:field",
    "condition:filter:category-don",
  ],
  parserRuleId: "condition-component:field-count-don-public",
  runtimeCapabilityIds: ["condition:fieldCount:don:public"],
  shapeId: "condition-field-count-don-public",
} as const;
