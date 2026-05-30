import { strict as assert } from "node:assert";
import { beforeAll, describe, test } from "vitest";
import type { DecisionId, PlayerId } from "@optcg/types";

import {
  createLocalDevMatch,
  getLocalDevSnapshot,
  type DevMatchSetup,
} from "./local-match.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";

const p1 = "p1" as PlayerId;

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

describe("local dev replacement action labels", () => {
  test("replacement decisions expose descriptive modal action labels", () => {
    const match = createLocalDevMatch(structuredClone(premadeSetup));
    match.state.status = { type: "active" };
    match.state.pendingDecision = {
      id: "decision:choose-replacement:test" as DecisionId,
      type: "chooseReplacement",
      playerId: p1,
      prompt: "Choose replacement effect.",
      causedBy: { type: "ruleProcess", name: "test:replacement" },
      visibility: { type: "private", playerId: p1 },
      processId: "process:test:replacement",
      replacementIds: ["replacement:test:life-to-hand"],
      replacementOptions: [
        {
          replacementId: "replacement:test:life-to-hand",
          label: "Add 1 card from Life to hand instead",
        },
      ],
      mandatory: false,
    };

    const labels = getLocalDevSnapshot(match)
      .players[p1]?.actions.filter(
        (action) => action.type === "respondToDecision",
      )
      .map((action) => action.label);

    assert.deepEqual(labels, [
      "Do not replace",
      "Add 1 card from Life to hand instead",
    ]);
  });
});
