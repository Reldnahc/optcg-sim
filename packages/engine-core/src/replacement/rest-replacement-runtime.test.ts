import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectId,
  PlayerId,
  QueueEntryId,
  ReplacementTrigger,
  TimingWindowId,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toSourceSnapshot,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import {
  buildSelectedTargetsRestReplacementProcess,
  detectSupportedFieldRemovalReplacementCandidate,
} from "./field-removal-process.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const cardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const restLeaderOrCharacterEffect = (): Extract<Effect, { type: "rest" }> => ({
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
      filter: { categories: ["leader", "character"] },
    },
  },
});

const setupOpponentEffectRestReplacementState = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const replacementSource = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[0], "replacement source"),
      cardId: toCardId("rest-replacement-source"),
    },
    zone: "characterArea",
  });
  replacementSource.state = "active";
  const otherCharacter = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[1], "other character"),
      cardId: toCardId("rest-replacement-other-character"),
    },
    zone: "characterArea",
  });
  otherCharacter.state = "active";
  const opponentSource = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(p2State.hand[0], "opponent source"),
      cardId: toCardId("opponent-rest-effect-source"),
    },
    zone: "characterArea",
  });
  opponentSource.state = "active";

  const replacementWhen: ReplacementTrigger = {
    type: "wouldBeRested",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    sourceCardFilter: { categories: ["character"] },
    target: { type: "self" },
  };
  const replacementEffectId = toEffectId(
    "replacement:opponent-effect-rest-other-character",
  );
  const replacementDefinitionId =
    "definition:opponent-effect-rest-other-character";
  const replacementSupport = {
    status: "implemented-dsl",
    effectDefinitionId: replacementDefinitionId,
    rulesVersion: "rest-replacement-rules",
    sourceTextHash: "rest-replacement-source",
  } as const;
  const replacementEffectBlock: EffectDefinition["effects"][number] = {
    id: replacementEffectId,
    category: "replacement",
    trigger: { type: "replacement", replacement: replacementWhen },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when: replacementWhen,
      instead: {
        type: "rest",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zones: ["characterArea"],
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "public",
            filter: { categories: ["character"], excludeSelf: true },
          },
        },
      },
    },
  };
  state.cardManifest.cards[replacementSource.cardId] = resolvedCard({
    cardId: replacementSource.cardId,
    category: "character",
    support: replacementSupport,
  });
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
  });
  state.cardManifest.cards[otherCharacter.cardId] = resolvedCard({
    cardId: otherCharacter.cardId,
    category: "character",
  });

  const restDefinitionId = "definition:opponent-rest-effect-source";
  const restSupport = {
    status: "implemented-dsl",
    effectDefinitionId: restDefinitionId,
    rulesVersion: "rest-replacement-rules",
    sourceTextHash: "opponent-rest-effect-source",
  } as const;
  const opponentSourceCard = resolvedCard({
    cardId: opponentSource.cardId,
    category: "character",
    support: restSupport,
  });
  const base = reviewedOnPlayDrawDefinition(
    opponentSource.cardId,
    opponentSourceCard.support,
  );
  const baseEffect = must(base.effects[0], "base effect");
  const restDefinition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect:opponent-rest-target"),
        effect: {
          type: "sequence",
          effects: [
            {
              id: "rest-target",
              connector: "always",
              effect: restLeaderOrCharacterEffect(),
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.cards[opponentSource.cardId] = opponentSourceCard;
  state.cardManifest.effectDefinitionsVersion =
    restDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [replacementDefinitionId]: {
      cardId: replacementSource.cardId,
      implementationStatus: "implemented-dsl",
      effects: [replacementEffectBlock],
      metadata: {
        sourceTextHash: replacementSupport.sourceTextHash,
        rulesVersion: replacementSupport.rulesVersion,
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-06-17T00:00:00.000Z",
      },
    },
    [restDefinitionId]: restDefinition,
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-opponent-rest-target"),
      timingWindowId: toTimingWindowId("window-opponent-rest-target"),
      controllerId: p2,
      source: cardRef(opponentSource, p2),
      sourceSnapshot: {
        ...toSourceSnapshot(opponentSource, p2, p2),
        category: "character",
      },
      effectBlockId: must(restDefinition.effects[0], "rest effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "rest-replacement-test" },
    },
  ];

  const restEntry = must(state.effectQueue[0], "rest queue entry");
  return {
    otherCharacter,
    replacementEffectId,
    replacementSource,
    restEntry,
    state,
  };
};

test("rest replacement candidate detection matches would-be-rested self replacement", () => {
  const { replacementSource, restEntry, state } =
    setupOpponentEffectRestReplacementState();
  const detected = detectSupportedFieldRemovalReplacementCandidate(
    state,
    buildSelectedTargetsRestReplacementProcess(restEntry, [
      cardRef(replacementSource, p1),
    ]),
  );

  assert.deepEqual(detected, {
    ok: true,
    candidate: {
      id: `${String(replacementSource.instanceId)}:replacement:opponent-effect-rest-other-character`,
      effectBlockId: "replacement:opponent-effect-rest-other-character",
      controllerId: p1,
      source: cardRef(replacementSource, p1),
      replacementEffect: {
        type: "replacement",
        when: {
          type: "wouldBeRested",
          sourceKind: "cardEffect",
          sourceControllerRelation: "opponentControlled",
          sourceCardFilter: { categories: ["character"] },
          target: { type: "self" },
        },
        instead: {
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["characterArea"],
              min: 1,
              max: 1,
              allowFewerIfUnavailable: false,
              visibility: "public",
              filter: { categories: ["character"], excludeSelf: true },
            },
          },
        },
      },
    },
  });
});

