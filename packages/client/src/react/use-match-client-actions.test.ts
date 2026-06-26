import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { InstanceId, PlayerId, Zone } from "@optcg/types";

import {
  cardCostConfirmActionIndex,
  createAttackTargetInteractionState,
} from "./use-match-client-actions.js";
import type { BoardViewModel, ClientActionModel } from "../view-model.js";
import type { OptionalCardCostGroup } from "../interactions/payment-decision.js";

const variableTrashGroup: OptionalCardCostGroup = {
  chooseActionIndex: -5,
  operation: "trash",
  chooseLabel: "Choose card to trash",
  minCount: 1,
  requiredCount: 2,
  source: { zone: "hand" as Zone, playerId: "p1" as PlayerId },
  cardActions: [
    { instanceIds: ["event-1"], actionIndex: 2 },
    { instanceIds: ["event-1", "stage-1"], actionIndex: 3 },
  ],
};

describe("match client action helpers", () => {
  test("card-cost confirm submits the selected payment action", () => {
    assert.equal(cardCostConfirmActionIndex(variableTrashGroup, 2), 2);
  });

  test("card-cost confirm is unavailable without a resolved payment action", () => {
    assert.equal(
      cardCostConfirmActionIndex(variableTrashGroup, undefined),
      undefined,
    );
    assert.equal(cardCostConfirmActionIndex(undefined, 2), undefined);
  });

  test("arming attack target choice clears the selected card menu", () => {
    const attackAction: ClientActionModel = {
      index: 7,
      type: "declareAttack",
      label: "Attack leader",
      attack: {
        attackerInstanceId: "attacker-1" as InstanceId,
        targetInstanceId: "leader-2" as InstanceId,
      },
    };
    const board = {
      actionsByCardInstanceId: {
        "attacker-1": [attackAction],
      },
    } as unknown as BoardViewModel;

    assert.deepEqual(
      createAttackTargetInteractionState({
        selectedCardInstanceId: "attacker-1",
        board,
      }),
      {
        attackTargetChoice: {
          attackerInstanceId: "attacker-1",
          chooseActionIndex: -20,
          targetActions: [{ targetInstanceId: "leader-2", actionIndex: 7 }],
        },
        selectedCardInstanceId: undefined,
      },
    );
  });
});
