import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  DecisionId,
  EffectDefinition,
  EffectId,
  GameState,
  InstanceId,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { actionLabel } from "./local-dev-action-labels.js";

const p1 = "p1" as PlayerId;

const payCostState = (
  paymentOptions: NonNullable<GameState["pendingDecision"]> extends infer T
    ? T extends { type: "payCost"; paymentOptions: infer Options }
      ? Options
      : never
    : never,
): GameState =>
  ({
    players: {
      [p1]: {
        playerId: p1,
        hand: [],
        trash: [],
        characters: [],
        costArea: [],
      },
    },
    pendingDecision: {
      id: "decision:payCost:test" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "test" },
      visibility: { type: "private", playerId: p1 },
      cost: { type: "custom", action: "test" },
      paymentOptions,
    },
  }) as unknown as GameState;

const paymentAction = (optionId: string): LegalAction => ({
  type: "respondToDecision",
  decisionId: "decision:payCost:test" as DecisionId,
  response: { type: "payment", optionId },
});

const counterEventLabelState = (
  definition: EffectDefinition,
  counterCardId: CardId,
  counterInstanceId: InstanceId,
): GameState =>
  ({
    cardManifest: {
      cards: {
        [counterCardId]: {
          cardId: counterCardId,
          name: "Counter Event",
          category: "event",
          support: {
            status: "implemented-dsl",
            effectDefinitionId: "counter-event-definition",
          },
        },
      },
      effectDefinitions: {
        "counter-event-definition": definition,
      },
    },
    players: {
      [p1]: {
        playerId: p1,
        leader: {
          instanceId: "leader-instance" as InstanceId,
          cardId: "leader-card" as CardId,
        },
        deck: [],
        hand: [{ instanceId: counterInstanceId, cardId: counterCardId }],
        trash: [],
        characters: [],
        costArea: [],
        donDeck: [],
        life: [],
      },
    },
  }) as unknown as GameState;

