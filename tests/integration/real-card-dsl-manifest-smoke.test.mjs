import assert from "node:assert/strict";
import { test } from "vitest";

import {
  fixtureOnlyRealCardDslMatchCardManifestPath,
  loadFixtureOnlyRealCardDslMatchCardManifest,
} from "../../packages/cards/src/index.ts";
import { createInitialState } from "../../packages/engine-core/src/index.ts";

const p1 = "real-card-smoke-p1";
const p2 = "real-card-smoke-p2";

const plainDataClone = (value) => JSON.parse(JSON.stringify(value));

const must = (value, label) => {
  assert.notEqual(value, undefined, `missing ${label}`);
  return value;
};

test("root integration loads real-card DSL manifest fixture into engine initial state", async () => {
  assert.equal(
    fixtureOnlyRealCardDslMatchCardManifestPath,
    "fixtures/cards/real-card-dsl-match-card-manifest.json",
  );

  const cardsProducedManifest =
    await loadFixtureOnlyRealCardDslMatchCardManifest();
  const plainManifest = plainDataClone(cardsProducedManifest);
  const leaderCard = must(plainManifest.cards["OP01-060"], "OP01-060");
  const deckCard = must(plainManifest.cards["EB01-023"], "EB01-023");
  const op10045 = must(plainManifest.cards["OP10-045"], "OP10-045");

  assert.equal(deckCard.support.status, "implemented-dsl");
  assert.equal(deckCard.support.effectDefinitionId, "eb01-023.on-play-draw-1");
  assert.equal(op10045.support.status, "implemented-dsl");
  assert.equal(
    op10045.support.effectDefinitionId,
    "op10-045.generated-support",
  );
  assert.notEqual(plainManifest, cardsProducedManifest);
  assert.deepEqual(plainManifest, cardsProducedManifest);

  const state = createInitialState({
    matchId: "real-card-dsl-manifest-smoke",
    playerOrder: [p1, p2],
    firstPlayerId: p1,
    leaderCardIds: {
      [p1]: "OP01-060",
      [p2]: "OP01-060",
    },
    leaderLifeCounts: {
      [p1]: leaderCard.life,
      [p2]: leaderCard.life,
    },
    deckCardIds: {
      [p1]: Array.from({ length: 10 }, () => "EB01-023"),
      [p2]: Array.from({ length: 10 }, () => "EB01-023"),
    },
    donDeckCardIds: {
      [p1]: [],
      [p2]: [],
    },
    cardManifest: plainManifest,
    rngSeed: "real-card-dsl-manifest-smoke-seed",
    shuffleDecks: false,
  });

  assert.equal(state.cardManifest.source, "poneglyph-fixture");
  assert.equal(state.cardManifest.manifestHash, plainManifest.manifestHash);
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
});
