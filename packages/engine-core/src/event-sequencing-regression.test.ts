import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

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
import { getLegalActions } from "./actions.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { createInitialState } from "./initial-state.js";
import { setupMainPlayState } from "./play-card-test-fixtures.js";
import {
  setupAttackState,
  withOnOpponentAttackDrawEffect,
  withWhenAttackingDrawEffect,
} from "./battle-actions-test-fixtures.js";

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

const ensureDeckHasAtLeast = (
  state: ReturnType<typeof setupAttackState>,
  playerId: PlayerId,
  count: number,
) => {
  const player = must(state.players[playerId], "deck owner");
  if (player.deck.length >= count) {
    return;
  }
  const needed = count - player.deck.length;
  const moved = player.hand.slice(0, needed).map((card, index) => ({
    ...card,
    zone: {
      zone: "deck" as const,
      playerId,
      slot: "deck" as const,
      index: player.deck.length + index,
    },
  }));
  player.deck = [...player.deck, ...moved];
  player.hand = player.hand.slice(needed).map((card, index) => ({
    ...card,
    zone: { zone: "hand" as const, playerId, slot: "hand" as const, index },
  }));
};

const effectEventIndex = (
  events: readonly EngineEvent[],
  eventType: "effectQueued" | "effectResolved",
  effectBlockId: string,
  label: string,
) => {
  const index = events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return event.type === eventType && payload.effectBlockId === effectBlockId;
  });
  assert.notEqual(index, -1, `${label} should emit ${eventType}`);
  return index;
};

const eventIndex = (
  events: readonly EngineEvent[],
  eventType: EngineEvent["type"],
  label: string,
) => {
  const index = events.findIndex((event) => event.type === eventType);
  assert.notEqual(index, -1, `${label} should emit ${eventType}`);
  return index;
};

const assertEng023cAttackTimingOrder = (
  opened: EngineResult,
  attackerEffectBlockId: string,
  defenderEffectBlockId: string,
) => {
  const attackDeclaredIndex = eventIndex(
    opened.events,
    "attackDeclared",
    "ENG-023C attack timing",
  );
  const attackerQueuedIndex = effectEventIndex(
    opened.events,
    "effectQueued",
    attackerEffectBlockId,
    "ENG-023C attacker timing",
  );
  const attackerResolvedIndex = effectEventIndex(
    opened.events,
    "effectResolved",
    attackerEffectBlockId,
    "ENG-023C attacker timing",
  );
  const defenderQueuedIndex = effectEventIndex(
    opened.events,
    "effectQueued",
    defenderEffectBlockId,
    "ENG-023C defender timing",
  );
  const defenderResolvedIndex = effectEventIndex(
    opened.events,
    "effectResolved",
    defenderEffectBlockId,
    "ENG-023C defender timing",
  );
  const decisionCreatedIndex = eventIndex(
    opened.events,
    "decisionCreated",
    "ENG-023C Counter Step",
  );

  assert.ok(attackDeclaredIndex < attackerQueuedIndex);
  assert.ok(attackerQueuedIndex < attackerResolvedIndex);
  assert.ok(attackerResolvedIndex < defenderQueuedIndex);
  assert.ok(defenderQueuedIndex < defenderResolvedIndex);
  assert.ok(defenderResolvedIndex < decisionCreatedIndex);
  assert.equal(
    opened.events.some((event) => event.type === "damageDealt"),
    false,
  );
};

const runEng023cAttackTimingCounterScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-023C p1");
  const p2State = must(state.players[p2], "ENG-023C p2");
  const attackerDefinition = withWhenAttackingDrawEffect(
    state,
    p1State.leader,
    "def-eng-023c-seq-when-attacking",
  );
  const defenderDefinition = withOnOpponentAttackDrawEffect(
    state,
    p2State.leader,
    "def-eng-023c-seq-on-opponent-attack",
  );
  const attackerEffect = must(
    attackerDefinition.effects[0],
    "ENG-023C attacker effect",
  );
  const defenderEffect = must(
    defenderDefinition.effects[0],
    "ENG-023C defender effect",
  );
  ensureDeckHasAtLeast(state, p1, 2);
  ensureDeckHasAtLeast(state, p2, 2);
  const counterCard = must(p2State.hand[0], "ENG-023C counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });

  assert.equal(
    getLegalActions(state, p2).some((action) => action.type === "useCounter"),
    false,
  );
  assert.equal(
    getLegalActions(state, p2).some(
      (action) => action.type === "respondToDecision",
    ),
    false,
  );

  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assertAcceptedSequencing(state, opened, "ENG-023C attack timing open");
  assert.equal(opened.stateHash, hashCanonicalStateValue(opened.state));
  assert.equal(opened.state.battle?.step, "counter");
  assert.equal(opened.state.pendingDecision?.playerId, p2);
  assertEng023cAttackTimingOrder(opened, attackerEffect.id, defenderEffect.id);
  assert.equal(
    getLegalActions(opened.state, p1).some(
      (action) => action.type === "useCounter",
    ),
    false,
  );
  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) => action.type === "useCounter",
    ),
    true,
  );
  assert.equal(
    getLegalActions(opened.state, p2).some(
      (action) => action.type === "respondToDecision",
    ),
    true,
  );

  const countered = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterCard.instanceId,
    target: must(opened.state.battle, "ENG-023C counter battle").currentTarget,
  });
  assertAcceptedSequencing(opened.state, countered, "ENG-023C counter use");
  assert.equal(countered.stateHash, hashCanonicalStateValue(countered.state));
  assert.equal(
    countered.events.some((event) => event.type === "counterUsed"),
    true,
  );

  const passed = applyAction(countered.state, {
    type: "respondToDecision",
    decisionId: must(
      countered.state.pendingDecision,
      "ENG-023C counter decision",
    ).id,
    response: { type: "cards", cards: [] },
  });
  assertAcceptedSequencing(countered.state, passed, "ENG-023C counter pass");
  assert.equal(passed.stateHash, hashCanonicalStateValue(passed.state));

  return { results: [opened, countered, passed] };
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
    "declare attack with attacker timing, defender timing, and Counter Step",
    runEng023cAttackTimingCounterScript,
  );

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
