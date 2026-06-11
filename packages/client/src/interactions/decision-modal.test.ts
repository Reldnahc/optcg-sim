import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  CardRef,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicChooseTriggerOrderDecision,
  PublicChooseQuantityDecision,
  PublicOrderCardsDecision,
  PublicPendingDecision,
  PublicSelectCardsDecision,
  PublicSelectTargetsDecision,
} from "@optcg/types";

import {
  buildDecisionResponse,
  createDecisionDraft,
  createDecisionModalModel,
  getPendingDecisionInteractionMode,
  isDecisionModalSuppressed,
  chooseDecisionTrigger,
  moveOrderedCardNear,
  setOrderedCardsPlacementDestination,
  setDecisionActionOption,
  setDecisionQuantity,
  setDecisionOption,
  selectionDraftIsComplete,
  toggleDecisionSelectedCard,
} from "./decision-modal.js";
import type { ClientActionModel } from "../view-model.js";

const p1 = "p1" as PlayerId;

const cardRef = (id: string): CardRef => ({
  instanceId: id as InstanceId,
  cardId: `CARD-${id}` as CardId,
  playerId: p1,
});

const baseDecision = {
  id: "decision-1" as DecisionId,
  playerId: p1,
  prompt: "Choose cards",
  causedBy: { type: "playerAction", actionId: "action-1" },
  presentation: {
    title: "Choose cards",
    instruction: "Choose cards",
  },
} satisfies Omit<PublicPendingDecision, "type">;

const baseModalPresentation = {
  title: "Choose cards",
  instruction: "Choose cards",
  prompt: "Choose cards",
};

const selectDecision = (): PublicSelectCardsDecision => ({
  ...baseDecision,
  type: "selectCards",
  min: 0,
  max: 1,
  candidates: [{ card: cardRef("1") }, { card: cardRef("2") }],
  choices: [
    { card: cardRef("1"), selectable: true },
    { card: cardRef("2"), selectable: true },
  ],
});

const targetDecision = (): PublicSelectTargetsDecision => ({
  ...baseDecision,
  type: "selectTargets",
  min: 0,
  max: 1,
  candidates: [{ card: cardRef("target-1") }, { card: cardRef("target-2") }],
});

const orderDecision = (): PublicOrderCardsDecision => ({
  ...baseDecision,
  type: "orderCards",
  cards: [cardRef("1"), cardRef("2"), cardRef("3")],
  destination: "deck",
});

const quantityDecision = (): PublicChooseQuantityDecision => ({
  ...baseDecision,
  type: "chooseQuantity",
  mode: "upTo",
  min: 0,
  max: 4,
});

