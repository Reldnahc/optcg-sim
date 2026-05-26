import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { InstanceId } from "@optcg/types";

import {
  ATTACH_SELECTED_DON_ACTION_INDEX,
  findAttachDonActionIndex,
  isSelectableCostAreaDon,
  selectedDonAttachmentMenuAction,
  toggleSelectedDonInstanceId,
} from "./don-selection.js";
import type { ClientVisibleAction } from "../transport.js";
import type { BoardViewModel, ClientCardModel } from "../view-model.js";

const card = (
  instanceId: string,
  state: ClientCardModel["state"],
): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: "DON" as ClientCardModel["cardId"],
  name: "DON!!",
  category: "don",
  ...(state === undefined ? {} : { state }),
  attachedDonCount: 0,
  attachedDonCards: [],
});

const board = (): BoardViewModel => ({
  playerId: "p1" as BoardViewModel["playerId"],
  self: {
    leader: card("leader-1", "active"),
    hand: [],
    characters: [],
    costArea: [card("active-don", "active"), card("rested-don", "rested")],
    trash: [],
    deckCount: 0,
    donDeckCount: 0,
    lifeCount: 0,
  },
  opponent: {
    leader: card("opponent-leader", "active"),
    handCount: 0,
    characters: [],
    costArea: [card("opponent-active-don", "active")],
    trash: [],
    deckCount: 0,
    donDeckCount: 0,
    lifeCount: 0,
  },
  actionsByCardInstanceId: {},
});

describe("DON selection interaction", () => {
  test("toggles multiple selected DON cards without replacing previous picks", () => {
    assert.deepEqual(toggleSelectedDonInstanceId([], "don-1"), ["don-1"]);
    assert.deepEqual(toggleSelectedDonInstanceId(["don-1"], "don-2"), [
      "don-1",
      "don-2",
    ]);
    assert.deepEqual(toggleSelectedDonInstanceId(["don-1", "don-2"], "don-1"), [
      "don-2",
    ]);
  });

  test("finds the current attach action by DON and target ids", () => {
    const actions: ClientVisibleAction[] = [
      {
        index: 3,
        type: "attachDon",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "don-1" as InstanceId,
          targetInstanceId: "leader-1" as InstanceId,
        },
      },
      {
        index: 4,
        type: "attachDon",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "don-2" as InstanceId,
          targetInstanceId: "char-1" as InstanceId,
        },
      },
    ];

    assert.equal(findAttachDonActionIndex(actions, "don-2", "char-1"), 4);
    assert.equal(
      findAttachDonActionIndex(actions, "don-1", "char-1"),
      undefined,
    );
  });

  test("only active unattached self cost-area DON cards are selectable", () => {
    const model = board();

    assert.equal(isSelectableCostAreaDon(model, "active-don"), true);
    assert.equal(isSelectableCostAreaDon(model, "rested-don"), false);
    assert.equal(isSelectableCostAreaDon(model, "leader-1"), false);
    assert.equal(isSelectableCostAreaDon(model, "opponent-active-don"), false);
  });

  test("creates a normal card menu action for selected DON attachment", () => {
    assert.equal(selectedDonAttachmentMenuAction([]), undefined);
    assert.deepEqual(selectedDonAttachmentMenuAction(["don-1"]), {
      index: ATTACH_SELECTED_DON_ACTION_INDEX,
      type: "attachDon",
      label: "Attach selected DON!!",
    });
    assert.deepEqual(selectedDonAttachmentMenuAction(["don-1", "don-2"]), {
      index: ATTACH_SELECTED_DON_ACTION_INDEX,
      type: "attachDon",
      label: "Attach 2 selected DON!!",
    });
  });
});