describe("local dev action labels", () => {
  test("labels Event Counter actions by their selected effect", () => {
    const counterCardId = "counter-event-card" as CardId;
    const counterInstanceId = "counter-event-instance" as InstanceId;
    const targetInstanceId = "target-instance" as InstanceId;
    const drawEffectId = "counter-event-card:counter:draw" as EffectId;
    const powerEffectId = "counter-event-card:counter:power" as EffectId;
    const definition: EffectDefinition = {
      cardId: counterCardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: drawEffectId,
          category: "auto",
          trigger: { type: "counter" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          effect: { type: "draw", player: "self", count: 1 },
        },
        {
          id: powerEffectId,
          category: "auto",
          trigger: { type: "counter" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          effect: {
            type: "modifyPower",
            target: { type: "myLeader" },
            value: 2000,
            duration: { type: "thisBattle" },
          },
        },
      ],
      metadata: {
        sourceTextHash: "source-hash",
        rulesVersion: "rules",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewer: "test",
      },
    };
    const state = counterEventLabelState(
      definition,
      counterCardId,
      counterInstanceId,
    );
    const target = {
      instanceId: targetInstanceId,
      cardId: "target-card" as CardId,
      playerId: p1,
    };

    assert.equal(
      actionLabel(state, {
        type: "useCounter",
        cardInstanceId: counterInstanceId,
        effectId: drawEffectId,
        target,
      }),
      "Counter: Draw 1 card",
    );
    assert.equal(
      actionLabel(state, {
        type: "useCounter",
        cardInstanceId: counterInstanceId,
        effectId: powerEffectId,
        target,
      }),
      "Counter: Give Leader +2000 power",
    );
  });

  test("keeps duplicate Event Counter effect labels distinguishable", () => {
    const counterCardId = "counter-event-card" as CardId;
    const counterInstanceId = "counter-event-instance" as InstanceId;
    const firstEffectId = "counter-event-card:counter:first-draw" as EffectId;
    const secondEffectId = "counter-event-card:counter:second-draw" as EffectId;
    const definition: EffectDefinition = {
      cardId: counterCardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: firstEffectId,
          category: "auto",
          trigger: { type: "counter" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          effect: { type: "draw", player: "self", count: 1 },
        },
        {
          id: secondEffectId,
          category: "auto",
          trigger: { type: "counter" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          effect: { type: "draw", player: "self", count: 1 },
        },
      ],
      metadata: {
        sourceTextHash: "source-hash",
        rulesVersion: "rules",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewer: "test",
      },
    };
    const state = counterEventLabelState(
      definition,
      counterCardId,
      counterInstanceId,
    );
    const target = {
      instanceId: "target-instance" as InstanceId,
      cardId: "target-card" as CardId,
      playerId: p1,
    };

    assert.equal(
      actionLabel(state, {
        type: "useCounter",
        cardInstanceId: counterInstanceId,
        effectId: firstEffectId,
        target,
      }),
      "Counter: Draw 1 card (first-draw)",
    );
    assert.equal(
      actionLabel(state, {
        type: "useCounter",
        cardInstanceId: counterInstanceId,
        effectId: secondEffectId,
        target,
      }),
      "Counter: Draw 1 card (second-draw)",
    );
  });

  test("labels negative Event Counter power modifiers without double signs", () => {
    const counterCardId = "counter-event-card" as CardId;
    const counterInstanceId = "counter-event-instance" as InstanceId;
    const powerEffectId = "counter-event-card:counter:power-down" as EffectId;
    const definition: EffectDefinition = {
      cardId: counterCardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: powerEffectId,
          category: "auto",
          trigger: { type: "counter" },
          sourcePresencePolicy: "resolveFromDestinationZone",
          effect: {
            type: "modifyPower",
            target: { type: "opponentLeader" },
            value: -1000,
            duration: { type: "thisBattle" },
          },
        },
      ],
      metadata: {
        sourceTextHash: "source-hash",
        rulesVersion: "rules",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewer: "test",
      },
    };
    const state = counterEventLabelState(
      definition,
      counterCardId,
      counterInstanceId,
    );

    assert.equal(
      actionLabel(state, {
        type: "useCounter",
        cardInstanceId: counterInstanceId,
        effectId: powerEffectId,
        target: {
          instanceId: "target-instance" as InstanceId,
          cardId: "target-card" as CardId,
          playerId: p1,
        },
      }),
      "Counter: Give opponent's Leader -1000 power",
    );
  });

  test("labels counter actions with the counter amount when known", () => {
    const counterCardId = "counter-card" as CardId;
    const counterInstanceId = "counter-instance" as InstanceId;
    const targetInstanceId = "target-instance" as InstanceId;
    const state = {
      cardManifest: {
        cards: {
          [counterCardId]: {
            cardId: counterCardId,
            name: "Counter Card",
            category: "character",
            counter: 2000,
          },
        },
      },
      players: {
        [p1]: {
          playerId: p1,
          leader: {
            instanceId: "leader-instance" as InstanceId,
            cardId: "leader-card" as CardId,
          },
          deck: [],
          hand: [{ instanceId: counterInstanceId, cardId: counterCardId }],
          trash: [],
          characters: [],
          costArea: [],
          donDeck: [],
          life: [],
        },
      },
    } as unknown as GameState;

    assert.equal(
      actionLabel(state, {
        type: "useCounter",
        cardInstanceId: counterInstanceId,
        target: {
          instanceId: targetInstanceId,
          cardId: "target-card" as CardId,
          playerId: p1,
        },
      }),
      "Counter +2000",
    );
  });

  test("labels no-selection life-to-hand costs from payment option structure", () => {
    const state = payCostState([
      {
        id: "moveCards:top",
        type: "moveCards",
        count: 1,
        from: { player: "self", zone: "life", position: "top" },
        to: { player: "self", zone: "hand" },
      },
    ]);

    assert.equal(
      actionLabel(state, paymentAction("moveCards:top")),
      "Add top Life to hand",
    );
  });

  test("labels no-selection deck-top trash costs from payment option structure", () => {
    const state = payCostState([
      {
        id: "moveCards",
        type: "moveCards",
        count: 2,
        from: { player: "self", zone: "deck", position: "top" },
        to: { player: "self", zone: "trash" },
      },
    ]);

    assert.equal(
      actionLabel(state, paymentAction("moveCards")),
      "Trash 2 cards from top of deck",
    );
  });

  test("labels no-selection self costs from payment option structure", () => {
    const state = payCostState([{ id: "restSelf", type: "restSelf" }]);

    assert.equal(
      actionLabel(state, paymentAction("restSelf")),
      "Rest this card",
    );
  });
});
