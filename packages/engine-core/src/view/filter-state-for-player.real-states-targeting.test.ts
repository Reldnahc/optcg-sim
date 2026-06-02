import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardRef,
  DecisionId,
  EffectId,
  GameState,
  PlayerId,
  QueueEntryId,
  StateSeq,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import { applyAction, getLegalActions } from "../actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "../action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

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
  label: string,
): void => {
  for (const key of keys) {
    const paths = findKeyPaths(value, key);
    assert.equal(
      paths.length,
      0,
      paths.length === 0
        ? `${label}: forbidden key ${key} must be absent`
        : `${label}: forbidden key ${key} found at ${paths.join(", ")}`,
    );
  }
};

const assertPublicDecisionShape = (
  view: ReturnType<typeof filterStateForPlayer>,
  label: string,
): void => {
  const pending = view.pendingDecision;
  assert.ok(pending, `${label}: pending decision must exist`);
  const keys = Object.keys(pending).sort();
  const requiredBase =
    pending.type === "selectTargets"
      ? [
          "candidates",
          "causedBy",
          "id",
          "max",
          "min",
          "playerId",
          "prompt",
          "type",
        ].sort()
      : ["causedBy", "id", "playerId", "prompt", "type"].sort();
  const required = (
    "source" in pending ? [...requiredBase, "source"] : requiredBase
  ).sort();
  if ("timeoutMs" in pending) {
    assert.deepEqual(
      keys,
      [...required, "timeoutMs"].sort(),
      `${label}: pending decision must be public`,
    );
    return;
  }
  assert.deepEqual(keys, required, `${label}: pending decision must be public`);
};

