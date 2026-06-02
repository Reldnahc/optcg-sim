import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EffectDefinition,
  SelectionSetId,
} from "@optcg/types";

import { applyPlayCard } from "./core.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { setupMainPlayState } from "../play-card-test-fixtures.js";

test("Event activation with no own implemented body still queues opponent activation reactions immediately", () => {
  const state = setupMainPlayState();
  state.turn.turnPlayerId = p2;
  const p1State = must(state.players[p1], "p1");
  const source: CardInstance = {
    ...must(p1State.hand[0], "reaction source"),
    zone: {
      zone: "characterArea",
      playerId: p1,
      slot: "character",
      index: 0,
    },
    state: "active",
    attachedDon: [],
  };
  p1State.characters = [source];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const p2State = must(state.players[p2], "p2");
  const eventCard = must(p2State.hand[0], "event");
  const revealedTopLifeSet = "set:revealed-top-life" as SelectionSetId;
  const sourceSupport = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    effectText:
      "When your opponent activates an Event or [Blocker], reveal up to 1 card from the top of your Life cards. This Character gains +1000 power during this turn per 1 cost on the revealed card.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-opponent-event-reaction",
    },
  });
  const topLife = must(p1State.life[0], "top life").card;
  state.cardManifest.cards[source.cardId] = sourceSupport;
  state.cardManifest.cards[topLife.cardId] = resolvedCard({
    cardId: topLife.cardId,
    category: "character",
    cost: 4,
  });
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 0,
    effectText: "[Main]",
  });
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-opponent-event-reaction": {
      cardId: source.cardId,
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "opponent-event-reaction" as EffectDefinition["effects"][number]["id"],
          category: "auto",
          trigger: {
            type: "opponentActivated",
            activations: ["event", "blocker"],
          },
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "revealTop",
                  player: "self",
                  zone: "life",
                  count: 1,
                  min: 0,
                  saveAs: revealedTopLifeSet,
                  visibility: "bothPlayers",
                },
              },
              {
                connector: "then",
                effect: {
                  type: "modifyPower",
                  target: { type: "self" },
                  value: {
                    type: "sumSelectedCardCosts",
                    selection: revealedTopLifeSet,
                    multiplier: 1000,
                  },
                  duration: { type: "thisTurn" },
                },
              },
            ],
          },
        },
      ],
      metadata: {
        sourceTextHash: sourceSupport.support.sourceTextHash,
        rulesVersion: sourceSupport.support.rulesVersion,
        effectDefinitionsVersion: "0.1.0",
        tested: true,
        reviewer: "qa-reviewer",
      },
    },
  };

  const result = applyPlayCard(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });

  assert.equal(result.errors, undefined);
  const decision = must(result.state.pendingDecision, "reaction reveal");
  assert.equal(decision.type, "chooseQuantity");
  assert.equal(decision.playerId, p1);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    true,
  );
});
