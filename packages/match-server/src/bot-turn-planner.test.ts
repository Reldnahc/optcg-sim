import { strict as assert } from "node:assert";
import type {
  CardId,
  InstanceId,
  PlayerId,
  PublicCardView,
} from "@optcg/types";
import { describe, test } from "vitest";

import {
  buildBotFeatures,
  type BotFeatures,
  type BotVisibleActionFacts,
} from "./bot-features.js";
import { chooseTurnPlan } from "./bot-turn-planner.js";
import type { DevMatchSnapshot, DevVisibleAction } from "./dev-snapshot-types.js";

const actionFacts = (
  actionIndex: number,
  overrides: Partial<BotVisibleActionFacts> = {},
): readonly [number, BotVisibleActionFacts] => [
  actionIndex,
  {
    relatedCards: [],
    hasRemainingAttackAfterAttachment: true,
    hasUsefulDonAttachment: true,
    donAttachmentUse: "pressure",
    ...overrides,
  },
];

const features = (overrides: Partial<BotFeatures> = {}): BotFeatures =>
  ({
    snapshot: {
      players: {
        p2: {
          actions: [],
        },
      },
    },
    botPlayerId: "p2",
    self: {
      lifeCount: 5,
      handCounterPower: 0,
      handCount: 5,
      donOnField: 0,
      activeDonCount: 1,
      characterCount: 0,
      attackerCount: 1,
      blockerCount: 0,
    },
    opponent: {
      lifeCount: 5,
      handCount: 5,
      characterCount: 0,
      blockerCount: 0,
      restedCharacterCount: 0,
      highestCharacterValue: 0,
    },
    cards: { visibleCards: [], byInstanceId: new Map() },
    actions: {
      byIndex: new Map(),
      hasProfitableEffect: false,
      hasPlayableDevelopmentCard: false,
      hasUsefulDonAttachment: false,
      hasAttack: false,
    },
    combat: {
      leaderAttackPressure: [],
      incomingBattleIsLethal: false,
      hasAvailableLethalLine: false,
      hasHighValueThreatAttack: false,
    },
    ...overrides,
  }) as BotFeatures;

const publicCard = (
  instanceId: string,
  fields: Partial<PublicCardView> = {},
): PublicCardView => ({
  instanceId: instanceId as InstanceId,
  cardId: (fields.cardId ?? "OP01-001") as CardId,
  owner: "p2" as PlayerId,
  controller: "p2" as PlayerId,
  zone: { playerId: "p2" as PlayerId, zone: "hand" },
  attachedDonCount: 0,
  attachedDonIds: [],
  ...fields,
});

const playCardAction = (index: number): DevVisibleAction => ({
  index,
  type: "playCard",
  label: "Play body",
  placement: { instanceId: "body" as InstanceId },
});

const attachDonAction = (index: number): DevVisibleAction => ({
  index,
  type: "attachDon",
  label: "Attach DON",
  attachment: {
    donInstanceId: `don-${index}` as InstanceId,
    targetInstanceId: "leader" as InstanceId,
  },
});

const activateEffectAction = (index: number): DevVisibleAction => ({
  index,
  type: "activateEffect",
  label: "Activate effect",
});

const leaderAttackAction = (index: number): DevVisibleAction => ({
  index,
  type: "declareAttack",
  label: "Attack leader",
  attack: {
    attackerInstanceId: "bot-leader" as InstanceId,
    targetInstanceId: "opponent-leader" as InstanceId,
  },
});

