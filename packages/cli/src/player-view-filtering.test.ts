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
    assert.equal(view.self.hand.length, recipientState.hand.length);
    assert.equal(view.opponent.handCount, opponentState.hand.length);
    assert.equal(view.self.deckCount, recipientState.deck.length);
    assert.equal(view.opponent.deckCount, opponentState.deck.length);
    assert.equal(view.self.donDeckCount, recipientState.donDeck.length);
    assert.equal(view.opponent.donDeckCount, opponentState.donDeck.length);

    for (const card of recipientState.hand) {
      assert.equal(
        view.self.hand.some(
          (visible) => visible.instanceId === card.instanceId,
        ),
        true,
      );
    }
    for (const card of opponentState.hand) {
      assertNoScalarValue(view, String(card.cardId), "opponent hand card id");
      assertNoScalarValue(
        view,
        String(card.instanceId),
        "opponent hand instance id",
      );
    }
    for (const card of [...recipientState.deck, ...opponentState.deck]) {
      assertNoScalarValue(view, String(card.cardId), "deck card id");
      assertNoScalarValue(view, String(card.instanceId), "deck instance id");
    }
    for (const card of [...recipientState.donDeck, ...opponentState.donDeck]) {
      assertNoScalarValue(view, String(card.cardId), "DON deck card id");
      assertNoScalarValue(
        view,
        String(card.instanceId),
        "DON deck instance id",
      );
    }
    for (const lifeCard of recipientState.life.filter((card) => !card.faceUp)) {
      assertNoScalarValue(
        view,
        String(lifeCard.card.cardId),
        "recipient face-down life card id",
      );
      assertNoScalarValue(
        view,
        String(lifeCard.card.instanceId),
        "recipient face-down life instance id",
      );
    }
    for (const lifeCard of opponentState.life.filter((card) => !card.faceUp)) {
      assertNoScalarValue(
        view,
        String(lifeCard.card.cardId),
        "opponent face-down life card id",
      );
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
