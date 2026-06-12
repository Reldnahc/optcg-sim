import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  DecisionId,
  InstanceId,
  PlayerId,
  PublicPendingDecision,
  Zone,
} from "@optcg/types";

import {
  createCanonicalDonPaymentActions,
  createCanonicalDonPaymentModalActions,
  autoOptionalCardCostGroup,
  autoPayCostActionIndex,
  cardCostGroupRequiresManualConfirm,
  cardCostPaymentLabel,
  optionalCardCostActionForSelection,
  optionalCardCostActionForInstance,
  optionalCardCostInstanceIds,
  createOptionalCardCostChoice,
  createOptionalCardCostModalActions,
  quickPayActivateMainCostActionIndex,
} from "./payment-decision.js";
import { progressClickSelection } from "./click-selection.js";
import type { OptionalCardCostGroup } from "./payment-decision.js";
import type { ClientActionModel } from "../view-model.js";

const payCostDecision = {
  id: "decision:payCost:sequence:queue-1:0" as DecisionId,
  type: "payCost",
  playerId: "p1" as PlayerId,
  prompt: "Choose whether to pay this optional cost.",
  causedBy: { type: "ruleProcess", name: "privateCausality" },
  presentation: {
    title: "Pay cost",
    instruction: "Choose whether to pay this optional cost",
  },
} satisfies PublicPendingDecision;

