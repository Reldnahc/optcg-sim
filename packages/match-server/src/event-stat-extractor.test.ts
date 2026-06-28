import { strict as assert } from "node:assert";
import type { EngineEvent, EngineEventType } from "@optcg/types";
import { test } from "vitest";

import {
  type EventStatContext,
  extractEventStatOperations,
} from "./event-stat-extractor.js";
import { statKeys } from "./user-stat-keys.js";

const p1 = "player-1";
const p2 = "player-2";
const u1 = "00000000-0000-4000-8000-000000000001";
const u2 = "00000000-0000-4000-8000-000000000002";

const baseContext = (): EventStatContext => ({
  userIdByPlayerId: new Map([
    [p1, u1],
    [p2, u2],
  ]),
  cardNumberByInstanceId: new Map([
    ["char-1", "OP01-016"],
    ["event-1", "OP01-029"],
    ["stage-1", "OP01-030"],
    ["leader-1", "OP01-001"],
    ["blocker-1", "OP01-017"],
    ["counter-1", "OP01-018"],
    ["counter-event-1", "OP01-019"],
  ]),
  categoryByInstanceId: new Map([
    ["char-1", "character"],
    ["event-1", "event"],
    ["stage-1", "stage"],
    ["leader-1", "leader"],
    ["blocker-1", "character"],
    ["counter-1", "character"],
    ["counter-event-1", "event"],
  ]),
  colorBucketByCardNumber: new Map([
    ["OP01-016", "red-blue"],
    ["OP01-029", "mono-red"],
    ["OP01-030", "black-yellow"],
    ["OP01-001", "mono-red"],
    ["OP01-017", "mono-green"],
    ["OP01-018", "mono-blue"],
    ["OP01-019", "mono-yellow"],
  ]),
});

const event = (
  type: EngineEventType,
  payload: unknown,
  options: {
    readonly seq?: number;
    readonly visibility?: EngineEvent["visibility"];
    readonly causedBy?: EngineEvent["causedBy"];
    readonly actor?: string;
  } = {},
): EngineEvent => ({
  id: `event:test:${String(options.seq ?? 1)}:${type}` as never,
  seq: options.seq ?? 1,
  type,
  ...(options.actor === undefined ? {} : { actor: options.actor as never }),
  payload,
  ...(options.causedBy === undefined ? {} : { causedBy: options.causedBy }),
  visibility: options.visibility ?? { type: "public" },
  createdAtStateSeq: 1 as never,
});

const statValues = (
  events: readonly EngineEvent[],
  context = baseContext(),
): Map<string, number> => {
  const values = new Map<string, number>();
  for (const operation of extractEventStatOperations(events, context)) {
    assert.equal(operation.operation, "increment");
    if (operation.userId !== u1) {
      continue;
    }
    values.set(
      operation.statKey,
      (values.get(operation.statKey) ?? 0) + operation.value,
    );
  }
  return values;
};

test("extracts card play totals by category card number and exact color bucket", () => {
  const values = statValues([
    event("cardPlayed", {
      playerId: p1,
      instanceId: "char-1",
      cardId: "char-card-id",
      category: "character",
      turnNumber: 1,
    }),
    event("cardPlayed", {
      playerId: p1,
      instanceId: "event-1",
      cardId: "event-card-id",
      category: "event",
      turnNumber: 1,
    }),
    event("cardPlayed", {
      playerId: p1,
      instanceId: "stage-1",
      cardId: "stage-card-id",
      category: "stage",
      turnNumber: 1,
    }),
  ]);

  assert.equal(values.get(statKeys.cardsPlayed), 3);
  assert.equal(values.get(statKeys.charactersPlayed), 1);
  assert.equal(values.get(statKeys.eventsPlayed), 1);
  assert.equal(values.get(statKeys.stagesPlayed), 1);
  assert.equal(values.get(statKeys.cardsPlayedByCard("OP01-016")), 1);
  assert.equal(values.get(statKeys.charactersPlayedByCard("OP01-016")), 1);
  assert.equal(values.get(statKeys.eventsPlayedByCard("OP01-029")), 1);
  assert.equal(values.get(statKeys.stagesPlayedByCard("OP01-030")), 1);
  assert.equal(values.get(statKeys.cardsPlayedColor("red-blue")), 1);
  assert.equal(values.get(statKeys.charactersPlayedColor("red-blue")), 1);
  assert.equal(values.get(statKeys.eventsPlayedColor("mono-red")), 1);
  assert.equal(values.get(statKeys.stagesPlayedColor("black-yellow")), 1);
});

