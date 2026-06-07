import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  EffectId,
  Protection,
  ReplacementTrigger,
  Target,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import {
  applyDeclareAttack,
  resolveSupportedVanillaBattle,
} from "./actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import {
  effectDefinition,
  passCounterStep,
  setupAttackState,
} from "./test-fixtures.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

const fieldRemovalProtection = (): Protection => ({
  process: "fieldRemoval",
  fieldRemoval: {
    processFamily: "fieldRemoval",
    classification: "moveFromFieldToTrash",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    targetScope: "thisCard",
    exclusions: {
      battleKO: "excluded",
      ruleProcessTrash: "excluded",
      controllerCost: "excluded",
      controllerOwnedEffect: "excluded",
      ambiguousCustomRemoval: "failClosed",
    },
  },
});

const protectTargetFromOpponentEffectRemoval = (
  state: ReturnType<typeof setupAttackState>,
  target: CardInstance,
) => {
  state.continuousEffects = [
    {
      id: `battle-field-removal-protection:${String(target.instanceId)}`,
      source: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: target.controller,
        zone: target.zone,
      },
      sourceSnapshot: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        ownerId: target.owner,
        controllerId: target.controller,
        zone: target.zone,
        category: "character",
        colors: ["red"],
        power: 3000,
        keywords: [],
      },
      controller: target.controller,
      modifier: {
        layer: "protection",
        target: { type: "self" },
        operation: { type: "protection", protection: fieldRemovalProtection() },
      },
      duration: { type: "permanent" },
      createdBy: { type: "ruleProcess", name: "battle-protection-test" },
      createdAtStateSeq: state.seq,
    },
  ];
};

const addOpponentFieldRemovalLifeReplacement = (
  state: ReturnType<typeof setupAttackState>,
  target: CardInstance,
): EffectId => {
  const targetCardId = toCardId("battle-sky-island-target");
  target.cardId = targetCardId;
  const replacementSource = must(state.players[p2], "p2").leader;
  const replacementTarget: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: {
      categories: ["character"],
      typesAny: ["Sky Island"],
      power: { min: 6000 },
    },
  };
  const when: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    target: replacementTarget,
  };
  const effectId = toEffectId("replacement:battle-field-removal-life-to-hand");
  const effectDefinitionId = "definition:battle-field-removal-life-to-hand";
  state.cardManifest.cards[target.cardId] = {
    ...resolvedCard({
      cardId: target.cardId,
      category: "character",
      power: 6000,
    }),
    types: ["Sky Island"],
  };
  state.cardManifest.cards[replacementSource.cardId] = resolvedCard({
    cardId: replacementSource.cardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "battle-field-removal-replacement-rules",
      sourceTextHash: "battle-field-removal-replacement-source",
    },
  });
  const effectBlock: EffectDefinition["effects"][number] = {
    id: effectId,
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: {
        type: "moveCards",
        count: 1,
        from: { player: "self", zone: "life", position: "top" },
        to: { player: "self", zone: "hand" },
        order: "original",
      },
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: {
      cardId: replacementSource.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: "battle-field-removal-replacement-source",
        rulesVersion: "battle-field-removal-replacement-rules",
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-29T00:00:00.000Z",
      },
    },
  };
  return effectId;
};

test("equal-or-greater power K.O.s rested character and returns attached DON!! rested", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const don = must(p2State.donDeck[0], "p2 don");
  p2State.donDeck = p2State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  p2State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
    },
  ];
  target.attachedDon = [don.instanceId];
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });
  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(must(result.state.players[p2], "p2").characters.length, 0);
  assert.equal(must(result.state.players[p2], "p2").trash.length >= 1, true);
  assert.equal(
    must(result.state.players[p2], "p2").costArea.find(
      (card) => card.instanceId === don.instanceId,
    )?.state,
    "rested",
  );
});

test("battle K.O. still removes a Character protected from opponent effect removal", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  protectTargetFromOpponentEffectRemoval(state, target);
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    false,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    result.events
      .filter((event) =>
        ["damageDealt", "cardKOd", "cardMoved"].includes(event.type),
      )
      .map((event) => event.type),
    ["damageDealt", "cardKOd", "cardMoved"],
  );
});