describe("optional card-cost interaction", () => {
  test("collapses per-card payCost actions into decline or choose-card options", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-1" as InstanceId],
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-2" as InstanceId],
        },
      },
    ];

    const choice = createOptionalCardCostChoice(payCostDecision, actions);

    assert.deepEqual(choice, {
      decisionId: payCostDecision.id,
      declineActionIndex: 1,
      groups: [
        {
          chooseActionIndex: -5,
          operation: "trash",
          chooseLabel: "Choose card to trash",
          requiredCount: 1,
          cardActions: [
            { instanceIds: ["hand-1"], actionIndex: 2 },
            { instanceIds: ["hand-2"], actionIndex: 3 },
          ],
        },
      ],
    });
    assert.deepEqual(createOptionalCardCostModalActions(choice), [
      { index: 1, type: "respondToDecision", label: "Decline cost" },
      {
        index: -5,
        type: "respondToDecision",
        label: "Choose card to trash",
      },
    ]);
  });

  test("uses dynamic card-cost choose labels for non-trash costs", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Return 1 Character",
        decisionPayment: {
          kind: "cardCost",
          operation: "returnToHand",
          chooseLabel: "Choose Character to return to hand",
          selectedCardInstanceIds: ["character-1" as InstanceId],
        },
      },
    ];

    const choice = createOptionalCardCostChoice(payCostDecision, actions);

    assert.deepEqual(createOptionalCardCostModalActions(choice), [
      { index: 1, type: "respondToDecision", label: "Decline cost" },
      {
        index: -5,
        type: "respondToDecision",
        label: "Choose Character to return to hand",
      },
    ]);
  });

  test("does not collapse non-card or multi-card payment actions", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 2 cards",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: [
            "hand-1" as InstanceId,
            "hand-2" as InstanceId,
          ],
        },
      },
    ];

    assert.equal(
      createOptionalCardCostChoice(payCostDecision, actions),
      undefined,
    );
  });

  test("collapses multi-card same-source payments into one selectable group", () => {
    const source = { zone: "trash" as Zone, playerId: "p1" as PlayerId };
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 2 card",
        decisionPayment: {
          kind: "cardCost",
          operation: "moveCards",
          chooseLabel: "Choose cards from trash",
          selectedCardInstanceIds: [
            "trash-1" as InstanceId,
            "trash-2" as InstanceId,
          ],
          source,
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 2 card",
        decisionPayment: {
          kind: "cardCost",
          operation: "moveCards",
          chooseLabel: "Choose cards from trash",
          selectedCardInstanceIds: [
            "trash-1" as InstanceId,
            "trash-3" as InstanceId,
          ],
          source,
        },
      },
    ];

    const choice = createOptionalCardCostChoice(payCostDecision, actions);
    const group = autoOptionalCardCostGroup(choice);

    assert.deepEqual(optionalCardCostInstanceIds(group), [
      "trash-1",
      "trash-2",
      "trash-3",
    ]);
    assert.ok(group);
    assert.equal(group.requiredCount, 2);
    assert.deepEqual(group.source, source);
  });

  test("collapses returnDon payments into one cost-area selectable group", () => {
    const source = { zone: "costArea" as Zone, playerId: "p1" as PlayerId };
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 2 DON!!",
        decisionPayment: {
          kind: "cardCost",
          operation: "returnDon",
          chooseLabel: "Choose DON!! to return",
          selectedCardInstanceIds: [
            "don-1" as InstanceId,
            "don-2" as InstanceId,
          ],
          source,
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 2 DON!!",
        decisionPayment: {
          kind: "cardCost",
          operation: "returnDon",
          chooseLabel: "Choose DON!! to return",
          selectedCardInstanceIds: [
            "don-1" as InstanceId,
            "don-3" as InstanceId,
          ],
          source,
        },
      },
    ];

    const group = autoOptionalCardCostGroup(
      createOptionalCardCostChoice(payCostDecision, actions),
    );

    assert.deepEqual(group, {
      chooseActionIndex: -5,
      operation: "returnDon",
      chooseLabel: "Choose DON!! to return",
      requiredCount: 2,
      source,
      cardActions: [
        { instanceIds: ["don-1", "don-2"], actionIndex: 2 },
        { instanceIds: ["don-1", "don-3"], actionIndex: 3 },
      ],
    });
  });

  test("collapses reveal-from-hand payments into one selectable hand group", () => {
    const source = { zone: "hand" as Zone, playerId: "p1" as PlayerId };
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Reveal 2 cards from hand",
        decisionPayment: {
          kind: "cardCost",
          operation: "reveal",
          chooseLabel: "Choose card to reveal",
          selectedCardInstanceIds: [
            "hand-1" as InstanceId,
            "hand-2" as InstanceId,
          ],
          source,
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Reveal 2 cards from hand",
        decisionPayment: {
          kind: "cardCost",
          operation: "reveal",
          chooseLabel: "Choose card to reveal",
          selectedCardInstanceIds: [
            "hand-1" as InstanceId,
            "hand-3" as InstanceId,
          ],
          source,
        },
      },
    ];

    const group = autoOptionalCardCostGroup(
      createOptionalCardCostChoice(payCostDecision, actions),
    );

    assert.deepEqual(group, {
      chooseActionIndex: -5,
      operation: "reveal",
      chooseLabel: "Choose card to reveal",
      requiredCount: 2,
      source,
      cardActions: [
        { instanceIds: ["hand-1", "hand-2"], actionIndex: 2 },
        { instanceIds: ["hand-1", "hand-3"], actionIndex: 3 },
      ],
    });
  });

  test("card costs progress from clicked cards and submit when a legal set is complete", () => {
    const source = { zone: "costArea" as Zone, playerId: "p1" as PlayerId };
    const group: OptionalCardCostGroup = {
      chooseActionIndex: -5,
      operation: "returnDon",
      chooseLabel: "Choose DON!! to return",
      requiredCount: 2,
      source,
      cardActions: [
        { instanceIds: ["don-1", "don-2"], actionIndex: 2 },
        { instanceIds: ["don-1", "don-3"], actionIndex: 3 },
      ],
    };

    assert.deepEqual(
      progressClickSelection({
        selectableInstanceIds: optionalCardCostInstanceIds(group),
        selectedInstanceIds: [],
        clickedInstanceId: "don-1",
        completionCount: group.requiredCount,
        isCompleteSelection: (selectedInstanceIds) =>
          optionalCardCostActionForSelection(group, selectedInstanceIds) !==
          undefined,
      }),
      { selectedInstanceIds: ["don-1"], complete: false },
    );
    const progress = progressClickSelection({
      selectableInstanceIds: optionalCardCostInstanceIds(group),
      selectedInstanceIds: ["don-1"],
      clickedInstanceId: "don-3",
      completionCount: group.requiredCount,
      isCompleteSelection: (selectedInstanceIds) =>
        optionalCardCostActionForSelection(group, selectedInstanceIds) !==
        undefined,
    });

    assert.deepEqual(progress, {
      selectedInstanceIds: ["don-1", "don-3"],
      complete: true,
    });
    assert.equal(
      optionalCardCostActionForSelection(group, ["don-1", "don-3"]),
      3,
    );
  });

  test("card costs allow unselecting and ignore illegal completed sets", () => {
    const source = { zone: "costArea" as Zone, playerId: "p1" as PlayerId };
    const group: OptionalCardCostGroup = {
      chooseActionIndex: -5,
      operation: "returnDon",
      chooseLabel: "Choose DON!! to return",
      requiredCount: 2,
      source,
      cardActions: [
        { instanceIds: ["don-1", "don-2"], actionIndex: 2 },
        { instanceIds: ["don-3", "don-4"], actionIndex: 3 },
      ],
    };

    assert.deepEqual(
      progressClickSelection({
        selectableInstanceIds: optionalCardCostInstanceIds(group),
        selectedInstanceIds: ["don-1"],
        clickedInstanceId: "don-1",
        completionCount: group.requiredCount,
        isCompleteSelection: (selectedInstanceIds) =>
          optionalCardCostActionForSelection(group, selectedInstanceIds) !==
          undefined,
      }),
      { selectedInstanceIds: [], complete: false },
    );
    assert.deepEqual(
      progressClickSelection({
        selectableInstanceIds: optionalCardCostInstanceIds(group),
        selectedInstanceIds: ["don-1"],
        clickedInstanceId: "don-3",
        completionCount: group.requiredCount,
        isCompleteSelection: (selectedInstanceIds) =>
          optionalCardCostActionForSelection(group, selectedInstanceIds) !==
          undefined,
      }),
      { selectedInstanceIds: ["don-1"], complete: false },
    );
  });

  test("only ordered trash movement card costs require manual confirmation", () => {
    assert.equal(
      cardCostGroupRequiresManualConfirm({
        operation: "moveCards",
        source: { zone: "trash" as Zone, playerId: "p1" as PlayerId },
      }),
      true,
    );
    assert.equal(
      cardCostGroupRequiresManualConfirm({
        operation: "returnDon",
        source: { zone: "costArea" as Zone, playerId: "p1" as PlayerId },
      }),
      false,
    );
  });

  test("does not collapse mixed payment families", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-1" as InstanceId],
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 1 DON!!",
      },
    ];

    assert.equal(
      createOptionalCardCostChoice(payCostDecision, actions),
      undefined,
    );
  });

  test("combines same-operation card costs with different legal zones into one scoped choice", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-1" as InstanceId],
          source: { zone: "hand" as Zone, playerId: "p1" as PlayerId },
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 1 Character",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose Character to trash",
          selectedCardInstanceIds: ["character-1" as InstanceId],
          source: {
            zone: "characterArea" as Zone,
            playerId: "p1" as PlayerId,
          },
        },
      },
    ];

    const choice = createOptionalCardCostChoice(payCostDecision, actions);
    const trashGroup = autoOptionalCardCostGroup(choice);

    assert.deepEqual(trashGroup?.source, undefined);
    assert.deepEqual(optionalCardCostInstanceIds(trashGroup), [
      "hand-1",
      "character-1",
    ]);
    assert.equal(optionalCardCostActionForInstance(trashGroup, "hand-1"), 2);
    assert.equal(
      optionalCardCostActionForInstance(trashGroup, "character-1"),
      3,
    );
  });

  test("auto-enters card selection when there is only one payment family", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-1" as InstanceId],
        },
      },
    ];

    const choice = createOptionalCardCostChoice(payCostDecision, actions);

    assert.deepEqual(autoOptionalCardCostGroup(choice), {
      chooseActionIndex: -5,
      operation: "trash",
      chooseLabel: "Choose card to trash",
      requiredCount: 1,
      cardActions: [{ instanceIds: ["hand-1"], actionIndex: 2 }],
    });
  });

  test("keeps the payment-family modal when multiple card-cost families exist", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["hand-1" as InstanceId],
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Return 1 Character",
        decisionPayment: {
          kind: "cardCost",
          operation: "returnToHand",
          chooseLabel: "Choose Character to return to hand",
          selectedCardInstanceIds: ["character-1" as InstanceId],
        },
      },
    ];

    const choice = createOptionalCardCostChoice(payCostDecision, actions);

    assert.equal(autoOptionalCardCostGroup(choice), undefined);
  });
});