const assertNoHiddenLeak = (
  state: GameState,
  recipient: PlayerId,
  label: string,
): void => {
  const opponent = recipient === p1 ? p2 : p1;
  const recipientState = must(state.players[recipient], `${label} recipient`);
  const opponentState = must(state.players[opponent], `${label} opponent`);
  const view = filterStateForPlayer(state, recipient);
  const publicVisibleCardIds = new Set<string>([
    ...view.self.hand.map((card) => String(card.cardId)),
    String(view.self.leader.cardId),
    String(view.opponent.leader.cardId),
    ...view.self.characters.map((card) => String(card.cardId)),
    ...view.opponent.characters.map((card) => String(card.cardId)),
    ...view.self.costArea.map((card) => String(card.cardId)),
    ...view.opponent.costArea.map((card) => String(card.cardId)),
    ...view.self.trash.map((card) => String(card.cardId)),
    ...view.opponent.trash.map((card) => String(card.cardId)),
    ...view.self.life.faceUpCards.map((card) => String(card.cardId)),
    ...view.opponent.life.faceUpCards.map((card) => String(card.cardId)),
    ...(view.self.stage === undefined ? [] : [String(view.self.stage.cardId)]),
    ...(view.opponent.stage === undefined
      ? []
      : [String(view.opponent.stage.cardId)]),
    ...view.revealedCards.flatMap((record) =>
      record.cards.map((card) => String(card.cardId)),
    ),
  ]);

  assert.equal(view.self.hand.length, recipientState.hand.length, label);
  assert.equal(view.opponent.handCount, opponentState.hand.length, label);
  assert.equal(view.self.deckCount, recipientState.deck.length, label);
  assert.equal(view.opponent.deckCount, opponentState.deck.length, label);
  assert.equal(view.self.donDeckCount, recipientState.donDeck.length, label);
  assert.equal(view.opponent.donDeckCount, opponentState.donDeck.length, label);

  for (const card of recipientState.hand) {
    const visible = view.self.hand.find(
      (entry) => entry.instanceId === card.instanceId,
    );
    assert.ok(visible, `${label} recipient hand card must remain visible`);
    assert.equal(visible.cardId, card.cardId, `${label} self hand cardId`);
    assert.equal(visible.owner, card.owner, `${label} self hand owner`);
    assert.equal(
      visible.controller,
      card.controller,
      `${label} self hand controller`,
    );
    assert.deepEqual(visible.zone, card.zone, `${label} self hand zone`);
    assert.equal(
      visible.attachedDonCount,
      card.attachedDon.length,
      `${label} self hand attachedDonCount`,
    );
  }

  for (const card of opponentState.hand) {
    if (!publicVisibleCardIds.has(String(card.cardId))) {
      assertNoScalarValue(
        view,
        String(card.cardId),
        `${label} opponent hand card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(card.instanceId),
      `${label} opponent hand instance id must stay hidden`,
    );
  }

  for (const card of recipientState.deck) {
    if (!publicVisibleCardIds.has(String(card.cardId))) {
      assertNoScalarValue(
        view,
        String(card.cardId),
        `${label} recipient deck card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(card.instanceId),
      `${label} recipient deck instance id must stay hidden`,
    );
  }
  for (const card of opponentState.deck) {
    if (!publicVisibleCardIds.has(String(card.cardId))) {
      assertNoScalarValue(
        view,
        String(card.cardId),
        `${label} opponent deck card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(card.instanceId),
      `${label} opponent deck instance id must stay hidden`,
    );
  }
  for (const card of recipientState.donDeck) {
    if (!publicVisibleCardIds.has(String(card.cardId))) {
      assertNoScalarValue(
        view,
        String(card.cardId),
        `${label} recipient DON deck card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(card.instanceId),
      `${label} recipient DON deck instance id must stay hidden`,
    );
  }
  for (const card of opponentState.donDeck) {
    if (!publicVisibleCardIds.has(String(card.cardId))) {
      assertNoScalarValue(
        view,
        String(card.cardId),
        `${label} opponent DON deck card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(card.instanceId),
      `${label} opponent DON deck instance id must stay hidden`,
    );
  }

  for (const lifeCard of recipientState.life.filter((card) => !card.faceUp)) {
    if (!publicVisibleCardIds.has(String(lifeCard.card.cardId))) {
      assertNoScalarValue(
        view,
        String(lifeCard.card.cardId),
        `${label} recipient face-down life card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(lifeCard.card.instanceId),
      `${label} recipient face-down life instance id must stay hidden`,
    );
  }
  for (const lifeCard of opponentState.life.filter((card) => !card.faceUp)) {
    if (!publicVisibleCardIds.has(String(lifeCard.card.cardId))) {
      assertNoScalarValue(
        view,
        String(lifeCard.card.cardId),
        `${label} opponent face-down life card id must stay hidden`,
      );
    }
    assertNoScalarValue(
      view,
      String(lifeCard.card.instanceId),
      `${label} opponent face-down life instance id must stay hidden`,
    );
  }

  assert.ok(view.self.leader);
  assert.ok(view.opponent.leader);

  assertNoForbiddenKeys(
    view,
    [
      "rng",
      "cardManifest",
      "manifestHash",
      "cardDataVersion",
      "effectDefinitions",
      "effectDefinitionsVersion",
      "customHandlerVersion",
      "banlistVersion",
      "effectQueue",
      "deferredTriggers",
      "replacementState",
      "continuousEffects",
      "audit",
      "eventJournal",
      "serverOnly",
      "response",
      "defaultResponse",
      "queueEntryId",
      "effectBlockId",
      "orderedIds",
      "triggerIds",
      "sourceSnapshot",
      "sourcePresencePolicy",
      "orderingGroup",
      "paymentOptions",
      "targetOptions",
      "cardOptions",
    ],
    label,
  );

  const pending = state.pendingDecision;
  if (pending !== undefined && pending.playerId === recipient) {
    assertPublicDecisionShape(view, label);
  } else {
    assert.equal(
      view.pendingDecision,
      undefined,
      `${label} pending decision hidden from non-recipient`,
    );
  }

  const expectedLegal = getLegalActions(state, recipient);
  if (expectedLegal.length > 0) {
    assert.ok(view.legalActions.length > 0, `${label} legal actions present`);
  }
};

const createSelectTargetsDecisionState = (): {
  state: GameState;
  target: CardRef;
  hiddenOpponentHandId: string;
  hiddenOpponentDeckId: string;
  hiddenOpponentLifeId: string;
} => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "selectTargets p1");
  const p2State = must(state.players[p2], "selectTargets p2");
  const targetSource = must(p2State.hand.shift(), "target source");
  const hiddenOpponentHandId = String(
    must(p2State.hand[0], "hidden opponent hand").cardId,
  );
  const hiddenOpponentDeckId = String(
    must(p2State.deck[0], "hidden opponent deck").cardId,
  );
  const hiddenOpponentLifeId = String(
    must(
      p2State.life.find((lifeCard) => !lifeCard.faceUp),
      "hidden opponent life",
    ).card.cardId,
  );
  const targetCardId = targetSource.cardId;
  const target = {
    ...targetSource,
    owner: p2,
    controller: p2,
    zone: {
      zone: "characterArea" as const,
      playerId: p2,
      slot: "character" as const,
      index: 0,
    },
    attachedDon: [],
    state: "active" as const,
  };
  p2State.characters = [target];
  p2State.hand = p2State.hand.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  state.cardManifest.cards[targetCardId] = resolvedCard({
    cardId: targetCardId,
    category: "character",
    power: 3000,
  });

  const queueEntryId = toQueueEntryId("real-select-targets-private-queue");
  const effectId = toEffectId("real-select-targets-private-effect");
  const sourceCard = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "real-select-targets-private-definition",
      rulesVersion: "real-select-targets-rules",
      sourceTextHash: "real-select-targets-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    p1State.leader.cardId,
    sourceCard.support,
  );
  state.cardManifest.cards[p1State.leader.cardId] = sourceCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "real-select-targets-private-definition": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base target effect"),
          id: effectId,
          effect: {
            type: "ko",
            target: {
              type: "choose",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "opponent",
                zone: "characterArea",
                min: 1,
                max: 1,
                allowFewerIfUnavailable: false,
                visibility: "public",
              },
            },
          },
        },
      ],
    },
  };
  state.effectQueue = [
    {
      id: queueEntryId,
      state: "pending",
      timingWindowId: toTimingWindowId("real-select-targets-private-timing"),
      generation: 1,
      controllerId: p1,
      source: {
        instanceId: p1State.leader.instanceId,
        cardId: p1State.leader.cardId,
        playerId: p1,
        zone: p1State.leader.zone,
      },
      sourceSnapshot: {
        instanceId: p1State.leader.instanceId,
        cardId: p1State.leader.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: p1State.leader.zone,
        category: "leader",
        colors: ["red"],
        keywords: [],
      },
      effectBlockId: effectId,
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 1,
      queuedAtStateSeq: toStateSeq(state.seq),
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "real-selectTargets" },
    },
  ];
  const request: TargetRequest = {
    timing: "onResolution",
    chooser: "self",
    player: "opponent",
    zone: "characterArea",
    min: 1,
    max: 1,
    allowFewerIfUnavailable: false,
    visibility: "public",
  };
  const targetRef = {
    instanceId: target.instanceId,
    cardId: target.cardId,
    playerId: p2,
    zone: target.zone,
  };
  state.pendingDecision = {
    id: toDecisionId("real-select-targets-decision"),
    type: "selectTargets",
    playerId: p1,
    prompt: "Select a target.",
    causedBy: { type: "effect", queueEntryId, effectId },
    visibility: { type: "public" },
    request,
    candidates: [{ card: targetRef, visibility: { type: "public" } }],
  };
  return {
    state,
    target: targetRef,
    hiddenOpponentHandId,
    hiddenOpponentDeckId,
    hiddenOpponentLifeId,
  };
};

