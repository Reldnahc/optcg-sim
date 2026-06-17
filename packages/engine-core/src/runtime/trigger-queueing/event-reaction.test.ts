import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  Zone,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toEngineEventId,
  toQueueEntryId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";

const toCardId = (value: string): CardId => value as CardId;

const appendCardPlayedEvent = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
  sourceZone: Zone,
): void => {
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: card.zone.playerId,
      instanceId: card.instanceId,
      cardId: card.cardId,
      category: "character",
      sourceZone,
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "card-played-reaction-test" },
    createdAtStateSeq: state.seq,
  });
};

const appendCardRestedEvent = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
): void => {
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:cardRested`),
    seq: state.eventJournal.length + 1,
    type: "cardRested",
    payload: {
      playerId: card.zone.playerId,
      instanceId: card.instanceId,
      cardId: card.cardId,
      category: "character",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "card-rested-reaction-test" },
    createdAtStateSeq: state.seq,
  });
};

const appendDonReturnedEvent = (
  state: ReturnType<typeof createActiveState>,
  playerId = p1,
  suffix = "test",
): void => {
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:donReturned:${suffix}`),
    seq: state.eventJournal.length + 1,
    type: "donReturned",
    payload: {
      playerId,
      donInstanceId: `don:returned:${suffix}`,
      state: "donDeck",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "don-returned-reaction-test" },
    createdAtStateSeq: state.seq,
  });
};

const appendDonAttachedEvent = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): void => {
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:donAttached`),
    seq: state.eventJournal.length + 1,
    type: "donAttached",
    payload: {
      playerId: source.controller,
      donInstanceId: "don:attached:test",
      target: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: source.controller,
        zone: source.zone,
      },
      targetPlayerId: source.controller,
      targetInstanceId: source.instanceId,
      targetCardId: source.cardId,
      sourceControllerId: source.controller,
      sourceKind: "effect",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "don-attached-reaction-test" },
    createdAtStateSeq: state.seq,
  });
};

const appendLifeRemovedEvent = (
  state: ReturnType<typeof createActiveState>,
): void => {
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:lifeRemoved`),
    seq: state.eventJournal.length + 1,
    type: "cardMoved",
    payload: {
      from: { zone: "life", playerId: p1, slot: "life", index: 0 },
      to: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
      reason: "moveCards",
    },
    visibility: { type: "public" },
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-entry:life:test"),
      effectId: toEffectId("effect:life:test"),
    },
    createdAtStateSeq: state.seq,
  });
};

const appendEffectResolvedEvent = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): void => {
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:effectResolved`),
    seq: state.eventJournal.length + 1,
    type: "effectResolved",
    payload: {
      queueEntryId: "queue-entry:resolved:test",
      timingWindowId: "timing-window:resolved:test",
      effectBlockId: "resolved-effect:test",
      controllerId: source.controller,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: source.controller,
        zone: source.zone,
      },
      sourceCardId: source.cardId,
      effectCategory: "auto",
      entryPoint: { type: "onPlay" },
      sourceTypes: ["Navy"],
      sourceCategory: "character",
      status: "resolved",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "effect-resolved-reaction-test" },
    createdAtStateSeq: state.seq,
  });
};

const appendTriggerActivatedEvent = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): void => {
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:triggerActivated`),
    seq: state.eventJournal.length + 1,
    type: "triggerActivated",
    payload: {
      playerId: source.controller,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: source.controller,
        zone: source.zone,
      },
      sourceCardId: source.cardId,
      sourceTypes: ["Navy"],
      sourceCategory: "character",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "trigger-activated-reaction-test" },
    createdAtStateSeq: state.seq,
  });
};

const setupCardPlayedReactionDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EffectDefinition => {
  const effectDefinitionId = "def-card-played-reaction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "card-played-reaction-rules",
      sourceTextHash: "card-played-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: "card-played-trash-rush" as EffectDefinition["effects"][number]["id"],
        category: "auto",
        trigger: {
          type: "cardPlayed",
          player: "self",
          sourceZone: "trash",
          filter: {
            categories: ["character"],
            typesAny: ["Land of Wano"],
          },
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                keyword: "rush",
                duration: { type: "thisTurn" },
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "producedObjects",
                    saveResultAs: "trigger:cardPlayed",
                  },
                  zone: "characterArea",
                  player: "self",
                  visibility: "publicOnly",
                  onFailure: "failClosed",
                },
              },
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const cardPlayedReactionState = (sourceZone: Zone) => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  const played = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(player.hand[1], "played"),
      cardId: toCardId("land-of-wano-played"),
    },
    zone: "characterArea",
    index: 1,
  });
  setupCardPlayedReactionDefinition(state, source);
  const playedCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  state.cardManifest.cards[played.cardId] = {
    ...playedCard,
    types: ["Land of Wano"],
  };
  appendCardPlayedEvent(state, played, sourceZone);
  return { played, source, state };
};

const setupCardRestedReactionDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EffectDefinition => {
  const effectDefinitionId = "def-card-rested-reaction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "card-rested-reaction-rules",
      sourceTextHash: "card-rested-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: "card-rested-draw" as EffectDefinition["effects"][number]["id"],
        category: "auto",
        trigger: {
          type: "cardRested",
          target: "self",
          player: "self",
          filter: { categories: ["character"] },
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "draw", count: 1, player: "self" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const cardRestedReactionState = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  setupCardRestedReactionDefinition(state, source);
  appendCardRestedEvent(state, source);
  return { source, state };
};

const setupDonReturnedReactionDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
  trigger: EffectDefinition["effects"][number]["trigger"] = {
    type: "donReturned",
    player: "self",
  },
): EffectDefinition => {
  const effectDefinitionId = "def-don-returned-reaction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "don-returned-reaction-rules",
      sourceTextHash: "don-returned-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: "don-returned-draw" as EffectDefinition["effects"][number]["id"],
        category: "auto",
        trigger,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "draw", count: 1, player: "self" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const donReturnedReactionState = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  setupDonReturnedReactionDefinition(state, source);
  appendDonReturnedEvent(state, p1);
  return { source, state };
};

const aggregateDonReturnedReactionState = (returnedCount: number) => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  setupDonReturnedReactionDefinition(state, source, {
    type: "eventCount",
    count: { op: "gte", value: 2 },
    trigger: { type: "donReturned", player: "self" },
  });
  for (let index = 0; index < returnedCount; index += 1) {
    appendDonReturnedEvent(state, p1, `aggregate:${String(index)}`);
  }
  return { source, state };
};

const setupDonAttachedReactionDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EffectDefinition => {
  const effectDefinitionId = "def-don-attached-reaction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "don-attached-reaction-rules",
      sourceTextHash: "don-attached-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: "don-attached-draw" as EffectDefinition["effects"][number]["id"],
        category: "auto",
        trigger: {
          type: "donAttached",
          player: "self",
          target: "self",
          sourceController: "self",
          sourceKind: "effect",
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "draw", count: 1, player: "self" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const donAttachedReactionState = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  setupDonAttachedReactionDefinition(state, source);
  appendDonAttachedEvent(state, source);
  return { source, state };
};

const setupLifeRemovedReactionDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EffectDefinition => {
  const effectDefinitionId = "def-life-removed-reaction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "life-removed-reaction-rules",
      sourceTextHash: "life-removed-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: "life-removed-draw-trash" as EffectDefinition["effects"][number]["id"],
        category: "auto",
        oncePerTurn: true,
        trigger: { type: "lifeRemoved", players: ["self"] },
        condition: {
          type: "and",
          conditions: [
            {
              type: "attachedDonCount",
              target: { type: "self" },
              op: "gte",
              value: 1,
            },
            { type: "yourTurn" },
          ],
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", count: 2, player: "self" },
            },
            {
              connector: "then",
              effect: {
                type: "trashFromHand",
                player: "self",
                chooser: "self",
                count: 1,
              },
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const lifeRemovedReactionState = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  source.attachedDon = [must(player.donDeck[0], "attached DON").instanceId];
  setupLifeRemovedReactionDefinition(state, source);
  appendLifeRemovedEvent(state);
  return { source, state };
};

const setupEffectResolvedReactionDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EffectDefinition => {
  const effectDefinitionId = "def-effect-resolved-reaction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "effect-resolved-reaction-rules",
      sourceTextHash: "effect-resolved-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: "effect-resolved-draw" as EffectDefinition["effects"][number]["id"],
        category: "auto",
        trigger: {
          type: "effectResolved",
          player: "self",
          effectEntryPoint: { type: "onPlay" },
          effectCategory: "auto",
          sourceFilter: { typesAny: ["Navy"] },
          status: "resolved",
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "draw", count: 1, player: "self" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const effectResolvedReactionState = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  setupEffectResolvedReactionDefinition(state, source);
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source manifest card"),
    types: ["Navy"],
  };
  appendEffectResolvedEvent(state, source);
  return { source, state };
};

const setupTriggerActivatedReactionDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EffectDefinition => {
  const effectDefinitionId = "def-trigger-activated-reaction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "trigger-activated-reaction-rules",
      sourceTextHash: "trigger-activated-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: "trigger-activated-draw" as EffectDefinition["effects"][number]["id"],
        category: "auto",
        trigger: {
          type: "triggerActivated",
          player: "self",
          sourceFilter: { typesAny: ["Navy"] },
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: { type: "draw", count: 1, player: "self" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const triggerActivatedReactionState = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  setupTriggerActivatedReactionDefinition(state, source);
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source manifest card"),
    types: ["Navy"],
  };
  appendTriggerActivatedEvent(state, source);
  return { source, state };
};

test("event reactions queue for matching cardPlayed events from the required source zone", () => {
  const { played, source, state } = cardPlayedReactionState("trash");

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queued entry");
  assert.equal(entry.source.instanceId, source.instanceId);
  assert.equal(entry.triggerEventId, state.eventJournal.at(-1)?.id);
  assert.equal(String(entry.timingWindowId).endsWith(":cardPlayed"), true);
  assert.equal(entry.effectBlockId, "card-played-trash-rush");
  assert.equal(played.zone.zone, "characterArea");

  const resolved = processEffectRuntime(result.state);

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.continuousEffects.length, 1);
  const record = must(resolved.state.continuousEffects[0], "continuous record");
  assert.deepEqual(record.modifier, {
    layer: "keywordAdd",
    target: {
      type: "exactCard",
      card: {
        instanceId: played.instanceId,
        cardId: played.cardId,
        playerId: p1,
        zone: played.zone,
      },
      binding: {
        family: "selectedTargets",
        saveResultAs: "card-played-trash-rush",
        objectIndex: 0,
      },
      createdAtStateSeq: record.createdAtStateSeq,
    },
    operation: { type: "addKeyword", keyword: "rush" },
  });
});

test("live event reaction queueing preserves omitted state hash", () => {
  const { state } = cardPlayedReactionState("trash");

  const result = processEffectRuntime(state, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});

test("event reactions do not queue when a matching cardPlayed event came from another zone", () => {
  const { state } = cardPlayedReactionState("hand");

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    false,
  );
});

test("event reactions queue for matching self cardRested events", () => {
  const { source, state } = cardRestedReactionState();

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queued entry");
  assert.equal(entry.source.instanceId, source.instanceId);
  assert.equal(entry.triggerEventId, state.eventJournal.at(-1)?.id);
  assert.equal(String(entry.timingWindowId).endsWith(":cardRested"), true);
  assert.equal(entry.effectBlockId, "card-rested-draw");
});

test("event reactions queue for matching self donReturned events", () => {
  const { source, state } = donReturnedReactionState();

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queued entry");
  assert.equal(entry.source.instanceId, source.instanceId);
  assert.equal(entry.triggerEventId, state.eventJournal.at(-1)?.id);
  assert.equal(String(entry.timingWindowId).endsWith(":donReturned"), true);
  assert.equal(entry.effectBlockId, "don-returned-draw");
});

test("aggregate event reactions queue once after enough matching DON return events", () => {
  const oneReturned = aggregateDonReturnedReactionState(1);

  const oneResult = processEffectRuntime(oneReturned.state);

  assert.equal(oneResult.errors, undefined);
  assert.equal(oneResult.state.effectQueue.length, 0);

  const twoReturned = aggregateDonReturnedReactionState(2);

  const twoResult = processEffectRuntime(twoReturned.state);

  assert.equal(twoResult.errors, undefined);
  assert.equal(twoResult.state.effectQueue.length, 1);
  const entry = must(twoResult.state.effectQueue[0], "queued entry");
  assert.equal(entry.source.instanceId, twoReturned.source.instanceId);
  assert.equal(entry.effectBlockId, "don-returned-draw");
  assert.equal(String(entry.timingWindowId).endsWith(":donReturned"), true);
});

test("event reactions queue DON attachment triggers through the canonical matcher", () => {
  const { source, state } = donAttachedReactionState();

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queued entry");
  assert.equal(entry.source.instanceId, source.instanceId);
  assert.equal(entry.triggerEventId, state.eventJournal.at(-1)?.id);
  assert.equal(String(entry.timingWindowId).endsWith(":donAttached"), true);
  assert.equal(entry.effectBlockId, "don-attached-draw");
});

test("event reactions queue life removal triggers through the canonical matcher", () => {
  const { source, state } = lifeRemovedReactionState();

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queued entry");
  assert.equal(entry.source.instanceId, source.instanceId);
  assert.equal(entry.triggerEventId, state.eventJournal.at(-1)?.id);
  assert.equal(String(entry.timingWindowId).endsWith(":lifeRemoved"), true);
  assert.equal(entry.effectBlockId, "life-removed-draw-trash");
  assert.deepEqual(entry.causedBy, {
    type: "ruleProcess",
    name: "effectRuntime:eventReactionTriggerQueueing",
  });
});

test("unsupported matching event reactions do not block canonical event producers", () => {
  const { source, state } = lifeRemovedReactionState();
  const definitions = must(
    state.cardManifest.effectDefinitions,
    "effect definitions",
  );
  const definition = must(
    definitions["def-life-removed-reaction"],
    "life removed reaction definition",
  );
  const baseEffect = must(definition.effects[0], "base effect");
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-life-removed-reaction": {
      ...definition,
      effects: [
        {
          ...baseEffect,
          id: "life-removed-unsupported-look-at-top" as EffectDefinition["effects"][number]["id"],
          effect: { type: "lookAtTop", player: "self", count: 1 },
        },
      ],
    },
  };

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    result.events.some((event) => {
      if (event.type !== "effectQueued") {
        return false;
      }
      const payload = event.payload as { effectBlockId?: unknown };
      return payload.effectBlockId === "life-removed-unsupported-look-at-top";
    }),
    false,
  );
  assert.equal(source.zone.zone, "characterArea");
});

test("event reactions queue effect resolution triggers through the canonical matcher", () => {
  const { source, state } = effectResolvedReactionState();

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queued entry");
  assert.equal(entry.source.instanceId, source.instanceId);
  assert.equal(entry.triggerEventId, state.eventJournal.at(-1)?.id);
  assert.equal(String(entry.timingWindowId).endsWith(":effectResolved"), true);
  assert.equal(entry.effectBlockId, "effect-resolved-draw");
});

test("event reactions queue trigger activation triggers through the canonical matcher", () => {
  const { source, state } = triggerActivatedReactionState();

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  const entry = must(result.state.effectQueue[0], "queued entry");
  assert.equal(entry.source.instanceId, source.instanceId);
  assert.equal(entry.triggerEventId, state.eventJournal.at(-1)?.id);
  assert.equal(
    String(entry.timingWindowId).endsWith(":triggerActivated"),
    true,
  );
  assert.equal(entry.effectBlockId, "trigger-activated-draw");
});