describe("DON payment interaction", () => {
  test("collapses four legal ways to pay three active DON into one action", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 4, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 5, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 6, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 7, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ];

    assert.deepEqual(createCanonicalDonPaymentActions(actions), [
      { index: 4, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ]);
  });

  test("collapses DON payment combinations while preserving unrelated global actions", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 0, type: "concede", label: "Concede" },
      { index: 4, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 5, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 6, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
      { index: 7, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ];

    assert.deepEqual(createCanonicalDonPaymentActions(actions), [
      { index: 0, type: "concede", label: "Concede" },
      { index: 4, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ]);
  });

  test("collapses global DON payment combinations by response key", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 0, type: "concede", label: "Concede" },
      {
        index: 4,
        type: "respondToDecision",
        label: "Raw payment transport label",
        responseKey: "payment:don:3",
      },
      {
        index: 5,
        type: "respondToDecision",
        label: "Raw payment transport label",
        responseKey: "payment:don:3",
      },
      {
        index: 6,
        type: "respondToDecision",
        label: "Raw payment transport label",
        responseKey: "payment:don:3",
      },
    ];

    assert.deepEqual(createCanonicalDonPaymentActions(actions), [
      { index: 0, type: "concede", label: "Concede" },
      {
        index: 4,
        type: "respondToDecision",
        label: "Raw payment transport label",
        responseKey: "payment:don:3",
      },
    ]);
  });

  test("collapses equivalent DON payment combinations to the first canonical action", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 4, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
      { index: 5, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
      { index: 6, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
    ];

    assert.deepEqual(createCanonicalDonPaymentModalActions(actions), [
      { index: 4, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
    ]);
  });

  test("collapses equivalent DON payment combinations by response key", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 4,
        type: "respondToDecision",
        label: "Raw payment transport label",
        responseKey: "payment:don:4",
      },
      {
        index: 5,
        type: "respondToDecision",
        label: "Raw payment transport label",
        responseKey: "payment:don:4",
      },
      {
        index: 6,
        type: "respondToDecision",
        label: "Raw payment transport label",
        responseKey: "payment:don:4",
      },
    ];

    assert.deepEqual(createCanonicalDonPaymentModalActions(actions), [
      {
        index: 4,
        type: "respondToDecision",
        label: "Raw payment transport label",
        responseKey: "payment:don:4",
      },
    ]);
  });

  test("keeps distinct DON payment counts as distinct canonical actions", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 4, type: "respondToDecision", label: "Pay cost with 2 DON!!" },
      { index: 5, type: "respondToDecision", label: "Pay cost with 2 DON!!" },
      { index: 6, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ];

    assert.deepEqual(createCanonicalDonPaymentModalActions(actions), [
      { index: 4, type: "respondToDecision", label: "Pay cost with 2 DON!!" },
      { index: 6, type: "respondToDecision", label: "Pay cost with 3 DON!!" },
    ]);
  });

  test("does not collapse mixed non-DON payment actions", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 4, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
      { index: 5, type: "respondToDecision", label: "Choose 1 card" },
    ];

    assert.equal(createCanonicalDonPaymentModalActions(actions), undefined);
  });
});

