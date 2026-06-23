import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  CardRef,
  DecisionId,
  DecisionResponse,
  InstanceId,
  PlayerId,
  PublicPendingDecisionId,
  Zone,
} from "@optcg/types";

import { chooseBotAction, createBotStrategy } from "./bot-player.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botId = "p2" as PlayerId;
type BotPendingDecision = NonNullable<
  DevMatchSnapshot["players"][PlayerId]["view"]["pendingDecision"]
>;
type BotPendingDecisionBase<TType extends BotPendingDecision["type"]> = Pick<
  Extract<BotPendingDecision, { type: TType }>,
  | "id"
  | "spotlightPendingId"
  | "type"
  | "playerId"
  | "prompt"
  | "causedBy"
  | "presentation"
>;

const cardRef = (instanceId: string, cardId: string = "OP01-001"): CardRef => ({
  instanceId: instanceId as InstanceId,
  cardId: cardId as CardId,
  playerId: botId,
});

const baseDecision = <TType extends BotPendingDecision["type"]>(
  id: string,
  type: TType,
): BotPendingDecisionBase<TType> =>
  ({
    id: id as DecisionId,
    spotlightPendingId:
      `spotlight:pending:test:${id}` as PublicPendingDecisionId,
    type,
    playerId: botId,
    prompt: "Choose.",
    causedBy: { type: "ruleProcess", name: "test" },
    presentation: { title: "Choose", instruction: "Choose." },
  }) as BotPendingDecisionBase<TType>;

