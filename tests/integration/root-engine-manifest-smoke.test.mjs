import assert from "node:assert/strict";
import { test } from "vitest";

import {
  loadRepresentativeMatchCardManifestFixture,
  representativeMatchCardManifestFixturePath,
} from "../../packages/cards/src/index.ts";
import { createInitialState } from "../../packages/engine-core/src/index.ts";

const p1 = "root-smoke-p1";
const p2 = "root-smoke-p2";
const leaderCardId = "OP01-060";
const deckCardId = "OP05-091";

const plainDataClone = (value) => JSON.parse(JSON.stringify(value));

const must = (value, label) => {
  assert.notEqual(value, undefined, `missing ${label}`);
  return value;
};

test("root integration loads cards-produced manifest into engine initial state", async () => {
  assert.equal(
    representativeMatchCardManifestFixturePath,
    "fixtures/cards/representative-match-card-manifest.json",
  );

  const cardsProducedManifest =
    await loadRepresentativeMatchCardManifestFixture();
  const plainManifest = plainDataClone(cardsProducedManifest);
  assert.deepEqual(plainManifest, cardsProducedManifest);
  assert.notEqual(plainManifest, cardsProducedManifest);

  const leaderCard = must(plainManifest.cards[leaderCardId], leaderCardId);
  const deckCard = must(plainManifest.cards[deckCardId], deckCardId);
  assert.equal(leaderCard.support.status, "unsupported");
  assert.equal(deckCard.support.status, "unsupported");

  const mainDeck = Array.from({ length: 10 }, () => deckCardId);
  const state = createInitialState({
    matchId: "root-engine-manifest-smoke",
    playerOrder: [p1, p2],
    firstPlayerId: p1,
    leaderCardIds: {
      [p1]: leaderCardId,
      [p2]: leaderCardId,
    },
    leaderLifeCounts: {
      [p1]: leaderCard.life,
      [p2]: leaderCard.life,
    },
    deckCardIds: {
      [p1]: mainDeck,
      [p2]: mainDeck,
    },
    donDeckCardIds: {
      [p1]: [],
      [p2]: [],
    },
    cardManifest: plainManifest,
    rngSeed: "root-engine-manifest-smoke-seed",
    shuffleDecks: false,
  });

  assert.equal(state.cardManifest.manifestHash, plainManifest.manifestHash);
  assert.equal(state.cardManifest.source, "poneglyph-fixture");
  assert.equal(state.version.cardDataVersion, plainManifest.cardDataVersion);
  assert.equal(
    state.version.effectDefinitionsVersion,
    plainManifest.effectDefinitionsVersion,
  );
  assert.equal(
    state.version.customHandlerVersion,
    plainManifest.customHandlerVersion,
  );
  assert.equal(state.version.banlistVersion, plainManifest.banlistVersion);

  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  assert.equal(p1State.leader.cardId, leaderCardId);
  assert.equal(p2State.leader.cardId, leaderCardId);
  assert.equal(p1State.hand.length, 5);
  assert.equal(p1State.life.length, leaderCard.life);
  assert.equal(p1State.deck.length, 0);
  assert.equal(p2State.hand.length, 5);
  assert.equal(p2State.life.length, leaderCard.life);
  assert.equal(p2State.deck.length, 0);
});
