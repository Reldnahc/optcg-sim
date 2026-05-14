import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const typeAuthorityDocPath = path.join(
  repoRoot,
  "docs",
  "contracts",
  "type-authority.md",
);

const requiredFields = [
  "Action.respondToDecision.playerId",
  "PublicCardView.currentPower",
  "BattleState.counterPower",
  "BattleState.damageProcess",
  "TransientCardSet.ownerId",
  "TransientCardSet.controllerId",
  "ReplacementAppliedEventPayload",
  "PublicDecision.processId",
  "PublicDecision.replacementIds",
  "PublicDecision.mandatory",
];

const allowedSpecRefs = new Set([
  "03-game-state-events-decisions.s002",
  "03-game-state-events-decisions.s003",
  "03-game-state-events-decisions.s016",
  "06-visibility-security.s004",
  "06-visibility-security.s007",
  "06-visibility-security.s021",
  "22-v6-implementation-tightening.s006",
  "23-repo-tooling-and-enforcement.s006",
  "23-repo-tooling-and-enforcement.s011",
  "24-story-schema.s016",
  "24-story-schema.s025",
  "24-story-schema.s031",
  "24-story-schema.s032",
]);

function isValidFollowUpStory(value) {
  return (
    value === "TYP-005D" ||
    value === "TYP-005E" ||
    value === "TYP-005F" ||
    value.startsWith("stories/ambiguities/") ||
    value.startsWith("stories/approved/")
  );
}

function extractDispositionJson(doc) {
  const match = doc.match(
    /## Downstream Disposition Record \(TYP-005C\)\n\n```json\n([\s\S]*?)\n```/,
  );
  assert.ok(
    match,
    "type-authority doc must include a `Downstream Disposition Record (TYP-005C)` JSON block",
  );
  return JSON.parse(match[1]);
}

test("downstream disposition record exists and enforces per-field TYP-005C authority evidence", async () => {
  const doc = await readFile(typeAuthorityDocPath, "utf8");
  const record = extractDispositionJson(doc);
  const ambiguityFileCache = new Map();

  assert.equal(record.storyId, "TYP-005C");
  assert.ok(
    Array.isArray(record.dispositions),
    "dispositions must be an array",
  );

  const byField = new Map(
    record.dispositions.map((entry) => [entry.field, entry]),
  );

  for (const field of requiredFields) {
    const disposition = byField.get(field);
    assert.ok(disposition, `missing disposition entry for ${field}`);
    assert.match(
      disposition.disposition,
      /^(canonical_contract_omission|package_drift_or_engine_internal|behavior_ambiguity)$/,
      `invalid disposition for ${field}`,
    );
    assert.equal(typeof disposition.followUpStory, "string");
    assert.ok(
      isValidFollowUpStory(disposition.followUpStory),
      `${field} followUpStory must be TYP-005D/TYP-005E/TYP-005F or a story path`,
    );
    if (disposition.disposition === "behavior_ambiguity") {
      assert.ok(
        disposition.followUpStory.startsWith("stories/ambiguities/") ||
          disposition.followUpStory.startsWith("stories/approved/"),
        `${field} behavior_ambiguity must route to an ambiguity/story path`,
      );
      assert.notEqual(
        disposition.followUpStory,
        "TYP-005D",
        `${field} behavior_ambiguity cannot route directly to TYP-005D`,
      );
      assert.notEqual(
        disposition.followUpStory,
        "TYP-005E",
        `${field} behavior_ambiguity cannot route directly to TYP-005E`,
      );
      assert.notEqual(
        disposition.followUpStory,
        "TYP-005F",
        `${field} behavior_ambiguity cannot route directly to TYP-005F`,
      );
      if (disposition.followUpStory.startsWith("stories/ambiguities/")) {
        const ambiguityPath = path.join(repoRoot, disposition.followUpStory);
        let ambiguityDoc = ambiguityFileCache.get(ambiguityPath);
        if (typeof ambiguityDoc !== "string") {
          ambiguityDoc = await readFile(ambiguityPath, "utf8");
          ambiguityFileCache.set(ambiguityPath, ambiguityDoc);
        }
        assert.ok(
          ambiguityDoc.includes(field),
          `${field} behavior_ambiguity must be explicitly listed in ${disposition.followUpStory}`,
        );
      }
    }
    assert.ok(
      Array.isArray(disposition.specRefs) && disposition.specRefs.length > 0,
      `${field} must include non-empty specRefs`,
    );
    for (const specRef of disposition.specRefs) {
      assert.ok(
        allowedSpecRefs.has(specRef),
        `${field} includes non-authorized spec ref: ${specRef}`,
      );
    }
    for (const requiredTextField of [
      "canonicalShape",
      "packageOrDownstreamShape",
      "downstreamConsumerSummary",
    ]) {
      assert.equal(typeof disposition[requiredTextField], "string");
      assert.ok(
        disposition[requiredTextField].trim().length > 0,
        `${field} must include non-empty ${requiredTextField}`,
      );
    }
  }
});
