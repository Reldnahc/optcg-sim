import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlayerId } from "@optcg/types";
import { test } from "vitest";

import { bootFixtureMatch, bootLocalManifestFixtureMatch } from "./boot.js";

const realCardDslManifestPath = fileURLToPath(
  new URL(
    "../../../fixtures/cards/real-card-dsl-match-card-manifest.json",
    import.meta.url,
  ),
);
const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const mustPlayer = (
  result: ReturnType<typeof bootFixtureMatch>,
  playerId: PlayerId,
) => {
  const player = result.state.players[playerId];
  assert.notEqual(player, undefined, `missing player ${String(playerId)}`);
  if (player === undefined) {
    throw new TypeError(`Missing player ${String(playerId)}.`);
  }
  return player;
};

test("bootFixtureMatch reaches the first mulligan decision deterministically", () => {
  const first = bootFixtureMatch();
  const second = bootFixtureMatch();

  assert.equal(first.stateHash, second.stateHash);
  assert.equal(first.state.seq, 1);
  assert.equal(first.state.status.type, "setup");
  assert.equal(first.state.pendingDecision?.type, "mulligan");
  assert.equal(first.summary.stateSeq, 1);
  assert.equal(first.summary.phase, "refresh");
  assert.equal(first.summary.status, "setup");
  assert.equal(first.summary.hasPendingDecision, true);
  assert.equal(first.summary.stateHash, first.stateHash);
});

test("bootLocalManifestFixtureMatch boots the real-card DSL manifest deterministically", () => {
  const first = bootLocalManifestFixtureMatch({
    manifestPath: realCardDslManifestPath,
  });
  const second = bootLocalManifestFixtureMatch({
    manifestPath: realCardDslManifestPath,
  });

  assert.equal(first.stateHash, second.stateHash);
  assert.equal(
    first.state.cardManifest.manifestHash,
    "real-card-dsl-match-card-manifest-no-example-test-v1",
  );
  assert.equal(first.state.cardManifest.source, "poneglyph-fixture");
  assert.deepEqual(Object.keys(first.state.cardManifest.cards).sort(), [
    "EB03-001",
    "OP04-014",
  ]);
  const firstP1 = mustPlayer(first, p1);
  const firstP2 = mustPlayer(first, p2);
  assert.equal(firstP1.leader.cardId, "EB03-001");
  assert.equal(firstP2.leader.cardId, "EB03-001");
  assert.equal(firstP1.hand.length, 5);
  assert.equal(firstP2.hand.length, 5);
  assert.equal(firstP1.hand[0]?.cardId, "OP04-014");
  assert.equal(firstP2.hand[0]?.cardId, "OP04-014");
  assert.equal(first.state.seq, 1);
  assert.equal(first.state.status.type, "setup");
  assert.equal(first.state.pendingDecision?.type, "mulligan");
  assert.equal(first.summary.stateHash, first.stateHash);
});

test("bootLocalManifestFixtureMatch fails clearly when the manifest file is absent", () => {
  assert.throws(
    () =>
      bootLocalManifestFixtureMatch({
        manifestPath: join(
          tmpdir(),
          "optcg-cli-missing-real-card-dsl-manifest.json",
        ),
      }),
    /CLI local manifest fixture not found:/u,
  );
});

test("bootLocalManifestFixtureMatch fails clearly when the manifest shape is malformed", () => {
  const directory = mkdtempSync(join(tmpdir(), "optcg-cli-manifest-"));
  const malformedPath = join(directory, "malformed.json");
  writeFileSync(
    malformedPath,
    JSON.stringify({
      manifestHash: "bad",
      source: "poneglyph-fixture",
      cardDataVersion: "bad",
      cards: {
        "EB03-001": {
          cardId: "EB03-001",
          category: "leader",
          name: "Donquixote Doflamingo",
          support: {},
        },
      },
      effectDefinitionsVersion: "bad",
      customHandlerVersion: "bad",
      banlistVersion: "bad",
      createdAt: "2026-05-09T00:00:00.000Z",
    }),
  );

  assert.throws(
    () => bootLocalManifestFixtureMatch({ manifestPath: malformedPath }),
    /CLI local manifest fixture card OP04-014 must be an object/u,
  );
});
