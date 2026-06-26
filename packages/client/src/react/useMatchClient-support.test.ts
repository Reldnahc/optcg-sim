import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  DecisionId,
  EngineEvent,
  InstanceId,
  MatchId,
  PlayerId,
  PlayerView,
  PublicSelectCardsDecision,
  Zone,
} from "@optcg/types";

import {
  activeCardCostGlobalActions,
  applyActiveCardCostLifeChoiceCards,
  buildGlobalActions,
  cardActionsForInstance,
  CHOOSE_NO_DECISION_CARDS_ACTION_INDEX,
  CLEAR_DECISION_SELECTION_ACTION_INDEX,
  CONFIRM_DECISION_SELECTION_ACTION_INDEX,
  applyPendingDecisionLifeChoiceCards,
  prominentDecisionPrompt,
  resolvingEffectSourceInstanceIds,
  setMatchLocation,
  zoneClickVisibleInstanceIds,
} from "./useMatchClient-support.js";
import type { BoardViewModel, ClientCardModel } from "../view-model.js";
import type { ClientVisibleAction } from "../transport.js";
import type {
  OptionalCardCostChoice,
  OptionalCardCostGroup,
} from "../interactions/payment-decision.js";

type BuildGlobalActionsPlayerSnapshot = NonNullable<
  Parameters<typeof buildGlobalActions>[0]["playerSnapshot"]
>;

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

const lifeMoveCardsGroup: OptionalCardCostGroup = {
  chooseActionIndex: -5,
  operation: "moveCards",
  chooseLabel: "Choose Life card",
  requiredCount: 1,
  source: { zone: "life" as Zone, playerId: "p1" as PlayerId },
  cardActions: [
    {
      instanceIds: ["real-life-top"],
      actionIndex: 2,
      selectedCards: [
        {
          instanceId: "real-life-top" as InstanceId,
          zone: "life",
          playerId: "p1" as PlayerId,
          index: 0,
        },
      ],
    },
    {
      instanceIds: ["real-life-bottom"],
      actionIndex: 3,
      selectedCards: [
        {
          instanceId: "real-life-bottom" as InstanceId,
          zone: "life",
          playerId: "p1" as PlayerId,
          index: 1,
        },
      ],
    },
  ],
};

