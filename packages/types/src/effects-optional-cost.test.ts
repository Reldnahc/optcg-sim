import { expect, test } from "vitest";

import type {
  Cost,
  DecisionId,
  Effect,
  EffectBlock,
  EffectId,
  OptionalCost,
  OptionalCostSegmentResult,
  OptionalPayCostDecision,
  PayCostEffect,
  PayCostDecision,
  PendingDecision,
  PlayerId,
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

test("SUP-003A optional choose-one trash costs are payCost sequence segment costs", () => {
  const optionalChooseOneTrashCost: OptionalCost = {
    type: "chooseOne",
    optional: true,
    options: [
      {
        type: "trashFromHand",
        count: 1,
        chooser: "self",
        optional: true,
      },
      {
        type: "trashFromField",
        count: 1,
        chooser: "self",
        filter: { categories: ["character"], typesAny: ["Straw Hat Crew"] },
        optional: true,
      },
    ],
  };
  const optionalChooseOneSegment: SequencedEffect = {
    id: "optional-choose-one-trash",
    connector: "always",
    saveResultAs: "paidTrashChoice",
    effect: {
      type: "payCost",
      cost: optionalChooseOneTrashCost,
    },
  };

  expect(optionalChooseOneSegment.effect.type).toBe("payCost");
  expect(optionalChooseOneTrashCost.options).toHaveLength(2);
});

test("SUP-003A optional choose-one trash costs reject malformed alternatives", () => {
  const missingAlternativeOptionalFlag: OptionalCost = {
    type: "chooseOne",
    optional: true,
    options: [
      {
        type: "trashFromField",
        count: 1,
        chooser: "self",
        filter: { categories: ["character"], typesAny: ["Straw Hat Crew"] },
        // @ts-expect-error choose-one field-trash alternatives require literal optional true.
        optional: undefined,
      },
      {
        type: "trashFromHand",
        count: 1,
        chooser: "self",
        optional: true,
      },
    ],
  };
  const missingChooser: OptionalCost = {
    type: "chooseOne",
    optional: true,
    options: [
      // @ts-expect-error field-trash alternatives require an explicit chooser.
      {
        type: "trashFromField",
        count: 1,
        filter: { categories: ["character"], typesAny: ["Straw Hat Crew"] },
        optional: true,
      },
      {
        type: "trashFromHand",
        count: 1,
        chooser: "self",
        optional: true,
      },
    ],
  };
  const unsupportedAlternativeFamily: OptionalCost = {
    type: "chooseOne",
    optional: true,
    options: [
      {
        // @ts-expect-error optional choose-one trash costs only support trash alternatives.
        type: "returnDon",
        count: 1,
        chooser: "self",
        optional: true,
      },
      {
        type: "trashFromHand",
        count: 1,
        chooser: "self",
        optional: true,
      },
    ],
  };
  const emptyAlternatives: OptionalCost = {
    type: "chooseOne",
    optional: true,
    // @ts-expect-error optional choose-one trash costs require at least one alternative.
    options: [],
  };

  void missingAlternativeOptionalFlag;
  void missingChooser;
  void unsupportedAlternativeFamily;
  void emptyAlternatives;
});

test("SUP-003A optional choose-one field-trash alternatives stay self scoped and filterable", () => {
  const opponentFieldTrash: OptionalCost = {
    type: "chooseOne",
    optional: true,
    options: [
      // @ts-expect-error field-trash alternatives are scoped to self costs.
      {
        type: "trashFromField",
        count: 1,
        chooser: "opponent",
        filter: { categories: ["character"], typesAny: ["Straw Hat Crew"] },
        optional: true,
      },
    ],
  };
  const namedStageFieldTrash: OptionalCost = {
    type: "chooseOne",
    optional: true,
    options: [
      {
        type: "trashFromField",
        count: 1,
        chooser: "self",
        filter: { categories: ["stage"], names: ["The Ark Noah"] },
        optional: true,
      },
      {
        type: "trashFromHand",
        count: 1,
        chooser: "self",
        filter: { typesAny: ["Fish-Man"] },
        optional: true,
      },
    ],
  };
  const arbitraryCardFilter: OptionalCost = {
    type: "chooseOne",
    optional: true,
    options: [
      {
        type: "trashFromField",
        count: 1,
        chooser: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Straw Hat Crew"],
          colorsAny: ["red"],
        },
        optional: true,
      },
    ],
  };
  const unsupportedFieldZone: OptionalCost = {
    type: "chooseOne",
    optional: true,
    options: [
      {
        type: "trashFromField",
        count: 1,
        chooser: "self",
        filter: { categories: ["character"], typesAny: ["Straw Hat Crew"] },
        optional: true,
        // @ts-expect-error field-trash alternatives do not authorize explicit field zones.
        zone: "stageArea",
      },
    ],
  };

  expect(namedStageFieldTrash.options).toHaveLength(2);
  void opponentFieldTrash;
  void arbitraryCardFilter;
  void unsupportedFieldZone;
});

