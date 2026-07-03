import { describe, expect, it } from "vitest";

import type {
  CardId,
  CardRef,
  EngineEventId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import {
  safeCombatSpotlightSemanticKey,
  toAllowedCombatSpotlightPresentation,
} from "./filter-state-combat-spotlight.js";

const source = {
  playerId: "p1" as PlayerId,
  instanceId: "source-1" as InstanceId,
  cardId: "OP00-001" as CardId,
} satisfies CardRef;

const attacker = {
  playerId: "p1" as PlayerId,
  instanceId: "attacker-1" as InstanceId,
  cardId: "OP00-002" as CardId,
} satisfies CardRef;

const defender = {
  playerId: "p2" as PlayerId,
  instanceId: "defender-1" as InstanceId,
  cardId: "OP00-003" as CardId,
} satisfies CardRef;

describe("combat spotlight filtering", () => {
  it("requires event-kind-specific combat fields", () => {
    expect(
      toAllowedCombatSpotlightPresentation({
        eventKind: "damageDealt",
        attacker,
        defender,
        attackerPower: 7000,
        defenderPower: 5000,
      }),
    ).toBeUndefined();

    expect(
      toAllowedCombatSpotlightPresentation({
        eventKind: "battleKOd",
        attacker,
        defender,
        attackerPower: 7000,
      }),
    ).toBeUndefined();

    expect(
      toAllowedCombatSpotlightPresentation({
        eventKind: "counterUsed",
        source,
        target: defender,
        counterPower: 2000,
        targetPower: 7000,
      }),
    ).toEqual({
      eventKind: "counterUsed",
      source,
      target: defender,
      counterPower: 2000,
      targetPower: 7000,
    });

    expect(
      toAllowedCombatSpotlightPresentation({
        eventKind: "battleKOd",
        attacker,
        defender,
        attackerPower: 7000,
        defenderPower: 5000,
        amount: 1,
      }),
    ).toEqual({
      eventKind: "battleKOd",
      attacker,
      defender,
      attackerPower: 7000,
      defenderPower: 5000,
    });
  });

  it("keeps battle K.O. and life damage semantic keys distinct", () => {
    const anchorId = "event:combat-anchor" as EngineEventId;

    expect(
      safeCombatSpotlightSemanticKey(anchorId, 0, {
        eventKind: "damageDealt",
        attacker,
        defender,
        attackerPower: 7000,
        defenderPower: 5000,
        amount: 1,
      }),
    ).toBe("combat|event:combat-anchor|0|damageDealt|7000|5000|1");

    expect(
      safeCombatSpotlightSemanticKey(anchorId, 0, {
        eventKind: "battleKOd",
        attacker,
        defender,
        attackerPower: 7000,
        defenderPower: 5000,
      }),
    ).toBe("combat|event:combat-anchor|0|battleKOd|7000|5000");
  });
});
