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
  resolveSupportedVanillaBattle,
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
import { hashCanonicalStateValue } from "./state/canonical-state.js";
import { createInitialState } from "./setup/initial-state.js";
import { setupMainPlayState } from "./play-card/test-fixtures.js";
import {
  setupAttackState,
  effectDefinition,
  passCounterStep,
  withOnKODrawEffect,
  withOnOpponentAttackDrawEffect,
  withWhenAttackingDrawEffect,
} from "./battle/test-fixtures.js";
import { createEvent } from "./action-results.js";

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

const triggerEventIdFromPayload = (
  payload: unknown,
): EngineEvent["id"] | null => {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const triggerEventId = (payload as { readonly triggerEventId?: unknown })
    .triggerEventId;
  return typeof triggerEventId === "string"
    ? (triggerEventId as EngineEvent["id"])
    : null;
};

const assertSpotlightsDoNotAnchorTriggers = (
  events: readonly EngineEvent[],
  label: string,
) => {
  const spotlightIds = new Set(
    events
      .filter((event) => event.type === "spotlightEntryCreated")
      .map((event) => event.id),
  );
  for (const event of events) {
    const triggerEventId = triggerEventIdFromPayload(event.payload);
    assert.equal(
      triggerEventId !== null && spotlightIds.has(triggerEventId),
      false,
      `${label} should not anchor ${event.type} to a spotlight event`,
    );
  }
};

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

test("spotlight presentation events are inert for gameplay sequencing", () => {
  // Engine-core does not expose an event-journal replay reducer; replay
  // determinism here is action re-execution. This covers the local
  // reducer-equivalent surface by proving spotlight events can be filtered out
  // without disturbing gameplay ordering or trigger anchors.
  const state = createActiveState();
  const source = must(state.players[p1], "sequencing p1").leader;
  const cardPlayed = createEvent(state, 1, "cardPlayed", {
    playerId: p1,
    instanceId: source.instanceId,
    cardId: source.cardId,
    category: "leader",
    turnNumber: state.turn.globalTurn,
  });
  const spotlight = createEvent(state, 2, "spotlightEntryCreated", {
    entry: {
      id: "spotlight:sequencing",
      key: "spotlight:sequencing",
      semanticKey: "spotlight:sequencing",
      mode: "resolved",
      status: "resolved",
      active: {
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
          zone: source.zone,
        },
        activeSpanIds: ["span:body"],
      },
    },
  });
  const effectQueued = createEvent(state, 3, "effectQueued", {
    playerId: p1,
    sourceInstanceId: source.instanceId,
    sourceCardId: source.cardId,
    triggerEventId: cardPlayed.id,
  });
  const events = [cardPlayed, spotlight, effectQueued];

  assert.deepEqual(
    events
      .filter((event) => event.type !== "spotlightEntryCreated")
      .map((event) => event.id),
    [cardPlayed.id, effectQueued.id],
  );
  assertSpotlightsDoNotAnchorTriggers(events, "synthetic-sequencing");
});

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

const runEng027dOnKOTriggerBattleScript = () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "ENG-027D sequencing p1");
  const p2State = must(state.players[p2], "ENG-027D sequencing p2");
  const attacker = must(p1State.characters[0], "ENG-027D sequencing attacker");
  const target = must(p2State.characters[0], "ENG-027D sequencing target");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  const definition = withOnKODrawEffect(
    state,
    target,
    "def-eng-027d-seq-on-ko",
  );
  const effectBlockId = must(
    definition.effects[0],
    "ENG-027D sequencing On K.O. effect",
  ).id;
  state.battle = {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    step: "counter",
    damageCount: 1,
  };

  const resolved = resolveSupportedVanillaBattle(state);
  assertAcceptedSequencing(state, resolved, "ENG-027D On K.O. battle");
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(resolved.state.deferredTriggers.length, 0);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.battle, undefined);

  const cardKOdIndex = eventIndex(
    resolved.events,
    "cardKOd",
    "ENG-027D On K.O. battle",
  );
  const effectQueuedIndex = effectEventIndex(
    resolved.events,
    "effectQueued",
    effectBlockId,
    "ENG-027D On K.O. battle",
  );
  const effectResolvedIndex = effectEventIndex(
    resolved.events,
    "effectResolved",
    effectBlockId,
    "ENG-027D On K.O. battle",
  );
  assert.ok(cardKOdIndex < effectQueuedIndex);
  assert.ok(effectQueuedIndex < effectResolvedIndex);

  return { results: [resolved] };
};