test("SUP-003A choose-one cost authorability stays payCost optional-cost scoped", () => {
  const standaloneChooseOne: Cost = {
    // @ts-expect-error broad standalone Cost.chooseOne remains planned.
    type: "chooseOne",
    options: [
      { type: "trashFromHand", count: 1, chooser: "self", optional: true },
    ],
    optional: true,
  };
  const standaloneFieldTrash: Cost = {
    // @ts-expect-error standalone non-optional Cost.trashFromField remains planned.
    type: "trashFromField",
    count: 1,
    chooser: "self",
    filter: { categories: ["character"], typesAny: ["Straw Hat Crew"] },
  };
  const optionalChooseOneTrashCost: OptionalCost = {
    type: "chooseOne",
    optional: true,
    options: [
      {
        type: "trashFromHand",
        count: 1,
        chooser: "self",
        optional: true,
      },
      {
        type: "trashFromField",
        count: 1,
        chooser: "self",
        filter: { categories: ["character"], typesAny: ["Straw Hat Crew"] },
        optional: true,
      },
    ],
  };
  const topLevelChooseOnePayCost: Effect = {
    // @ts-expect-error choose-one payCost remains scoped to sequence segments.
    type: "payCost",
    cost: optionalChooseOneTrashCost,
  };
  const optionalChooseOnePayCostDecision: OptionalPayCostDecision = {
    id: "optional-choose-one-decision" as DecisionId,
    type: "payCost",
    playerId: "player-1" as PlayerId,
    prompt: "You may trash 1 Character or 1 card from hand",
    causedBy: { type: "ruleProcess", name: "test" },
    visibility: { type: "public" },
    cost: optionalChooseOneTrashCost,
    paymentOptions: [],
  };
  const broadPayCostDecision: PayCostDecision = {
    id: "broad-pay-cost-decision" as DecisionId,
    type: "payCost",
    playerId: "player-1" as PlayerId,
    prompt: "Pay a broad cost",
    causedBy: { type: "ruleProcess", name: "test" },
    visibility: { type: "public" },
    // @ts-expect-error broad PayCostDecision cost lane must not accept OptionalCost chooseOne.
    cost: optionalChooseOneTrashCost,
    paymentOptions: [],
  };
  const pendingOptionalPayCostDecision: PendingDecision =
    optionalChooseOnePayCostDecision;
  const sequenceWithChooseOneCost: Cost = {
    type: "sequence",
    costs: [
      {
        // @ts-expect-error choose-one costs remain unsupported in Cost.sequence lanes.
        type: "chooseOne",
        options: [
          { type: "trashFromHand", count: 1, chooser: "self", optional: true },
        ],
        optional: true,
      },
    ],
  };
  const optionalActivationIsNotOptionalCost: EffectBlock = {
    id: "optional-activation" as EffectId,
    category: "activate",
    trigger: { type: "activateMain" },
    optional: true,
    effect: {
      type: "draw",
      count: 1,
      player: "self",
    },
  };

  expect(optionalActivationIsNotOptionalCost.optional).toBe(true);
  void standaloneChooseOne;
  void standaloneFieldTrash;
  void topLevelChooseOnePayCost;
  void broadPayCostDecision;
  void pendingOptionalPayCostDecision;
  void sequenceWithChooseOneCost;
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