describe("generic no-choice payment interaction", () => {
  test("does not auto-submit optional generic no-choice pay-cost actions", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      { index: 2, type: "respondToDecision", label: "Rest this card" },
    ];

    assert.equal(autoPayCostActionIndex(payCostDecision, actions), undefined);
  });

  test("auto-submits mandatory generic no-choice pay-cost actions without depending on generic labels", () => {
    const actions: readonly ClientActionModel[] = [
      { index: 2, type: "respondToDecision", label: "Rest this card" },
    ];

    assert.equal(autoPayCostActionIndex(payCostDecision, actions), 2);
  });

  test("does not auto-submit specific DON payment choices", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      { index: 2, type: "respondToDecision", label: "Pay cost with 1 DON!!" },
    ];

    assert.equal(autoPayCostActionIndex(payCostDecision, actions), undefined);
  });

  test("does not auto-submit when there is more than one payment action", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      { index: 2, type: "respondToDecision", label: "Rest this card" },
      { index: 3, type: "respondToDecision", label: "Trash this card" },
    ];

    assert.equal(autoPayCostActionIndex(payCostDecision, actions), undefined);
  });
});

describe("quick activate-main payment interaction", () => {
  test("auto-pays a single rest-self cost", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      { index: 2, type: "respondToDecision", label: "Rest this card" },
    ];

    assert.equal(
      quickPayActivateMainCostActionIndex(payCostDecision, actions),
      2,
    );
  });

  test("auto-pays a single trash-self cost", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      { index: 2, type: "respondToDecision", label: "Trash this card" },
    ];

    assert.equal(
      quickPayActivateMainCostActionIndex(payCostDecision, actions),
      2,
    );
  });

  test("auto-pays a single rest-DON cost", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      { index: 2, type: "respondToDecision", label: "Rest 1 DON!!" },
    ];

    assert.equal(
      quickPayActivateMainCostActionIndex(payCostDecision, actions),
      2,
    );
  });

  test("auto-pays a collapsed single-DON payment", () => {
    const actions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 1 DON!!",
        responseKey: "payment:don:1",
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 1 DON!!",
        responseKey: "payment:don:1",
      },
    ];

    assert.equal(
      quickPayActivateMainCostActionIndex(payCostDecision, actions),
      2,
    );
  });

  test("does not auto-pay larger DON costs or ambiguous cost alternatives", () => {
    const largerDonActions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      { index: 2, type: "respondToDecision", label: "Pay cost with 2 DON!!" },
    ];
    const mixedActions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      { index: 2, type: "respondToDecision", label: "Rest this card" },
      { index: 3, type: "respondToDecision", label: "Trash this card" },
    ];

    assert.equal(
      quickPayActivateMainCostActionIndex(payCostDecision, largerDonActions),
      undefined,
    );
    assert.equal(
      quickPayActivateMainCostActionIndex(payCostDecision, mixedActions),
      undefined,
    );
  });
});

