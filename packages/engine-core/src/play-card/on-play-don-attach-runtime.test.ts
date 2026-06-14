import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  EffectDefinition,
  EngineResult,
  GameState,
  SelectionId,
} from "@optcg/types";

import {
  applyPlayCard,
  applyPlayCardDecisionResponse,
  getPlayCardLegalActions,
} from "./core.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { hasPlayCardAction, setupMainPlayState } from "./test-fixtures.js";

const applyPlayCardTestAction = (
  state: GameState,
  action:
    | Extract<Action, { type: "playCard" }>
    | Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  if (action.type === "playCard") {
    return applyPlayCard(state, action);
  }
  const result = applyPlayCardDecisionResponse(state, action);
  assert.ok(result !== null, "expected play-card decision response");
  return result;
};

test("On Play leader-type conditioned optional opponent DON attachment no-ops when opponent has no DON", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const character = must(p1State.hand[0], "on-play character");
  const opponentCharacterSource = must(
    p2State.hand[0],
    "opponent character source",
  );
  const opponentCharacter: CardInstance = {
    ...opponentCharacterSource,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
    state: "active",
    attachedDon: [],
    turnPlayed: 0,
  };
  p2State.characters = [opponentCharacter];
  p2State.hand = p2State.hand
    .filter((card) => card.instanceId !== opponentCharacterSource.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p2, slot: "hand", index },
    }));
  p2State.donDeck = [...p2State.costArea, ...p2State.donDeck].map(
    (card, index) => ({
      ...card,
      zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
    }),
  );
  p2State.costArea = [];
  state.cardManifest.cards[p1State.leader.cardId] = {
    ...resolvedCard({
      cardId: p1State.leader.cardId,
      category: "leader",
      power: 5000,
    }),
    types: ["East Blue"],
  };
  state.cardManifest.cards[opponentCharacter.cardId] = resolvedCard({
    cardId: opponentCharacter.cardId,
    category: "character",
    cost: 0,
    power: 2000,
  });
  const line =
    "[On Play] If your Leader has the {East Blue} type, give up to 1 DON!! card from your opponent's cost area to 1 of your opponent's Characters.";
  const donSelection = "donSelection:attach" as SelectionId;
  const targetSelection = "targetSelection:attach-don";
  const resolved = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 0,
    power: 2000,
    effectText: line,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-on-play-opponent-don-attach-noop",
      rulesVersion: "r1",
      sourceTextHash: "source-hash",
    },
  });
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-on-play-opponent-don-attach-noop": {
      cardId: character.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "def-on-play-opponent-don-attach-noop:effect:1" as EffectDefinition["effects"][number]["id"],
          category: "auto",
          trigger: { type: "onPlay" },
          condition: {
            type: "hasCardInZone",
            zone: "leaderArea",
            player: "self",
            filter: {
              categories: ["leader"],
              typesAny: ["East Blue"],
            },
          },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: {
            type: "sequence",
            effects: [
              {
                id: "select:don-to-attach",
                connector: "always",
                saveResultAs: donSelection,
                effect: {
                  type: "selectTargets",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    zone: "costArea",
                    player: "opponent",
                    filter: { categories: ["don"] },
                    min: 0,
                    max: 1,
                    allowFewerIfUnavailable: true,
                    visibility: "public",
                  },
                },
              },
              {
                id: "select:don-attach-target",
                connector: "ifYouDo",
                saveResultAs: targetSelection,
                effect: {
                  type: "selectTargets",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "opponent",
                    zone: "characterArea",
                    filter: { categories: ["character"] },
                    min: 1,
                    max: 1,
                    allowFewerIfUnavailable: false,
                    visibility: "public",
                  },
                },
              },
              {
                id: "attach:selected-don",
                connector: "then",
                effect: {
                  type: "attachSelectedDon",
                  selection: donSelection,
                  target: {
                    type: "savedFieldObject",
                    binding: {
                      family: "selectedTargets",
                      saveResultAs: targetSelection,
                    },
                    zone: "characterArea",
                    player: "opponent",
                    filter: { categories: ["character"] },
                    visibility: "publicOnly",
                    onFailure: "failClosed",
                  },
                },
              },
            ],
          },
        },
      ],
      metadata: {
        sourceTextHash: resolved.support.sourceTextHash,
        rulesVersion: resolved.support.rulesVersion,
        effectDefinitionsVersion: "0.1.0",
        tested: true,
        reviewer: "qa-reviewer",
      },
    },
  };
  state.cardManifest.cards[character.cardId] = resolved;

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), character),
    true,
  );
  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: character.instanceId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.effectExecutionFrames.length, 0);
  const resultP1 = must(result.state.players[p1], "result p1");
  const resultP2 = must(result.state.players[p2], "result p2");
  assert.equal(
    must(resultP1.characters[0], "played character").instanceId,
    character.instanceId,
  );
  assert.deepEqual(
    must(resultP2.characters[0], "opponent character").attachedDon,
    [],
  );
});