test("does not emit card play scoped stats without supported metadata evidence", () => {
  const values = statValues([
    event("cardPlayed", {
      playerId: p1,
      instanceId: "unknown-card",
      cardId: "unknown-card-id",
      category: "character",
      turnNumber: 1,
    }),
  ]);

  assert.equal(values.get(statKeys.cardsPlayed), 1);
  assert.equal(values.get(statKeys.charactersPlayed), 1);
  assert.equal(values.get(statKeys.cardsPlayedByCard("OP01-016")), undefined);
  assert.equal(
    values.get(statKeys.charactersPlayedColor("red-blue")),
    undefined,
  );
});

test("does not emit stats for unknown players", () => {
  assert.deepEqual(
    extractEventStatOperations(
      [
        event("cardPlayed", {
          playerId: "unknown-player",
          instanceId: "char-1",
          cardId: "char-card-id",
          category: "character",
        }),
      ],
      baseContext(),
    ),
    [],
  );
});

test("extracts combat and counter stats from semantic combat events", () => {
  const values = statValues([
    event("attackDeclared", {
      attacker: { playerId: p1, instanceId: "leader-1", cardId: "leader-card" },
      target: { playerId: p2, instanceId: "leader-2", cardId: "leader-card-2" },
    }),
    event("attackDeclared", {
      attacker: { playerId: p1, instanceId: "char-1", cardId: "char-card" },
      target: { playerId: p2, instanceId: "leader-2", cardId: "leader-card-2" },
    }),
    event("blockerActivated", {
      attacker: { playerId: p2, instanceId: "char-2", cardId: "char-card-2" },
      blocker: {
        playerId: p1,
        instanceId: "blocker-1",
        cardId: "blocker-card",
      },
      previousTarget: {
        playerId: p1,
        instanceId: "leader-1",
        cardId: "leader-card",
      },
      currentTarget: {
        playerId: p1,
        instanceId: "blocker-1",
        cardId: "blocker-card",
      },
    }),
    event("counterUsed", {
      playerId: p1,
      instanceId: "counter-1",
      cardId: "counter-card",
      target: { playerId: p1, instanceId: "leader-1", cardId: "leader-card" },
      value: 2000,
    }),
    event("counterUsed", {
      playerId: p1,
      instanceId: "counter-event-1",
      cardId: "counter-event-card",
      target: { playerId: p1, instanceId: "leader-1", cardId: "leader-card" },
      value: 4000,
    }),
  ]);

  assert.equal(values.get(statKeys.attacksDeclared), 2);
  assert.equal(values.get(statKeys.leaderAttacksDeclared), 1);
  assert.equal(values.get(statKeys.characterAttacksDeclared), 1);
  assert.equal(values.get(statKeys.blockersUsed), 1);
  assert.equal(values.get(statKeys.countersUsed), 2);
  assert.equal(values.get(statKeys.counterCardsUsed), 2);
  assert.equal(values.get(statKeys.counterPowerUsedTotal), 6000);
  assert.equal(values.get(statKeys.counterEventsPlayed), 1);
});

test("extracts movement resource stats without double-counting paired draw movements", () => {
  const values = statValues([
    event("cardDrawn", { playerId: p1, turnNumber: 2 }),
    event(
      "cardMoved",
      { from: "deck", to: "hand", playerId: p1, reason: "draw" },
      { seq: 2, visibility: { type: "public" } },
    ),
    event(
      "cardMoved",
      {
        from: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
        to: { zone: "hand", playerId: p1, slot: "hand", index: 4 },
        playerId: p1,
        reason: "draw",
        instanceId: "drawn-card",
        cardId: "drawn-card-id",
      },
      { seq: 3, visibility: { type: "private", playerId: p1 as never } },
    ),
    event("cardTrashed", {
      playerId: p1,
      instanceId: "discarded-card",
      cardId: "discarded-card-id",
      reason: "trashFromHand",
    }),
    event("cardMoved", {
      playerId: p1,
      from: "deck",
      to: "trash",
      reason: "effectTrash",
    }),
    event("cardMoved", {
      playerId: p1,
      from: "life",
      to: "hand",
      reason: "damage",
    }),
    event("lifeTaken", { damagedPlayerId: p1, amount: 2 }),
    event("cardMoved", {
      playerId: p1,
      from: "trash",
      to: "life",
      reason: "effect",
    }),
    event("cardRevealed", {
      revealId: "reveal-1",
      cards: [
        { playerId: p1, instanceId: "event-1", cardId: "event-card-id" },
        { playerId: p1, instanceId: "char-1", cardId: "char-card-id" },
      ],
      origin: "search",
    }),
  ]);

  assert.equal(values.get(statKeys.cardsDrawn), 1);
  assert.equal(values.get(statKeys.cardsTrashedFromHand), 1);
  assert.equal(values.get(statKeys.cardsTrashedFromDeck), 1);
  assert.equal(values.get(statKeys.cardsAddedFromLife), 1);
  assert.equal(values.get(statKeys.lifeDamageTaken), 2);
  assert.equal(values.get(statKeys.lifeRecovered), 1);
  assert.equal(values.get(statKeys.cardsRevealed), 2);
});

