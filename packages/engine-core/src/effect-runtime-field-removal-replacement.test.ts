import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  PlayerId,
  QueueEntryId,
  ReplacementTrigger,
  Target,
  TimingWindowId,
} from "@optcg/types";

import { applyAction } from "./actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import { executeSelectedTargetEffectPrimitive } from "./effect-runtime-primitives.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const sourceSnapshot = (
  card: CardInstance,
  controllerId: PlayerId,
): EffectQueueEntry["sourceSnapshot"] => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId: card.owner,
  controllerId,
  zone: card.zone,
  category: "character",
  colors: ["red"],
  keywords: [],
  power: 5000,
});

const cardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

test("accepted opponent field-removal replacement moves top life to hand instead of KOing matching Character", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const sourceHand = must(p1State.hand[0], "source");
  const targetHand = must(p2State.hand[0], "target");
  const source: CardInstance = {
    ...sourceHand,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const targetCardId = toCardId("sky-island-target");
  const targetCard: CardInstance = {
    ...targetHand,
    cardId: targetCardId,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  p1State.characters = [source];
  p1State.hand = p1State.hand.slice(1);
  p2State.characters = [targetCard];
  p2State.hand = p2State.hand.slice(1);
  const topLife = must(p2State.life[0], "top life").card;

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
  const effectId = toEffectId("replacement:field-removal-life-to-hand");
  const effectDefinitionId = "definition:field-removal-life-to-hand";
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[targetCard.cardId] = {
    ...resolvedCard({
      cardId: targetCard.cardId,
      category: "character",
      power: 6000,
      support: {
        status: "implemented-dsl",
        effectDefinitionId,
        rulesVersion: "replacement-rules",
        sourceTextHash: "replacement-source",
      },
    }),
    types: ["Sky Island"],
  };
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
    [effectDefinitionId]: {
      cardId: targetCard.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: "replacement-source",
        rulesVersion: "replacement-rules",
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-28T00:00:00.000Z",
      },
    },
  };
  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-field-removal"),
    state: "pending",
    timingWindowId: "timing-window-field-removal" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: cardRef(source, p1),
    sourceSnapshot: sourceSnapshot(source, p1),
    effectBlockId: toEffectId("ko-target-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "field-removal-replacement-test" },
  };

  const paused = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
    [cardRef(targetCard, p2)],
  );
  const decision = paused.state.pendingDecision;
  if (decision?.type !== "chooseReplacement") {
    assert.fail("expected chooseReplacement decision");
  }
  assert.equal(decision.replacementIds[0], effectId);

  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "replacement", replacementId: effectId },
  });
  const nextP2 = must(accepted.state.players[p2], "next p2");

  assert.equal(accepted.errors, undefined);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === targetCard.instanceId),
    true,
  );
  assert.equal(
    must(nextP2.hand.at(-1), "new hand card").instanceId,
    topLife.instanceId,
  );
  assert.equal(nextP2.life.length, p2State.life.length - 1);
  assert.deepEqual(
    accepted.events.map((event) => event.type),
    ["decisionResolved", "replacementApplied", "cardMoved", "cardMoved"],
  );
});

test("opponent field-removal life replacement is unavailable when its life cost cannot be paid", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const sourceHand = must(p1State.hand[0], "source");
  const targetHand = must(p2State.hand[0], "target");
  const source: CardInstance = {
    ...sourceHand,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const targetCardId = toCardId("sky-island-target-with-no-life");
  const targetCard: CardInstance = {
    ...targetHand,
    cardId: targetCardId,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  p1State.characters = [source];
  p1State.hand = p1State.hand.slice(1);
  p2State.characters = [targetCard];
  p2State.hand = p2State.hand.slice(1);
  p2State.life = [];

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
  const effectId = toEffectId("replacement:no-life-field-removal-life-to-hand");
  const effectDefinitionId = "definition:no-life-field-removal-life-to-hand";
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[targetCard.cardId] = {
    ...resolvedCard({
      cardId: targetCard.cardId,
      category: "character",
      power: 6000,
      support: {
        status: "implemented-dsl",
        effectDefinitionId,
        rulesVersion: "replacement-rules",
        sourceTextHash: "replacement-source",
      },
    }),
    types: ["Sky Island"],
  };
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
    [effectDefinitionId]: {
      cardId: targetCard.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: "replacement-source",
        rulesVersion: "replacement-rules",
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-28T00:00:00.000Z",
      },
    },
  };
  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-field-removal-no-life"),
    state: "pending",
    timingWindowId: "timing-window-field-removal-no-life" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: cardRef(source, p1),
    sourceSnapshot: sourceSnapshot(source, p1),
    effectBlockId: toEffectId("ko-target-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "field-removal-replacement-test" },
  };

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
    [cardRef(targetCard, p2)],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === targetCard.instanceId),
    false,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === targetCard.instanceId),
    true,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardKOd", "cardMoved"],
  );
});

