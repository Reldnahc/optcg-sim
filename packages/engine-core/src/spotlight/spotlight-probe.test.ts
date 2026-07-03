import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ActiveEffectTextPresentation,
  CardId,
  CardRef,
  DecisionId,
  EffectId,
  EffectTextSpotlightHistoryEntry,
  EffectQueueEntry,
  EffectTextSpanId,
  EngineEvent,
  EngineEventId,
  InstanceId,
  PlayerId,
  CombatSpotlightHistoryEntry,
  PlayedCardSpotlightHistoryEntry,
  QueueEntryId,
  SpotlightEntryCreatedPayload,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import {
  appendCombatSpotlightEntryCreatedEvent,
  appendEffectResolvedEvent,
  appendEvent,
  appendPendingSpotlightEntryCreatedEvents,
  appendPlayedCardSpotlightEntryCreatedEvent,
  appendReplacementSpotlightEntryCreatedEvents,
} from "../action-results.js";
import { createActiveState, p1, p2 } from "../action-test-fixtures.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";

const toCardId = (value: string): CardId => value as CardId;
const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;
const spanId = (value: string): EffectTextSpanId => value as EffectTextSpanId;

const cardRef = (
  label: string,
  playerId: PlayerId,
  zone: "characterArea" | "hand" | "leaderArea" = "characterArea",
): CardRef => ({
  instanceId: toInstanceId(`probe:${label}:instance`),
  cardId: toCardId(`probe:${label}:card`),
  playerId,
  zone:
    zone === "leaderArea"
      ? { zone, playerId }
      : zone === "hand"
        ? { zone, playerId, slot: "hand", index: 0 }
        : {
            zone,
            playerId,
            slot: "character",
            index: playerId === p1 ? 0 : 1,
          },
});

const effectPresentation = ({
  source,
  target,
  span = spanId("span:body:probe"),
}: {
  readonly source: CardRef;
  readonly target: CardRef;
  readonly span?: EffectTextSpanId | undefined;
}): ActiveEffectTextPresentation => ({
  source,
  textKind: "effect",
  activeSpanIds: [span],
  targetLinks: [{ spanId: span, relation: "affectedCard", cards: [target] }],
});

const queuedEntry = (
  source: CardRef,
  presentation: ActiveEffectTextPresentation,
): EffectQueueEntry => ({
  id: toQueueEntryId("probe:queue-entry:resolved"),
  state: "pending",
  timingWindowId: toTimingWindowId("probe:timing-window"),
  generation: 0,
  controllerId: source.playerId,
  source,
  sourceSnapshot: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    ownerId: source.playerId,
    controllerId: source.playerId,
    zone: source.zone ?? { zone: "leaderArea", playerId: source.playerId },
    category: "character",
    colors: ["red"],
    keywords: [],
    power: 5000,
  },
  effectBlockId: toEffectId("probe:effect:resolved"),
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 1,
  queuedAtStateSeq: toStateSeq(1),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "spotlight-probe" },
  presentation,
});

const expectSpotlightCreatedAfter = (
  events: readonly EngineEvent[],
  anchorType: EngineEvent["type"],
): void => {
  const anchorIndex = events.findIndex((event) => event.type === anchorType);
  assert.notEqual(anchorIndex, -1, `${anchorType} anchor missing`);
  assert.equal(events[anchorIndex + 1]?.type, "spotlightEntryCreated");
};

const expectEffectTextEntry = (
  entry: unknown,
): EffectTextSpotlightHistoryEntry => {
  assert.equal(
    typeof entry === "object" &&
      entry !== null &&
      (!("kind" in entry) || entry.kind === "effectText"),
    true,
  );
  return entry as EffectTextSpotlightHistoryEntry;
};

const expectCombatEntry = (entry: unknown): CombatSpotlightHistoryEntry => {
  assert.equal(
    typeof entry === "object" &&
      entry !== null &&
      "kind" in entry &&
      entry.kind === "combat",
    true,
  );
  return entry as CombatSpotlightHistoryEntry;
};

const expectPlayedCardEntry = (
  entry: unknown,
): PlayedCardSpotlightHistoryEntry => {
  assert.equal(
    typeof entry === "object" &&
      entry !== null &&
      "kind" in entry &&
      entry.kind === "playedCard",
    true,
  );
  return entry as PlayedCardSpotlightHistoryEntry;
};

