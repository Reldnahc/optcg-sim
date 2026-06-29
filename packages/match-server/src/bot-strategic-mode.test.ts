import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { BotFeatures } from "./bot-features.js";
import { chooseBotStrategicMode } from "./bot-strategic-mode.js";

const features = (overrides: Partial<BotFeatures>): BotFeatures =>
  ({
    snapshot: {},
    botPlayerId: "p2",
    self: {
      lifeCount: 5,
      handCounterPower: 0,
      handCount: 5,
      donOnField: 0,
      activeDonCount: 0,
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

describe("chooseBotStrategicMode", () => {
  test("survive beats every normal turn concern", () => {
    assert.equal(
      chooseBotStrategicMode(
        features({
          combat: {
            leaderAttackPressure: [],
            incomingBattleIsLethal: true,
            hasAvailableLethalLine: true,
            hasHighValueThreatAttack: true,
          },
        }),
      ).mode,
      "survive",
    );
  });

  test("available lethal becomes lethal mode", () => {
    assert.equal(
      chooseBotStrategicMode(
        features({
          combat: {
            leaderAttackPressure: [],
            incomingBattleIsLethal: false,
            hasAvailableLethalLine: true,
            hasHighValueThreatAttack: false,
          },
        }),
      ).mode,
      "lethal",
    );
  });

  test("low opponent life becomes pressure mode", () => {
    assert.equal(
      chooseBotStrategicMode(
        features({
          opponent: {
            lifeCount: 1,
            handCount: 5,
            characterCount: 0,
            blockerCount: 0,
            restedCharacterCount: 0,
            highestCharacterValue: 0,
          },
        }),
      ).mode,
      "pressure",
    );
  });
});
