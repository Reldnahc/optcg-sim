import { strict as assert } from "node:assert";
import type {
  CardId,
  CardRef,
  DecisionId,
  EffectId,
  InstanceId,
  PlayerId,
  PublicCardView,
  PublicPendingDecisionId,
  QueueEntryId,
} from "@optcg/types";
import { describe, test } from "vitest";

import { chooseGenericBotDecision } from "./bot-decision-planner.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

const botPlayerId = "p2" as PlayerId;

type BotPendingDecision = NonNullable<
  DevMatchSnapshot["players"][PlayerId]["view"]["pendingDecision"]
>;

const publicCard = (
  instanceId: string,
  fields: Partial<PublicCardView> = {},
): PublicCardView => ({
  instanceId: instanceId as InstanceId,
  cardId: (fields.cardId ?? "OP01-001") as CardId,
  owner: botPlayerId,
  controller: botPlayerId,
  zone: { playerId: botPlayerId, zone: "hand" },
  attachedDonCount: 0,
  attachedDonIds: [],
  ...fields,
});

const cardRef = (instanceId: string): CardRef => ({
  instanceId: instanceId as InstanceId,
  cardId: "OP01-001" as CardId,
  playerId: botPlayerId,
});

const selectCardsDecision = (
  prompt: string,
  causedBy: BotPendingDecision["causedBy"],
): Extract<BotPendingDecision, { type: "selectCards" }> => ({
  id: `decision:${prompt}` as DecisionId,
  spotlightPendingId: `spotlight:pending:${prompt}` as PublicPendingDecisionId,
  type: "selectCards",
  playerId: botPlayerId,
  prompt,
  causedBy,
  presentation: { title: "Choose", instruction: prompt },
  min: 1,
  max: 1,
  candidates: [
    { card: cardRef("low-value-card") },
    { card: cardRef("high-value-card") },
  ],
  choices: [
    { card: cardRef("low-value-card"), selectable: true },
    { card: cardRef("high-value-card"), selectable: true },
  ],
});

const selectTargetsDecision = ({
  min,
  max,
  candidates,
}: {
  readonly min: number;
  readonly max: number;
  readonly candidates: readonly CardRef[];
}): Extract<BotPendingDecision, { type: "selectTargets" }> => ({
  id: `decision:targets:${String(min)}:${String(max)}` as DecisionId,
  spotlightPendingId:
    `spotlight:pending:targets:${String(min)}:${String(max)}` as PublicPendingDecisionId,
  type: "selectTargets",
  playerId: botPlayerId,
  prompt: "Choose targets.",
  causedBy: { type: "ruleProcess", name: "target-test" },
  presentation: { title: "Choose", instruction: "Choose targets." },
  min,
  max,
  candidates: candidates.map((card) => ({ card })),
});

const contextWithDecision = (
  pendingDecision: BotPendingDecision,
): Parameters<typeof chooseGenericBotDecision>[0] => ({
  botPlayerId,
  snapshot: {
    stateSeq: 1,
    actionSeq: 1,
    stateHash: "decision-planner",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: botPlayerId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botPlayerId]: 1 },
    },
    activePlayerId: botPlayerId,
    players: {
      [botPlayerId]: {
        view: {
          self: {
            leader: publicCard("leader", {
              zone: { playerId: botPlayerId, zone: "leaderArea" },
              currentPower: 5_000,
            }),
            hand: [
              publicCard("low-value-card", {
                printedPower: 1_000,
                printedCost: 1,
              }),
              publicCard("high-value-card", {
                printedPower: 9_000,
                printedCost: 7,
              }),
            ],
            characters: [],
            costArea: [],
            life: { count: 5, faceUpCards: [] },
          },
          opponent: {
            handCount: 5,
            leader: publicCard("opponent-leader", {
              owner: "p1" as PlayerId,
              controller: "p1" as PlayerId,
              zone: { playerId: "p1" as PlayerId, zone: "leaderArea" },
              currentPower: 5_000,
            }),
            life: { count: 5, faceUpCards: [] },
            characters: [],
            costArea: [],
          },
          pendingDecision,
        },
        actions: [],
      },
    },
  } as unknown as DevMatchSnapshot,
});

const selectedInstanceIds = (
  choice: ReturnType<typeof chooseGenericBotDecision>,
): readonly string[] =>
  choice?.response.type === "cards"
    ? choice.response.cards.map((card) => String(card.instanceId))
    : [];

const selectedTargetInstanceIds = (
  choice: ReturnType<typeof chooseGenericBotDecision>,
): readonly string[] | undefined =>
  choice?.response.type === "targets"
    ? choice.response.targets.map((card) => String(card.instanceId))
    : undefined;

describe("chooseGenericBotDecision", () => {
  test("selects high-value card for generic keep/search-like selection", () => {
    const choice = chooseGenericBotDecision(
      contextWithDecision(
        selectCardsDecision("Choose a card to add to hand.", {
          type: "ruleProcess",
          name: "search",
        }),
      ),
    );

    assert.deepEqual(selectedInstanceIds(choice), ["high-value-card"]);
  });

  test("selects low-value card for generic payment-like selection", () => {
    const choice = chooseGenericBotDecision(
      contextWithDecision(
        selectCardsDecision("Trash a card from hand to pay the cost.", {
          type: "effect",
          queueEntryId: "queue:cost" as QueueEntryId,
          effectId: "effect:cost" as EffectId,
        }),
      ),
    );

    assert.deepEqual(selectedInstanceIds(choice), ["low-value-card"]);
  });

  test("declines optional target decisions instead of guessing a target", () => {
    const choice = chooseGenericBotDecision(
      contextWithDecision(
        selectTargetsDecision({
          min: 0,
          max: 1,
          candidates: [cardRef("high-value-card")],
        }),
      ),
    );

    assert.deepEqual(selectedTargetInstanceIds(choice), []);
  });

  test("does not emit an invalid empty target response for mandatory targets", () => {
    const choice = chooseGenericBotDecision(
      contextWithDecision(
        selectTargetsDecision({
          min: 1,
          max: 1,
          candidates: [],
        }),
      ),
    );

    assert.equal(choice, undefined);
  });
});