test("spotlight probe covers authored game spotlight families through player view history", () => {
  const state = createActiveState();
  const source = cardRef("source", p1, "leaderArea");
  const target = cardRef("target", p2);
  const selfTarget = cardRef("replacement-self", p1);
  const defender = cardRef("defender", p2);
  const damagedLeader = cardRef("damaged-leader", p2, "leaderArea");
  const counterSource = cardRef("counter", p2, "hand");
  const played = cardRef("played", p1);
  const events: EngineEvent[] = [];

  appendEffectResolvedEvent(
    state,
    events,
    queuedEntry(source, effectPresentation({ source, target })),
  );

  appendEvent(
    state,
    events,
    "decisionCreated",
    { decisionId: toDecisionId("probe:decision:pending") },
    { type: "public" },
  );
  const decisionCreated = events.at(-1);
  appendPendingSpotlightEntryCreatedEvents({
    state,
    events,
    decisionCreatedEvent: decisionCreated,
    recipientPlayerId: p1,
    visibility: { type: "public" },
    activeEffectText: effectPresentation({
      source,
      target,
      span: spanId("span:body:pending"),
    }),
    pendingDecision: {
      id: toDecisionId("probe:decision:pending"),
      type: "selectTargets",
      playerId: p1,
      prompt: "Select a target.",
      causedBy: {
        type: "effect",
        queueEntryId: toQueueEntryId("probe:queue-entry:pending"),
        effectId: toEffectId("probe:effect:pending"),
      },
      visibility: { type: "public" },
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "opponent",
        zone: "characterArea",
        min: 1,
        max: 1,
        allowFewerIfUnavailable: false,
      },
      candidates: [{ card: target, visibility: { type: "public" } }],
    },
  });

  appendEvent(
    state,
    events,
    "replacementApplied",
    {
      processId: "probe:replacement:process",
      replacementId: "probe:replacement:id",
      previousPayloadHash: "probe:previous",
      transformedPayloadHash: "probe:transformed",
      presentation: effectPresentation({
        source: selfTarget,
        target: selfTarget,
        span: spanId("span:replacement"),
      }),
    },
    { type: "public" },
  );
  const replacementApplied = events.at(-1);
  assert.ok(replacementApplied !== undefined);
  appendReplacementSpotlightEntryCreatedEvents({
    state,
    events,
    replacementAppliedEvent: replacementApplied,
    replacementId: "probe:replacement:id",
    presentation: effectPresentation({
      source: selfTarget,
      target: selfTarget,
      span: spanId("span:replacement"),
    }),
  });

  appendEvent(
    state,
    events,
    "attackDeclared",
    {
      attacker: source,
      target: defender,
      attackerPower: 5000,
      defenderPower: 6000,
    },
    { type: "public" },
  );
  const attackDeclared = events.at(-1);
  assert.ok(attackDeclared !== undefined);
  appendCombatSpotlightEntryCreatedEvent({
    state,
    events,
    anchorEvent: attackDeclared,
    combat: {
      eventKind: "attackDeclared",
      attacker: source,
      defender,
      attackerPower: 5000,
      defenderPower: 6000,
    },
  });

  appendEvent(
    state,
    events,
    "counterUsed",
    {
      playerId: p2,
      instanceId: counterSource.instanceId,
      cardId: counterSource.cardId,
      target: defender,
      value: 1000,
    },
    { type: "public" },
  );
  const counterUsed = events.at(-1);
  assert.ok(counterUsed !== undefined);
  appendCombatSpotlightEntryCreatedEvent({
    state,
    events,
    anchorEvent: counterUsed,
    combat: {
      eventKind: "counterUsed",
      source: counterSource,
      target: defender,
      counterPower: 1000,
    },
  });

  appendEvent(
    state,
    events,
    "damageDealt",
    {
      attacker: source.instanceId,
      target: damagedLeader.instanceId,
      amount: 1,
    },
    { type: "public" },
  );
  const damageDealt = events.at(-1);
  assert.ok(damageDealt !== undefined);
  appendCombatSpotlightEntryCreatedEvent({
    state,
    events,
    anchorEvent: damageDealt,
    combat: {
      eventKind: "damageDealt",
      attacker: source,
      defender: damagedLeader,
      attackerPower: 5000,
      defenderPower: 6000,
      amount: 1,
    },
  });

  appendEvent(
    state,
    events,
    "cardKOd",
    {
      playerId: p2,
      instanceId: defender.instanceId,
    },
    { type: "public" },
  );
  const cardKOd = events.at(-1);
  assert.ok(cardKOd !== undefined);
  appendCombatSpotlightEntryCreatedEvent({
    state,
    events,
    anchorEvent: cardKOd,
    combat: {
      eventKind: "battleKOd",
      attacker: source,
      defender,
      attackerPower: 5000,
      defenderPower: 6000,
    },
  });

  appendEvent(
    state,
    events,
    "cardPlayed",
    {
      playerId: p1,
      instanceId: played.instanceId,
      cardId: played.cardId,
      category: "character",
      turnNumber: state.turn.globalTurn,
    },
    { type: "public" },
  );
  const cardPlayed = events.at(-1);
  assert.ok(cardPlayed !== undefined);
  appendPlayedCardSpotlightEntryCreatedEvent({
    state,
    events,
    anchorEvent: cardPlayed,
    source: played,
  });

  expectSpotlightCreatedAfter(events, "effectResolved");
  expectSpotlightCreatedAfter(events, "decisionCreated");
  expectSpotlightCreatedAfter(events, "replacementApplied");
  expectSpotlightCreatedAfter(events, "attackDeclared");
  expectSpotlightCreatedAfter(events, "counterUsed");
  expectSpotlightCreatedAfter(events, "damageDealt");
  expectSpotlightCreatedAfter(events, "cardKOd");
  expectSpotlightCreatedAfter(events, "cardPlayed");

  state.eventJournal = events.map((event, index) => ({
    ...event,
    id: toEngineEventId(`probe:event:${String(index)}`),
  }));
  const view = filterStateForPlayer(state, p1);
  const entries = view.effectSpotlightHistory?.entries ?? [];

  assert.deepEqual(
    entries.map((entry) => entry.kind ?? "effectText"),
    [
      "effectText",
      "effectText",
      "effectText",
      "combat",
      "combat",
      "combat",
      "combat",
      "playedCard",
    ],
  );
  assert.equal(view.effectSpotlightHistory?.presentKey, entries.at(-1)?.key);

  const [
    resolvedEntry,
    pendingEntry,
    replacementEntry,
    attackEntryCandidate,
    counterEntryCandidate,
    damageEntryCandidate,
    battleKoEntryCandidate,
    playedEntryCandidate,
  ] = entries;
  const resolvedEffectEntry = expectEffectTextEntry(resolvedEntry);
  assert.deepEqual(resolvedEffectEntry.active.targetLinks?.[0]?.cards, [
    {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: target.playerId,
    },
  ]);
  const pendingEffectEntry = expectEffectTextEntry(pendingEntry);
  assert.equal(pendingEffectEntry.mode, "live");
  assert.equal(pendingEffectEntry.status, "pending");
  const replacementEffectEntry = expectEffectTextEntry(replacementEntry);
  assert.deepEqual(replacementEffectEntry.active.targetLinks?.[0]?.cards, [
    {
      instanceId: selfTarget.instanceId,
      cardId: selfTarget.cardId,
      playerId: selfTarget.playerId,
    },
  ]);
  const attackEntry = expectCombatEntry(attackEntryCandidate);
  assert.equal(attackEntry.combat.eventKind, "attackDeclared");
  assert.deepEqual(attackEntry.combat.defender, {
    instanceId: defender.instanceId,
    cardId: defender.cardId,
    playerId: defender.playerId,
  });
  const counterEntry = expectCombatEntry(counterEntryCandidate);
  assert.deepEqual(counterEntry.combat, {
    eventKind: "counterUsed",
    source: {
      instanceId: counterSource.instanceId,
      cardId: counterSource.cardId,
      playerId: counterSource.playerId,
    },
    target: {
      instanceId: defender.instanceId,
      cardId: defender.cardId,
      playerId: defender.playerId,
    },
    counterPower: 1000,
  });
  const damageEntry = expectCombatEntry(damageEntryCandidate);
  assert.deepEqual(damageEntry.combat, {
    eventKind: "damageDealt",
    attacker: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: source.playerId,
    },
    defender: {
      instanceId: damagedLeader.instanceId,
      cardId: damagedLeader.cardId,
      playerId: damagedLeader.playerId,
    },
    attackerPower: 5000,
    defenderPower: 6000,
    amount: 1,
  });
  const battleKoEntry = expectCombatEntry(battleKoEntryCandidate);
  assert.deepEqual(battleKoEntry.combat, {
    eventKind: "battleKOd",
    attacker: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: source.playerId,
    },
    defender: {
      instanceId: defender.instanceId,
      cardId: defender.cardId,
      playerId: defender.playerId,
    },
    attackerPower: 5000,
    defenderPower: 6000,
  });
  const playedEntry = expectPlayedCardEntry(playedEntryCandidate);
  assert.deepEqual(playedEntry.source, {
    instanceId: played.instanceId,
    cardId: played.cardId,
    playerId: played.playerId,
  });

  const authoredSpotlightPayloads = events
    .filter((event) => event.type === "spotlightEntryCreated")
    .map((event) => event.payload as SpotlightEntryCreatedPayload);
  assert.equal(authoredSpotlightPayloads.length, entries.length);
  assert.equal(
    authoredSpotlightPayloads.every(
      (payload) =>
        payload.disclosure !== undefined &&
        Array.isArray(payload.disclosure.entryRefs) &&
        payload.disclosure.entryRefs.length > 0,
    ),
    true,
  );
});
