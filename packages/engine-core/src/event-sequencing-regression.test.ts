import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineEvent, EngineResult, GameState } from "@optcg/types";

import {
  applyAction,
  startMulliganFlow,
  respondToMulliganDecision,
  advanceRefreshPhase,
  advanceDrawPhase,
  advanceDonPhase,
} from "./index.js";
import {
  createActiveState,
  createInput,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import { createInitialState } from "./initial-state.js";
import { setupMainPlayState } from "./play-card-test-fixtures.js";
import { setupAttackState } from "./battle-actions-test-fixtures.js";

const assertStrictlyIncreasingSeq = (
  events: readonly EngineEvent[],
  label: string,
) => {
  for (let index = 1; index < events.length; index += 1) {
    const previous = must(events[index - 1], `${label} previous event`);
    const current = must(events[index], `${label} current event`);
    assert.ok(
      current.seq > previous.seq,
      `${label} seq ${String(current.seq)} must be greater than ${String(
        previous.seq,
      )}`,
    );
  }
};

const assertAcceptedSequencing = (
  previousState: GameState,
  result: EngineResult,
  label: string,
) => {
  assert.equal(result.errors, undefined, `${label} should be accepted`);
  assert.notEqual(
    result.events.length,
    0,
    `${label} should emit at least one event`,
  );
  const previousJournalLength = previousState.eventJournal.length;
  const appendedSuffix = result.state.eventJournal.slice(previousJournalLength);

  assertStrictlyIncreasingSeq(result.events, `${label} result.events`);
  assert.equal(
    new Set(result.events.map((event) => event.id)).size,
    result.events.length,
    `${label} event ids should be unique`,
  );
  assert.deepEqual(
    appendedSuffix,
    result.events,
    `${label} appended state.eventJournal suffix should equal result events`,
  );
  assertStrictlyIncreasingSeq(
    result.state.eventJournal,
    `${label} full state.eventJournal`,
  );
};

const signature = (result: EngineResult) => ({
  eventSeq: result.events.map((event) => event.seq),
  eventIds: result.events.map((event) => event.id),
  eventTypes: result.events.map((event) => event.type),
  stateHash: result.stateHash,
});

const assertDeterministicScript = (
  name: string,
  run: () => { results: EngineResult[] },
) => {
  const first = run();
  const second = run();
  assert.deepEqual(
    first.results.map(signature),
    second.results.map(signature),
    `${name} should be deterministic`,
  );
};

test("ENG-016: accepted engine paths keep EngineResult/eventJournal sequencing and deterministic hashes", () => {
  assertDeterministicScript("mulligan", () => {
    const setup = createInitialState(createInput());
    const started = startMulliganFlow(setup);
    assertAcceptedSequencing(setup, started, "mulligan:start");

    const first = respondToMulliganDecision(started.state, {
      type: "respondToDecision",
      decisionId: must(started.state.pendingDecision, "mulligan first decision")
        .id,
      response: { type: "mulligan", keep: true },
    });
    assertAcceptedSequencing(started.state, first, "mulligan:first response");

    const second = respondToMulliganDecision(first.state, {
      type: "respondToDecision",
      decisionId: must(first.state.pendingDecision, "mulligan second decision")
        .id,
      response: { type: "mulligan", keep: true },
    });
    assertAcceptedSequencing(first.state, second, "mulligan:second response");

    return { results: [started, first, second] };
  });

  assertDeterministicScript("phase advancement", () => {
    const active = createActiveState();
    const refresh = advanceRefreshPhase(active);
    assertAcceptedSequencing(active, refresh, "phase:refresh");
    const draw = advanceDrawPhase(refresh.state);
    assertAcceptedSequencing(refresh.state, draw, "phase:draw");
    const don = advanceDonPhase(draw.state);
    assertAcceptedSequencing(draw.state, don, "phase:don");
    return { results: [refresh, draw, don] };
  });

  assertDeterministicScript("play card", () => {
    const state = setupMainPlayState();
    const p1State = must(state.players[p1], "play-card p1");
    const character = must(p1State.hand[0], "play-card character");
    state.cardManifest.cards[character.cardId] = resolvedCard({
      cardId: character.cardId,
      category: "character",
      cost: 0,
      power: 2000,
    });
    const played = applyAction(state, {
      type: "playCard",
      cardInstanceId: character.instanceId,
    });
    assertAcceptedSequencing(state, played, "play-card");
    return { results: [played] };
  });

  assertDeterministicScript("attach DON", () => {
    const state = createActiveState();
    state.turn.phase = "main";
    const turnPlayer = must(state.players[p1], "attach p1");
    const don = must(turnPlayer.donDeck[0], "attach don");
    turnPlayer.donDeck = turnPlayer.donDeck.slice(1).map((card, index) => ({
      ...card,
      zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
    }));
    turnPlayer.costArea = [
      {
        ...don,
        zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
        state: "active",
      },
    ];
    const attached = applyAction(state, {
      type: "attachDon",
      donInstanceId: don.instanceId,
      target: {
        instanceId: turnPlayer.leader.instanceId,
        cardId: turnPlayer.leader.cardId,
        playerId: p1,
      },
    });
    assertAcceptedSequencing(state, attached, "attach-don");
    return { results: [attached] };
  });

  assertDeterministicScript("declare attack with blocker activation", () => {
    const state = setupAttackState();
    const attacker = must(state.players[p1], "attack p1").leader;
    const defenderPlayer = must(state.players[p2], "attack p2");
    const blocker = must(defenderPlayer.characters[0], "defender blocker");
    blocker.state = "active";
    state.cardManifest.cards[attacker.cardId] = resolvedCard({
      cardId: attacker.cardId,
      category: "leader",
      power: 5000,
    });
    state.cardManifest.cards[defenderPlayer.leader.cardId] = resolvedCard({
      cardId: defenderPlayer.leader.cardId,
      category: "leader",
      power: 5000,
    });
    state.cardManifest.cards[blocker.cardId] = {
      ...resolvedCard({
        cardId: blocker.cardId,
        category: "character",
        power: 3000,
      }),
      printedKeywords: ["blocker"],
    };
    const opened = applyAction(state, {
      type: "declareAttack",
      attacker: {
        instanceId: attacker.instanceId,
        cardId: attacker.cardId,
        playerId: p1,
      },
      target: {
        instanceId: defenderPlayer.leader.instanceId,
        cardId: defenderPlayer.leader.cardId,
        playerId: p2,
      },
    });
    assertAcceptedSequencing(state, opened, "declare-attack");

    const blocked = applyAction(opened.state, {
      type: "respondToDecision",
      decisionId: must(opened.state.pendingDecision, "blocker decision").id,
      response: {
        type: "cards",
        cards: [
          {
            instanceId: blocker.instanceId,
            cardId: blocker.cardId,
            playerId: p2,
            zone: blocker.zone,
          },
        ],
      },
    });
    assertAcceptedSequencing(opened.state, blocked, "blocker-resolution");
    assert.equal(
      blocked.events.some((event) => event.type === "blockerActivated"),
      true,
    );
    return { results: [opened, blocked] };
  });

  assertDeterministicScript(
    "supported on-play draw and effect queue processing",
    () => {
      const state = setupMainPlayState();
      const p1State = must(state.players[p1], "on-play p1");
      const character = must(p1State.hand[0], "on-play character");
      const resolved = resolvedCard({
        cardId: character.cardId,
        category: "character",
        cost: 0,
        power: 2000,
        effectText: "[On Play] Draw 1 card.",
        support: {
          status: "implemented-dsl",
          effectDefinitionId: "def-eng-016-on-play",
          rulesVersion: "r1",
          sourceTextHash: "source-hash",
        },
      });
      state.cardManifest.cards[character.cardId] = resolved;
      const definition = reviewedOnPlayDrawDefinition(character.cardId, {
        ...resolved.support,
        status: "implemented-dsl",
        effectDefinitionId: "def-eng-016-on-play",
      });
      state.cardManifest.effectDefinitionsVersion =
        definition.metadata.effectDefinitionsVersion;
      state.cardManifest.effectDefinitions = {
        "def-eng-016-on-play": definition,
      };

      const played = applyAction(state, {
        type: "playCard",
        cardInstanceId: character.instanceId,
      });
      assertAcceptedSequencing(state, played, "on-play-draw");
      assert.equal(played.state.effectQueue.length, 0);
      assert.equal(
        played.events.some((event) => event.type === "effectQueued"),
        true,
      );
      assert.equal(
        played.events.some((event) => event.type === "effectResolved"),
        true,
      );
      assert.equal(
        played.events.some((event) => event.type === "cardDrawn"),
        true,
      );
      return { results: [played] };
    },
  );

  assertDeterministicScript("concession terminal result", () => {
    const state = createActiveState();
    const conceded = applyAction(state, {
      type: "concede",
      playerId: p1,
    });
    assertAcceptedSequencing(state, conceded, "concede");
    return { results: [conceded] };
  });
});
