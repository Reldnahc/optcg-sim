import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  EffectTextSpotlightHistoryEntry,
  PlayerId,
  QueueEntryId,
  ReplacementTrigger,
  SpotlightEntryCreatedPayload,
  Target,
  TimingWindowId,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../action-test-fixtures.js";
import { executeSelectedTargetEffectPrimitive } from "../runtime/primitives/execute.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";
import {
  replacementPresentation,
  replacementSpotlightPayloads,
  stateWithPendingReplacementPresentation,
} from "./spotlight-test-support.js";

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

test("accepted opponent effect field-removal replacement returns selected DON instead of KOing matching Character", () => {
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
  const targetCardId = toCardId("effect-removal-return-don-target");
  const targetCard: CardInstance = {
    ...targetHand,
    cardId: targetCardId,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
  };
  const returnedDon = {
    ...must(p2State.donDeck[0], "return don"),
    zone: { zone: "costArea" as const, playerId: p2, index: 0 },
    state: "rested" as const,
  };
  p1State.characters = [source];
  p1State.hand = p1State.hand.slice(1);
  p2State.characters = [targetCard];
  p2State.hand = p2State.hand.slice(1);
  p2State.costArea = [returnedDon];
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
  const effectId = toEffectId("replacement:effect-removal-return-don");
  const effectDefinitionId = "definition:effect-removal-return-don";
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
  must(
    state.cardManifest.cards[targetCard.cardId],
    "target metadata",
  ).effectTextSourceMap = {
    textKind: "effect",
    sourceText: "If this card would leave the field, return 1 DON!! instead.",
    spans: [
      {
        id: "span:replacement" as const,
        role: "body",
        start: 0,
        end: 62,
        text: "If this card would leave the field, return 1 DON!! instead.",
      },
    ],
  };
  const effectBlock: EffectDefinition["effects"][number] = {
    id: effectId,
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    presentation: {
      textKind: "effect",
      spanIds: ["span:replacement" as const],
    },
    effect: {
      type: "replacement",
      when,
      instead: {
        type: "returnDon",
        count: 1,
        player: "self",
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
        reviewedAt: "2026-06-04T00:00:00.000Z",
      },
    },
  };
  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-effect-removal-return-don"),
    state: "pending",
    timingWindowId: "timing-window-effect-removal-return-don" as TimingWindowId,
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
  const replacementId = must(
    replacementDecision.replacementIds[0],
    "replacement id",
  );
  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: replacementDecision.id,
    response: { type: "replacement", replacementId },
  });
  const payDecision = accepted.state.pendingDecision;
  if (payDecision?.type !== "payCost") {
    assert.fail("expected return-DON payCost replacement decision");
  }
  const pendingSpotlight = accepted.events
    .filter((event) => event.type === "spotlightEntryCreated")
    .map((event) => event.payload as SpotlightEntryCreatedPayload)
    .find(
      (
        payload,
      ): payload is SpotlightEntryCreatedPayload & {
        entry: EffectTextSpotlightHistoryEntry;
      } =>
        payload.entry.kind === undefined &&
        payload.entry.mode === "live" &&
        payload.entry.status === "pending",
    );
  if (pendingSpotlight === undefined) {
    assert.fail("expected pending replacement spotlight");
  }
  const pendingSpotlightId = must(
    pendingSpotlight.entry.pendingDecisionId,
    "pending spotlight id",
  );
  assert.deepEqual(pendingSpotlight.entry.active.activeSpanIds, [
    "span:replacement",
  ]);
  assert.equal(pendingSpotlightId.includes(String(payDecision.id)), false);
  assert.equal(
    pendingSpotlightId.includes(String(payDecision.decisionAnchorEventId)),
    true,
  );
  assert.deepEqual(payDecision.paymentOptions, [
    { id: "returnDon", type: "returnDon", count: 1 },
  ]);
  const ownerView = filterStateForPlayer(accepted.state, p2);
  const opponentView = filterStateForPlayer(accepted.state, p1);
  assert.equal(
    ownerView.pendingDecision?.spotlightPendingId,
    pendingSpotlightId,
  );
  const ownerSpotlightEntry = ownerView.effectSpotlightHistory?.entries.at(-1);
  if (
    ownerSpotlightEntry === undefined ||
    (ownerSpotlightEntry.kind !== undefined &&
      ownerSpotlightEntry.kind !== "effectText")
  ) {
    assert.fail("expected owner-visible effect-text replacement spotlight");
  }
  assert.equal(ownerSpotlightEntry.pendingDecisionId, pendingSpotlightId);
  assert.deepEqual(ownerSpotlightEntry.active.activeSpanIds, [
    "span:replacement",
  ]);
  assert.deepEqual(ownerSpotlightEntry.active.targetLinks, [
    {
      spanId: "span:replacement",
      relation: "affectedCard",
      cards: [
        {
          instanceId: targetCard.instanceId,
          cardId: targetCard.cardId,
          playerId: p2,
        },
      ],
    },
  ]);
  assert.equal(opponentView.pendingDecision, undefined);
  const opponentSpotlightEntry =
    opponentView.effectSpotlightHistory?.entries.at(-1);
  assert.equal(
    opponentSpotlightEntry === undefined ||
      !("pendingDecisionId" in opponentSpotlightEntry),
    true,
  );
  const ownerSpotlightJson = JSON.stringify({
    events: ownerView.events.filter(
      (event) => event.type === "spotlightEntryCreated",
    ),
    effectSpotlightHistory: ownerView.effectSpotlightHistory,
  });
  const opponentSpotlightJson = JSON.stringify({
    events: opponentView.events.filter(
      (event) => event.type === "spotlightEntryCreated",
    ),
    effectSpotlightHistory: opponentView.effectSpotlightHistory,
  });
  assert.equal(ownerSpotlightJson.includes(String(payDecision.id)), false);
  assert.equal(opponentSpotlightJson.includes(String(payDecision.id)), false);

  const resolved = applyAction(
    stateWithPendingReplacementPresentation({
      state: accepted.state,
      pendingKey: "pendingReplacementPayCostInstead",
      presentation: replacementPresentation({
        source: cardRef(targetCard, p2),
        target: cardRef(returnedDon, p2),
      }),
    }),
    {
      type: "respondToDecision",
      decisionId: payDecision.id,
      response: {
        type: "payment",
        optionId: "returnDon",
        selectedDonInstanceIds: [returnedDon.instanceId],
      },
    },
  );
  const nextP2 = must(resolved.state.players[p2], "next p2");

  assert.equal(resolved.errors, undefined);
  assert.equal(nextP2.costArea.length, 0);
  assert.equal(
    must(nextP2.donDeck.at(-1), "returned DON").instanceId,
    returnedDon.instanceId,
  );
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === targetCard.instanceId),
    true,
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "costPaid",
      "replacementApplied",
      "spotlightEntryCreated",
    ],
  );
  assert.equal(replacementSpotlightPayloads(resolved.events).length, 1);
});