describe("headless decision modal models", () => {
  test("selectCards draft toggles legal candidates and builds a cards response", () => {
    const decision = selectDecision();
    let draft = createDecisionDraft(decision);
    draft = toggleDecisionSelectedCard(decision, draft, "1" as InstanceId);

    const model = createDecisionModalModel(decision, draft);
    const response = buildDecisionResponse(decision, draft);

    assert.equal(model.kind, "selectCards");
    assert.equal(model.title, "Choose 1 card");
    assert.equal(model.canConfirm, true);
    assert.deepEqual(model.selectedInstanceIds, ["1"]);
    assert.deepEqual(response, { type: "cards", cards: [cardRef("1")] });
  });

  test("selectCards modal title reflects multi-card max selections", () => {
    const decision: PublicSelectCardsDecision = {
      ...selectDecision(),
      max: 2,
    };

    const model = createDecisionModalModel(decision);

    assert.equal(model.title, "Choose 2 cards");
  });

  test("selectCards draft ignores unknown candidates and prevents selecting beyond multi-select max", () => {
    const decision: PublicSelectCardsDecision = {
      ...selectDecision(),
      max: 2,
      candidates: [
        { card: cardRef("1") },
        { card: cardRef("2") },
        { card: cardRef("3") },
      ],
      choices: [
        { card: cardRef("1"), selectable: true },
        { card: cardRef("2"), selectable: true },
        { card: cardRef("3"), selectable: true },
      ],
    };
    let draft = createDecisionDraft(decision);
    draft = toggleDecisionSelectedCard(
      decision,
      draft,
      "missing" as InstanceId,
    );
    draft = toggleDecisionSelectedCard(decision, draft, "1" as InstanceId);
    draft = toggleDecisionSelectedCard(decision, draft, "2" as InstanceId);
    draft = toggleDecisionSelectedCard(decision, draft, "3" as InstanceId);

    const model = createDecisionModalModel(decision, draft);

    assert.equal(model.kind, "selectCards");
    assert.deepEqual(model.selectedInstanceIds, ["1", "2"]);
  });

  test("selectCards draft prevents selecting another card from the same different-name group", () => {
    const decision: PublicSelectCardsDecision = {
      ...selectDecision(),
      max: 2,
      candidates: [
        { card: cardRef("1") },
        { card: cardRef("2") },
        { card: cardRef("3") },
      ],
      choices: [
        { card: cardRef("1"), selectable: true },
        { card: cardRef("2"), selectable: true },
        { card: cardRef("3"), selectable: true },
      ],
      selectionConstraint: {
        type: "differentNames",
        groupKeysByInstanceId: {
          "1": "Elder A",
          "2": "Elder A",
          "3": "Elder B",
        },
      },
    };
    let draft = createDecisionDraft(decision);
    draft = toggleDecisionSelectedCard(decision, draft, "1" as InstanceId);
    draft = toggleDecisionSelectedCard(decision, draft, "2" as InstanceId);
    draft = toggleDecisionSelectedCard(decision, draft, "3" as InstanceId);

    const model = createDecisionModalModel(decision, draft);

    assert.equal(model.kind, "selectCards");
    assert.deepEqual(model.selectedInstanceIds, ["1", "3"]);
    assert.deepEqual(
      model.cards.map((choice) => choice.selectable),
      [true, false, true],
    );
  });

  test("selectCards draft replaces the selected card when max is one", () => {
    const decision = selectDecision();
    let draft = createDecisionDraft(decision);
    draft = toggleDecisionSelectedCard(decision, draft, "1" as InstanceId);
    draft = toggleDecisionSelectedCard(decision, draft, "2" as InstanceId);

    const model = createDecisionModalModel(decision, draft);

    assert.equal(model.kind, "selectCards");
    assert.deepEqual(model.selectedInstanceIds, ["2"]);
  });

  test("selectTargets draft builds a targets response", () => {
    const decision = targetDecision();
    const draft = toggleDecisionSelectedCard(
      decision,
      createDecisionDraft(decision),
      "target-2" as InstanceId,
    );

    const model = createDecisionModalModel(decision, draft);
    const response = buildDecisionResponse(decision, draft);

    assert.equal(model.kind, "selectCards");
    assert.equal(model.confirmLabel, "Confirm");
    assert.deepEqual(model.selectedInstanceIds, ["target-2"]);
    assert.deepEqual(response, {
      type: "targets",
      targets: [cardRef("target-2")],
    });
  });

  test("selectTargets draft completes when every visible up-to target is selected", () => {
    const decision: PublicSelectTargetsDecision = {
      ...targetDecision(),
      max: 4,
      candidates: [
        { card: cardRef("target-1") },
        { card: cardRef("target-2") },
      ],
    };
    let draft = createDecisionDraft(decision);
    draft = toggleDecisionSelectedCard(
      decision,
      draft,
      "target-1" as InstanceId,
    );

    assert.equal(selectionDraftIsComplete(decision, draft), false);

    draft = toggleDecisionSelectedCard(
      decision,
      draft,
      "target-2" as InstanceId,
    );

    assert.equal(selectionDraftIsComplete(decision, draft), true);
  });

  test("selectTargets draft does not auto-complete while more visible up-to targets remain", () => {
    const decision: PublicSelectTargetsDecision = {
      ...targetDecision(),
      max: 4,
      candidates: [
        { card: cardRef("target-1") },
        { card: cardRef("target-2") },
        { card: cardRef("target-3") },
      ],
    };
    let draft = createDecisionDraft(decision);
    draft = toggleDecisionSelectedCard(
      decision,
      draft,
      "target-1" as InstanceId,
    );
    draft = toggleDecisionSelectedCard(
      decision,
      draft,
      "target-2" as InstanceId,
    );

    assert.equal(selectionDraftIsComplete(decision, draft), false);
  });

  test("selectCards draft exposes disabled choices and prevents selecting them", () => {
    const decision: PublicSelectCardsDecision = {
      ...selectDecision(),
      candidates: [{ card: cardRef("1") }],
      choices: [
        { card: cardRef("1"), selectable: true },
        { card: cardRef("2"), selectable: false },
      ],
    };
    let draft = createDecisionDraft(decision);
    draft = toggleDecisionSelectedCard(decision, draft, "2" as InstanceId);

    const model = createDecisionModalModel(decision, draft);

    assert.equal(model.kind, "selectCards");
    assert.deepEqual(model.cards, [
      { card: cardRef("1"), selectable: true },
      { card: cardRef("2"), selectable: false },
    ]);
    assert.deepEqual(model.selectedInstanceIds, []);
  });

  test("orderCards draft supports drag-style ordering and builds orderedIds response", () => {
    const decision = orderDecision();
    let draft = createDecisionDraft(decision);
    draft = moveOrderedCardNear(
      decision,
      draft,
      "3" as InstanceId,
      "1" as InstanceId,
      "before",
    );

    const model = createDecisionModalModel(decision, draft);
    const response = buildDecisionResponse(decision, draft);

    assert.equal(model.kind, "orderCards");
    assert.deepEqual(model.orderedInstanceIds, ["3", "1", "2"]);
    assert.deepEqual(response, { type: "orderedIds", ids: ["3", "1", "2"] });
  });

  test("top-or-bottom orderCards draft builds a single-destination top response", () => {
    const decision = {
      ...orderDecision(),
      placement: { type: "topOrBottom" },
    } satisfies PublicOrderCardsDecision;
    let draft = createDecisionDraft(decision);
    draft = moveOrderedCardNear(
      decision,
      draft,
      "3" as InstanceId,
      "1" as InstanceId,
      "before",
    );

    const model = createDecisionModalModel(decision, draft);
    const response = buildDecisionResponse(decision, draft);

    assert.equal(model.kind, "orderCards");
    assert.deepEqual(model.orderedInstanceIds, ["3", "1", "2"]);
    assert.equal(model.placementDestination, "top");
    assert.deepEqual(response, {
      type: "topBottomPlacement",
      topIds: ["3", "1", "2"],
      bottomIds: [],
    });
  });

  test("top-or-bottom orderCards draft builds a single-destination bottom response", () => {
    const decision = {
      ...orderDecision(),
      placement: { type: "topOrBottom" },
    } satisfies PublicOrderCardsDecision;
    let draft = createDecisionDraft(decision);
    draft = moveOrderedCardNear(
      decision,
      draft,
      "3" as InstanceId,
      "1" as InstanceId,
      "before",
    );
    draft = setOrderedCardsPlacementDestination(decision, draft, "bottom");

    const model = createDecisionModalModel(decision, draft);
    const response = buildDecisionResponse(decision, draft);

    assert.equal(model.kind, "orderCards");
    assert.deepEqual(model.orderedInstanceIds, ["3", "1", "2"]);
    assert.equal(model.placementDestination, "bottom");
    assert.deepEqual(response, {
      type: "topBottomPlacement",
      topIds: [],
      bottomIds: ["3", "1", "2"],
    });
  });

  test("chooseTriggerOrder draft uses a card-choice selection for the next trigger", () => {
    const decision = {
      ...baseDecision,
      type: "chooseTriggerOrder",
      choices: [
        { triggerId: "trigger-1", source: cardRef("1") },
        { triggerId: "trigger-2", source: cardRef("2") },
        { triggerId: "trigger-3" },
      ],
    } satisfies PublicChooseTriggerOrderDecision;
    let draft = createDecisionDraft(decision);
    draft = chooseDecisionTrigger(decision, draft, "trigger-3");

    const model = createDecisionModalModel(decision, draft);
    const response = buildDecisionResponse(decision, draft);

    assert.equal(model.kind, "orderTriggers");
    assert.deepEqual(model.orderedTriggerIds, ["trigger-3"]);
    assert.equal(model.confirmLabel, "Confirm");
    assert.deepEqual(
      model.choices.map((choice) => ({
        triggerId: choice.triggerId,
        selected: choice.selected,
        orderIndex: choice.orderIndex,
      })),
      [
        { triggerId: "trigger-1", selected: false, orderIndex: undefined },
        { triggerId: "trigger-2", selected: false, orderIndex: undefined },
        { triggerId: "trigger-3", selected: true, orderIndex: 0 },
      ],
    );
    assert.deepEqual(response, { type: "orderedIds", ids: ["trigger-3"] });
  });

  test("chooseQuantity draft builds a quantity response only inside bounds", () => {
    const decision = quantityDecision();
    const draft = setDecisionQuantity(createDecisionDraft(decision), 3);

    const model = createDecisionModalModel(decision, draft);
    const response = buildDecisionResponse(decision, draft);

    assert.equal(model.kind, "chooseQuantity");
    assert.equal(model.quantity, 3);
    assert.equal(model.canConfirm, true);
    assert.deepEqual(response, { type: "chooseQuantity", quantity: 3 });
  });

  test("zero-to-one chooseQuantity decisions render as yes-no choices", () => {
    const decision = {
      ...quantityDecision(),
      presentation: {
        title: "Move card",
        instruction: "Do you want to move 1 card from deck to Life?",
      },
      prompt: "Choose how many cards to move from deck to Life.",
      max: 1,
    } satisfies PublicChooseQuantityDecision;
    let draft = createDecisionDraft(decision);
    let model = createDecisionModalModel(decision, draft);

    assert.equal(model.kind, "binaryQuantity");
    assert.equal(model.title, "Move card");
    assert.equal(
      model.instruction,
      "Do you want to move 1 card from deck to Life?",
    );
    assert.equal(
      model.prompt,
      "Choose how many cards to move from deck to Life.",
    );
    assert.equal(model.selectedQuantity, 1);
    assert.deepEqual(model.options, [
      { quantity: 0, label: "No" },
      { quantity: 1, label: "Yes" },
    ]);

    draft = setDecisionQuantity(draft, 0);
    model = createDecisionModalModel(decision, draft);
    const response = buildDecisionResponse(decision, draft);

    assert.equal(model.kind, "binaryQuantity");
    assert.equal(model.selectedQuantity, 0);
    assert.deepEqual(response, { type: "chooseQuantity", quantity: 0 });
  });

  test("zero-to-one chooseQuantity decisions preserve public presentation copy", () => {
    const decision = {
      ...quantityDecision(),
      presentation: {
        title: "Add Life card",
        instruction: "Add up to 1 card from deck to Life.",
      },
      prompt: "Add up to 1 card from deck to Life.",
      max: 1,
    } satisfies PublicChooseQuantityDecision;

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision),
    );

    assert.equal(model.kind, "binaryQuantity");
    assert.equal(model.title, "Add Life card");
    assert.equal(model.instruction, "Add up to 1 card from deck to Life.");
    assert.equal(model.prompt, "Add up to 1 card from deck to Life.");
  });

  test("modal models expose public presentation title and instruction", () => {
    const decision: PublicChooseQuantityDecision = {
      ...quantityDecision(),
      prompt: "Raw engine prompt",
      presentation: {
        title: "Choose amount",
        instruction: "Select how many cards to move.",
      },
    };

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision),
    );

    assert.equal(model.title, "Choose amount");
    assert.equal(model.instruction, "Select how many cards to move.");
    assert.equal(model.prompt, "Raw engine prompt");
  });

  test("chooseQuantity draft defaults to the maximum legal quantity", () => {
    const decision = quantityDecision();
    const draft = createDecisionDraft(decision);
    const model = createDecisionModalModel(decision, draft);

    assert.equal(draft.kind, "chooseQuantity");
    assert.equal(draft.quantity, decision.max);
    assert.equal(model.kind, "chooseQuantity");
    assert.equal(model.quantity, decision.max);
  });

  test("invalid drafts fail closed before response construction", () => {
    const decision = {
      ...quantityDecision(),
      min: 2,
      max: 4,
    };
    const draft = setDecisionQuantity(createDecisionDraft(decision), 1);

    const model = createDecisionModalModel(decision, draft);

    assert.equal(model.kind, "chooseQuantity");
    assert.equal(model.canConfirm, false);
    assert.throws(
      () => buildDecisionResponse(decision, draft),
      /Decision draft is not confirmable/u,
    );
  });

  test("simple option decisions can use the modal response path", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "mulligan",
    };
    const draft = setDecisionOption(
      decision,
      createDecisionDraft(decision),
      "mulligan",
    );
    const model = createDecisionModalModel(decision, draft);
    const response = buildDecisionResponse(decision, draft);

    assert.deepEqual(model, {
      ...baseModalPresentation,
      kind: "chooseOption",
      decisionId: decision.id,
      options: [
        { value: "keep", label: "Keep hand" },
        { value: "mulligan", label: "Mulligan" },
      ],
      selectedOption: "mulligan",
      canConfirm: true,
    });
    assert.deepEqual(response, { type: "mulligan", keep: false });
  });

  test("default decision modal renders legal response actions as options", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "payCost",
      prompt: "Pay cost to play card",
      presentation: {
        title: "Pay cost",
        instruction: "Choose a payment option.",
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      { index: 4, type: "respondToDecision", label: "Pay cost with 4 DON!!" },
      { index: 5, type: "respondToDecision", label: "Pay cost with 5 DON!!" },
    ];
    const draft = setDecisionActionOption(
      createDecisionDraft(decision, responseActions),
      5,
    );

    const model = createDecisionModalModel(decision, draft, responseActions);

    assert.deepEqual(model, {
      title: "Pay cost",
      instruction: "Choose a payment option.",
      prompt: "Pay cost to play card",
      kind: "actionOptions",
      decisionId: decision.id,
      options: [
        { actionIndex: 4, label: "Pay 4 DON!!" },
        { actionIndex: 5, label: "Pay 5 DON!!" },
      ],
      selectedActionIndex: 5,
      canConfirm: true,
    });
  });

  test("default decision modal labels response actions by response key", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "payCost",
      prompt: "Pay cost to play card",
      presentation: {
        title: "Pay cost",
        instruction: "Choose whether to pay.",
        choices: [
          { responseKey: "decline", label: "Decline cost" },
          { responseKey: "payment:don:4", label: "Pay 4 DON!!" },
        ],
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 4,
        type: "respondToDecision",
        label: "Raw decline transport label",
        responseKey: "decline",
      },
      {
        index: 5,
        type: "respondToDecision",
        label: "Raw payment transport label",
        responseKey: "payment:don:4",
      },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.equal(model.kind, "actionOptions");
    assert.deepEqual(model.options, [
      { actionIndex: 4, label: "Decline cost" },
      { actionIndex: 5, label: "Pay 4 DON!!" },
    ]);
  });

  test("choose-one effect decisions render effect options as a dedicated model", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "chooseEffectOption",
      prompt: "Choose one:",
      presentation: {
        title: "Choose one",
        instruction: "Choose one effect.",
        choices: [
          { responseKey: "draw-card", label: "Draw 1 card." },
          { responseKey: "return-don", label: "Return 1 DON!! card." },
          { responseKey: "decline", label: "Do nothing" },
        ],
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 9,
        type: "respondToDecision",
        label: "Raw decline",
        responseKey: "decline",
      },
      {
        index: 10,
        type: "respondToDecision",
        label: "Raw draw",
        responseKey: "draw-card",
      },
      {
        index: 11,
        type: "respondToDecision",
        label: "Raw return",
        responseKey: "return-don",
      },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.deepEqual(model, {
      title: "Choose one",
      instruction: "Choose one effect.",
      prompt: "Choose one:",
      kind: "chooseOne",
      decisionId: decision.id,
      options: [
        { actionIndex: 10, label: "Draw 1 card." },
        { actionIndex: 11, label: "Return 1 DON!! card." },
      ],
      declineActionIndex: 9,
      declineLabel: "Do nothing",
      canConfirm: true,
    });
  });

  test("required choose-one effect decisions omit the decline action", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "chooseEffectOption",
      prompt: "Choose one:",
      presentation: {
        title: "Choose one",
        instruction: "Choose one effect.",
        choices: [{ responseKey: "draw-card", label: "Draw 1 card." }],
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 10,
        type: "respondToDecision",
        label: "Raw draw",
        responseKey: "draw-card",
      },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.equal(model.kind, "chooseOne");
    assert.equal(model.declineActionIndex, undefined);
    assert.equal(model.declineLabel, undefined);
    assert.deepEqual(model.options, [
      { actionIndex: 10, label: "Draw 1 card." },
    ]);
  });

  test("default decision modal receives collapsed DON payment response actions", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "payCost",
      prompt: "Pay cost to play card",
      presentation: {
        title: "Pay cost",
        instruction: "Choose whether to pay.",
        choices: [{ responseKey: "payment:don:4", label: "Pay 4 DON!!" }],
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 4,
        type: "respondToDecision",
        label: "Pay cost with 4 DON!!",
        responseKey: "payment:don:4",
      },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.equal(model.kind, "actionOptions");
    assert.deepEqual(model.options, [{ actionIndex: 4, label: "Pay 4 DON!!" }]);
  });

  test("default decision modal collapses DON payment permutations alongside decline", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "payCost",
      prompt: "Pay optional DON cost",
      presentation: {
        title: "Pay cost",
        instruction: "Choose whether to pay.",
        choices: [
          { responseKey: "decline", label: "Decline cost" },
          { responseKey: "payment:don:3", label: "Pay 3 DON!!" },
        ],
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 3,
        type: "respondToDecision",
        label: "Raw decline transport label",
        responseKey: "decline",
      },
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

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.equal(model.kind, "actionOptions");
    assert.deepEqual(model.options, [
      { actionIndex: 3, label: "Decline cost" },
      { actionIndex: 4, label: "Pay 3 DON!!" },
    ]);
  });

  test("default decision modal collapses restDon payment permutations by label", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "payCost",
      prompt: "Pay DON cost",
      presentation: {
        title: "Pay cost",
        instruction: "Choose how to pay.",
        choices: [{ responseKey: "restDon", label: "Rest DON!!" }],
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 4,
        type: "respondToDecision",
        label: "Pay cost with 4 DON!!",
        responseKey: "restDon",
      },
      {
        index: 5,
        type: "respondToDecision",
        label: "Pay cost with 4 DON!!",
        responseKey: "restDon",
      },
      {
        index: 6,
        type: "respondToDecision",
        label: "Pay cost with 4 DON!!",
        responseKey: "restDon",
      },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.equal(model.kind, "actionOptions");
    assert.deepEqual(model.options, [{ actionIndex: 4, label: "Pay 4 DON!!" }]);
  });

  test("default decision modal collapses restDon payment permutations by rest label", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "payCost",
      prompt: "Pay DON cost",
      presentation: {
        title: "Pay cost",
        instruction: "Choose how to pay.",
        choices: [{ responseKey: "restDon", label: "Rest 1 DON!!" }],
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 4,
        type: "respondToDecision",
        label: "Rest 1 DON!!",
        responseKey: "restDon",
      },
      {
        index: 5,
        type: "respondToDecision",
        label: "Rest 1 DON!!",
        responseKey: "restDon",
      },
      {
        index: 6,
        type: "respondToDecision",
        label: "Rest 1 DON!!",
        responseKey: "restDon",
      },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.equal(model.kind, "actionOptions");
    assert.deepEqual(model.options, [{ actionIndex: 4, label: "Pay 1 DON!!" }]);
  });

  test("default decision modal collapses restDon permutations by presentation rest label", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "payCost",
      prompt: "Pay DON cost",
      presentation: {
        title: "Pay cost",
        instruction: "Choose how to pay.",
        choices: [{ responseKey: "restDon", label: "Rest 1 DON!!" }],
      },
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 4,
        type: "respondToDecision",
        label: "Raw rest transport label",
        responseKey: "restDon",
      },
      {
        index: 5,
        type: "respondToDecision",
        label: "Raw rest transport label",
        responseKey: "restDon",
      },
      {
        index: 6,
        type: "respondToDecision",
        label: "Raw rest transport label",
        responseKey: "restDon",
      },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.equal(model.kind, "actionOptions");
    assert.deepEqual(model.options, [{ actionIndex: 4, label: "Pay 1 DON!!" }]);
  });

  test("life trigger decision modal includes the damaged card with response options", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "confirmLifeTrigger",
      prompt: "Activate life trigger?",
      presentation: {
        title: "Life trigger",
        instruction: "Choose whether to activate this trigger.",
      },
      card: cardRef("life-trigger"),
    };
    const responseActions: readonly ClientActionModel[] = [
      { index: 1, type: "respondToDecision", label: "Activate trigger" },
      { index: 2, type: "respondToDecision", label: "Add to hand" },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.deepEqual(model, {
      title: "Life trigger",
      instruction: "Choose whether to activate this trigger.",
      prompt: "Activate life trigger?",
      kind: "actionOptions",
      decisionId: decision.id,
      card: cardRef("life-trigger"),
      options: [
        { actionIndex: 1, label: "Activate trigger" },
        { actionIndex: 2, label: "Add to hand" },
      ],
      selectedActionIndex: 1,
      canConfirm: true,
    });
  });

  test("life trigger response buttons do not duplicate the damaged card choice", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "confirmLifeTrigger",
      prompt: "Activate life trigger?",
      presentation: {
        title: "Life trigger",
        instruction: "Choose whether to activate this trigger.",
        choices: [
          {
            responseKey: "activateTrigger",
            label: "Activate trigger",
            cards: [cardRef("life-trigger")],
          },
          {
            responseKey: "addToHand",
            label: "Add to hand",
            cards: [cardRef("life-trigger")],
          },
        ],
      },
      card: cardRef("life-trigger"),
    };
    const responseActions: readonly ClientActionModel[] = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Activate trigger",
        responseKey: "activateTrigger",
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Add to hand",
        responseKey: "addToHand",
      },
    ];

    const model = createDecisionModalModel(
      decision,
      createDecisionDraft(decision, responseActions),
      responseActions,
    );

    assert.equal(model.kind, "actionOptions");
    assert.equal(model.card?.instanceId, cardRef("life-trigger").instanceId);
    assert.deepEqual(model.options, [
      { actionIndex: 1, label: "Activate trigger" },
      { actionIndex: 2, label: "Add to hand" },
    ]);
  });

  test("counter-step pass decisions are suppressed from modal rendering", () => {
    const counterPass: PublicSelectCardsDecision = {
      ...selectDecision(),
      id: "decision:counterStep:pass:attacker-1:7" as DecisionId,
      min: 0,
      max: 0,
      candidates: [],
    };
    const normalSelection: PublicSelectCardsDecision = {
      ...selectDecision(),
      id: "decision:selectCards:sequence-set:queue-entry-1" as DecisionId,
    };

    assert.equal(isDecisionModalSuppressed(counterPass), true);
    assert.equal(isDecisionModalSuppressed(normalSelection), false);
  });

  test("pending decision interaction mode sends visible board targets to zone clicks", () => {
    assert.equal(
      getPendingDecisionInteractionMode(targetDecision(), {
        visibleZoneClickInstanceIds: ["target-1", "target-2"],
      }),
      "zoneClick",
    );
  });

  test("pending decision interaction mode fails closed to modal when candidates are not visible zone cards", () => {
    assert.equal(
      getPendingDecisionInteractionMode(targetDecision(), {
        visibleZoneClickInstanceIds: ["target-1"],
      }),
      "modal",
    );
    assert.equal(
      getPendingDecisionInteractionMode(
        {
          ...selectDecision(),
          id: "decision:selectCards:sequence-set:queue-entry-1" as DecisionId,
        },
        { visibleZoneClickInstanceIds: [] },
      ),
      "modal",
    );
  });

  test("pending decision interaction mode keeps counter pass in global actions", () => {
    const counterPass: PublicSelectCardsDecision = {
      ...selectDecision(),
      id: "decision:counterStep:pass:attacker-1:7" as DecisionId,
      min: 0,
      max: 0,
      candidates: [],
    };

    assert.equal(
      getPendingDecisionInteractionMode(counterPass, {
        visibleZoneClickInstanceIds: [],
      }),
      "global",
    );
  });
});
