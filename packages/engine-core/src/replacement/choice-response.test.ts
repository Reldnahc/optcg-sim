import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  PlayerId,
  QueueEntryId,
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
} from "../action-test-fixtures.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { executeSelectedTargetEffectPrimitive } from "../runtime/primitives/execute.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const publicCharacterRequest = (): TargetRequest => ({
  timing: "onResolution",
  chooser: "self",
  player: "opponent",
  zone: "characterArea",
  min: 1,
  max: 1,
  allowFewerIfUnavailable: false,
  visibility: "public",
});

const koChooseEffect = (): Extract<Effect, { type: "ko" }> => ({
  type: "ko",
  target: { type: "choose", request: publicCharacterRequest() },
});

const cardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const attachReviewedKoReplacementDefinition = (
  state: ReturnType<typeof createActiveState>,
  target: CardInstance,
): EffectDefinition["effects"][number] => {
  const support = {
    cardId: target.cardId,
    status: "implemented-dsl" as const,
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: state.cardManifest.cardDataVersion,
    sourceTextHash: "replacement-source-hash",
    behaviorHash: "replacement-behavior-hash",
    effectDefinitionId: `definition:${String(target.cardId)}`,
  };
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    support,
  });
  const effectBlock: EffectDefinition["effects"][number] = {
    id: toEffectId("replacement:would-be-ko-draw-1"),
    category: "replacement",
    trigger: {
      type: "replacement",
      replacement: { type: "wouldBeKOd", target: { type: "self" } },
    },
    optional: true,
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when: { type: "wouldBeKOd", target: { type: "self" } },
      instead: { type: "draw", count: 1, player: "self" },
    },
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [support.effectDefinitionId]: {
      cardId: target.cardId,
      implementationStatus: "implemented-dsl",
      effects: [effectBlock],
      metadata: {
        sourceTextHash: support.sourceTextHash,
        rulesVersion: support.rulesVersion,
        effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
        tested: true,
        reviewedBy: "engine-reviewer",
        reviewedAt: "2026-05-11T00:00:00.000Z",
      },
    },
  };
  return effectBlock;
};

const pauseForReplacementDecision = () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const sourceSeed = must(p1State.hand[0], "source seed");
  const targetSeed = must(p2State.hand[0], "target seed");
  const don = must(p2State.donDeck[0], "attached DON");
  const source: CardInstance = {
    ...sourceSeed,
    cardId: toCardId("ko-source"),
    zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  };
  const target: CardInstance = {
    ...targetSeed,
    cardId: toCardId("ko-target"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [don.instanceId],
    turnPlayed: 1,
  };
  p1State.characters = [source];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p2State.characters = [target];
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  p2State.donDeck = p2State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  p2State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
  });
  const effectBlock = attachReviewedKoReplacementDefinition(state, target);
  const entry: EffectQueueEntry = {
    id: toQueueEntryId("queue-entry-ko-targets"),
    state: "pending",
    timingWindowId: "window-ko-targets" as TimingWindowId,
    generation: 0,
    controllerId: p1,
    source: cardRef(source, p1),
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "character",
      colors: ["red"],
      keywords: [],
      power: 5000,
    },
    effectBlockId: toEffectId("ko-targets-effect"),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "ko-target-test" },
  };
  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [cardRef(target, p2)],
  );
  return {
    result,
    effectBlock,
    target,
    replacementId: `${String(target.instanceId)}:${String(effectBlock.id)}`,
  };
};

const mustChooseReplacementDecision = (
  decision: ReturnType<
    typeof pauseForReplacementDecision
  >["result"]["state"]["pendingDecision"],
) => {
  if (decision?.type !== "chooseReplacement") {
    throw new Error("missing chooseReplacement decision");
  }
  return decision;
};

