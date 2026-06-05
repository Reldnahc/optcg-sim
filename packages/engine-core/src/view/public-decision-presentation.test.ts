import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { PendingDecision, PlayerId } from "@optcg/types";

import { toDecisionId } from "../action-results.js";
import { publicDecisionPresentation } from "./public-decision-presentation.js";

const p1 = "p1" as PlayerId;

const chooseQuantity = (
  prompt: string,
  bounds: { min: number; max: number },
): Extract<PendingDecision, { type: "chooseQuantity" }> => ({
  id: toDecisionId("decision:quantity"),
  type: "chooseQuantity",
  playerId: p1,
  prompt,
  causedBy: { type: "ruleProcess", name: "test" },
  visibility: { type: "private", playerId: p1 },
  mode: "upTo",
  min: bounds.min,
  max: bounds.max,
});

describe("public decision presentation", () => {
  test("zero-to-one move quantity decisions become concrete yes-no questions", () => {
    assert.deepEqual(
      publicDecisionPresentation({
        pending: chooseQuantity(
          "Choose how many cards to move from deck to Life.",
          {
            min: 0,
            max: 1,
          },
        ),
      }),
      {
        title: "Move card",
        instruction: "Do you want to move 1 card from deck to Life?",
      },
    );
  });

  test("zero-to-one draw and reveal quantity decisions become concrete yes-no questions", () => {
    assert.deepEqual(
      publicDecisionPresentation({
        pending: chooseQuantity("Choose how many cards to draw.", {
          min: 0,
          max: 1,
        }),
      }),
      {
        title: "Draw card",
        instruction: "Do you want to draw 1 card?",
      },
    );
    assert.deepEqual(
      publicDecisionPresentation({
        pending: chooseQuantity("Choose how many cards to reveal from Life.", {
          min: 0,
          max: 1,
        }),
      }),
      {
        title: "Reveal card",
        instruction: "Do you want to reveal 1 card from Life?",
      },
    );
  });

  test("larger quantity decisions keep range wording", () => {
    assert.deepEqual(
      publicDecisionPresentation({
        pending: chooseQuantity(
          "Choose how many cards to move from deck to Life.",
          {
            min: 0,
            max: 2,
          },
        ),
      }),
      {
        title: "Choose quantity",
        instruction: "Choose how many cards to move from deck to Life",
      },
    );
  });
});
