import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  CardRef,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicChooseQuantityDecision,
  PublicOrderCardsDecision,
  PublicPendingDecision,
  PublicSelectCardsDecision,
} from "@optcg/types";

import {
  buildDecisionResponse,
  createDecisionDraft,
  createDecisionModalModel,
  moveOrderedCardNear,
  setDecisionQuantity,
  toggleDecisionSelectedCard,
} from "./decision-modal.js";

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

  test("selectCards draft ignores unknown candidates and prevents selecting beyond max", () => {
    const decision = selectDecision();
    let draft = createDecisionDraft(decision);
    draft = toggleDecisionSelectedCard(
      decision,
      draft,
      "missing" as InstanceId,
    );
    draft = toggleDecisionSelectedCard(decision, draft, "1" as InstanceId);
    draft = toggleDecisionSelectedCard(decision, draft, "2" as InstanceId);

    const model = createDecisionModalModel(decision, draft);

    assert.equal(model.kind, "selectCards");
    assert.deepEqual(model.selectedInstanceIds, ["1"]);
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

  test("unknown decision families become generic descriptors without response construction", () => {
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "mulligan",
    };
    const draft = createDecisionDraft(decision);
    const model = createDecisionModalModel(decision, draft);

    assert.deepEqual(model, {
      kind: "generic",
      decisionId: decision.id,
      prompt: decision.prompt,
      canConfirm: false,
      decisionType: "mulligan",
    });
    assert.throws(
      () => buildDecisionResponse(decision, draft),
      /Unsupported decision modal response/u,
    );
  });
});
