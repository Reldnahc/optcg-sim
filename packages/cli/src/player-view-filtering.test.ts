import assert from "node:assert/strict";
import { test } from "vitest";

import { filterStateForPlayer } from "@optcg/engine-core";
import type { PlayerId } from "@optcg/types";

import { bootFixtureMatch } from "./boot.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const findScalarPaths = (
  value: unknown,
  target: string,
  path = "$",
): string[] => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value) === target ? [path] : [];
  }
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    const matches: string[] = [];
    for (const [index, item] of value.entries()) {
      matches.push(
        ...findScalarPaths(item, target, `${path}[${String(index)}]`),
      );
    }
    return matches;
  }
  if (typeof value === "object") {
    const matches: string[] = [];
    for (const [key, item] of Object.entries(value)) {
      matches.push(...findScalarPaths(item, target, `${path}.${key}`));
    }
    return matches;
  }
  return [];
};

const assertNoScalarValue = (
  value: unknown,
  target: string,
  message: string,
): void => {
  const paths = findScalarPaths(value, target);
  assert.equal(
    paths.length,
    0,
    paths.length === 0 ? message : `${message}; found at ${paths.join(", ")}`,
  );
};

const findKeyPaths = (value: unknown, key: string, path = "$"): string[] => {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    const matches: string[] = [];
    for (const [index, item] of value.entries()) {
      matches.push(...findKeyPaths(item, key, `${path}[${String(index)}]`));
    }
    return matches;
  }
  if (typeof value === "object") {
    const matches: string[] = [];
    for (const [entryKey, item] of Object.entries(value)) {
      if (entryKey === key) {
        matches.push(`${path}.${entryKey}`);
      }
      matches.push(...findKeyPaths(item, key, `${path}.${entryKey}`));
    }
    return matches;
  }
  return [];
};

const assertNoForbiddenKeys = (
  value: unknown,
  keys: readonly string[],
): void => {
  for (const key of keys) {
    const paths = findKeyPaths(value, key);
    assert.equal(
      paths.length,
      0,
      paths.length === 0
        ? `forbidden key ${key} must be absent`
        : `forbidden key ${key} found at ${paths.join(", ")}`,
    );
  }
};

