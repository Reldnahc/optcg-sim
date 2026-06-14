import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectId } from "@optcg/types";

import { applyAction } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { applyDeclareAttack } from "./actions.js";
import { setupAttackState } from "./test-fixtures.js";

test("activated opponent-attack reaction pauses before Counter Step", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const effectId = "activated-opponent-attack-power" as EffectId;
  const definition: EffectDefinition = {
    cardId: p2State.leader.cardId,
    implementationStatus: "implemented-dsl",
    effects: [
      {
        id: effectId,
        category: "activate",
        trigger: { type: "onOpponentAttack" },
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "modifyPower",
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
                value: -1000,
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    ],
    metadata: {
      sourceTextHash: "activated-opponent-attack-power-source",
      rulesVersion: "activated-opponent-attack-power-rules",
      effectDefinitionsVersion: "fixture",
      tested: true,
      reviewer: "qa-reviewer",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-activated-opponent-attack-power": definition,
  };
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-activated-opponent-attack-power",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });

  const opened = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(opened.errors, undefined);
  const decision = must(
    opened.state.pendingDecision,
    "activated reaction optional decision",
  );
  assert.equal(decision.type, "chooseOptionalActivation");
  assert.equal(decision.playerId, p2);
  assert.equal(decision.effectId, effectId);
  assert.deepEqual(opened.state.battle?.step, "attack");

  const accepted = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  const targetDecision = must(
    accepted.state.pendingDecision,
    "power target decision",
  );
  assert.equal(targetDecision.type, "selectTargets");
  assert.equal(targetDecision.playerId, p2);
  assert.deepEqual(accepted.state.battle?.step, "attack");
});
