import assert from "node:assert/strict";
import { test } from "vitest";

import type { SelectionId } from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../action-test-fixtures.js";
import { applyDeclareAttack } from "./actions.js";
import {
  cardRef,
  installSupportedCounterEvent,
  setupAttackState,
} from "./test-fixtures.js";

type EngineInternalBattleState = NonNullable<
  ReturnType<typeof setupAttackState>["battle"]
> & { counterPower?: number };

const battleCounterPower = (
  battle: ReturnType<typeof setupAttackState>["battle"],
): number | undefined =>
  (battle as EngineInternalBattleState | undefined)?.counterPower;

test("nested Counter Event sequence resolves power then trailing trash-to-hand selection", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const baseCounterEvent = must(p2State.hand[0], "counter event");
  const counterEvent = {
    ...baseCounterEvent,
    cardId: toCardId("counter-event-nested-sequence"),
  };
  p2State.hand = [
    counterEvent,
    ...p2State.hand.slice(1).map((card, index) => ({
      ...card,
      zone: {
        zone: "hand" as const,
        playerId: p2,
        slot: "hand" as const,
        index: index + 1,
      },
    })),
  ];
  const trashTemplate = must(p2State.deck[0], "trash template");
  const trashCards = Array.from({ length: 1 }, (_, index) => ({
    ...trashTemplate,
    instanceId:
      `${String(trashTemplate.instanceId)}:nested-counter-trash:${String(index)}` as typeof trashTemplate.instanceId,
    cardId: toCardId("nested-eligible-black-trash"),
    zone: {
      zone: "trash" as const,
      playerId: p2,
      slot: "trash" as const,
      index,
    },
  }));
  const eligible = must(trashCards[0], "eligible trash card");
  p2State.trash = trashCards;
  state.cardManifest.cards[eligible.cardId] = {
    ...resolvedCard({
      cardId: eligible.cardId,
      category: "character",
      cost: 3,
    }),
    colors: ["black"],
  };

  installSupportedCounterEvent(state, counterEvent, 1000);
  const definitionId = `${String(counterEvent.cardId)}:counter`;
  const trashSelectionId = "nestedTrashSelection:addToHand" as SelectionId;
  const definition = must(
    state.cardManifest.effectDefinitions?.[definitionId],
    "counter definition",
  );
  const counterEffect = must(definition.effects[0], "counter effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [definitionId]: {
      ...definition,
      effects: [
        {
          ...counterEffect,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "sequence",
                  effects: [
                    {
                      connector: "always",
                      effect: {
                        type: "modifyPower",
                        target: {
                          type: "chooseFromZones",
                          request: {
                            timing: "onResolution",
                            chooser: "self",
                            player: "self",
                            zones: ["leaderArea", "characterArea"],
                            min: 0,
                            max: 1,
                            allowFewerIfUnavailable: true,
                            visibility: "public",
                            filter: { categories: ["leader", "character"] },
                          },
                        },
                        value: 1000,
                        duration: { type: "thisBattle" },
                      },
                    },
                  ],
                },
              },
              {
                connector: "then",
                effect: {
                  type: "selectCards",
                  zone: "trash",
                  player: "self",
                  chooser: "self",
                  min: 0,
                  max: 1,
                  filter: {
                    colorsAny: ["black"],
                    categories: ["character"],
                    cost: { max: 3 },
                  },
                  saveAs: trashSelectionId,
                  visibility: "bothPlayers",
                },
              },
              {
                connector: "then",
                effect: {
                  type: "moveSelected",
                  selection: trashSelectionId,
                  from: "trash",
                  to: "hand",
                },
              },
            ],
          },
        },
      ],
    },
  };

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);
  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) =>
        action.type === "useCounter" &&
        action.cardInstanceId === counterEvent.instanceId,
    ),
    true,
  );

  const used = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });
  const selectionDecision = must(
    used.state.pendingDecision,
    "trash-to-hand selection decision",
  );

  assert.equal(used.errors, undefined);
  assert.equal(battleCounterPower(used.state.battle), 1000);
  assert.equal(selectionDecision.type, "selectCards");
});
