import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  DecisionId,
  EngineEvent,
  InstanceId,
  PlayerId,
  PlayerView,
  Zone,
} from "@optcg/types";

import {
  activeCardCostGlobalActions,
  CLEAR_DECISION_SELECTION_ACTION_INDEX,
  CONFIRM_DECISION_SELECTION_ACTION_INDEX,
  prominentDecisionPrompt,
  resolvingEffectSourceInstanceIds,
} from "./useMatchClient-support.js";
import type {
  OptionalCardCostChoice,
  OptionalCardCostGroup,
} from "../interactions/payment-decision.js";

const optionalChoice: OptionalCardCostChoice = {
  decisionId: "decision:return-don" as DecisionId,
  declineActionIndex: 1,
  groups: [],
};

const returnDonGroup: OptionalCardCostGroup = {
  chooseActionIndex: -5,
  operation: "returnDon",
  chooseLabel: "Choose DON!! to return",
  requiredCount: 2,
  source: { zone: "costArea" as Zone, playerId: "p1" as PlayerId },
  cardActions: [
    { instanceIds: ["don-1", "don-2"], actionIndex: 2 },
    { instanceIds: ["don-1", "don-3"], actionIndex: 3 },
  ],
};

const moveCardsGroup: OptionalCardCostGroup = {
  chooseActionIndex: -5,
  operation: "moveCards",
  chooseLabel: "Choose cards from trash",
  requiredCount: 2,
  source: { zone: "trash" as Zone, playerId: "p1" as PlayerId },
  cardActions: [
    { instanceIds: ["trash-1", "trash-2"], actionIndex: 2 },
    { instanceIds: ["trash-1", "trash-3"], actionIndex: 3 },
  ],
};

const event = (
  overrides: Partial<EngineEvent> & Pick<EngineEvent, "type" | "seq">,
): EngineEvent => ({
  id: `event:${String(overrides.seq)}:${overrides.type}` as EngineEvent["id"],
  payload: {},
  visibility: { type: "public" },
  createdAtStateSeq: 1 as EngineEvent["createdAtStateSeq"],
  ...overrides,
});

const decision = (id: string): NonNullable<PlayerView["pendingDecision"]> => ({
  id: id as DecisionId,
  type: "selectCards",
  playerId: "p1" as PlayerId,
  prompt: "Choose a card.",
  causedBy: { type: "ruleProcess", name: "privateCausality" },
  min: 0,
  max: 1,
  candidates: [],
  choices: [],
});

const targetDecision = (
  id: string,
): NonNullable<PlayerView["pendingDecision"]> => ({
  id: id as DecisionId,
  type: "selectTargets",
  playerId: "p1" as PlayerId,
  prompt: "Choose a target.",
  causedBy: { type: "ruleProcess", name: "privateCausality" },
  min: 0,
  max: 1,
  candidates: [],
});

const quantityDecision = (
  id: string,
): NonNullable<PlayerView["pendingDecision"]> => ({
  id: id as DecisionId,
  type: "chooseQuantity",
  playerId: "p1" as PlayerId,
  prompt: "Choose a number.",
  causedBy: { type: "ruleProcess", name: "privateCausality" },
  mode: "upTo",
  min: 0,
  max: 2,
});

const payCostDecision = (
  id: string,
): NonNullable<PlayerView["pendingDecision"]> => ({
  id: id as DecisionId,
  type: "payCost",
  playerId: "p1" as PlayerId,
  prompt: "Pay cost.",
  causedBy: { type: "ruleProcess", name: "privateCausality" },
});

const activeSourceEvents = (decisionId: string): EngineEvent[] => [
  event({
    type: "effectQueued",
    seq: 1,
    source: {
      instanceId: "active-source" as InstanceId,
      cardId: "OP13-089" as CardId,
      playerId: "p1" as PlayerId,
    },
  }),
  event({
    type: "decisionCreated",
    seq: 2,
    payload: { decisionId },
  }),
];

