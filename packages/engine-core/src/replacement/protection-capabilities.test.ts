import assert from "node:assert/strict";
import { test } from "vitest";
import type { Protection } from "@optcg/types";

import {
  getUnsupportedProtectionReason,
  isSupportedProtection,
} from "./protection-capabilities.js";

const supportedFieldRemovalProtection = {
  process: "fieldRemoval",
  fieldRemoval: {
    processFamily: "fieldRemoval",
    classification: "moveFromFieldToTrash",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    targetScope: "thisCard",
    exclusions: {
      battleKO: "excluded",
      ruleProcessTrash: "excluded",
      controllerCost: "excluded",
      controllerOwnedEffect: "excluded",
      ambiguousCustomRemoval: "failClosed",
    },
  },
} satisfies Protection;

test("protection capability classifier accepts supported protection families", () => {
  assert.equal(isSupportedProtection(supportedFieldRemovalProtection), true);
  assert.equal(
    isSupportedProtection({
      process: "rest",
      sourceKind: "cardEffect",
      sourceControllerRelation: "opponentControlled",
      sourceCardCategories: ["character"],
    }),
    true,
  );
  assert.equal(
    isSupportedProtection({
      process: "ko",
      sourceKind: "battle",
      sourceControllerRelation: "opponentControlled",
    }),
    true,
  );
});

test("protection capability classifier reports unsupported family reasons", () => {
  assert.equal(
    getUnsupportedProtectionReason({
      ...supportedFieldRemovalProtection,
      fieldRemoval: {
        ...supportedFieldRemovalProtection.fieldRemoval,
        sourceKind: "battle",
      },
    }),
    "malformed-field-removal-protection",
  );
  assert.equal(
    getUnsupportedProtectionReason({ process: "damage" }),
    "unsupported-protection-shape",
  );
});
