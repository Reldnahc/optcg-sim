import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { BotFeatures } from "./bot-features.js";
import { evaluateVisibleBoardState } from "./bot-state-evaluator.js";

const base = (partial: Partial<BotFeatures>): BotFeatures =>
  ({
    snapshot: {},
    botPlayerId: "p2",
    self: {
      lifeCount: 3,
      handCounterPower: 0,
      handCount: 5,
      donOnField: 0,
      activeDonCount: 0,
      characterCount: 2,
      attackerCount: 1,
      blockerCount: 0,
    },
    opponent: {
      lifeCount: 3,
      handCount: 5,
      characterCount: 2,
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
    ...partial,
  }) as BotFeatures;

describe("evaluateVisibleBoardState", () => {
  test("more own board is better", () => {
    const even = evaluateVisibleBoardState({
      features: base({}),
      mode: "develop",
    });
    const ahead = evaluateVisibleBoardState({
      features: base({
        self: {
          lifeCount: 3,
          handCounterPower: 0,
          handCount: 5,
          donOnField: 0,
          activeDonCount: 0,
          characterCount: 4,
          attackerCount: 2,
          blockerCount: 0,
        },
      }),
      mode: "develop",
    });

    assert.ok(ahead.total > even.total);
  });

  test("low life is penalized", () => {
    const safe = evaluateVisibleBoardState({
      features: base({}),
      mode: "stabilize",
    });
    const danger = evaluateVisibleBoardState({
      features: base({
        self: {
          lifeCount: 1,
          handCounterPower: 0,
          handCount: 5,
          donOnField: 0,
          activeDonCount: 0,
          characterCount: 2,
          attackerCount: 1,
          blockerCount: 0,
        },
      }),
      mode: "stabilize",
    });

    assert.ok(danger.total < safe.total);
  });
});