const variableTrashFromHandGroup: OptionalCardCostGroup = {
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

const fixedRevealFromHandGroup: OptionalCardCostGroup = {
  chooseActionIndex: -5,
  operation: "reveal",
  chooseLabel: "Choose card to reveal",
  requiredCount: 1,
  source: { zone: "hand" as Zone, playerId: "p1" as PlayerId },
  cardActions: [{ instanceIds: ["event-1"], actionIndex: 2 }],
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

const presentation = (prompt: string) => ({
  title: prompt,
  instruction: prompt,
});

const decision = (id: string): NonNullable<PlayerView["pendingDecision"]> => ({
  id: id as DecisionId,
  spotlightPendingId: `spotlight:${id}` as NonNullable<
    PlayerView["pendingDecision"]
  >["spotlightPendingId"],
  type: "selectCards",
  playerId: "p1" as PlayerId,
  prompt: "Choose a card.",
  presentation: presentation("Choose a card."),
  causedBy: { type: "ruleProcess", name: "privateCausality" },
  min: 0,
  max: 1,
  candidates: [],
  choices: [],
});

const selectCardsDecision = (id: string): PublicSelectCardsDecision => ({
  id: id as DecisionId,
  spotlightPendingId:
    `spotlight:${id}` as PublicSelectCardsDecision["spotlightPendingId"],
  type: "selectCards",
  playerId: "p1" as PlayerId,
  prompt: "Choose a card.",
  presentation: presentation("Choose a card."),
  causedBy: { type: "ruleProcess", name: "privateCausality" },
  min: 0,
  max: 1,
  candidates: [],
  choices: [],
});

const counterPassDecision = (): PublicSelectCardsDecision => ({
  ...selectCardsDecision("decision:counterStep:pass:attacker-1:7"),
  prompt: "Use counter or end step.",
  presentation: {
    ...presentation("Use counter or end step."),
    choices: [{ responseKey: "default", label: "End step" }],
  },
  min: 0,
  max: 0,
  candidates: [],
  choices: [],
});

const playerSnapshotWithActions = (
  actions: ClientVisibleAction[],
): BuildGlobalActionsPlayerSnapshot => ({
  view: {
    ...({} as PlayerView),
    events: [],
  },
  actions,
});

const targetDecision = (
  id: string,
): NonNullable<PlayerView["pendingDecision"]> => ({
  id: id as DecisionId,
  spotlightPendingId: `spotlight:${id}` as NonNullable<
    PlayerView["pendingDecision"]
  >["spotlightPendingId"],
  type: "selectTargets",
  playerId: "p1" as PlayerId,
  prompt: "Choose a target.",
  presentation: presentation("Choose a target."),
  causedBy: { type: "ruleProcess", name: "privateCausality" },
  min: 0,
  max: 1,
  candidates: [],
});

const quantityDecision = (
  id: string,
): NonNullable<PlayerView["pendingDecision"]> => ({
  id: id as DecisionId,
  spotlightPendingId: `spotlight:${id}` as NonNullable<
    PlayerView["pendingDecision"]
  >["spotlightPendingId"],
  type: "chooseQuantity",
  playerId: "p1" as PlayerId,
  prompt: "Choose a number.",
  presentation: presentation("Choose a number."),
  causedBy: { type: "ruleProcess", name: "privateCausality" },
  mode: "upTo",
  min: 0,
  max: 2,
});

const payCostDecision = (
  id: string,
): NonNullable<PlayerView["pendingDecision"]> => ({
  id: id as DecisionId,
  spotlightPendingId: `spotlight:${id}` as NonNullable<
    PlayerView["pendingDecision"]
  >["spotlightPendingId"],
  type: "payCost",
  playerId: "p1" as PlayerId,
  prompt: "Pay cost.",
  presentation: presentation("Pay cost."),
  causedBy: { type: "ruleProcess", name: "privateCausality" },
});

const hiddenLifeCard = (id: string, cardId = "hidden"): ClientCardModel => ({
  instanceId: id as InstanceId,
  cardId: cardId as CardId,
  name: "Hidden card",
  category: "hidden",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const boardWithLife = (): BoardViewModel => {
  const selfLeader = hiddenLifeCard("self-leader", "SELF-LEADER");
  const opponentLeader = hiddenLifeCard("opponent-leader", "OPP-LEADER");
  return {
    playerId: "p1" as PlayerId,
    selfLabel: "Player",
    opponentLabel: "Opponent",
    selfIsTurnPlayer: true,
    opponentIsTurnPlayer: false,
    self: {
      leader: selfLeader,
      hand: [],
      characters: [],
      costArea: [],
      trash: [],
      deckCount: 0,
      donDeckCount: 0,
      lifeCount: 2,
      lifeCards: [
        hiddenLifeCard("hidden-life-self-0"),
        hiddenLifeCard("hidden-life-self-1"),
      ],
    },
    opponent: {
      leader: opponentLeader,
      handCount: 0,
      characters: [],
      costArea: [],
      trash: [],
      deckCount: 0,
      donDeckCount: 0,
      lifeCount: 0,
      lifeCards: [],
    },
    actionsByCardInstanceId: {},
  };
};

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
  test("global zero-card default decisions expose a direct fallback action", () => {
    const pendingDecision = counterPassDecision();

    assert.deepEqual(
      buildGlobalActions({
        playerSnapshot: playerSnapshotWithActions([]),
        attackTargetChoiceActive: false,
        counterTargetChoiceActive: false,
        activeCardCostGroup: undefined,
        optionalCardCostChoice: undefined,
        explicitCardCostChoiceActive: false,
        selectedCardCostInstanceCount: 0,
        selectedCardCostActionIndex: undefined,
        pendingDecisionInteractionMode: "global",
        pendingDecision,
        activeDecisionDraft: undefined,
      }),
      [
        {
          index: CHOOSE_NO_DECISION_CARDS_ACTION_INDEX,
          label: "End step",
          type: "chooseNoDecisionCards",
        },
      ],
    );
  });

  test("global zero-card decisions without public default choices do not synthesize actions", () => {
    const pendingDecision: PublicSelectCardsDecision = {
      ...counterPassDecision(),
      presentation: presentation("Use counter or end step."),
    };

    assert.deepEqual(
      buildGlobalActions({
        playerSnapshot: playerSnapshotWithActions([]),
        attackTargetChoiceActive: false,
        counterTargetChoiceActive: false,
        activeCardCostGroup: undefined,
        optionalCardCostChoice: undefined,
        explicitCardCostChoiceActive: false,
        selectedCardCostInstanceCount: 0,
        selectedCardCostActionIndex: undefined,
        pendingDecisionInteractionMode: "global",
        pendingDecision,
        activeDecisionDraft: undefined,
      }),
      [],
    );
  });

  test("global zero-card counter decisions do not duplicate projected pass actions", () => {
    const pendingDecision = counterPassDecision();

    assert.deepEqual(
      buildGlobalActions({
        playerSnapshot: playerSnapshotWithActions([
          { index: 4, type: "respondToDecision", label: "End step" },
        ]),
        attackTargetChoiceActive: false,
        counterTargetChoiceActive: false,
        activeCardCostGroup: undefined,
        optionalCardCostChoice: undefined,
        explicitCardCostChoiceActive: false,
        selectedCardCostInstanceCount: 0,
        selectedCardCostActionIndex: undefined,
        pendingDecisionInteractionMode: "global",
        pendingDecision,
        activeDecisionDraft: undefined,
      }),
      [{ index: 4, label: "End step", type: "respondToDecision" }],
    );
  });

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
          label: "Place 2 cards from trash at bottom",
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

  test("variable hand-trash card costs use generic confirm copy", () => {
    assert.deepEqual(
      activeCardCostGlobalActions({
        choice: optionalChoice,
        group: variableTrashFromHandGroup,
        explicitChoiceActive: false,
        selectedInstanceCount: 1,
        selectedActionIndex: 2,
      }),
      [
        { index: 1, label: "Decline cost", type: "respondToDecision" },
        {
          index: CONFIRM_DECISION_SELECTION_ACTION_INDEX,
          label: "Trash cards",
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

  test("fixed hand card costs require explicit global confirmation", () => {
    assert.deepEqual(
      activeCardCostGlobalActions({
        choice: optionalChoice,
        group: fixedRevealFromHandGroup,
        explicitChoiceActive: false,
        selectedInstanceCount: 1,
        selectedActionIndex: 2,
      }),
      [
        { index: 1, label: "Decline cost", type: "respondToDecision" },
        {
          index: CONFIRM_DECISION_SELECTION_ACTION_INDEX,
          label: "Reveal 1 card from hand",
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

  test("pending life card choices render as hidden clickable zone cards", () => {
    const board = boardWithLife();
    const pendingDecision: PublicSelectCardsDecision = {
      ...selectCardsDecision("decision:life-cost"),
      candidates: [
        {
          card: {
            instanceId: "real-life-top" as InstanceId,
            cardId: "SECRET-LIFE" as CardId,
            playerId: "p1" as PlayerId,
            zone: { zone: "life", playerId: "p1" as PlayerId, index: 0 },
          },
        },
      ],
      choices: [
        {
          card: {
            instanceId: "real-life-top" as InstanceId,
            cardId: "SECRET-LIFE" as CardId,
            playerId: "p1" as PlayerId,
            zone: { zone: "life", playerId: "p1" as PlayerId, index: 0 },
          },
          selectable: true,
        },
      ],
    };

    const updated = applyPendingDecisionLifeChoiceCards(board, pendingDecision);
    assert.ok(updated);

    const firstLifeCard = updated.self.lifeCards[0];
    assert.ok(firstLifeCard);
    assert.equal(firstLifeCard.instanceId, "real-life-top");
    assert.equal(firstLifeCard.cardId, "hidden");
    assert.equal(firstLifeCard.category, "hidden");
    assert.deepEqual(zoneClickVisibleInstanceIds(updated), [
      "real-life-top",
      "hidden-life-self-1",
      "self-leader",
      "opponent-leader",
    ]);
  });

  test("active life card costs render as hidden clickable zone cards", () => {
    const updated = applyActiveCardCostLifeChoiceCards(
      boardWithLife(),
      lifeMoveCardsGroup,
    );
    assert.ok(updated);

    assert.deepEqual(
      updated.self.lifeCards.map((card) => String(card.instanceId)),
      ["real-life-top", "real-life-bottom"],
    );
    assert.deepEqual(zoneClickVisibleInstanceIds(updated), [
      "real-life-top",
      "real-life-bottom",
      "self-leader",
      "opponent-leader",
    ]);
  });

  test("card actions expose selected DON attachment for opponent targets when legal metadata exists", () => {
    const board = boardWithLife();
    const opponentCharacter = hiddenLifeCard("opponent-character", "OPP-CHAR");
    board.opponent.characters = [opponentCharacter];
    const actions: ClientVisibleAction[] = [
      {
        index: 12,
        type: "respondToDecision",
        label: "Pay cost",
        attachment: {
          donInstanceId: "opponent-rested-don" as InstanceId,
          targetInstanceId: opponentCharacter.instanceId,
        },
      },
    ];

    assert.deepEqual(
      cardActionsForInstance({
        board,
        instanceId: String(opponentCharacter.instanceId),
        selectedCardInstanceId: String(opponentCharacter.instanceId),
        selectedDonInstanceIds: ["opponent-rested-don"],
        legalActions: actions,
      }),
      [
        {
          index: -1,
          type: "attachDon",
          label: "Attach selected DON!!",
        },
      ],
    );
  });

  test("match URL updates preserve reusable room code paths", () => {
    const hadWindow = Object.prototype.hasOwnProperty.call(
      globalThis,
      "window",
    );
    const originalWindow = Reflect.get(globalThis, "window");
    const testWindow = {
      location: { href: "http://localhost/r/ab12" },
      history: {
        replaceState(_state: unknown, _title: string, url: string) {
          testWindow.location.href = new URL(
            url,
            testWindow.location.href,
          ).href;
        },
      },
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: testWindow,
    });
    try {
      setMatchLocation("match-rematch-1" as MatchId);

      assert.equal(testWindow.location.href, "http://localhost/r/ab12");
    } finally {
      if (!hadWindow) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
        });
      }
    }
  });
});
