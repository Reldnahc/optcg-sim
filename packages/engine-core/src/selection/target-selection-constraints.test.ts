import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardRef,
  DecisionId,
  EffectId,
  EffectQueueEntry,
  GameState,
  InstanceId,
  QueueEntryId,
  StateSeq,
  TargetRequest,
  TimingWindowId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toCardId,
} from "../action-test-fixtures.js";
import { applyAction } from "../actions.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const constrainedTargetRequest = (): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "opponent",
  zone: "characterArea",
  min: 0,
  max: 2,
  allowFewerIfUnavailable: true,
  visibility: "public",
  filter: { categories: ["character"] },
  selectionConstraints: [
    {
      type: "totalStat",
      stat: "currentPower",
      op: "lte",
      value: 4000,
    },
  ],
});

const queuedTargetEffect = (): EffectQueueEntry => ({
  id: toQueueEntryId("queue-entry-total-power-targets"),
  state: "pending",
  timingWindowId: toTimingWindowId("timing-window-total-power-targets"),
  generation: 1,
  controllerId: p1,
  source: {
    instanceId: toInstanceId("total-power-source"),
    cardId: toCardId("total-power-source-card"),
    playerId: p1,
    zone: { zone: "leaderArea", playerId: p1, slot: "leader", index: 0 },
  },
  sourceSnapshot: {
    instanceId: toInstanceId("total-power-source"),
    cardId: toCardId("total-power-source-card"),
    ownerId: p1,
    controllerId: p1,
    zone: { zone: "leaderArea", playerId: p1, slot: "leader", index: 0 },
    category: "leader",
    colors: ["red"],
    keywords: [],
  },
  effectBlockId: toEffectId("effect-total-power-targets"),
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 1,
  queuedAtStateSeq: toStateSeq(1),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "selectTargets:totalPower:test" },
});

const setupConstrainedSelection = (): {
  readonly decisionId: DecisionId;
  readonly state: GameState;
  readonly targets: readonly CardRef[];
} => {
  const request = constrainedTargetRequest();
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2 state");
  const sourceCardId = toCardId("total-power-source-card");
  state.cardManifest.cards[sourceCardId] = resolvedCard({
    cardId: sourceCardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-total-power-targets",
      rulesVersion: "total-power-targets-rules",
      sourceTextHash: "total-power-targets-source",
    },
  });
  const support = must(
    state.cardManifest.cards[sourceCardId].support,
    "source support",
  );
  const baseDefinition = reviewedOnPlayDrawDefinition(sourceCardId, support);
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-total-power-targets": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: toEffectId("effect-total-power-targets"),
          effect: { type: "ko", target: { type: "choose", request } },
        },
      ],
    },
  };

  const targetCards = [
    { cardId: toCardId("target-3000"), power: 3000 },
    { cardId: toCardId("target-2000"), power: 2000 },
  ] as const;
  const targets = targetCards.map((target, index) => {
    state.cardManifest.cards[target.cardId] = resolvedCard({
      cardId: target.cardId,
      category: "character",
      power: target.power,
    });
    const source = must(p2State.hand[index], `p2 hand ${String(index)}`);
    return {
      ...source,
      cardId: target.cardId,
      owner: p2,
      controller: p2,
      zone: {
        zone: "characterArea" as const,
        playerId: p2,
        slot: "character" as const,
        index,
      },
      attachedDon: [],
      state: "active" as const,
    };
  });
  p2State.characters = targets;
  p2State.hand = p2State.hand.slice(targets.length).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));

  const queueEntry = queuedTargetEffect();
  const candidateRefs = targets.map((target) => ({
    instanceId: target.instanceId,
    cardId: target.cardId,
    playerId: p2,
    zone: target.zone,
  }));
  const decisionId = toDecisionId(
    "decision:selectTargets:queue-entry-total-power-targets",
  );
  state.effectQueue = [queueEntry];
  state.pendingDecision = {
    id: decisionId,
    type: "selectTargets",
    playerId: p1,
    prompt: "Select targets.",
    causedBy: {
      type: "effect",
      queueEntryId: queueEntry.id,
      effectId: queueEntry.effectBlockId,
    },
    visibility: { type: "public" },
    request,
    candidates: candidateRefs.map((card) => ({
      card,
      visibility: { type: "public" },
    })),
  };

  return { decisionId, state, targets: candidateRefs };
};

const respondWithTargets = (
  decisionId: DecisionId,
  targets: readonly CardRef[],
): Extract<Action, { type: "respondToDecision" }> => ({
  type: "respondToDecision",
  decisionId,
  response: { type: "targets", targets: [...targets] },
});

test("selectTargets rejects a target group whose total current power exceeds the request constraint", () => {
  const { decisionId, state, targets } = setupConstrainedSelection();

  const result = applyAction(
    state,
    respondWithTargets(decisionId, [
      must(targets[0], "first target"),
      must(targets[1], "second target"),
    ]),
  );

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Selected targets do not satisfy the selection constraints.",
    },
  ]);
  assert.equal(result.state, state);
});