const runEng028LifeTriggerDeclineAndActivationScripts = () => {
  const openLifeTrigger = () => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "ENG-028 p1");
    const p2State = must(state.players[p2], "ENG-028 p2");
    const topLife = must(p2State.life[0], "ENG-028 top life");
    const lifeCardId = "eng-028-life-trigger" as typeof topLife.card.cardId;
    const definition = effectDefinition(lifeCardId, { type: "trigger" });
    const effect = must(definition.effects[0], "ENG-028 trigger effect");
    const effectWithoutFlags = { ...effect };
    delete effectWithoutFlags.optional;
    delete effectWithoutFlags.oncePerTurn;
    const supported = {
      ...definition,
      effects: [
        {
          ...effectWithoutFlags,
          sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
        },
      ],
    };
    p2State.life[0] = {
      ...topLife,
      card: { ...topLife.card, cardId: lifeCardId },
    };
    state.cardManifest.cards[lifeCardId] = resolvedCard({
      cardId: lifeCardId,
      category: "character",
      power: 1000,
      triggerText: "TRIGGER: draw 1 card",
      support: {
        status: "implemented-dsl",
        effectDefinitionId: "def-eng-028-life-trigger",
        rulesVersion: supported.metadata.rulesVersion,
        sourceTextHash: supported.metadata.sourceTextHash,
      },
    });
    state.cardManifest.effectDefinitionsVersion =
      supported.metadata.effectDefinitionsVersion;
    state.cardManifest.effectDefinitions = {
      "def-eng-028-life-trigger": supported,
    };
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
    assertAcceptedSequencing(state, opened, "ENG-028 counter decision");
    const passed = passCounterStep(opened.state, p2);
    assertAcceptedSequencing(
      opened.state,
      passed,
      "ENG-028 life trigger decision",
    );
    return passed;
  };

  const openedForDecline = openLifeTrigger();
  const expectedOpenedSignature = {
    eventSeq: [10, 11, 12, 13, 14, 15, 16, 17],
    eventIds: [
      "event:4:1:decisionResolved",
      "event:4:1:damageDealt",
      "event:4:2:spotlightEntryCreated",
      "event:4:3:lifeTaken",
      "event:4:4:decisionCreated",
      "event:4:5:battleEnded",
      "event:4:6:effectResolved",
      "event:4:7:ruleProcessingChecked",
    ],
    eventTypes: [
      "decisionResolved",
      "damageDealt",
      "spotlightEntryCreated",
      "lifeTaken",
      "decisionCreated",
      "battleEnded",
      "effectResolved",
      "ruleProcessingChecked",
    ],
    stateHash:
      "298e55c585bb1d21dbf479efc6a6c617a1313d3c191d8e6879883363195855a2",
  };
  assert.deepEqual(signature(openedForDecline), expectedOpenedSignature);
  const declineDecision = must(
    openedForDecline.state.pendingDecision,
    "ENG-028 decline decision",
  );
  const declined = applyAction(openedForDecline.state, {
    type: "respondToDecision",
    decisionId: declineDecision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });
  assertAcceptedSequencing(
    openedForDecline.state,
    declined,
    "ENG-028 life trigger decline",
  );
  assert.equal(declined.stateHash, hashCanonicalStateValue(declined.state));
  assert.deepEqual(signature(declined), {
    eventSeq: [18, 19, 20],
    eventIds: [
      "event:5:1:decisionResolved",
      "event:5:2:cardMoved",
      "event:5:3:cardMoved",
    ],
    eventTypes: ["decisionResolved", "cardMoved", "cardMoved"],
    stateHash:
      "b1ad9ff286ae858b4d33ef0e0b70f80fa3d74b353623b719b3be27e4df80b3b2",
  });

  const openedForActivation = openLifeTrigger();
  assert.deepEqual(signature(openedForActivation), expectedOpenedSignature);
  const activateDecision = must(
    openedForActivation.state.pendingDecision,
    "ENG-028 activation decision",
  );
  const activated = applyAction(openedForActivation.state, {
    type: "respondToDecision",
    decisionId: activateDecision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });
  assertAcceptedSequencing(
    openedForActivation.state,
    activated,
    "ENG-028 life trigger activation",
  );
  assert.equal(activated.stateHash, hashCanonicalStateValue(activated.state));
  assert.equal(activated.state.effectQueue.length, 0);
  assert.equal(activated.state.revealedCards.length, 0);
  assert.deepEqual(signature(activated), {
    eventSeq: [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
    eventIds: [
      "event:5:1:decisionResolved",
      "event:5:2:cardRevealed",
      "event:5:3:triggerActivated",
      "event:5:4:effectQueued",
      "event:6:1:cardDrawn",
      "event:6:2:cardMoved",
      "event:6:3:cardMoved",
      "event:6:1:effectResolved",
      "event:6:1:ruleProcessingChecked",
      "event:6:2:gameEnded",
      "event:6:1:cardMoved",
      "event:6:2:cardTrashed",
    ],
    eventTypes: [
      "decisionResolved",
      "cardRevealed",
      "triggerActivated",
      "effectQueued",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
      "gameEnded",
      "cardMoved",
      "cardTrashed",
    ],
    stateHash:
      "c08d8493295e92870f9266860565c692b6db126f854331bd39c71f39f302c206",
  });

  return {
    results: [openedForDecline, declined, openedForActivation, activated],
  };
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
      const gameplayTypes = played.events
        .filter((event) => event.type !== "spotlightEntryCreated")
        .map((event) => event.type);
      assert.deepEqual(gameplayTypes, [
        "cardRevealed",
        "cardMoved",
        "cardPlayed",
        "ruleProcessingChecked",
        "effectQueued",
        "cardDrawn",
        "cardMoved",
        "cardMoved",
        "effectResolved",
        "ruleProcessingChecked",
        "gameEnded",
      ]);
      assertSpotlightsDoNotAnchorTriggers(played.events, "on-play-draw");
      assert.equal(
        played.events.some((event) => event.type === "cardDrawn"),
        true,
      );
      return { results: [played] };
    },
  );

  assertDeterministicScript(
    "supported battle K.O. draw trigger and cleanup",
    runEng027dOnKOTriggerBattleScript,
  );

  assertDeterministicScript(
    "life trigger decline and activation paths",
    runEng028LifeTriggerDeclineAndActivationScripts,
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