const snapshotWithDecision = (
  pendingDecision: NonNullable<
    DevMatchSnapshot["players"][PlayerId]["view"]["pendingDecision"]
  >,
  actions: readonly DevVisibleAction[] = [],
): DevMatchSnapshot =>
  ({
    stateSeq: 7,
    actionSeq: 3,
    stateHash: "hash",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: botId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botId]: 1 },
    },
    activePlayerId: botId,
    players: {
      [botId]: {
        view: { pendingDecision },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("bot decision liveness", () => {
  test("answers every public pending decision type without visible actions", () => {
    const orderedCard = cardRef("ordered-card");
    const targetCard = cardRef("target-card", "OP01-002");
    const selectedCard = cardRef("selected-card", "OP01-003");
    const destination = "deck" as Zone;
    const cases: readonly {
      readonly name: string;
      readonly decision: BotPendingDecision;
      readonly response: DecisionResponse;
    }[] = [
      {
        name: "payCost",
        decision: {
          ...baseDecision("decision:matrix:pay-cost", "payCost"),
        },
        response: { type: "paymentDeclined" },
      },
      {
        name: "chooseTriggerOrder",
        decision: {
          ...baseDecision(
            "decision:matrix:choose-trigger-order",
            "chooseTriggerOrder",
          ),
          choices: [{ triggerId: "trigger-1", source: cardRef("source-card") }],
        },
        response: { type: "orderedIds", ids: ["trigger-1"] },
      },
      {
        name: "chooseEffectOption",
        decision: {
          ...baseDecision(
            "decision:matrix:choose-effect-option",
            "chooseEffectOption",
          ),
          presentation: {
            title: "Choose one",
            instruction: "Choose one.",
            choices: [{ responseKey: "decline", label: "Do nothing" }],
          },
        },
        response: { type: "effectOptionDeclined" },
      },
      {
        name: "chooseReplacement",
        decision: {
          ...baseDecision(
            "decision:matrix:choose-replacement",
            "chooseReplacement",
          ),
          presentation: {
            title: "Choose replacement",
            instruction: "Choose replacement.",
            choices: [{ responseKey: "decline", label: "Do not replace" }],
          },
        },
        response: { type: "replacement" },
      },
      {
        name: "chooseQuantity",
        decision: {
          ...baseDecision("decision:matrix:choose-quantity", "chooseQuantity"),
          mode: "upTo",
          min: 1,
          max: 3,
        },
        response: { type: "chooseQuantity", quantity: 1 },
      },
      {
        name: "selectCards",
        decision: {
          ...baseDecision("decision:matrix:select-cards", "selectCards"),
          min: 1,
          max: 2,
          candidates: [{ card: selectedCard }],
          choices: [{ card: selectedCard, selectable: true }],
        },
        response: { type: "cards", cards: [selectedCard] },
      },
      {
        name: "selectTargets",
        decision: {
          ...baseDecision("decision:matrix:select-targets", "selectTargets"),
          min: 1,
          max: 1,
          candidates: [{ card: targetCard }],
        },
        response: { type: "targets", targets: [targetCard] },
      },
      {
        name: "orderCards",
        decision: {
          ...baseDecision("decision:matrix:order-cards", "orderCards"),
          cards: [orderedCard],
          destination,
        },
        response: { type: "orderedIds", ids: [String(orderedCard.instanceId)] },
      },
      {
        name: "confirmLifeTrigger",
        decision: {
          ...baseDecision(
            "decision:matrix:confirm-life-trigger",
            "confirmLifeTrigger",
          ),
          card: cardRef("life-card"),
        },
        response: { type: "lifeTrigger", choice: "addToHand" },
      },
      {
        name: "chooseOptionalActivation",
        decision: {
          ...baseDecision(
            "decision:matrix:choose-optional-activation",
            "chooseOptionalActivation",
          ),
        },
        response: { type: "optionalActivation", choice: "decline" },
      },
      {
        name: "mulligan",
        decision: {
          ...baseDecision("decision:matrix:mulligan", "mulligan"),
        },
        response: { type: "mulligan", keep: true },
      },
      {
        name: "declareLoopCount",
        decision: {
          ...baseDecision(
            "decision:matrix:declare-loop-count",
            "declareLoopCount",
          ),
        },
        response: { type: "loopCount", count: 1 },
      },
      {
        name: "rollbackConsent",
        decision: {
          ...baseDecision(
            "decision:matrix:rollback-consent",
            "rollbackConsent",
          ),
        },
        response: { type: "rollbackConsent", allow: true },
      },
    ];

    for (const { name, decision, response } of cases) {
      const chosen = chooseBotAction(snapshotWithDecision(decision), botId);

      assert.deepEqual(
        chosen,
        {
          type: "respondToDecision",
          decisionId: decision.id,
          response,
        },
        name,
      );
    }
  });

  test("does not take normal visible actions while fallback can answer a pending decision", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision(
        {
          ...baseDecision("decision:normal-action-blocked", "chooseQuantity"),
          mode: "upTo",
          min: 0,
          max: 2,
        },
        [
          {
            index: 0,
            type: "playCard",
            label: "Play card",
          },
          {
            index: 1,
            type: "endMainPhase",
            label: "End turn",
          },
        ],
      ),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:normal-action-blocked",
      response: { type: "chooseQuantity", quantity: 0 },
    });
  });

  test("declines a pending cost when no visible payment action exists", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision({
        id: "decision:cost" as DecisionId,
        spotlightPendingId:
          "spotlight:pending:test:cost" as PublicPendingDecisionId,
        type: "payCost",
        playerId: botId,
        prompt: "Pay the cost?",
        causedBy: { type: "ruleProcess", name: "test" },
        presentation: { title: "Pay cost", instruction: "Pay the cost." },
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:cost",
      response: { type: "paymentDeclined" },
    });
  });

  test("submits an empty trigger order when there are no trigger choices", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision({
        id: "decision:trigger-order" as DecisionId,
        spotlightPendingId:
          "spotlight:pending:test:trigger-order" as PublicPendingDecisionId,
        type: "chooseTriggerOrder",
        playerId: botId,
        prompt: "Choose trigger order.",
        causedBy: { type: "ruleProcess", name: "test" },
        presentation: {
          title: "Choose order",
          instruction: "Choose trigger order.",
        },
        choices: [],
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:trigger-order",
      response: { type: "orderedIds", ids: [] },
    });
  });

  test("uses a visible effect option response instead of blindly declining", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision(
        {
          id: "decision:effect-option" as DecisionId,
          spotlightPendingId:
            "spotlight:pending:test:effect-option" as PublicPendingDecisionId,
          type: "chooseEffectOption",
          playerId: botId,
          prompt: "Choose one.",
          causedBy: { type: "ruleProcess", name: "test" },
          presentation: { title: "Choose one", instruction: "Choose one." },
        },
        [
          {
            index: 0,
            type: "respondToDecision",
            label: "Use effect option",
            responseKey: "effect-option:0",
          },
        ],
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("uses a visible replacement response instead of blindly declining", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision(
        {
          id: "decision:replacement" as DecisionId,
          spotlightPendingId:
            "spotlight:pending:test:replacement" as PublicPendingDecisionId,
          type: "chooseReplacement",
          playerId: botId,
          prompt: "Choose replacement.",
          causedBy: { type: "ruleProcess", name: "test" },
          presentation: {
            title: "Choose replacement",
            instruction: "Choose replacement.",
          },
        },
        [
          {
            index: 0,
            type: "respondToDecision",
            label: "Use replacement",
            responseKey: "replacement:0",
          },
        ],
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("pays a visible cost response instead of declining it", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision(
        {
          id: "decision:activation-cost" as DecisionId,
          spotlightPendingId:
            "spotlight:pending:test:activation-cost" as PublicPendingDecisionId,
          type: "payCost",
          playerId: botId,
          prompt: "Pay the cost?",
          causedBy: { type: "ruleProcess", name: "test" },
          presentation: { title: "Pay cost", instruction: "Pay the cost." },
        },
        [
          {
            index: 0,
            type: "respondToDecision",
            label: "Decline cost",
            responseKey: "decline",
            decisionPayment: { kind: "paymentDeclined" },
          },
          {
            index: 1,
            type: "respondToDecision",
            label: "Rest 1 DON!!",
            responseKey: "restDon",
          },
        ],
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("uses a visible card selection response instead of synthesizing one", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision(
        {
          id: "decision:select-visible" as DecisionId,
          spotlightPendingId:
            "spotlight:pending:test:select-visible" as PublicPendingDecisionId,
          type: "selectCards",
          playerId: botId,
          prompt: "Choose cards.",
          causedBy: { type: "ruleProcess", name: "test" },
          presentation: { title: "Choose", instruction: "Choose." },
          min: 1,
          max: 1,
          candidates: [
            {
              card: {
                instanceId: "card-1" as InstanceId,
                cardId: "OP01-001" as CardId,
                playerId: botId,
              },
            },
          ],
          choices: [],
        },
        [
          {
            index: 0,
            type: "playCard",
            label: "Play another card",
          },
          {
            index: 7,
            type: "respondToDecision",
            label: "Choose legal selection",
            responseKey: "cards:card-1",
          },
        ],
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 7 });
  });

  test("uses a visible quantity response instead of synthesizing one", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision(
        {
          id: "decision:quantity-visible" as DecisionId,
          spotlightPendingId:
            "spotlight:pending:test:quantity-visible" as PublicPendingDecisionId,
          type: "chooseQuantity",
          playerId: botId,
          prompt: "Choose quantity.",
          causedBy: { type: "ruleProcess", name: "test" },
          presentation: { title: "Choose", instruction: "Choose." },
          mode: "upTo",
          min: 0,
          max: 3,
        },
        [
          {
            index: 2,
            type: "respondToDecision",
            label: "Choose 2",
            responseKey: "quantity:2",
          },
        ],
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 2 });
  });

  test("chooses an effect option from public presentation choices when decline is not legal", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision({
        ...baseDecision(
          "decision:mandatory-effect-option",
          "chooseEffectOption",
        ),
        presentation: {
          title: "Choose one",
          instruction: "Choose one.",
          choices: [{ responseKey: "option:draw", label: "Draw 1 card" }],
        },
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:mandatory-effect-option",
      response: { type: "effectOption", optionId: "option:draw" },
    });
  });

  test("chooses a replacement from public presentation choices when decline is not legal", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision({
        ...baseDecision("decision:mandatory-replacement", "chooseReplacement"),
        presentation: {
          title: "Choose replacement",
          instruction: "Choose replacement.",
          choices: [
            {
              responseKey: "replacement:would-be-ko-draw-1",
              label: "Use replacement",
            },
          ],
        },
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:mandatory-replacement",
      response: {
        type: "replacement",
        replacementId: "replacement:would-be-ko-draw-1",
      },
    });
  });

  test("profile scoring cannot suppress a projected visible decision action", () => {
    const strategy = createBotStrategy({
      scoreAction: ({ action }) =>
        action.type === "respondToDecision" ? false : undefined,
    });
    const chosen = strategy.chooseAction({
      snapshot: snapshotWithDecision(
        {
          ...baseDecision(
            "decision:profile-cannot-suppress-visible",
            "chooseQuantity",
          ),
          mode: "upTo",
          min: 0,
          max: 3,
        },
        [
          {
            index: 4,
            type: "respondToDecision",
            label: "Choose 2",
            responseKey: "2",
          },
        ],
      ),
      botPlayerId: botId,
    });

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 4 });
  });

  test("still activates an effect before ending main phase", () => {
    const chosen = chooseBotAction(
      {
        stateSeq: 7,
        actionSeq: 3,
        stateHash: "hash",
        status: "active",
        turn: {
          turnNumber: 1,
          turnPlayerId: botId,
          phase: "main",
          globalTurn: 1,
          playerTurnCounts: { [botId]: 1 },
        },
        activePlayerId: botId,
        players: {
          [botId]: {
            view: {},
            actions: [
              {
                index: 0,
                type: "endMainPhase",
                label: "End turn",
              },
              {
                index: 1,
                type: "activateEffect",
                label: "Activate effect",
              },
            ],
          },
        },
      } as unknown as DevMatchSnapshot,
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("answers character overflow selectCards decisions from candidates", () => {
    const overflowCard: CardRef = {
      instanceId: "character-1" as InstanceId,
      cardId: "OP01-001" as CardId,
      playerId: botId,
      zone: { zone: "characterArea", playerId: botId, index: 0 },
    };
    const chosen = chooseBotAction(
      snapshotWithDecision({
        id: "decision:character-overflow:played-card" as DecisionId,
        spotlightPendingId:
          "spotlight:pending:test:character-overflow:played-card" as PublicPendingDecisionId,
        type: "selectCards",
        playerId: botId,
        prompt: "Choose a Character to trash.",
        causedBy: { type: "ruleProcess", name: "characterOverflow" },
        presentation: {
          title: "Character overflow",
          instruction: "Choose a Character to trash.",
        },
        min: 1,
        max: 1,
        candidates: [{ card: overflowCard }],
        choices: [],
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:character-overflow:played-card",
      response: { type: "cards", cards: [overflowCard] },
    });
  });

  test("answers runtime play overflow by selecting exactly one character", () => {
    const firstCharacter: CardRef = {
      instanceId: "character-1" as InstanceId,
      cardId: "OP01-001" as CardId,
      playerId: botId,
      zone: { zone: "characterArea", playerId: botId, index: 0 },
    };
    const secondCharacter: CardRef = {
      instanceId: "character-2" as InstanceId,
      cardId: "OP01-002" as CardId,
      playerId: botId,
      zone: { zone: "characterArea", playerId: botId, index: 1 },
    };
    const chosen = chooseBotAction(
      snapshotWithDecision({
        id: "decision:runtime:playSelected:overflow:played-card:11" as DecisionId,
        spotlightPendingId:
          "spotlight:pending:test:runtime:playSelected:overflow:played-card:11" as PublicPendingDecisionId,
        type: "selectCards",
        playerId: botId,
        prompt: "Choose a Character to trash.",
        causedBy: { type: "ruleProcess", name: "playSelectedOverflow" },
        presentation: {
          title: "Character overflow",
          instruction: "Choose a Character to trash.",
        },
        min: 0,
        max: 5,
        candidates: [{ card: firstCharacter }, { card: secondCharacter }],
        choices: [
          { card: firstCharacter, selectable: true },
          { card: secondCharacter, selectable: true },
        ],
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:runtime:playSelected:overflow:played-card:11",
      response: { type: "cards", cards: [firstCharacter] },
    });
  });
});
