import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  DecisionId,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { actionLabel } from "./local-dev-action-labels.js";

const p1 = "p1" as PlayerId;

const payCostState = (
  paymentOptions: NonNullable<GameState["pendingDecision"]> extends infer T
    ? T extends { type: "payCost"; paymentOptions: infer Options }
      ? Options
      : never
    : never,
): GameState =>
  ({
    players: {
      [p1]: {
        playerId: p1,
        hand: [],
        trash: [],
        characters: [],
        costArea: [],
      },
    },
    pendingDecision: {
      id: "decision:payCost:test" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "test" },
      visibility: { type: "private", playerId: p1 },
      cost: { type: "custom", action: "test" },
      paymentOptions,
    },
  }) as unknown as GameState;

const paymentAction = (optionId: string): LegalAction => ({
  type: "respondToDecision",
  decisionId: "decision:payCost:test" as DecisionId,
  response: { type: "payment", optionId },
});

describe("local dev action labels", () => {
  test("labels no-selection life-to-hand costs from payment option structure", () => {
    const state = payCostState([
      {
        id: "moveCards:top",
        type: "moveCards",
        count: 1,
        from: { player: "self", zone: "life", position: "top" },
        to: { player: "self", zone: "hand" },
      },
    ]);

    assert.equal(
      actionLabel(state, paymentAction("moveCards:top")),
      "Add top Life to hand",
    );
  });

  test("labels no-selection deck-top trash costs from payment option structure", () => {
    const state = payCostState([
      {
        id: "moveCards",
        type: "moveCards",
        count: 2,
        from: { player: "self", zone: "deck", position: "top" },
        to: { player: "self", zone: "trash" },
      },
    ]);

    assert.equal(
      actionLabel(state, paymentAction("moveCards")),
      "Trash 2 cards from top of deck",
    );
  });

  test("labels no-selection self costs from payment option structure", () => {
    const state = payCostState([{ id: "restSelf", type: "restSelf" }]);

    assert.equal(
      actionLabel(state, paymentAction("restSelf")),
      "Rest this card",
    );
  });
});