const featuresForActions = (
  actions: readonly DevVisibleAction[],
): BotFeatures => {
  const snapshot = {
    stateSeq: 1,
    actionSeq: 1,
    stateHash: "turn-planner",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: "p2" as PlayerId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { ["p2" as PlayerId]: 1 },
    },
    activePlayerId: "p2" as PlayerId,
    players: {
      ["p2" as PlayerId]: {
        view: {
          self: {
            leader: publicCard("bot-leader", {
              zone: { playerId: "p2" as PlayerId, zone: "leaderArea" },
              currentPower: 6_000,
            }),
            hand: [
              publicCard("body", {
                zone: { playerId: "p2" as PlayerId, zone: "hand" },
                printedCost: 4,
                printedPower: 6_000,
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
            life: { count: 3, faceUpCards: [] },
            characters: [],
            costArea: [],
          },
        },
        actions: [...actions],
      },
    },
  } as unknown as DevMatchSnapshot;
  return buildBotFeatures(snapshot, "p2" as PlayerId);
};

describe("chooseTurnPlan", () => {
  test("develop mode chooses persistent board before low-value DON pressure", () => {
    const actions = [playCardAction(0), attachDonAction(1)];
    const plan = chooseTurnPlan({
      actions,
      features: features({
        actions: {
          byIndex: new Map([
            actionFacts(1, {
              hasUsefulDonAttachment: false,
              donAttachmentUse: "none",
            }),
          ]),
          hasProfitableEffect: false,
          hasPlayableDevelopmentCard: true,
          hasUsefulDonAttachment: false,
          hasAttack: false,
        },
      }),
      mode: "develop",
    });

    assert.equal(plan?.steps[0]?.actionIndex, 0);
    assert.equal(
      plan?.score.terms.some((term) => term.reason === "persistent board"),
      true,
    );
  });

  test("effect actions are plan candidates with explanation", () => {
    const plan = chooseTurnPlan({
      actions: [activateEffectAction(4)],
      features: features(),
      mode: "cleanup",
    });

    assert.equal(plan?.steps[0]?.actionIndex, 4);
    assert.equal(
      plan?.score.terms.some((term) => term.reason === "use available effect"),
      true,
    );
  });

  test("does not attach reserved DON before important development", () => {
    const actions = [playCardAction(0), attachDonAction(1)];
    const body = publicCard("body", { printedCost: 5 });
    const plan = chooseTurnPlan({
      actions,
      features: features({
        self: {
          lifeCount: 5,
          handCounterPower: 0,
          handCount: 5,
          donOnField: 5,
          activeDonCount: 5,
          characterCount: 0,
          attackerCount: 1,
          blockerCount: 0,
        },
        cards: {
          visibleCards: [body],
          byInstanceId: new Map([[String(body.instanceId), body]]),
        },
        actions: {
          byIndex: new Map([actionFacts(1)]),
          hasProfitableEffect: false,
          hasPlayableDevelopmentCard: true,
          hasUsefulDonAttachment: true,
          hasAttack: false,
        },
      }),
      mode: "develop",
    });

    assert.equal(plan?.steps[0]?.actionIndex, 0);
  });

  test("lethal mode may spend DON before development", () => {
    const actions = [playCardAction(0), attachDonAction(1)];
    const body = publicCard("body", { printedCost: 5 });
    const plan = chooseTurnPlan({
      actions,
      features: features({
        self: {
          lifeCount: 5,
          handCounterPower: 0,
          handCount: 5,
          donOnField: 5,
          activeDonCount: 5,
          characterCount: 0,
          attackerCount: 1,
          blockerCount: 0,
        },
        cards: {
          visibleCards: [body],
          byInstanceId: new Map([[String(body.instanceId), body]]),
        },
        actions: {
          byIndex: new Map([actionFacts(1)]),
          hasProfitableEffect: false,
          hasPlayableDevelopmentCard: true,
          hasUsefulDonAttachment: true,
          hasAttack: false,
        },
      }),
      mode: "lethal",
    });

    assert.equal(plan?.steps[0]?.actionIndex, 1);
  });

  test("pressure mode prefers attack-before-play sequence", () => {
    const actions = [playCardAction(0), leaderAttackAction(1)];
    const plan = chooseTurnPlan({
      actions,
      features: featuresForActions(actions),
      mode: "pressure",
      config: { maxSteps: 2, beamWidth: 4 },
    });

    assert.deepEqual(
      plan?.steps.map((step) => step.actionIndex),
      [1, 0],
    );
  });

  test("develop mode prefers play-before-attack when lethal is absent", () => {
    const actions = [playCardAction(0), leaderAttackAction(1)];
    const plan = chooseTurnPlan({
      actions,
      features: featuresForActions(actions),
      mode: "develop",
      config: { maxSteps: 2, beamWidth: 4 },
    });

    assert.deepEqual(
      plan?.steps.map((step) => step.actionIndex),
      [0, 1],
    );
  });
});
