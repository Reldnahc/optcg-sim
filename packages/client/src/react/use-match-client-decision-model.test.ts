import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  DecisionId,
  CardId,
  EffectId,
  InstanceId,
  MatchId,
  PlayerId,
  PlayerView,
  QueueEntryId,
  StateSeq,
  Zone,
} from "@optcg/types";

import type { ClientPlayerSnapshot } from "../transport.js";
import type { MatchClientState } from "../controller.js";
import { createMatchClientDecisionModel } from "./use-match-client-decision-model.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const card = (
  instanceId: string,
  cardId: string,
  zone: Zone,
  owner: PlayerId,
): PlayerView["self"]["leader"] => ({
  instanceId: instanceId as InstanceId,
  cardId: cardId as CardId,
  owner,
  controller: owner,
  zone: { playerId: owner, zone },
  attachedDonCount: 0,
  attachedDonIds: [],
});

const payCostDecision = {
  id: "decision:quick-pay" as DecisionId,
  spotlightPendingId: "spotlight:decision:quick-pay" as NonNullable<
    PlayerView["pendingDecision"]
  >["spotlightPendingId"],
  type: "payCost",
  playerId: p1,
  prompt: "Pay cost.",
  causedBy: { type: "playerAction", actionId: "action-quick-pay" },
  presentation: {
    title: "Pay cost",
    instruction: "Choose whether to pay.",
  },
} satisfies NonNullable<PlayerView["pendingDecision"]>;

const playerSnapshot = (): ClientPlayerSnapshot => ({
  view: {
    matchId: "match-1" as MatchId,
    playerId: p1,
    stateSeq: 1 as StateSeq,
    actionSeq: 1,
    turn: {
      globalTurn: 1,
      playerTurnCounts: { [p1]: 1 },
      turnPlayerId: p1,
      phase: "main",
    },
    self: {
      playerId: p1,
      deckCount: 0,
      donDeckCount: 0,
      hand: [],
      trash: [],
      leader: card("leader-1", "OP01-001", "leaderArea", p1),
      characters: [],
      costArea: [],
      life: { count: 0, faceUpCards: [] },
      hasMulliganed: true,
      turnCount: 1,
    },
    opponent: {
      playerId: p2,
      deckCount: 0,
      donDeckCount: 0,
      handCount: 0,
      trash: [],
      leader: card("opponent-leader-1", "OP01-002", "leaderArea", p2),
      characters: [],
      costArea: [],
      life: { count: 0, faceUpCards: [] },
      hasMulliganed: true,
      turnCount: 0,
    },
    pendingDecision: payCostDecision,
    legalActions: [],
    revealedCards: [],
    events: [],
    timers: { players: {} },
  },
  actions: [
    {
      index: 1,
      type: "respondToDecision",
      label: "Decline cost",
      decisionPayment: { kind: "paymentDeclined" },
    },
    { index: 2, type: "respondToDecision", label: "Rest this card" },
  ],
});

const matchClientState = (
  snapshot: ClientPlayerSnapshot,
): MatchClientState => ({
  matchId: "match-1" as MatchId,
  seat: { matchId: "match-1" as MatchId, playerId: p1 },
  snapshot: {
    matchId: "match-1" as MatchId,
    stateSeq: 1,
    actionSeq: 1,
    players: { [p1]: snapshot },
  },
  cards: {
    players: {
      [p1]: {
        cards: {
          [snapshot.view.self.leader.cardId]: {
            cardId: snapshot.view.self.leader.cardId,
            name: "Leader",
            category: "leader",
          },
          [snapshot.view.opponent.leader.cardId]: {
            cardId: snapshot.view.opponent.leader.cardId,
            name: "Opponent Leader",
            category: "leader",
          },
          ...Object.fromEntries(
            snapshot.view.opponent.characters.map((character) => [
              character.cardId,
              {
                cardId: character.cardId,
                name: "Opponent Character",
                category: "character",
                power: 7000,
              },
            ]),
          ),
        },
      },
    },
  },
});