describe("card cost payment labels", () => {
  test("formats selected hand trash costs from structured card-cost data", () => {
    const group: OptionalCardCostGroup = {
      chooseActionIndex: -5,
      operation: "trash",
      chooseLabel: "Choose card to trash",
      requiredCount: 2,
      source: { zone: "hand", playerId: "p1" as PlayerId },
      cardActions: [],
    };

    assert.equal(cardCostPaymentLabel(group), "Trash 2 cards from hand");
  });

  test("formats selected trash-to-bottom costs from structured card-cost data", () => {
    const group: OptionalCardCostGroup = {
      chooseActionIndex: -5,
      operation: "moveCards",
      chooseLabel: "Choose cards from trash",
      requiredCount: 2,
      source: { zone: "trash", playerId: "p1" as PlayerId },
      cardActions: [],
    };

    assert.equal(
      cardCostPaymentLabel(group),
      "Place 2 cards from trash at bottom",
    );
  });

  test("formats selected reveal-from-hand costs from structured card-cost data", () => {
    const group: OptionalCardCostGroup = {
      chooseActionIndex: -5,
      operation: "reveal",
      chooseLabel: "Choose card to reveal",
      requiredCount: 2,
      source: { zone: "hand", playerId: "p1" as PlayerId },
      cardActions: [],
    };

    assert.equal(cardCostPaymentLabel(group), "Reveal 2 cards from hand");
  });
});
