import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicCardView,
  PublicPendingDecisionId,
} from "@optcg/types";

import { buildBotActionCandidates } from "./bot-candidates.js";
import { buildBotFeatures } from "./bot-features.js";
import { scoreBotCandidate } from "./bot-score.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botPlayerId = "p2" as PlayerId;
const opponentPlayerId = "p1" as PlayerId;

const snapshotWithActions = (
  actions: readonly DevVisibleAction[],
  cards: {
    readonly selfLeader?: Partial<PublicCardView>;
    readonly selfHand?: readonly Partial<PublicCardView>[];
    readonly selfCharacters?: readonly Partial<PublicCardView>[];
    readonly opponentLeader?: Partial<PublicCardView>;
    readonly opponentHandCount?: number;
    readonly opponentLifeCount?: number;
  } = {},
): DevMatchSnapshot =>
  ({
    stateSeq: 7,
    actionSeq: 3,
    stateHash: "hash",
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
            leader: {
              instanceId: "bot-leader" as InstanceId,
              cardId: "OP01-001" as CardId,
              owner: botPlayerId,
              controller: botPlayerId,
              zone: { playerId: botPlayerId, zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
              ...cards.selfLeader,
            },
            hand: cards.selfHand ?? [],
            characters: cards.selfCharacters ?? [],
            costArea: [],
            life: { count: 5, faceUpCards: [] },
          },
          opponent: {
            handCount: cards.opponentHandCount ?? 0,
            leader: {
              instanceId: "opponent-leader" as InstanceId,
              cardId: "OP01-002" as CardId,
              owner: opponentPlayerId,
              controller: opponentPlayerId,
              zone: { playerId: opponentPlayerId, zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
              ...cards.opponentLeader,
            },
            life: { count: cards.opponentLifeCount ?? 5, faceUpCards: [] },
            characters: [],
            costArea: [],
          },
        },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

const onlyCandidate = (snapshot: DevMatchSnapshot) => {
  const features = buildBotFeatures(snapshot, botPlayerId);
  const candidate = buildBotActionCandidates(features)[0];
  if (candidate === undefined) {
    throw new Error("Expected one candidate.");
  }
  return { features, candidate };
};

describe("scoreBotCandidate", () => {
  test("explains visible decision responses", () => {
    const snapshot = snapshotWithActions([
      {
        index: 0,
        type: "respondToDecision",
        label: "Rest DON!!",
        responseKey: "payment:don:1",
      },
    ]);
    const botSnapshot = snapshot.players[botPlayerId];
    if (botSnapshot === undefined) {
      throw new Error("Expected bot snapshot.");
    }
    botSnapshot.view.pendingDecision = {
      id: "decision:cost" as DecisionId,
      spotlightPendingId:
        "spotlight:pending:test:cost" as PublicPendingDecisionId,
      type: "payCost",
      playerId: botPlayerId,
      prompt: "Pay the cost?",
      causedBy: { type: "ruleProcess", name: "test" },
      presentation: { title: "Pay cost", instruction: "Pay the cost." },
    };
    const { features, candidate } = onlyCandidate(snapshot);

    const scored = scoreBotCandidate({ candidate, features });

    assert.equal(
      scored.breakdown.reasons.includes("decision:visible-response"),
      true,
    );
  });

  test("explains lethal leader attacks", () => {
    const { features, candidate } = onlyCandidate(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "declareAttack",
            label: "Attack leader",
            attack: {
              attackerInstanceId: "bot-leader" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
        ],
        {
          selfLeader: { currentPower: 6_000 },
          opponentLeader: { currentPower: 5_000 },
          opponentHandCount: 0,
          opponentLifeCount: 0,
        },
      ),
    );

    const scored = scoreBotCandidate({ candidate, features });

    assert.equal(
      scored.breakdown.reasons.includes("combat:leader-lethal"),
      true,
    );
  });

  test("explains high-counter preservation when scoring card plays", () => {
    const { features, candidate } = onlyCandidate(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "playCard",
            label: "Play counter card",
            placement: { instanceId: "counter-card" as InstanceId },
          },
        ],
        {
          selfHand: [
            {
              instanceId: "counter-card" as InstanceId,
              cardId: "OP01-003" as CardId,
              printedCounter: 2_000,
              printedPower: 5_000,
            },
          ],
        },
      ),
    );

    const scored = scoreBotCandidate({ candidate, features });

    assert.equal(
      scored.breakdown.reasons.includes("resource:preserve-counter"),
      true,
    );
  });
});