describe("match client support helpers", () => {
  test("active card-cost selections expose global confirm and clear actions", () => {
    assert.deepEqual(
      activeCardCostGlobalActions({
        choice: optionalChoice,
        group: moveCardsGroup,
        explicitChoiceActive: false,
        selectedInstanceCount: 2,
        selectedActionIndex: 2,
      }),
      [
        { index: 1, label: "Decline cost", type: "respondToDecision" },
        {
          index: CONFIRM_DECISION_SELECTION_ACTION_INDEX,
          label: "Pay cost",
          type: "confirmDecisionSelection",
        },
        {
          index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
          label: "Clear selection",
          type: "clearDecisionSelection",
        },
      ],
    );
  });

  test("direct return-DON costs expose only decline while clicks drive payment", () => {
    assert.deepEqual(
      activeCardCostGlobalActions({
        choice: optionalChoice,
        group: returnDonGroup,
        explicitChoiceActive: false,
        selectedInstanceCount: 1,
        selectedActionIndex: undefined,
      }),
      [{ index: 1, label: "Decline cost", type: "respondToDecision" }],
    );
  });

  test("current pending decision activates its visible effect source card", () => {
    const activeSource = resolvingEffectSourceInstanceIds({
      pendingDecision: decision("decision:search"),
      events: [
        event({
          type: "effectQueued",
          seq: 1,
          source: {
            instanceId: "old-source" as InstanceId,
            cardId: "OP13-001" as CardId,
            playerId: "p1" as PlayerId,
          },
        }),
        event({
          type: "effectResolved",
          seq: 2,
          source: {
            instanceId: "old-source" as InstanceId,
            cardId: "OP13-001" as CardId,
            playerId: "p1" as PlayerId,
          },
        }),
        event({
          type: "effectQueued",
          seq: 3,
          source: {
            instanceId: "active-source" as InstanceId,
            cardId: "OP13-089" as CardId,
            playerId: "p1" as PlayerId,
          },
        }),
        event({
          type: "decisionCreated",
          seq: 4,
          payload: { decisionId: "decision:search" },
        }),
      ],
    });

    assert.deepEqual(activeSource, ["active-source"]);
  });

  test("projected pending decision source drives active card highlighting directly", () => {
    const activeSource = resolvingEffectSourceInstanceIds({
      pendingDecision: {
        ...decision("decision:search"),
        source: {
          instanceId: "projected-source" as InstanceId,
          cardId: "OP13-089" as CardId,
          playerId: "p1" as PlayerId,
        },
      },
      events: [],
    });

    assert.deepEqual(activeSource, ["projected-source"]);
  });

  test("prominent decision prompt uses action-oriented cost labels", () => {
    assert.equal(
      prominentDecisionPrompt({
        pendingDecision: payCostDecision("decision:return-don"),
        activeCardCostGroup: returnDonGroup,
      }),
      "Return 2 DON!!",
    );
    assert.equal(
      prominentDecisionPrompt({
        pendingDecision: decision("decision:search"),
        activeCardCostGroup: undefined,
      }),
      "Choose a card",
    );
  });

  test("resolved effects and unrelated decisions do not keep stale active cards", () => {
    const activeSource = resolvingEffectSourceInstanceIds({
      pendingDecision: decision("decision:mulligan"),
      events: [
        event({
          type: "effectQueued",
          seq: 1,
          source: {
            instanceId: "old-source" as InstanceId,
            cardId: "OP13-089" as CardId,
            playerId: "p1" as PlayerId,
          },
        }),
        event({
          type: "effectResolved",
          seq: 2,
          source: {
            instanceId: "old-source" as InstanceId,
            cardId: "OP13-089" as CardId,
            playerId: "p1" as PlayerId,
          },
        }),
        event({
          type: "decisionCreated",
          seq: 3,
          payload: { decisionId: "decision:mulligan" },
        }),
      ],
    });

    assert.deepEqual(activeSource, []);
  });

  test("effect source highlighting applies across pending decision shapes", () => {
    const decisionCases = [
      decision("decision:select-cards"),
      targetDecision("decision:select-targets"),
      quantityDecision("decision:quantity"),
      payCostDecision("decision:pay-cost"),
    ];

    for (const currentDecision of decisionCases) {
      assert.deepEqual(
        resolvingEffectSourceInstanceIds({
          pendingDecision: currentDecision,
          events: activeSourceEvents(String(currentDecision.id)),
        }),
        ["active-source"],
      );
    }
  });
});
