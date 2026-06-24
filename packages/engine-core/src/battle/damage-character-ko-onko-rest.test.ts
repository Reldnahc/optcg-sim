import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { applyAction } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { applyDeclareAttack } from "./actions.js";
import {
  effectDefinition,
  passCounterStep,
  setupAttackState,
} from "./test-fixtures.js";

test("On K.O. rest target effect pauses, resolves, and resumes battle cleanup", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  p1State.leader = { ...p1State.leader, state: "rested" };
  const restCandidateSource = must(p1State.hand[0], "rest candidate");
  const restCandidate = {
    ...restCandidateSource,
    zone: {
      zone: "characterArea",
      playerId: p1,
      slot: "character",
      index: 1,
    } as const,
    state: "active" as const,
    attachedDon: [],
    turnPlayed: 1,
  };
  p1State.characters = [attacker, restCandidate];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[restCandidate.cardId] = resolvedCard({
    cardId: restCandidate.cardId,
    category: "character",
    cost: 4,
    power: 3000,
  });
  const definition = effectDefinition(target.cardId, { type: "onKO" });
  const onKOEffect = must(definition.effects[0], "On K.O. rest effect");
  const onKODefinition: EffectDefinition = {
    ...definition,
    effects: [
      {
        ...onKOEffect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
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
              filter: {
                anyOf: [
                  { categories: ["leader"] },
                  { categories: ["character"], cost: { max: 7 } },
                ],
              },
            },
          },
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    onKODefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-supported-on-ko-rest": onKODefinition,
  };
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
    effectText:
      "[On K.O.] Rest up to 1 of your opponent's Leader or Character cards with a cost of 7 or less.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-supported-on-ko-rest",
      rulesVersion: onKODefinition.metadata.rulesVersion,
      sourceTextHash: onKODefinition.metadata.sourceTextHash,
    },
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });
  assert.equal(opened.errors, undefined);

  const paused = passCounterStep(opened.state, p2);
  assert.equal(paused.errors, undefined);
  assert.equal(paused.state.battle, undefined);
  const decision = must(paused.state.pendingDecision, "On K.O. rest decision");
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.playerId, p2);
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    [p1State.leader.instanceId, restCandidate.instanceId],
  );
  assert.equal(
    paused.events.some(
      (event) =>
        event.type === "effectResolved" &&
        (event.payload as { systemStep?: unknown }).systemStep === "endBattle",
    ),
    true,
  );

  const resolved = applyAction(
    paused.state,
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "targets",
        targets: [
          must(
            decision.candidates.find(
              (candidate) =>
                candidate.card.instanceId === restCandidate.instanceId,
            ),
            "rest target",
          ).card,
        ],
      },
    },
    {
      includeStateHash: false,
      validateInvariants: false,
    },
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.stateHash, "");
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.battle, undefined);
  assert.deepEqual(resolved.state.effectQueue, []);
  assert.equal(
    must(resolved.state.players[p1], "resolved p1").characters.find(
      (card) => card.instanceId === restCandidate.instanceId,
    )?.state,
    "rested",
  );
});
