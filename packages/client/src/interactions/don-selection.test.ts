import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  DecisionId,
  InstanceId,
  PublicSelectTargetsDecision,
} from "@optcg/types";

import {
  ATTACH_SELECTED_DON_ACTION_INDEX,
  findAttachDonActionIndex,
  hasSelectedDonAttachmentTargetAction,
  isSelectableCostAreaDon,
  isZoneClickCostAreaDonSelection,
  shouldPreserveSelectedDonAfterDecisionSubmit,
  selectedDonAttachmentClickIntent,
  selectedDonAttachmentMenuAction,
  toggleSelectedDonInstanceId,
} from "./don-selection.js";
import type { DecisionDraft } from "./decision-modal.js";
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

const hiddenLifeCards = (count: number): ClientCardModel[] =>
  Array.from({ length: count }, (_, index) => ({
    instanceId: `hidden-life-${String(index)}` as InstanceId,
    cardId: "hidden" as ClientCardModel["cardId"],
    name: "Hidden card",
    category: "hidden",
    attachedDonCount: 0,
    attachedDonCards: [],
  }));

const board = (): BoardViewModel => ({
  playerId: "p1" as BoardViewModel["playerId"],
  selfLabel: "Player",
  opponentLabel: "Opponent",
  selfIsTurnPlayer: true,
  opponentIsTurnPlayer: false,
  self: {
    leader: card("leader-1", "active"),
    hand: [],
    characters: [],
    costArea: [card("active-don", "active"), card("rested-don", "rested")],
    trash: [],
    deckCount: 0,
    donDeckCount: 0,
    lifeCount: 0,
    lifeCards: hiddenLifeCards(0),
  },
  opponent: {
    leader: card("opponent-leader", "active"),
    handCount: 0,
    characters: [],
    costArea: [
      card("opponent-active-don", "active"),
      card("opponent-rested-don", "rested"),
    ],
    trash: [],
    deckCount: 0,
    donDeckCount: 0,
    lifeCount: 0,
    lifeCards: hiddenLifeCards(0),
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

  test("cost-area DON selection requires a current legal attach action when actions are provided", () => {
    const model = board();
    const actions: ClientVisibleAction[] = [
      {
        index: 7,
        type: "attachDon",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "active-don" as InstanceId,
          targetInstanceId: "leader-1" as InstanceId,
        },
      },
    ];

    assert.equal(isSelectableCostAreaDon(model, "active-don", actions), true);
    assert.equal(isSelectableCostAreaDon(model, "rested-don", actions), false);
    assert.equal(isSelectableCostAreaDon(model, "active-don", []), false);
  });

  test("cost-area DON selection can use opponent DON when a legal attach action exposes it", () => {
    const model = board();
    const actions: ClientVisibleAction[] = [
      {
        index: 11,
        type: "respondToDecision",
        label: "Pay cost",
        attachment: {
          donInstanceId: "opponent-rested-don" as InstanceId,
          targetInstanceId: "opponent-leader" as InstanceId,
        },
      },
    ];

    assert.equal(
      isSelectableCostAreaDon(model, "opponent-rested-don", actions),
      true,
    );
    assert.equal(
      isSelectableCostAreaDon(model, "opponent-active-don", actions),
      false,
    );
  });

  test("zone-click cost-area DON selections submit active or rested cost-area DON directly", () => {
    const model = board();
    const decision: PublicSelectTargetsDecision = {
      id: "decision:select-owner-don" as DecisionId,
      spotlightPendingId:
        "spotlight:decision:select-owner-don" as PublicSelectTargetsDecision["spotlightPendingId"],
      type: "selectTargets",
      playerId: "p1" as PublicSelectTargetsDecision["playerId"],
      prompt: "Select DON!!.",
      presentation: {
        title: "Select DON!!",
        instruction: "Select DON!!.",
      },
      causedBy: { type: "ruleProcess", name: "test" },
      min: 0,
      max: 1,
      candidates: [
        {
          card: {
            instanceId: "active-don" as InstanceId,
            cardId:
              "DON" as PublicSelectTargetsDecision["candidates"][number]["card"]["cardId"],
            playerId: "p1" as PublicSelectTargetsDecision["playerId"],
            zone: {
              zone: "costArea",
              playerId: "p1" as PublicSelectTargetsDecision["playerId"],
              slot: "cost",
              index: 0,
            },
          },
        },
        {
          card: {
            instanceId: "opponent-rested-don" as InstanceId,
            cardId:
              "DON" as PublicSelectTargetsDecision["candidates"][number]["card"]["cardId"],
            playerId: "p2" as PublicSelectTargetsDecision["playerId"],
            zone: {
              zone: "costArea",
              playerId: "p2" as PublicSelectTargetsDecision["playerId"],
              slot: "cost",
              index: 1,
            },
          },
        },
      ],
    };

    assert.equal(
      isZoneClickCostAreaDonSelection(model, decision, "active-don"),
      true,
    );
    assert.equal(
      isZoneClickCostAreaDonSelection(model, decision, "opponent-rested-don"),
      true,
    );
    assert.equal(
      isZoneClickCostAreaDonSelection(model, decision, "opponent-active-don"),
      false,
    );
  });

  test("preserves selected cost-area DON after source decision submit", () => {
    const model = board();
    const decision: PublicSelectTargetsDecision = {
      id: "decision:select-owner-don" as DecisionId,
      spotlightPendingId:
        "spotlight:decision:select-owner-don" as PublicSelectTargetsDecision["spotlightPendingId"],
      type: "selectTargets",
      playerId: "p1" as PublicSelectTargetsDecision["playerId"],
      prompt: "Select DON!!.",
      presentation: {
        title: "Select DON!!",
        instruction: "Select DON!!.",
      },
      causedBy: { type: "ruleProcess", name: "test" },
      min: 0,
      max: 1,
      candidates: [
        {
          card: {
            instanceId: "opponent-rested-don" as InstanceId,
            cardId:
              "DON" as PublicSelectTargetsDecision["candidates"][number]["card"]["cardId"],
            playerId: "p2" as PublicSelectTargetsDecision["playerId"],
            zone: {
              zone: "costArea",
              playerId: "p2" as PublicSelectTargetsDecision["playerId"],
              slot: "cost",
              index: 1,
            },
          },
        },
      ],
    };
    const draft: DecisionDraft = {
      kind: "selectCards",
      decisionId: decision.id,
      selectedInstanceIds: ["opponent-rested-don" as InstanceId],
    };

    assert.equal(
      shouldPreserveSelectedDonAfterDecisionSubmit({
        board: model,
        decision,
        draft,
      }),
      true,
    );
  });

  test("selected DON attachment targets are driven by legal action metadata", () => {
    const actions: ClientVisibleAction[] = [
      {
        index: 11,
        type: "respondToDecision",
        label: "Pay cost",
        attachment: {
          donInstanceId: "opponent-rested-don" as InstanceId,
          targetInstanceId: "opponent-character" as InstanceId,
        },
      },
    ];

    assert.equal(
      hasSelectedDonAttachmentTargetAction(
        ["opponent-rested-don"],
        actions,
        "opponent-character",
      ),
      true,
    );
    assert.equal(
      hasSelectedDonAttachmentTargetAction(
        ["opponent-rested-don"],
        actions,
        "leader-1",
      ),
      false,
    );
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

  test("selected DON attachment menu requires each selected DON to have a legal target action", () => {
    const actions: ClientVisibleAction[] = [
      {
        index: 7,
        type: "attachDon",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "don-1" as InstanceId,
          targetInstanceId: "leader-1" as InstanceId,
        },
      },
      {
        index: 8,
        type: "attachDon",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "don-2" as InstanceId,
          targetInstanceId: "leader-1" as InstanceId,
        },
      },
    ];

    assert.deepEqual(
      selectedDonAttachmentMenuAction(["don-1", "don-2"], actions, "leader-1"),
      {
        index: ATTACH_SELECTED_DON_ACTION_INDEX,
        type: "attachDon",
        label: "Attach 2 selected DON!!",
      },
    );
    assert.equal(
      selectedDonAttachmentMenuAction(["don-1", "don-2"], actions, "char-1"),
      undefined,
    );
    assert.equal(
      selectedDonAttachmentMenuAction(["don-1", "don-3"], actions, "leader-1"),
      undefined,
    );
  });

  test("selected DON target clicks confirm by default and can attach immediately", () => {
    assert.deepEqual(
      selectedDonAttachmentClickIntent({
        confirmAttachDon: true,
        selectedDonInstanceIds: ["don-1"],
        targetInstanceId: "leader-1",
      }),
      { type: "confirm", targetInstanceId: "leader-1" },
    );
    assert.deepEqual(
      selectedDonAttachmentClickIntent({
        confirmAttachDon: false,
        selectedDonInstanceIds: ["don-1"],
        targetInstanceId: "leader-1",
      }),
      { type: "attach", targetInstanceId: "leader-1" },
    );
    assert.equal(
      selectedDonAttachmentClickIntent({
        confirmAttachDon: false,
        selectedDonInstanceIds: [],
        targetInstanceId: "leader-1",
      }),
      undefined,
    );
  });
});
