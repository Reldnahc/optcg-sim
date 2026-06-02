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

import { applyAction } from "../actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../action-test-fixtures.js";
import { executeSelectedTargetEffectPrimitive } from "../runtime/primitives/execute.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const cardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

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

const restSelfReplacementFixture = (sourceState: "active" | "rested") => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attackingSource = {
    ...must(p1State.hand[0], "source"),
    zone: {
      zone: "characterArea" as const,
      playerId: p1,
      slot: "character" as const,
      index: 0,
    },
    state: "active" as const,
    attachedDon: [],
  };
  const replacementSource: CardInstance = {
    ...must(p2State.hand[0], "replacement source"),
    cardId: toCardId(`tashigi-replacement-source-${sourceState}`),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: sourceState,
    attachedDon: [],
  };
  const targetCard: CardInstance = {
    ...must(p2State.hand[1], "replacement target"),
    cardId: toCardId(`green-protected-character-${sourceState}`),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
    state: "active",
    attachedDon: [],
  };
  p1State.characters = [attackingSource];
  p1State.hand = p1State.hand.slice(1);
  p2State.characters = [replacementSource, targetCard];
  p2State.hand = p2State.hand.slice(2);

  const replacementTarget: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: {
      categories: ["character"],
      colorsAny: ["green"],
      nameNot: ["Tashigi"],
    },
  };
  const when: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceKind: "cardEffect",
    target: replacementTarget,
  };
  const effectId = toEffectId(
    `replacement:effect-removal-rest-self-${sourceState}`,
  );
  const effectDefinitionId = `definition:effect-removal-rest-self-${sourceState}`;
  state.cardManifest.cards[attackingSource.cardId] = resolvedCard({
    cardId: attackingSource.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[replacementSource.cardId] = {
    ...resolvedCard({
      cardId: replacementSource.cardId,
      category: "character",
      power: 5000,
      support: {
        status: "implemented-dsl",
        effectDefinitionId,
        rulesVersion: "replacement-rules",
        sourceTextHash: "replacement-source",
      },
    }),
    name: "Tashigi",
  };
  state.cardManifest.cards[targetCard.cardId] = {
    ...resolvedCard({
      cardId: targetCard.cardId,
      category: "character",
      power: 5000,
    }),
    colors: ["green"],
    name: "Green Ally",
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
        type: "rest",
        target: { type: "self" },
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
        reviewedAt: "2026-05-31T00:00:00.000Z",
      },
    },
  };
  const entry: EffectQueueEntry = {
    id: toQueueEntryId(`queue-entry-effect-removal-rest-self-${sourceState}`),
    state: "pending",
    timingWindowId:
      `timing-window-effect-removal-rest-self-${sourceState}` as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: cardRef(attackingSource, p1),
    sourceSnapshot: sourceSnapshot(attackingSource, p1),
    effectBlockId: toEffectId("ko-target-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "field-removal-replacement-test" },
  };

  return { effectId, entry, state, targetCard, replacementSource };
};

const koTarget = (fixture: ReturnType<typeof restSelfReplacementFixture>) =>
  executeSelectedTargetEffectPrimitive(
    fixture.state,
    fixture.entry,
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
    [cardRef(fixture.targetCard, p2)],
  );

test("accepted opponent effect field-removal replacement rests its source Character instead of KOing matching Character", () => {
  const fixture = restSelfReplacementFixture("active");
  const paused = koTarget(fixture);
  const decision = paused.state.pendingDecision;
  if (decision?.type !== "chooseReplacement") {
    assert.fail("expected chooseReplacement decision");
  }

  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "replacement", replacementId: fixture.effectId },
  });
  const nextP2 = must(accepted.state.players[p2], "next p2");
  const nextReplacementSource = must(
    nextP2.characters.find(
      (card) => card.instanceId === fixture.replacementSource.instanceId,
    ),
    "replacement source",
  );

  assert.equal(accepted.errors, undefined);
  assert.equal(
    nextP2.characters.some(
      (card) => card.instanceId === fixture.targetCard.instanceId,
    ),
    true,
  );
  assert.equal(nextReplacementSource.state, "rested");
  assert.deepEqual(
    accepted.events.map((event) => event.type),
    ["decisionResolved", "replacementApplied"],
  );
});

test("opponent effect field-removal rest-self replacement is unavailable when its source is already rested", () => {
  const fixture = restSelfReplacementFixture("rested");
  const result = koTarget(fixture);
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    nextP2.characters.some(
      (card) => card.instanceId === fixture.targetCard.instanceId,
    ),
    false,
  );
  assert.equal(
    nextP2.trash.some(
      (card) => card.instanceId === fixture.targetCard.instanceId,
    ),
    true,
  );
});