test("opponent Character effect rest attempt can be replaced by resting another Character instead", () => {
  const { otherCharacter, replacementEffectId, replacementSource, state } =
    setupOpponentEffectRestReplacementState();

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const targetDecision = must(paused.state.pendingDecision, "target decision");
  assert.equal(targetDecision.type, "selectTargets");

  const replacementPaused = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [cardRef(replacementSource, p1)] },
  });
  const replacementDecision = replacementPaused.state.pendingDecision;
  assert.equal(replacementPaused.errors, undefined);
  assert.equal(replacementDecision?.type, "chooseReplacement");
  assert.match(
    must(replacementDecision.replacementIds[0], "replacement id"),
    new RegExp(`${replacementEffectId}$`, "u"),
  );

  const accepted = applyAction(replacementPaused.state, {
    type: "respondToDecision",
    decisionId: replacementDecision.id,
    response: {
      type: "replacement",
      replacementId: must(replacementDecision.replacementIds[0], "id"),
    },
  });
  const restInsteadDecision = accepted.state.pendingDecision;
  assert.equal(accepted.errors, undefined);
  assert.equal(restInsteadDecision?.type, "selectTargets");

  const resolved = applyAction(accepted.state, {
    type: "respondToDecision",
    decisionId: restInsteadDecision.id,
    response: { type: "targets", targets: [cardRef(otherCharacter, p1)] },
  });
  const nextP1 = must(resolved.state.players[p1], "next p1");
  const nextReplacementSource = must(
    nextP1.characters.find(
      (card) => card.instanceId === replacementSource.instanceId,
    ),
    "replacement source",
  );
  const nextOtherCharacter = must(
    nextP1.characters.find(
      (card) => card.instanceId === otherCharacter.instanceId,
    ),
    "other character",
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(nextReplacementSource.state, "active");
  assert.equal(nextOtherCharacter.state, "rested");
});

test("declining opponent Character effect rest replacement rests the original target", () => {
  const { otherCharacter, replacementSource, state } =
    setupOpponentEffectRestReplacementState();

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const targetDecision = must(paused.state.pendingDecision, "target decision");
  assert.equal(targetDecision.type, "selectTargets");

  const replacementPaused = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [cardRef(replacementSource, p1)] },
  });
  const replacementDecision = replacementPaused.state.pendingDecision;
  assert.equal(replacementPaused.errors, undefined);
  assert.equal(replacementDecision?.type, "chooseReplacement");

  const declined = applyAction(replacementPaused.state, {
    type: "respondToDecision",
    decisionId: replacementDecision.id,
    response: { type: "replacement" },
  });
  const nextP1 = must(declined.state.players[p1], "next p1");
  const nextReplacementSource = must(
    nextP1.characters.find(
      (card) => card.instanceId === replacementSource.instanceId,
    ),
    "replacement source",
  );
  const nextOtherCharacter = must(
    nextP1.characters.find(
      (card) => card.instanceId === otherCharacter.instanceId,
    ),
    "other character",
  );

  assert.equal(declined.errors, undefined);
  assert.equal(declined.state.pendingDecision, undefined);
  assert.equal(
    declined.state.effectQueue.some((entry) =>
      String(entry.id).includes("queue-entry-opponent-rest-target"),
    ),
    false,
  );
  assert.equal(nextReplacementSource.state, "rested");
  assert.equal(nextOtherCharacter.state, "active");
});