describe("match client decision model", () => {
  test("suppresses the payment modal while armed quick-pay will submit activate-main cost", () => {
    const model = createMatchClientDecisionModel({
      clientState: undefined,
      playerSnapshot: playerSnapshot(),
      pendingDecision: payCostDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: [],
      decisionDraft: undefined,
      quickPayActivateMainCosts: true,
      quickPayActivateMainArmed: true,
    });

    assert.equal(model.quickPayActivateMainCostActionIndex, 2);
    assert.equal(model.decisionModal, undefined);
  });

  test("attach-DON pay costs use board-click cost selection instead of a modal", () => {
    const snapshot = playerSnapshot();
    snapshot.view.opponent.costArea = [
      {
        ...card("opponent-rested-don", "DON", "costArea", p2),
        state: "rested",
      },
    ];
    snapshot.view.opponent.characters = [
      card("opponent-character", "OP01-003", "characterArea", p2),
    ];
    snapshot.actions = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "opponent-rested-don" as InstanceId,
          targetInstanceId: "opponent-character" as InstanceId,
        },
      },
    ];

    const model = createMatchClientDecisionModel({
      clientState: undefined,
      playerSnapshot: snapshot,
      pendingDecision: payCostDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: [],
      decisionDraft: undefined,
    });

    assert.equal(model.decisionModal, undefined);
    assert.equal(model.activeCardCostGroup?.operation, "attachDon");
    assert.deepEqual(model.pendingChoiceInstanceIds, ["opponent-rested-don"]);
    assert.equal(model.decisionPrompt, "Choose DON!! to attach");
  });

  test("rest-DON pay costs use board-click cost selection instead of a modal", () => {
    const snapshot = playerSnapshot();
    snapshot.view.self.costArea = [
      {
        ...card("don-1", "DON", "costArea", p1),
        state: "active",
      },
      {
        ...card("don-2", "DON", "costArea", p1),
        state: "active",
      },
      {
        ...card("don-3", "DON", "costArea", p1),
        state: "active",
      },
    ];
    snapshot.actions = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 2 DON!!",
        decisionPayment: {
          kind: "cardCost",
          operation: "restDon",
          chooseLabel: "Choose DON!! to rest",
          selectedCardInstanceIds: [
            "don-1" as InstanceId,
            "don-2" as InstanceId,
          ],
          source: { zone: "costArea", playerId: p1 },
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 2 DON!!",
        decisionPayment: {
          kind: "cardCost",
          operation: "restDon",
          chooseLabel: "Choose DON!! to rest",
          selectedCardInstanceIds: [
            "don-1" as InstanceId,
            "don-3" as InstanceId,
          ],
          source: { zone: "costArea", playerId: p1 },
        },
      },
    ];

    const model = createMatchClientDecisionModel({
      clientState: matchClientState(snapshot),
      playerSnapshot: snapshot,
      pendingDecision: payCostDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: [],
      decisionDraft: undefined,
    });

    assert.equal(model.decisionModal, undefined);
    assert.equal(model.activeCardCostGroup?.operation, "restDon");
    assert.deepEqual(model.pendingChoiceInstanceIds, [
      "don-1",
      "don-2",
      "don-3",
    ]);
    assert.equal(model.decisionPrompt, "Rest 2 DON!!");
  });

  test("variable trash-from-hand pay costs use hand-card selection instead of a modal", () => {
    const snapshot = playerSnapshot();
    snapshot.view.self.hand = [
      card("event-1", "OP00-EVENT", "hand", p1),
      card("stage-1", "OP00-STAGE", "hand", p1),
    ];
    snapshot.actions = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Pay cost with 1 card",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: ["event-1" as InstanceId],
          source: { zone: "hand", playerId: p1 },
        },
      },
      {
        index: 3,
        type: "respondToDecision",
        label: "Pay cost with 2 cards",
        decisionPayment: {
          kind: "cardCost",
          operation: "trash",
          chooseLabel: "Choose card to trash",
          selectedCardInstanceIds: [
            "event-1" as InstanceId,
            "stage-1" as InstanceId,
          ],
          source: { zone: "hand", playerId: p1 },
        },
      },
    ];

    const model = createMatchClientDecisionModel({
      clientState: matchClientState(snapshot),
      playerSnapshot: snapshot,
      pendingDecision: payCostDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: ["event-1"],
      decisionDraft: undefined,
    });

    assert.equal(model.decisionModal, undefined);
    assert.equal(model.activeCardCostGroup?.operation, "trash");
    assert.deepEqual(model.pendingChoiceInstanceIds, ["event-1", "stage-1"]);
    assert.deepEqual(model.decisionSelectedInstanceIds, ["event-1"]);
    const selection = model.activeCardCostSelection;
    assert.ok(selection);
    assert.equal(selection.canConfirm, true);
    assert.equal(selection.confirmLabel, "Trash cards");
    assert.equal(model.selectedCardCostActionIndex, 2);
    assert.equal(model.decisionPrompt, "Trash cards");
  });

  test("server-projected pay-cost interactions drive hand-card selection without raw action metadata", () => {
    const snapshot = playerSnapshot();
    snapshot.view.self.hand = [
      card("event-1", "OP00-EVENT", "hand", p1),
      card("stage-1", "OP00-STAGE", "hand", p1),
    ];
    snapshot.actions = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        responseKey: "decline",
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Raw payment",
        responseKey: "trashFromHand",
      },
    ];
    snapshot.payCostInteraction = {
      decisionId: payCostDecision.id,
      declineActionIndex: 1,
      groups: [
        {
          chooseActionIndex: -5,
          operation: "trash",
          chooseLabel: "Choose card to trash",
          minCount: 1,
          requiredCount: 2,
          source: { zone: "hand", playerId: p1 },
          cardActions: [
            { instanceIds: ["event-1"], actionIndex: 2 },
            { instanceIds: ["event-1", "stage-1"], actionIndex: 3 },
          ],
        },
      ],
    };

    const model = createMatchClientDecisionModel({
      clientState: matchClientState(snapshot),
      playerSnapshot: snapshot,
      pendingDecision: payCostDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: ["event-1"],
      decisionDraft: undefined,
    });

    assert.equal(model.decisionModal, undefined);
    assert.equal(model.activeCardCostGroup?.operation, "trash");
    assert.deepEqual(model.pendingChoiceInstanceIds, ["event-1", "stage-1"]);
    assert.equal(model.selectedCardCostActionIndex, 2);
  });

  test("attach-DON pay costs highlight legal targets after selecting DON", () => {
    const snapshot = playerSnapshot();
    snapshot.view.opponent.costArea = [
      {
        ...card("opponent-rested-don", "DON", "costArea", p2),
        state: "rested",
      },
    ];
    snapshot.view.opponent.characters = [
      card("opponent-character", "OP01-003", "characterArea", p2),
    ];
    snapshot.actions = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "opponent-rested-don" as InstanceId,
          targetInstanceId: "opponent-character" as InstanceId,
        },
      },
    ];

    const model = createMatchClientDecisionModel({
      clientState: undefined,
      playerSnapshot: snapshot,
      pendingDecision: payCostDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: ["opponent-rested-don"],
      decisionDraft: undefined,
    });

    assert.deepEqual(model.pendingChoiceInstanceIds, ["opponent-character"]);
  });

  test("visible selectTargets decisions use board-click target selection", () => {
    const snapshot = playerSnapshot();
    const opponentCharacter = card(
      "opponent-character",
      "OP01-003",
      "characterArea",
      p2,
    );
    snapshot.view.opponent.characters = [opponentCharacter];
    snapshot.view.pendingDecision = {
      id: "decision:selectTargets:rested-reaction" as DecisionId,
      spotlightPendingId:
        "spotlight:decision:selectTargets:rested-reaction" as NonNullable<
          PlayerView["pendingDecision"]
        >["spotlightPendingId"],
      type: "selectTargets",
      playerId: p1,
      prompt: "Choose target.",
      causedBy: { type: "ruleProcess", name: "privateCausality" },
      presentation: { title: "Choose target", instruction: "Choose target." },
      min: 0,
      max: 1,
      candidates: [
        {
          card: {
            instanceId: opponentCharacter.instanceId,
            cardId: opponentCharacter.cardId,
            playerId: p2,
            zone: opponentCharacter.zone,
          },
        },
      ],
    };
    snapshot.actions = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Choose no target",
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Choose target",
      },
    ];

    const model = createMatchClientDecisionModel({
      clientState: matchClientState(snapshot),
      playerSnapshot: snapshot,
      pendingDecision: snapshot.view.pendingDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: [],
      decisionDraft: undefined,
    });

    assert.equal(model.pendingDecisionInteractionMode, "zoneClick");
    assert.deepEqual(model.pendingChoiceInstanceIds, ["opponent-character"]);
    assert.equal(model.decisionModal, undefined);
  });

  test("placed optional activation responses still open the decision modal", () => {
    const snapshot = playerSnapshot();
    const source = snapshot.view.self.leader;
    snapshot.view.pendingDecision = {
      id: "decision:chooseOptionalActivation:test" as DecisionId,
      spotlightPendingId:
        "spotlight:decision:chooseOptionalActivation:test" as NonNullable<
          PlayerView["pendingDecision"]
        >["spotlightPendingId"],
      type: "chooseOptionalActivation",
      playerId: p1,
      prompt: "Choose whether to activate this effect.",
      causedBy: {
        type: "effect",
        queueEntryId: "queue-entry:test" as QueueEntryId,
        effectId: "effect:test" as EffectId,
      },
      presentation: {
        title: "Optional effect",
        instruction: "Choose whether to activate this effect",
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
          zone: source.zone,
        },
        choices: [
          { responseKey: "activate", label: "Activate effect" },
          { responseKey: "decline", label: "Decline effect" },
        ],
      },
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
    };
    snapshot.actions = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Activate effect",
        responseKey: "activate",
        placement: { instanceId: source.instanceId },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Decline effect",
        responseKey: "decline",
        placement: { instanceId: source.instanceId },
      },
    ];

    const model = createMatchClientDecisionModel({
      clientState: matchClientState(snapshot),
      playerSnapshot: snapshot,
      pendingDecision: snapshot.view.pendingDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: [],
      decisionDraft: undefined,
    });

    assert.equal(model.decisionModal?.kind, "optionalActivation");
    assert.deepEqual(
      model.decisionModal?.options.map((option) => option.label),
      ["Activate effect", "Decline effect"],
    );
    assert.deepEqual(
      model.board?.actionsByCardInstanceId[String(source.instanceId)]?.map(
        (action) => action.responseKey,
      ),
      ["activate", "decline"],
    );
  });
});