test("battle K.O. pauses for opponent field-removal life replacement", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const topLife = must(p2State.life[0], "top life").card;
  const replacementId = addOpponentFieldRemovalLifeReplacement(state, target);
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  const decision = must(result.state.pendingDecision, "replacement decision");
  assert.equal(decision.type, "chooseReplacement");
  assert.equal(decision.playerId, p2);
  const offeredReplacementId = must(
    decision.replacementIds[0],
    "replacement id",
  );
  assert.match(offeredReplacementId, new RegExp(`${replacementId}$`, "u"));
  assert.deepEqual(
    result.events
      .filter((event) =>
        ["damageDealt", "decisionCreated", "cardKOd", "cardMoved"].includes(
          event.type,
        ),
      )
      .map((event) => event.type),
    ["damageDealt", "decisionCreated"],
  );

  const accepted = applyAction(result.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "replacement", replacementId: offeredReplacementId },
  });
  const nextP2 = must(accepted.state.players[p2], "accepted p2");

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.equal(accepted.state.battle, undefined);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(
    must(nextP2.hand.at(-1), "life moved to hand").instanceId,
    topLife.instanceId,
  );
  assert.deepEqual(
    accepted.events
      .filter((event) =>
        [
          "decisionResolved",
          "replacementApplied",
          "cardMoved",
          "cardKOd",
          "effectResolved",
        ].includes(event.type),
      )
      .map((event) => event.type),
    [
      "decisionResolved",
      "replacementApplied",
      "cardMoved",
      "cardMoved",
      "effectResolved",
    ],
  );
});

test("banish attacker against rested character still K.O.s normally and returns attached DON!!", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const beforeLife = p2State.life.length;
  const don = must(p2State.donDeck[0], "p2 don");
  p2State.donDeck = p2State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  p2State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
    },
  ];
  target.attachedDon = [don.instanceId];
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
    printedKeywords: ["banish"],
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(must(result.state.players[p2], "p2").characters.length, 0);
  assert.equal(
    must(result.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );
  assert.equal(
    must(result.state.players[p2], "p2").costArea.find(
      (card) => card.instanceId === don.instanceId,
    )?.state,
    "rested",
  );
  assert.equal(must(result.state.players[p2], "p2").life.length, beforeLife);
});

test("character K.O. reindexes surviving defender characters", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const survivor = must(p2State.hand[0], "second defender");
  p2State.characters.push({
    ...survivor,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
    state: "rested",
    attachedDon: [],
    turnPlayed: 1,
  });
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });
  state.cardManifest.cards[survivor.cardId] = resolvedCard({
    cardId: survivor.cardId,
    category: "character",
    power: 3000,
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  const defender = must(result.state.players[p2], "p2");
  assert.equal(defender.characters.length, 1);
  const remainingCharacter = must(defender.characters[0], "remaining defender");
  assert.equal(remainingCharacter.instanceId, survivor.instanceId);
  assert.deepEqual(remainingCharacter.zone, {
    zone: "characterArea",
    playerId: p2,
    slot: "character",
    index: 0,
  });
});

test("lower-power attack causes no K.O. and no life movement", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 2000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 7000,
  });
  const beforeLife = p2State.life.length;
  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });
  assert.equal(opened.errors, undefined);
  const result = passCounterStep(opened.state, p2);
  assert.equal(result.errors, undefined);
  assert.equal(must(result.state.players[p2], "p2").characters.length, 1);
  assert.equal(must(result.state.players[p2], "p2").life.length, beforeLife);
});