test("chooseReplacement legal actions expose accept and decline only to the decision player", () => {
  const { result, replacementId } = pauseForReplacementDecision();
  const decision = mustChooseReplacementDecision(result.state.pendingDecision);

  assert.deepEqual(getLegalActions(result.state, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "replacement" },
    },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "replacement", replacementId },
    },
  ]);
  assert.deepEqual(getLegalActions(result.state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("declining optional chooseReplacement resolves to the unreplaced KO process", () => {
  const { result, target } = pauseForReplacementDecision();
  const decision = mustChooseReplacementDecision(result.state.pendingDecision);

  const declined = applyAction(result.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "replacement" },
  });
  const nextP2 = must(declined.state.players[p2], "next p2");

  assert.equal(declined.errors, undefined);
  assert.equal(declined.state.pendingDecision, undefined);
  assert.deepEqual(declined.state.replacementState, []);
  assert.deepEqual(
    declined.events.map((event) => event.type),
    ["decisionResolved", "cardKOd", "cardMoved", "donReturned"],
  );
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(nextP2.trash[0]?.instanceId, target.instanceId);
});

test("live chooseReplacement response preserves omitted state hash", () => {
  const { result } = pauseForReplacementDecision();
  const decision = mustChooseReplacementDecision(result.state.pendingDecision);

  const declined = applyAction(
    result.state,
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "replacement" },
    },
    {
      includeStateHash: false,
      validateInvariants: false,
    },
  );

  assert.equal(declined.errors, undefined);
  assert.equal(declined.stateHash, "");
});

test.each([
  {
    name: "wrong player",
    playerId: p1,
    response: { type: "replacement" },
    reason: "Player does not match current pending decision.",
  },
  {
    name: "missing response",
    playerId: p2,
    omitResponse: true,
    reason: "Response must be an object for chooseReplacement.",
  },
  {
    name: "null response",
    playerId: p2,
    response: null,
    reason: "Response must be an object for chooseReplacement.",
  },
  {
    name: "malformed response type",
    playerId: p2,
    response: { type: "orderedIds", ids: [] },
    reason: "Response type must be replacement for chooseReplacement.",
  },
  {
    name: "unknown replacement id",
    playerId: p2,
    response: { type: "replacement", replacementId: "replacement:unknown" },
    reason: "replacementId must match an available replacement.",
  },
  {
    name: "malformed player id",
    playerId: p2,
    actionOverride: {
      type: "respondToDecision",
      decisionId: "placeholder-decision-id",
      playerId: null,
      response: { type: "replacement" },
    } as unknown as Parameters<typeof applyAction>[1],
    reason: "Player does not match current pending decision.",
  },
] satisfies {
  name: string;
  playerId: PlayerId;
  actionOverride?: Parameters<typeof applyAction>[1];
  response?: Record<string, unknown> | null;
  omitResponse?: true;
  reason: string;
}[])(
  "chooseReplacement response validation rejects $name without mutation",
  ({ playerId, actionOverride, response, omitResponse, reason }) => {
    const { result } = pauseForReplacementDecision();
    const decision = mustChooseReplacementDecision(
      result.state.pendingDecision,
    );
    const before = structuredClone(result.state);
    const beforeHash = hashCanonicalStateValue(result.state);
    const action =
      actionOverride === undefined
        ? ({
            type: "respondToDecision" as const,
            decisionId: decision.id,
            playerId,
            ...(omitResponse === true ? {} : { response }),
          } as unknown as Parameters<typeof applyAction>[1])
        : { ...actionOverride, decisionId: decision.id };

    const rejected = applyAction(result.state, action);

    assert.deepEqual(rejected.errors, [
      { type: "invalidDecisionResponse", reason },
    ]);
    assert.deepEqual(rejected.events, []);
    assert.deepEqual(rejected.state, before);
    assert.equal(rejected.stateHash, beforeHash);
    assert.equal(rejected.state.pendingDecision?.id, decision.id);
  },
);

test("chooseReplacement response validation rejects mandatory decline without mutation", () => {
  const { result } = pauseForReplacementDecision();
  const decision = mustChooseReplacementDecision(result.state.pendingDecision);
  const mandatoryState = {
    ...result.state,
    pendingDecision: { ...decision, mandatory: true },
  };
  const before = structuredClone(mandatoryState);

  const rejected = applyAction(mandatoryState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "replacement" },
  });

  assert.deepEqual(rejected.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Mandatory replacement decisions cannot be declined.",
    },
  ]);
  assert.deepEqual(rejected.events, []);
  assert.deepEqual(rejected.state, before);
});
