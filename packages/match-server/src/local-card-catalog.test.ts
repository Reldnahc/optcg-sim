import { strict as assert } from "node:assert";
import { beforeAll, describe, test } from "vitest";
import type {
  DecisionId,
  EffectTextSourceMap,
  EngineEventId,
  PlayerId,
} from "@optcg/types";

import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  createLocalDevMatch,
  getLocalDevCardCatalogForPlayer,
  type DevMatchSetup,
} from "./local-match.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

const createTestMatch = () =>
  createLocalDevMatch(structuredClone(premadeSetup));

describe("local dev card catalog", () => {
  test("includes effect text source maps for visible card catalog entries", () => {
    const match = createTestMatch();
    const p1State = match.state.players[p1];
    if (p1State === undefined) {
      throw new Error("Missing p1 state.");
    }
    const visible = p1State.leader;
    const card = match.state.cardManifest.cards[visible.cardId];
    if (card === undefined) {
      throw new Error("Missing visible card manifest entry.");
    }
    card.effectText = "[On Play] Draw 1 card.";
    const sourceMap: EffectTextSourceMap = {
      textKind: "effect",
      sourceText: card.effectText,
      spans: [
        {
          id: "span:body:draw",
          role: "body",
          start: 10,
          end: card.effectText.length,
          text: card.effectText.slice(10),
          primitiveEvidence: ["instruction:draw"],
        },
      ],
    };
    card.effectTextSourceMap = sourceMap;

    const catalog = getLocalDevCardCatalogForPlayer(match, p1);
    const entry = catalog.players[p1]?.instances?.[visible.instanceId];

    assert.equal(entry?.effectTextSourceMap?.sourceText, entry?.effectText);
    assert.equal(entry?.effectTextSourceMap?.spans[0]?.id, "span:body:draw");
  });

  test("includes cards from visible reveal events", () => {
    const match = createTestMatch();
    const p1State = match.state.players[p1];
    if (p1State === undefined) {
      throw new Error("Missing p1 state.");
    }
    const revealed = p1State.deck[0];
    if (revealed === undefined) {
      throw new Error("Missing reveal card in p1 deck.");
    }
    match.state.eventJournal.push({
      id: "event:test:public-reveal" as EngineEventId,
      seq: 1,
      type: "cardRevealed",
      payload: {
        revealId: "reveal:test:public",
        cards: [
          {
            instanceId: revealed.instanceId,
            cardId: revealed.cardId,
            playerId: p1,
          },
        ],
        origin: "topOfDeck",
      },
      visibility: { type: "public" },
      createdAtStateSeq: match.state.seq,
    });

    const catalog = getLocalDevCardCatalogForPlayer(match, p2);

    assert.equal(
      catalog.players[p1]?.cards[revealed.cardId]?.cardId,
      revealed.cardId,
    );
  });

  test("includes private order-card decision cards", () => {
    const match = createTestMatch();
    const p1State = match.state.players[p1];
    if (p1State === undefined) {
      throw new Error("Missing p1 state.");
    }
    const looked = p1State.deck[0];
    if (looked === undefined) {
      throw new Error("Missing looked deck card.");
    }
    match.state.pendingDecision = {
      id: "decision:orderCards:test" as DecisionId,
      type: "orderCards",
      playerId: p1,
      prompt: "Place looked cards.",
      causedBy: { type: "ruleProcess", name: "test" },
      visibility: { type: "private", playerId: p1 },
      cards: [
        {
          instanceId: looked.instanceId,
          cardId: looked.cardId,
          playerId: p1,
          zone: looked.zone,
        },
      ],
      destination: "deck",
      placement: { type: "topOrBottom" },
    };

    const catalog = getLocalDevCardCatalogForPlayer(match, p1);
    const entry = catalog.players[p1]?.cards[looked.cardId];
    if (entry === undefined) {
      throw new Error("Missing pending order card catalog entry.");
    }

    assert.equal(entry.cardId, looked.cardId);
    assert.equal(entry.imageUrl?.startsWith("https://"), true);
  });

  test("includes private life trigger decision cards for the decision player", () => {
    const match = createTestMatch();
    const p1State = match.state.players[p1];
    if (p1State === undefined) {
      throw new Error("Missing p1 state.");
    }
    const triggerCard = p1State.deck[0];
    if (triggerCard === undefined) {
      throw new Error("Missing trigger card in p1 deck.");
    }
    match.state.pendingDecision = {
      id: "decision:lifeTrigger:test" as DecisionId,
      type: "confirmLifeTrigger",
      playerId: p1,
      prompt: "Activate life trigger?",
      causedBy: { type: "ruleProcess", name: "test" },
      visibility: { type: "private", playerId: p1 },
      card: {
        instanceId: triggerCard.instanceId,
        cardId: triggerCard.cardId,
        playerId: p1,
        zone: {
          zone: "life",
          playerId: p1,
          slot: "life",
          index: 0,
        },
      },
      options: ["activateTrigger", "addToHand"],
    };

    const p1Catalog = getLocalDevCardCatalogForPlayer(match, p1);
    const p2Catalog = getLocalDevCardCatalogForPlayer(match, p2);
    const entry = p1Catalog.players[p1]?.instances?.[triggerCard.instanceId];
    if (entry === undefined) {
      throw new Error("Missing pending life trigger card catalog entry.");
    }

    assert.equal(entry.cardId, triggerCard.cardId);
    assert.equal(entry.imageUrl?.startsWith("https://"), true);
    assert.equal(
      p2Catalog.players[p1]?.instances?.[triggerCard.instanceId],
      undefined,
    );
  });

  test("includes cards referenced by pending decision choice presentation", () => {
    const match = createTestMatch();
    const p1State = match.state.players[p1];
    if (p1State === undefined) {
      throw new Error("Missing p1 state.");
    }
    const source = p1State.deck[0];
    if (source === undefined) {
      throw new Error("Missing replacement source card.");
    }
    source.zone = {
      zone: "deck",
      playerId: p1,
      slot: "deck",
      index: 0,
    };
    match.state.pendingDecision = {
      id: "decision:replacement:test" as DecisionId,
      type: "chooseReplacement",
      playerId: p1,
      prompt: "Choose replacement effect.",
      causedBy: { type: "ruleProcess", name: "test" },
      visibility: { type: "private", playerId: p1 },
      processId: "process:replacement:test",
      replacementIds: ["replacement:test"],
      replacementOptions: [
        {
          replacementId: "replacement:test",
          label: "Use replacement",
          source: {
            instanceId: source.instanceId,
            cardId: source.cardId,
            playerId: p1,
            zone: source.zone,
          },
        },
      ],
      mandatory: false,
    };

    const catalog = getLocalDevCardCatalogForPlayer(match, p1);
    const entry = catalog.players[p1]?.instances?.[source.instanceId];
    if (entry === undefined) {
      throw new Error("Missing decision choice source card catalog entry.");
    }

    assert.equal(entry.cardId, source.cardId);
    assert.equal(entry.imageUrl?.startsWith("https://"), true);
  });

  test("keys persistent revealed cards by revealed card owner", () => {
    const match = createTestMatch();
    const p1State = match.state.players[p1];
    if (p1State === undefined) {
      throw new Error("Missing p1 state.");
    }
    const revealed = p1State.deck[0];
    if (revealed === undefined) {
      throw new Error("Missing reveal card in p1 deck.");
    }
    match.state.revealedCards.push({
      id: "reveal:search-reveal:test",
      cards: [
        {
          instanceId: revealed.instanceId,
          cardId: revealed.cardId,
          playerId: p1,
        },
      ],
      visibility: { type: "public" },
      origin: "topOfDeck",
      createdAtStateSeq: match.state.seq,
      cleanupPolicy: "returnToOrigin",
    });

    const catalog = getLocalDevCardCatalogForPlayer(match, p2);

    assert.equal(
      catalog.players[p1]?.cards[revealed.cardId]?.cardId,
      revealed.cardId,
    );
    assert.equal(catalog.players[p2]?.cards[revealed.cardId], undefined);
  });
});