test("reviewed supported On K.O. metadata resolves after battle K.O. events", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const beforeDeck = p2State.deck.length;
  const beforeHand = p2State.hand.length;
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  const definition = effectDefinition(target.cardId, { type: "onKO" });
  const onKOEffect = must(definition.effects[0], "onKO effect");
  const onKODefinition = {
    ...definition,
    effects: [
      {
        ...onKOEffect,
        sourcePresencePolicy: "resolveFromDestinationZone" as const,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    onKODefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-supported-on-ko": onKODefinition,
  };
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    effectText: "[On K.O.] Draw 1 card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-supported-on-ko",
      rulesVersion: onKODefinition.metadata.rulesVersion,
      sourceTextHash: onKODefinition.metadata.sourceTextHash,
    },
  });

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

  const result = resolveSupportedVanillaBattle(state);
  const replay = resolveSupportedVanillaBattle(structuredClone(state));

  assert.equal(result.errors, undefined);
  assert.equal(replay.errors, undefined);
  assert.deepEqual(replay.events, result.events);
  assert.deepEqual(result.state.effectQueue, []);
  assert.deepEqual(replay.state.effectQueue, []);
  assert.equal(replay.stateHash, result.stateHash);
  const cardKOdIndex = result.events.findIndex(
    (event) => event.type === "cardKOd",
  );
  const cardMovedIndex = result.events.findIndex(
    (event) => event.type === "cardMoved",
  );
  const effectQueuedIndex = result.events.findIndex(
    (event) => event.type === "effectQueued",
  );
  const cardKOd = must(result.events[cardKOdIndex], "cardKOd event");
  const cardMoved = must(result.events[cardMovedIndex], "cardMoved event");
  const effectQueued = must(
    result.events[effectQueuedIndex],
    "effectQueued event",
  );
  const onKOResolved = result.events.find(
    (event) =>
      event.type === "effectResolved" &&
      (event.payload as { effectBlockId?: unknown }).effectBlockId ===
        onKOEffect.id,
  );
  const onKOResolvedIndex = result.events.findIndex(
    (event) => event === onKOResolved,
  );
  const nextP2 = must(result.state.players[p2], "p2");

  assert.equal(cardKOdIndex >= 0, true);
  assert.equal(cardMovedIndex > cardKOdIndex, true);
  assert.equal(effectQueuedIndex > cardMovedIndex, true);
  assert.equal(onKOResolvedIndex > effectQueuedIndex, true);
  assert.equal(
    result.events.map((event) => event.id).length,
    new Set(result.events.map((event) => event.id)).size,
  );
  assert.equal(
    result.events.filter((event) => event.type === "effectResolved").length,
    2,
  );
  const queuedId = `queue-entry:${String(cardKOd.id)}:${String(onKOEffect.id)}`;
  const timingWindowId = `timing-window:${String(cardKOd.id)}:onKO`;
  assert.deepEqual(effectQueued.payload, {
    queueEntryId: queuedId,
    timingWindowId,
    generation: 0,
    effectBlockId: onKOEffect.id,
    triggerEventId: cardKOd.id,
    sourcePresencePolicy: "resolveFromDestinationZone",
    orderingGroup: "nonTurnPlayer",
  });
  assert.deepEqual(effectQueued.causedBy, {
    type: "ruleProcess",
    name: "effectRuntime:onKOTriggerQueueing",
  });
  assert.ok(onKOResolved !== undefined);
  assert.deepEqual(onKOResolved.payload, {
    queueEntryId: queuedId,
    timingWindowId,
    generation: 0,
    effectBlockId: onKOEffect.id,
    triggerEventId: cardKOd.id,
    sourcePresencePolicy: "resolveFromDestinationZone",
    orderingGroup: "nonTurnPlayer",
    presentation: {
      source: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
        zone: {
          zone: "trash",
          playerId: p2,
          slot: "trash",
          index: 0,
        },
      },
      textKind: "effect",
      activeSpanIds: [],
    },
    status: "resolved",
  });
  assert.equal(
    (cardMoved.payload as { instanceId?: unknown }).instanceId,
    target.instanceId,
  );
  assert.equal(nextP2.characters.length, 0);
  assert.equal(nextP2.trash[0]?.instanceId, target.instanceId);
  assert.equal(nextP2.deck.length, beforeDeck - 1);
  assert.equal(nextP2.hand.length, beforeHand + 1);
});

test("On K.O. rest target effect pauses, resolves, and resumes battle cleanup", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  p1State.leader = { ...p1State.leader, state: "rested" };
  const restCandidateSource = must(p1State.hand[0], "rest candidate");
  const restCandidate = {
    ...restCandidateSource,
    zone: {
      zone: "characterArea",
      playerId: p1,
      slot: "character",
      index: 1,
    } as const,
    state: "active" as const,
    attachedDon: [],
    turnPlayed: 1,
  };
  p1State.characters = [attacker, restCandidate];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[restCandidate.cardId] = resolvedCard({
    cardId: restCandidate.cardId,
    category: "character",
    cost: 4,
    power: 3000,
  });
  const definition = effectDefinition(target.cardId, { type: "onKO" });
  const onKOEffect = must(definition.effects[0], "On K.O. rest effect");
  const onKODefinition: EffectDefinition = {
    ...definition,
    effects: [
      {
        ...onKOEffect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "opponent",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: {
                anyOf: [
                  { categories: ["leader"] },
                  { categories: ["character"], cost: { max: 7 } },
                ],
              },
            },
          },
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    onKODefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-supported-on-ko-rest": onKODefinition,
  };
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    effectText:
      "[On K.O.] Rest up to 1 of your opponent's Leader or Character cards with a cost of 7 or less.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-supported-on-ko-rest",
      rulesVersion: onKODefinition.metadata.rulesVersion,
      sourceTextHash: onKODefinition.metadata.sourceTextHash,
    },
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });
  assert.equal(opened.errors, undefined);

  const paused = passCounterStep(opened.state, p2);
  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.battle, undefined);
  const decision = must(paused.state.pendingDecision, "On K.O. rest decision");
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.playerId, p2);
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    [p1State.leader.instanceId, restCandidate.instanceId],
  );
  assert.equal(
    paused.events.some(
      (event) =>
        event.type === "effectResolved" &&
        (event.payload as { systemStep?: unknown }).systemStep === "endBattle",
    ),
    true,
  );

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [
        must(
          decision.candidates.find(
            (candidate) =>
              candidate.card.instanceId === restCandidate.instanceId,
          ),
          "rest target",
        ).card,
      ],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.battle, undefined);
  assert.deepEqual(resolved.state.effectQueue, []);
  assert.equal(
    must(resolved.state.players[p1], "resolved p1").characters.find(
      (card) => card.instanceId === restCandidate.instanceId,
    )?.state,
    "rested",
  );
});
