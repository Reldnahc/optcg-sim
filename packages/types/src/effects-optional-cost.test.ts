import { expect, test } from "vitest";

import type {
  Effect,
  EffectBlock,
  EffectId,
  OptionalCost,
  OptionalCostSegmentResult,
  PayCostEffect,
  SequencedEffect,
} from "./index.js";

test("TYP-009A composed optional cost clauses use payCost sequence segments", () => {
  const optionalReturnDonCost: OptionalCost = {
    type: "returnDon",
    count: 1,
    chooser: "self",
    optional: true,
  };
  const payOptionalCost: PayCostEffect = {
    type: "payCost",
    cost: optionalReturnDonCost,
  };
  const optionalCostSequence: Effect = {
    type: "sequence",
    effects: [
      {
        id: "optional-return-don",
        connector: "always",
        effect: payOptionalCost,
        saveResultAs: "paidReturnDon",
      },
      {
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  };

  const nonOptionalCost: OptionalCost = {
    type: "restDon",
    count: 1,
    chooser: "self",
    // @ts-expect-error optional cost clauses require literal optional true.
    optional: false,
  };
  const missingOptionalFlag: OptionalCost = {
    type: "returnDon",
    count: 1,
    chooser: "self",
    // @ts-expect-error optional cost clauses require the optional flag.
    optional: undefined,
  };

  expect(optionalCostSequence.type).toBe("sequence");
  expect(payOptionalCost.type).toBe("payCost");
  void nonOptionalCost;
  void missingOptionalFlag;
});

test("SUP-002A optional hand-trash costs are payCost sequence segment costs", () => {
  const optionalTrashFromHandCost: OptionalCost = {
    type: "trashFromHand",
    count: 1,
    chooser: "self",
    filter: { categories: ["character"] },
    optional: true,
  };
  const optionalHandTrashSegment: SequencedEffect = {
    id: "optional-trash-from-hand",
    connector: "always",
    saveResultAs: "paidHandTrash",
    effect: {
      type: "payCost",
      cost: optionalTrashFromHandCost,
    },
  };
  const nonOptionalTrashCost: OptionalCost = {
    type: "trashFromHand",
    count: 1,
    chooser: "self",
    // @ts-expect-error optional hand-trash costs require literal optional true.
    optional: false,
  };
  // @ts-expect-error optional hand-trash costs require an explicit chooser.
  const missingChooser: OptionalCost = {
    type: "trashFromHand",
    count: 1,
    optional: true,
  };

  expect(optionalHandTrashSegment.effect.type).toBe("payCost");
  expect(optionalTrashFromHandCost.count).toBe(1);
  void nonOptionalTrashCost;
  void missingChooser;
});

test("TYP-009A payCost is not authorable as a top-level effect", () => {
  const optionalReturnDonCost: OptionalCost = {
    type: "returnDon",
    count: 1,
    chooser: "self",
    optional: true,
  };
  const topLevelPayCostEffect: Effect = {
    // @ts-expect-error payCost is only authorable as a sequence segment effect.
    type: "payCost",
    cost: optionalReturnDonCost,
  };
  const topLevelPayCostBlock: EffectBlock = {
    id: "pay-cost-top-level" as EffectId,
    category: "activate",
    trigger: { type: "activateMain" },
    effect: {
      // @ts-expect-error payCost is only authorable inside sequence segments.
      type: "payCost",
      cost: optionalReturnDonCost,
    },
  };

  void topLevelPayCostEffect;
  void topLevelPayCostBlock;
});

test("TYP-009A optional cost segment results distinguish accept decline and failure", () => {
  const accepted: OptionalCostSegmentResult = {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: true,
    playerDeclined: false,
  };
  const declined: OptionalCostSegmentResult = {
    attempted: true,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: true,
  };
  const failedPayment: OptionalCostSegmentResult = {
    attempted: true,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  };

  // @ts-expect-error declined optional costs are not successful cost payment.
  const ambiguousDecline: OptionalCostSegmentResult = {
    attempted: true,
    succeeded: true,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: true,
  };
  // @ts-expect-error failed optional costs do not change canonical state.
  const ambiguousFailure: OptionalCostSegmentResult = {
    attempted: true,
    succeeded: false,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  };

  expect(accepted.paidCost).toBe(true);
  expect(declined.playerDeclined).toBe(true);
  expect(failedPayment.playerDeclined).toBe(false);
  void ambiguousDecline;
  void ambiguousFailure;
});