test("bootFixtureMatch state filters without hidden-info leaks", () => {
  const { state } = bootFixtureMatch();
  const players = [p1, p2] as const;

  for (const recipient of players) {
    const opponent = recipient === p1 ? p2 : p1;
    const recipientState = state.players[recipient];
    const opponentState = state.players[opponent];
    assert.ok(recipientState);
    assert.ok(opponentState);

    const view = filterStateForPlayer(state, recipient);
    const publicVisibleCardIds = new Set<string>([
      ...view.self.hand.map((card) => String(card.cardId)),
      String(view.self.leader.cardId),
      String(view.opponent.leader.cardId),
      ...view.self.characters.map((card) => String(card.cardId)),
      ...view.opponent.characters.map((card) => String(card.cardId)),
      ...view.self.costArea.map((card) => String(card.cardId)),
      ...view.opponent.costArea.map((card) => String(card.cardId)),
      ...view.self.trash.map((card) => String(card.cardId)),
      ...view.opponent.trash.map((card) => String(card.cardId)),
      ...view.self.life.faceUpCards.map((card) => String(card.cardId)),
      ...view.opponent.life.faceUpCards.map((card) => String(card.cardId)),
      ...(view.self.stage === undefined
        ? []
        : [String(view.self.stage.cardId)]),
      ...(view.opponent.stage === undefined
        ? []
        : [String(view.opponent.stage.cardId)]),
      ...view.revealedCards.flatMap((record) =>
        record.cards.map((card) => String(card.cardId)),
      ),
    ]);
    assert.equal(view.self.hand.length, recipientState.hand.length);
    assert.equal(view.opponent.handCount, opponentState.hand.length);
    assert.equal(view.self.deckCount, recipientState.deck.length);
    assert.equal(view.opponent.deckCount, opponentState.deck.length);
    assert.equal(view.self.donDeckCount, recipientState.donDeck.length);
    assert.equal(view.opponent.donDeckCount, opponentState.donDeck.length);

    for (const card of recipientState.hand) {
      const visible = view.self.hand.find(
        (entry) => entry.instanceId === card.instanceId,
      );
      assert.ok(visible);
      assert.equal(visible.cardId, card.cardId);
      assert.equal(visible.owner, card.owner);
      assert.equal(visible.controller, card.controller);
      assert.deepEqual(visible.zone, card.zone);
      assert.equal(visible.attachedDonCount, card.attachedDon.length);
    }
    assert.equal(view.self.leader.instanceId, recipientState.leader.instanceId);
    assert.equal(view.self.leader.cardId, recipientState.leader.cardId);
    assert.equal(view.self.leader.owner, recipientState.leader.owner);
    assert.equal(view.self.leader.controller, recipientState.leader.controller);
    assert.deepEqual(view.self.leader.zone, recipientState.leader.zone);
    assert.equal(
      view.self.leader.attachedDonCount,
      recipientState.leader.attachedDon.length,
    );
    assert.equal(
      view.opponent.leader.instanceId,
      opponentState.leader.instanceId,
    );
    assert.equal(view.opponent.leader.cardId, opponentState.leader.cardId);
    assert.equal(view.opponent.leader.owner, opponentState.leader.owner);
    assert.equal(
      view.opponent.leader.controller,
      opponentState.leader.controller,
    );
    assert.deepEqual(view.opponent.leader.zone, opponentState.leader.zone);
    assert.equal(
      view.opponent.leader.attachedDonCount,
      opponentState.leader.attachedDon.length,
    );
    assert.equal(view.self.characters.length, recipientState.characters.length);
    assert.equal(
      view.opponent.characters.length,
      opponentState.characters.length,
    );
    assert.equal(view.self.costArea.length, recipientState.costArea.length);
    assert.equal(view.opponent.costArea.length, opponentState.costArea.length);
    assert.equal(view.self.trash.length, recipientState.trash.length);
    assert.equal(view.opponent.trash.length, opponentState.trash.length);
    if (recipientState.stage !== undefined) {
      assert.ok(view.self.stage);
      assert.equal(view.self.stage.instanceId, recipientState.stage.instanceId);
      assert.equal(view.self.stage.cardId, recipientState.stage.cardId);
    }
    if (opponentState.stage !== undefined) {
      assert.ok(view.opponent.stage);
      assert.equal(
        view.opponent.stage.instanceId,
        opponentState.stage.instanceId,
      );
      assert.equal(view.opponent.stage.cardId, opponentState.stage.cardId);
    }
    for (const card of opponentState.hand) {
      if (!publicVisibleCardIds.has(String(card.cardId))) {
        assertNoScalarValue(view, String(card.cardId), "opponent hand card id");
      }
      assertNoScalarValue(
        view,
        String(card.instanceId),
        "opponent hand instance id",
      );
    }
    for (const card of [...recipientState.deck, ...opponentState.deck]) {
      if (!publicVisibleCardIds.has(String(card.cardId))) {
        assertNoScalarValue(view, String(card.cardId), "deck card id");
      }
      assertNoScalarValue(view, String(card.instanceId), "deck instance id");
    }
    for (const card of [...recipientState.donDeck, ...opponentState.donDeck]) {
      if (!publicVisibleCardIds.has(String(card.cardId))) {
        assertNoScalarValue(view, String(card.cardId), "DON deck card id");
      }
      assertNoScalarValue(
        view,
        String(card.instanceId),
        "DON deck instance id",
      );
    }
    for (const lifeCard of recipientState.life.filter((card) => !card.faceUp)) {
      if (!publicVisibleCardIds.has(String(lifeCard.card.cardId))) {
        assertNoScalarValue(
          view,
          String(lifeCard.card.cardId),
          "recipient face-down life card id",
        );
      }
      assertNoScalarValue(
        view,
        String(lifeCard.card.instanceId),
        "recipient face-down life instance id",
      );
    }
    for (const lifeCard of opponentState.life.filter((card) => !card.faceUp)) {
      if (!publicVisibleCardIds.has(String(lifeCard.card.cardId))) {
        assertNoScalarValue(
          view,
          String(lifeCard.card.cardId),
          "opponent face-down life card id",
        );
      }
      assertNoScalarValue(
        view,
        String(lifeCard.card.instanceId),
        "opponent face-down life instance id",
      );
    }

    const raw = view as unknown as Record<string, unknown>;
    assert.ok(raw);
    assertNoForbiddenKeys(view, [
      "rng",
      "effectQueue",
      "deferredTriggers",
      "replacementState",
      "continuousEffects",
      "audit",
      "eventJournal",
      "serverOnly",
      "response",
      "defaultResponse",
      "candidates",
      "paymentOptions",
      "targetOptions",
      "cardOptions",
    ]);
  }
});