test("opponent field-removal replacement from another field source protects matching Character", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const sourceHand = must(p1State.hand[0], "source");
  const targetHand = must(p2State.hand[0], "target");
  const source: CardInstance = {
    ...sourceHand,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const targetCardId = toCardId("sky-island-target-protected-by-leader");
  const targetCard: CardInstance = {
    ...targetHand,
    cardId: targetCardId,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  p1State.characters = [source];
  p1State.hand = p1State.hand.slice(1);
  p2State.characters = [targetCard];
  p2State.hand = p2State.hand.slice(1);
  const replacementSource = p2State.leader;
  const topLife = must(p2State.life[0], "top life").card;

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
  const effectId = toEffectId("replacement:leader-field-removal-life-to-hand");
  const effectDefinitionId = "definition:leader-field-removal-life-to-hand";
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[targetCard.cardId] = {
    ...resolvedCard({
      cardId: targetCard.cardId,
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
      rulesVersion: "replacement-rules",
      sourceTextHash: "replacement-source",
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
    [effectDefinitionId]: {
      cardId: replacementSource.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: "replacement-source",
        rulesVersion: "replacement-rules",
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-29T00:00:00.000Z",
      },
    },
  };
  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-leader-field-removal"),
    state: "pending",
    timingWindowId: "timing-window-leader-field-removal" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: cardRef(source, p1),
    sourceSnapshot: sourceSnapshot(source, p1),
    effectBlockId: toEffectId("ko-target-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "field-removal-replacement-test" },
  };

  const paused = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
    [cardRef(targetCard, p2)],
  );
  const decision = paused.state.pendingDecision;
  if (decision?.type !== "chooseReplacement") {
    assert.fail("expected chooseReplacement decision");
  }
  assert.equal(decision.replacementIds[0], effectId);

  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "replacement", replacementId: effectId },
  });
  const nextP2 = must(accepted.state.players[p2], "next p2");

  assert.equal(accepted.errors, undefined);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === targetCard.instanceId),
    true,
  );
  assert.equal(
    must(nextP2.hand.at(-1), "new hand card").instanceId,
    topLife.instanceId,
  );
  assert.equal(nextP2.life.length, p2State.life.length - 1);
});

test("accepted K.O. replacement trashes from hand instead of KOing matching base-cost Character", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const sourceHand = must(p1State.hand[0], "source");
  const targetHand = must(p2State.hand[0], "target");
  const replacementCostCard = must(p2State.hand[1], "replacement cost card");
  const source: CardInstance = {
    ...sourceHand,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const targetCardId = toCardId("base-cost-target");
  const targetCard: CardInstance = {
    ...targetHand,
    cardId: targetCardId,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  p1State.characters = [source];
  p1State.hand = p1State.hand.slice(1);
  p2State.characters = [targetCard];
  p2State.hand = p2State.hand.slice(1);

  const replacementTarget: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: {
      categories: ["character"],
      cost: { min: 4 },
    },
  };
  const when: ReplacementTrigger = {
    type: "wouldBeKOd",
    target: replacementTarget,
  };
  const effectId = toEffectId("replacement:ko-trash-from-hand");
  const effectDefinitionId = "definition:ko-trash-from-hand";
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[targetCard.cardId] = resolvedCard({
    cardId: targetCard.cardId,
    category: "character",
    cost: 4,
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "replacement-rules",
      sourceTextHash: "replacement-source",
    },
  });
  const effectBlock: EffectDefinition["effects"][number] = {
    id: effectId,
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    oncePerTurn: true,
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
      },
    },
  };
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: {
      cardId: targetCard.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: "replacement-source",
        rulesVersion: "replacement-rules",
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-06-01T00:00:00.000Z",
      },
    },
  };
  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-ko-trash-from-hand"),
    state: "pending",
    timingWindowId: "timing-window-ko-trash-from-hand" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: cardRef(source, p1),
    sourceSnapshot: sourceSnapshot(source, p1),
    effectBlockId: toEffectId("ko-target-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "ko-replacement-test" },
  };

  const paused = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
    [cardRef(targetCard, p2)],
  );
  const replacementDecision = paused.state.pendingDecision;
  if (replacementDecision?.type !== "chooseReplacement") {
    assert.fail("expected chooseReplacement decision");
  }

  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: replacementDecision.id,
    response: { type: "replacement", replacementId: effectId },
  });
  const trashDecision = accepted.state.pendingDecision;
  if (trashDecision?.type !== "selectCards") {
    assert.fail("expected hand-trash replacement decision");
  }
  assert.equal(trashDecision.playerId, p2);
  assert.equal(trashDecision.request.zone, "hand");

  const resolved = applyAction(accepted.state, {
    type: "respondToDecision",
    decisionId: trashDecision.id,
    response: {
      type: "cards",
      cards: [cardRef(replacementCostCard, p2)],
    },
  });
  const nextP2 = must(resolved.state.players[p2], "next p2");

  assert.equal(resolved.errors, undefined);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === targetCard.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === targetCard.instanceId),
    false,
  );
  assert.equal(
    nextP2.trash.some(
      (card) => card.instanceId === replacementCostCard.instanceId,
    ),
    true,
  );
  assert.equal(resolved.state.oncePerTurn.length, 1);
  const oncePerTurn = must(
    resolved.state.oncePerTurn[0],
    "once-per-turn record",
  );
  assert.equal(oncePerTurn.cardInstanceId, targetCard.instanceId);
  assert.equal(oncePerTurn.effectId, effectId);
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    ["decisionResolved", "cardMoved", "cardTrashed", "replacementApplied"],
  );
});

