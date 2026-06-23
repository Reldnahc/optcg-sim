import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  CardRef,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicPendingDecisionId,
} from "@optcg/types";

import { chooseBotDecisionResponse } from "./bot-decision-responder.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botPlayerId = "p2" as PlayerId;
const opponentPlayerId = "p1" as PlayerId;

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
  playerId: botPlayerId,
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
    playerId: botPlayerId,
    prompt: "Choose.",
    causedBy: { type: "ruleProcess", name: "test" },
    presentation: { title: "Choose", instruction: "Choose." },
  }) as BotPendingDecisionBase<TType>;

const snapshotWithDecision = (
  pendingDecision?: BotPendingDecision,
  actions: readonly DevVisibleAction[] = [],
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
        view:
          pendingDecision === undefined
            ? {}
            : {
                pendingDecision,
              },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("chooseBotDecisionResponse", () => {
  test("returns undefined when no bot-owned pending decision exists", () => {
    const chosen = chooseBotDecisionResponse({
      snapshot: snapshotWithDecision(),
      botPlayerId,
      profile: {},
      visibleActions: [],
    });

    assert.equal(chosen, undefined);
  });

  test("returns undefined when the pending decision belongs to another player", () => {
    const decision = {
      ...baseDecision("decision:opponent", "chooseQuantity"),
      playerId: opponentPlayerId,
      mode: "upTo" as const,
      min: 0,
      max: 1,
    };

    const chosen = chooseBotDecisionResponse({
      snapshot: snapshotWithDecision(decision),
      botPlayerId,
      profile: {},
      visibleActions: [],
    });

    assert.equal(chosen, undefined);
  });

  test("uses profile decision before visible decision actions", () => {
    const profileCard = cardRef("profile-card");
    const decision = {
      ...baseDecision("decision:profile", "selectCards"),
      min: 1,
      max: 1,
      candidates: [{ card: profileCard }],
      choices: [{ card: profileCard, selectable: true }],
    };
    const visibleDecisionAction: DevVisibleAction = {
      index: 7,
      type: "respondToDecision",
      label: "Choose visible action",
      responseKey: "cards:visible-card",
    };

    const chosen = chooseBotDecisionResponse({
      snapshot: snapshotWithDecision(decision, [visibleDecisionAction]),
      botPlayerId,
      profile: {
        id: "test-profile",
        chooseDecision: () => ({
          type: "respondToDecision",
          decisionId: decision.id,
          response: { type: "cards", cards: [profileCard] },
        }),
      },
      visibleActions: [visibleDecisionAction],
    });

    if (chosen === undefined) {
      throw new Error("Expected profile decision response.");
    }
    assert.deepEqual(chosen.choice, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [profileCard] },
    });
    assert.deepEqual(chosen.reason, {
      kind: "profile",
      profileId: "test-profile",
    });
  });

  test("uses visible respondToDecision actions before fallback", () => {
    const decision = {
      ...baseDecision("decision:visible", "chooseQuantity"),
      mode: "upTo" as const,
      min: 0,
      max: 3,
    };
    const visibleDecisionAction: DevVisibleAction = {
      index: 4,
      type: "respondToDecision",
      label: "Choose 2",
      responseKey: "2",
    };

    const chosen = chooseBotDecisionResponse({
      snapshot: snapshotWithDecision(decision, [visibleDecisionAction]),
      botPlayerId,
      profile: {},
      visibleActions: [visibleDecisionAction],
    });

    if (chosen === undefined) {
      throw new Error("Expected visible decision response.");
    }
    assert.deepEqual(chosen.choice, {
      type: "submitAction",
      actionIndex: visibleDecisionAction.index,
    });
    assert.deepEqual(chosen.reason, {
      kind: "visible-action",
      actionIndex: visibleDecisionAction.index,
    });
  });

  test("uses fallback when no profile or visible response exists", () => {
    const decision = {
      ...baseDecision("decision:fallback", "chooseQuantity"),
      mode: "upTo" as const,
      min: 1,
      max: 3,
    };

    const chosen = chooseBotDecisionResponse({
      snapshot: snapshotWithDecision(decision),
      botPlayerId,
      profile: {},
      visibleActions: [],
    });

    if (chosen === undefined) {
      throw new Error("Expected fallback decision response.");
    }
    assert.deepEqual(chosen.choice, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "chooseQuantity", quantity: 1 },
    });
    assert.deepEqual(chosen.reason, {
      kind: "fallback",
      decisionType: "chooseQuantity",
    });
  });
});