test("real selectTargets views expose public candidates without legal responses or private queue metadata", () => {
  const {
    state,
    target,
    hiddenOpponentHandId,
    hiddenOpponentDeckId,
    hiddenOpponentLifeId,
  } = createSelectTargetsDecisionState();

  assertNoHiddenLeak(state, p1, "real-selectTargets:p1");
  assertNoHiddenLeak(state, p2, "real-selectTargets:p2");

  const recipientView = filterStateForPlayer(state, p1);
  const opponentView = filterStateForPlayer(state, p2);
  const source = must(state.players[p1], "p1").leader;
  assert.deepEqual(recipientView.pendingDecision, {
    id: toDecisionId("real-select-targets-decision"),
    type: "selectTargets",
    playerId: p1,
    prompt: "Select a target.",
    causedBy: { type: "ruleProcess", name: "privateCausality" },
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    min: 1,
    max: 1,
    candidates: [{ card: target }],
  });
  assert.deepEqual(
    recipientView.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [
      {
        type: "respondToDecision",
        decisionId: toDecisionId("real-select-targets-decision"),
      },
    ],
  );
  assert.equal(opponentView.pendingDecision, undefined);
  assert.deepEqual(
    opponentView.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );

  assert.equal(
    recipientView.opponent.characters[0]?.instanceId,
    target.instanceId,
  );
  const pendingDecision = must(state.pendingDecision, "target decision");
  assert.equal(pendingDecision.type, "selectTargets");
  assert.deepEqual(pendingDecision.candidates, [
    { card: target, visibility: { type: "public" } },
  ]);
  assert.equal(
    JSON.stringify(recipientView).includes(hiddenOpponentHandId),
    false,
  );
  for (const view of [recipientView, opponentView]) {
    const serialized = JSON.stringify(view);
    assert.equal(serialized.includes("request"), false);
    assert.equal(serialized.includes("response"), false);
    assert.equal(serialized.includes("queueEntryId"), false);
    assert.equal(
      serialized.includes("real-select-targets-private-queue"),
      false,
    );
    assert.equal(
      serialized.includes("real-select-targets-private-effect"),
      false,
    );
    assert.equal(
      serialized.includes("real-select-targets-private-timing"),
      false,
    );
    assert.equal(serialized.includes(hiddenOpponentDeckId), false);
    assert.equal(serialized.includes(hiddenOpponentLifeId), false);
    assert.equal(serialized.includes("manifestHash"), false);
    assert.equal(serialized.includes("effectDefinitions"), false);
    assert.equal(serialized.includes("cardManifest"), false);
    assert.equal(serialized.includes("real-select-targets-rules"), false);
    assert.equal(serialized.includes("real-select-targets-source"), false);
  }

  const resolved = applyAction(state, {
    type: "respondToDecision",
    decisionId: toDecisionId("real-select-targets-decision"),
    response: { type: "targets", targets: [target] },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(resolved.state.effectQueue, []);
  assertNoHiddenLeak(resolved.state, p1, "real-selectTargets-resolved:p1");
  assertNoHiddenLeak(resolved.state, p2, "real-selectTargets-resolved:p2");

  const resolvedRecipientView = filterStateForPlayer(resolved.state, p1);
  const resolvedOpponentView = filterStateForPlayer(resolved.state, p2);
  assert.equal(
    JSON.stringify(resolvedRecipientView).includes(hiddenOpponentHandId),
    false,
  );
  for (const view of [resolvedRecipientView, resolvedOpponentView]) {
    const serialized = JSON.stringify(view);
    assert.equal(serialized.includes(hiddenOpponentDeckId), false);
    assert.equal(serialized.includes(hiddenOpponentLifeId), false);
    assert.equal(
      serialized.includes("real-select-targets-private-queue"),
      false,
    );
    assert.equal(
      serialized.includes("real-select-targets-private-effect"),
      false,
    );
    assert.equal(serialized.includes("effectQueue"), false);
    assert.equal(serialized.includes("cardManifest"), false);
    assert.equal(serialized.includes("manifestHash"), false);
  }
});
