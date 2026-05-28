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
  toggleOrderedCardBottomPlacement,
  setDecisionActionOption,
  setDecisionQuantity,
  setDecisionOption,
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
} satisfies Omit<PublicPendingDecision, "type">;

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
    assert.equal(model.canConfirm, true);
    assert.deepEqual(model.selectedInstanceIds, ["1"]);
    assert.deepEqual(response, { type: "cards", cards: [cardRef("1")] });
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

  test("top-or-bottom orderCards draft builds topBottomPlacement response", () => {
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
    draft = toggleOrderedCardBottomPlacement(
      decision,
      draft,
      "1" as InstanceId,
    );

    const model = createDecisionModalModel(decision, draft);
    const response = buildDecisionResponse(decision, draft);

    assert.equal(model.kind, "orderCards");
    assert.deepEqual(model.orderedInstanceIds, ["3", "1", "2"]);
    assert.deepEqual(model.bottomInstanceIds, ["1"]);
    assert.deepEqual(response, {
      type: "topBottomPlacement",
      topIds: ["3", "2"],
      bottomIds: ["1"],
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
      kind: "chooseOption",
      decisionId: decision.id,
      prompt: decision.prompt,
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
      kind: "actionOptions",
      decisionId: decision.id,
      prompt: "Pay cost to play card",
      options: [
        { actionIndex: 4, label: "Pay cost with 4 DON!!" },
        { actionIndex: 5, label: "Pay cost with 5 DON!!" },
      ],
      selectedActionIndex: 5,
      canConfirm: true,
    });
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
      id: "decision:selectCards:search-reveal:queue-entry-1" as DecisionId,
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
          id: "decision:selectCards:search-reveal:queue-entry-1" as DecisionId,
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
