import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
  PlayerId,
  SelectionId,
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
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";

const ownerConstrainedTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-owner-source",
      connector: "always",
      saveResultAs: "selection:owner-source",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "anyPlayer",
          zone: "costArea",
          filter: { categories: ["don"] },
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
    {
      id: "select-matching-owner-target",
      connector: "ifYouDo",
      saveResultAs: "selection:owner-target",
      effect: {
        type: "selectTargets",
        ownerConstraint: {
          type: "sameAsSavedReferenceOwner",
          selection: "selection:owner-source" as SelectionId,
        },
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "anyPlayer",
          zones: ["leaderArea", "characterArea"],
          filter: { categories: ["leader", "character"] },
          min: 1,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    {
      id: "attach-owner-source",
      connector: "then",
      effect: {
        type: "attachSelectedDon",
        selection: "selection:owner-source" as SelectionId,
        targetOwner: "selectedDonOwner",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "selection:owner-target",
          },
          zones: ["leaderArea", "characterArea"],
          player: "anyPlayer",
          filter: { categories: ["leader", "character"] },
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const setupDefinition = (state: GameState, effect: Effect): void => {
  const p1State = must(state.players[p1], "p1");
  state.turn.turnPlayerId = p1;
  state.turn.phase = "main";
  state.turn.playerTurnCounts[p1] = 2;
  p1State.turnCount = 2;
  const source = p1State.leader;
  const effectDefinitionId = "def-owner-constrained-target";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "owner-constrained-target-rules",
      sourceTextHash: "owner-constrained-target-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-owner-constrained-target"),
        category: "activate",
        trigger: { type: "activateMain" },
        condition: { type: "turnCount", player: "self", op: "gte", value: 2 },
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect,
      },
    ],
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry:owner-constrained-target"),
      timingWindowId: toTimingWindowId("timing-window:owner-constrained"),
      queueOrigin: { type: "activateMain" },
      generation: 0,
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "ownerConstraintTest" },
    },
  ];
};

const moveDonToCostArea = (
  state: GameState,
  playerId: PlayerId,
): CardInstance => {
  const player = must(state.players[playerId], "player");
  const don = must(player.donDeck[0], "DON");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId, slot: "donDeck", index },
  }));
  const costDon: CardInstance = {
    ...don,
    zone: { zone: "costArea", playerId, slot: "cost", index: 0 },
    state: "rested",
  };
  player.costArea = [costDon];
  state.cardManifest.cards[don.cardId] = resolvedCard({
    cardId: don.cardId,
    category: "don",
  });
  return costDon;
};

const setupOwnerConstraintState = () => {
  const state = createActiveState();
  setupDefinition(state, ownerConstrainedTargetSequence());
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const p1Target = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "p1 target"),
    zone: "characterArea",
  });
  const p2Target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "p2 target"),
    zone: "characterArea",
  });
  const p1Don = moveDonToCostArea(state, p1);
  const p2Don = moveDonToCostArea(state, p2);
  for (const card of [p1Target, p2Target, p2State.leader]) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: card.zone.zone === "leaderArea" ? "leader" : "character",
    });
  }
  return { p1Don, p1Target, p2Don, p2Target, state };
};

const targetCandidatesAfterSelectingDon = (
  state: GameState,
  don: CardInstance,
) => {
  const selectDonResult = processEffectRuntime(state);
  assert.equal(selectDonResult.errors, undefined);
  const selectDon = must(selectDonResult.state.pendingDecision, "select DON");
  assert.equal(selectDon.type, "selectTargets");

  const selected = applyAction(selectDonResult.state, {
    type: "respondToDecision",
    decisionId: selectDon.id,
    response: {
      type: "targets",
      targets: [
        must(
          selectDon.candidates.find(
            (candidate) => candidate.card.instanceId === don.instanceId,
          ),
          "selected DON candidate",
        ).card,
      ],
    },
  });
  const selectTarget = must(selected.state.pendingDecision, "select target");
  assert.equal(selected.errors, undefined);
  assert.equal(selectTarget.type, "selectTargets");
  return selectTarget.candidates.map((candidate) => candidate.card);
};

test("selectTargets owner constraint offers only self targets for a saved self-owned source", () => {
  const { p1Don, p1Target, p2Target, state } = setupOwnerConstraintState();

  const candidates = targetCandidatesAfterSelectingDon(state, p1Don);

  assert.ok(
    candidates.some(
      (candidate) => candidate.instanceId === p1Target.instanceId,
    ),
  );
  assert.equal(
    candidates.some(
      (candidate) => candidate.instanceId === p2Target.instanceId,
    ),
    false,
  );
  assert.equal(
    candidates.every((candidate) => candidate.playerId === p1),
    true,
  );
});

test("selectTargets owner constraint offers only opponent targets for a saved opponent-owned source", () => {
  const { p1Target, p2Don, p2Target, state } = setupOwnerConstraintState();

  const candidates = targetCandidatesAfterSelectingDon(state, p2Don);

  assert.ok(
    candidates.some(
      (candidate) => candidate.instanceId === p2Target.instanceId,
    ),
  );
  assert.equal(
    candidates.some(
      (candidate) => candidate.instanceId === p1Target.instanceId,
    ),
    false,
  );
  assert.equal(
    candidates.every((candidate) => candidate.playerId === p2),
    true,
  );
});
