import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { CardId, DecisionId, InstanceId, PlayerId } from "@optcg/types";

import {
  createCollectionDecisionSurface,
  usesCollectionCardCostSurface,
  type CollectionDecisionSurface,
} from "./decision-surface.js";
import type { DecisionModalModel } from "./decision-modal.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const trashChoice = (
  instanceId: string,
  playerId: PlayerId = p1,
): Extract<DecisionModalModel, { kind: "selectCards" }>["cards"][number] => ({
  card: {
    instanceId: instanceId as InstanceId,
    cardId: `${instanceId}-card` as CardId,
    playerId,
    zone: { zone: "trash", playerId, slot: "trash", index: 0 },
  },
  selectable: true,
});

const handChoice = (
  instanceId: string,
): Extract<DecisionModalModel, { kind: "selectCards" }>["cards"][number] => ({
  card: {
    instanceId: instanceId as InstanceId,
    cardId: `${instanceId}-card` as CardId,
    playerId: p1,
    zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
  },
  selectable: true,
});

const selectCardsModel = (
  cards: Extract<DecisionModalModel, { kind: "selectCards" }>["cards"],
): Extract<DecisionModalModel, { kind: "selectCards" }> => ({
  kind: "selectCards",
  decisionId: "decision-select-trash" as DecisionId,
  prompt: "Choose cards from trash.",
  min: 0,
  max: 2,
  canConfirm: true,
  selectedInstanceIds: [],
  cards,
  confirmLabel: "Confirm",
});

describe("decision surface routing", () => {
  test("routes same-player trash selectCards decisions to a collection selector", () => {
    const model = selectCardsModel([
      trashChoice("trash-1"),
      trashChoice("trash-2"),
    ]);

    assert.deepEqual(createCollectionDecisionSurface(model, p1), {
      kind: "collection",
      title: "Player trash",
      zone: "trash",
      playerId: p1,
      model,
    } satisfies CollectionDecisionSurface);
  });

  test("labels opponent trash collection selectors from the current player's view", () => {
    const model = selectCardsModel([trashChoice("trash-1", p2)]);

    assert.equal(
      createCollectionDecisionSurface(model, p1)?.title,
      "Opponent trash",
    );
  });

  test("does not route mixed-zone card selections to a collection selector", () => {
    const model = selectCardsModel([
      trashChoice("trash-1"),
      handChoice("hand-1"),
    ]);

    assert.equal(createCollectionDecisionSurface(model, p1), undefined);
  });

  test("does not route hand card selections to a collection selector", () => {
    const model = selectCardsModel([
      handChoice("hand-1"),
      handChoice("hand-2"),
    ]);

    assert.equal(createCollectionDecisionSurface(model, p1), undefined);
  });

  test("routes only stacked trash card-cost selections to collection surfaces", () => {
    assert.equal(
      usesCollectionCardCostSurface({ zone: "trash", playerId: p1 }),
      true,
    );
    assert.equal(
      usesCollectionCardCostSurface({ zone: "costArea", playerId: p1 }),
      false,
    );
    assert.equal(
      usesCollectionCardCostSurface({ zone: "hand", playerId: p1 }),
      false,
    );
  });
});
