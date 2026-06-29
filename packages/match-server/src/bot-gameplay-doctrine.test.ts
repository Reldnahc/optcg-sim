import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  counterPowerRequiredToStopAttack,
  estimatedCounterCardsRequiredToStopAttack,
} from "./bot-gameplay-doctrine.js";

describe("bot gameplay doctrine", () => {
  test("attacker wins ties, so equal power requires counter", () => {
    assert.equal(
      counterPowerRequiredToStopAttack({
        attackerPower: 5_000,
        targetPower: 5_000,
      }),
      1_000,
    );
  });

  test("leader attack pressure is scored by counter cards required", () => {
    assert.equal(
      estimatedCounterCardsRequiredToStopAttack({
        attackerPower: 7_000,
        targetPower: 5_000,
      }),
      2,
    );
    assert.equal(
      estimatedCounterCardsRequiredToStopAttack({
        attackerPower: 9_000,
        targetPower: 5_000,
      }),
      3,
    );
  });

  test("below-target attacks are not live attacks", () => {
    assert.equal(
      counterPowerRequiredToStopAttack({
        attackerPower: 4_000,
        targetPower: 5_000,
      }),
      undefined,
    );
  });
});