test("accepted opponent effect field-removal replacement rests selected own cards instead of KOing matching Character", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const sourceHand = must(p1State.hand[0], "source");
  const targetHand = must(p2State.hand[0], "target");
  const source: CardInstance = {
    ...sourceHand,
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const targetCardId = toCardId("effect-removal-rest-replacement-target");
  const targetCard: CardInstance = {
    ...targetHand,
    cardId: targetCardId,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const firstDon = {
    ...must(p2State.donDeck[0], "first don"),
    zone: { zone: "costArea" as const, playerId: p2, index: 0 },
    state: "active" as const,
  };
  p1State.characters = [source];
  p1State.hand = p1State.hand.slice(1);
  p2State.characters = [targetCard];
  p2State.hand = p2State.hand.slice(1);
  p2State.costArea = [firstDon];
  p2State.donDeck = p2State.donDeck.slice(1);

  const replacementTarget: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: {
      categories: ["character"],
      power: { max: 7000 },
    },
  };
  const when: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceKind: "cardEffect",
    target: replacementTarget,
  };
  const effectId = toEffectId("replacement:effect-removal-rest-cards");
  const effectDefinitionId = "definition:effect-removal-rest-cards";
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[targetCard.cardId] = resolvedCard({
    cardId: targetCard.cardId,
    category: "character",
    power: 7000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "replacement-rules",
      sourceTextHash: "replacement-source",
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
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
            min: 2,
            max: 2,
            allowFewerIfUnavailable: false,
            visibility: "public",
          },
        },
      },
    },
  };
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: {
      cardId: targetCard.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: "replacement-source",
        rulesVersion: "replacement-rules",
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-31T00:00:00.000Z",
      },
    },
  };
  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-effect-removal-rest"),
    state: "pending",
    timingWindowId: "timing-window-effect-removal-rest" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: cardRef(source, p1),
    sourceSnapshot: sourceSnapshot(source, p1),
    effectBlockId: toEffectId("ko-target-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "field-removal-replacement-test" },
  };

  const paused = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "opponent",
          zone: "characterArea",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
    [cardRef(targetCard, p2)],
  );
  const replacementDecision = paused.state.pendingDecision;
  if (replacementDecision?.type !== "chooseReplacement") {
    assert.fail("expected chooseReplacement decision");
  }

  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: replacementDecision.id,
    response: { type: "replacement", replacementId: effectId },
  });
  const restDecision = accepted.state.pendingDecision;
  if (restDecision?.type !== "selectTargets") {
    assert.fail("expected selectTargets decision for replacement rest cards");
  }
  assert.deepEqual(
    restDecision.candidates.map((candidate) => candidate.card.instanceId),
    [p2State.leader.instanceId, targetCard.instanceId, firstDon.instanceId],
  );

  const resolved = applyAction(accepted.state, {
    type: "respondToDecision",
    decisionId: restDecision.id,
    response: {
      type: "targets",
      targets: [cardRef(p2State.leader, p2), cardRef(firstDon, p2)],
    },
  });
  const nextP2 = must(resolved.state.players[p2], "next p2");

  assert.equal(resolved.errors, undefined);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === targetCard.instanceId),
    true,
  );
  assert.equal(nextP2.leader.state, "rested");
  assert.equal(must(nextP2.costArea[0], "rested don").state, "rested");
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    ["decisionResolved", "replacementApplied"],
  );
});