test("extracts private chooser reveal stats from server-side card evidence", () => {
  const values = statValues([
    event(
      "cardRevealed",
      {
        revealId: "private-reveal",
        cards: [
          { playerId: p1, instanceId: "event-1", cardId: "event-card-id" },
          { playerId: p1, instanceId: "char-1", cardId: "char-card-id" },
        ],
        origin: "effect",
      },
      { visibility: { type: "private", playerId: p1 as never } },
    ),
  ]);

  assert.equal(values.get(statKeys.cardsRevealed), 2);
});

test("does not emit reveal stats for hidden events", () => {
  const values = statValues([
    event(
      "cardRevealed",
      {
        revealId: "hidden-reveal",
        cards: [
          { playerId: p1, instanceId: "event-1", cardId: "event-card-id" },
        ],
        origin: "effect",
      },
      { visibility: { type: "hidden" } },
    ),
  ]);

  assert.equal(values.get(statKeys.cardsRevealed), undefined);
});

test("extracts DON and effect activation stats when payload proves the family", () => {
  const values = statValues([
    event("donAttached", {
      playerId: p1,
      donInstanceId: "don-1",
      target: { playerId: p1, instanceId: "char-1", cardId: "char-card-id" },
    }),
    event(
      "donReturned",
      { playerId: p1, donInstanceId: "don-1", state: "rested" },
      { visibility: { type: "replayOnly" } },
    ),
    event(
      "cardMoved",
      {
        playerId: p1,
        cardInstanceId: "don-2",
        from: "donDeck",
        to: "costArea",
      },
      {
        visibility: { type: "replayOnly" },
        causedBy: {
          type: "effect",
          queueEntryId: "queue-1" as never,
          effectId: "effect-1" as never,
        },
      },
    ),
    event("triggerActivated", {
      playerId: p1,
      source: { playerId: p1, instanceId: "event-1", cardId: "event-card-id" },
      card: { playerId: p1, instanceId: "event-1", cardId: "event-card-id" },
      sourceCardId: "event-card-id",
      sourceTypes: ["Straw Hat Crew"],
      sourceCategory: "event",
      revealId: "reveal-1",
      effectBlockId: "effect-trigger-1",
    }),
    event("effectResolved", {
      controllerId: p1,
      source: { playerId: p1, instanceId: "char-1", cardId: "char-card-id" },
      sourceCardId: "char-card-id",
      effectCategory: "auto",
      entryPoint: { type: "onPlay" },
      status: "resolved",
    }),
    event("effectResolved", {
      controllerId: p1,
      source: { playerId: p1, instanceId: "char-1", cardId: "char-card-id" },
      sourceCardId: "char-card-id",
      effectCategory: "activate",
      entryPoint: { type: "activateMain" },
      status: "resolved",
    }),
  ]);

  assert.equal(values.get(statKeys.donAttached), 1);
  assert.equal(values.get(statKeys.donReturned), 1);
  assert.equal(values.get(statKeys.donRamped), 1);
  assert.equal(values.get(statKeys.triggerEffectsActivated), 1);
  assert.equal(values.get(statKeys.effectsActivatedTotal), 3);
  assert.equal(values.get(statKeys.onPlayEffectsActivated), 1);
  assert.equal(values.get(statKeys.activateMainEffectsActivated), 1);
});

test("extracts battle KOs only when the movement payload identifies the battle source controller", () => {
  const values = statValues([
    event("cardMoved", {
      playerId: p2,
      instanceId: "ko-target",
      cardId: "ko-target-card",
      from: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 0,
      },
      to: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
      reason: "ko",
      sourceControllerId: p1,
      sourceKind: "battle",
      sourceInstanceId: "char-1",
      sourceCardId: "char-card-id",
    }),
  ]);

  assert.equal(values.get(statKeys.charactersKoByBattle), 1);
});

test("does not emit don_restored_total without supported event evidence", () => {
  const values = statValues([
    event("cardMoved", {
      playerId: p1,
      cardInstanceId: "don-1",
      from: "costArea",
      to: "costArea",
      state: "active",
    }),
  ]);

  assert.equal(values.get(statKeys.donRestored), undefined);
});
