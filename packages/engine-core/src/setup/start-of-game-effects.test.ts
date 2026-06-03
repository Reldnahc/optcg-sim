import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardRef,
  EffectBlock,
  MatchCardManifest,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";
import { createInitialState } from "./initial-state.js";
import type { PreMulliganSetupGameState } from "./initial-state.js";
import { startMulliganFlow } from "./mulligan.js";
import { resolvedCard } from "../action-test-fixtures.js";

const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

const baseManifest = (): MatchCardManifest => ({
  manifestHash: "manifest-sog",
  source: "manual-test",
  cardDataVersion: "fixture",
  effectDefinitionsVersion: "fixture",
  customHandlerVersion: "fixture",
  banlistVersion: "fixture",
  createdAt: "2026-05-21T00:00:00.000Z",
  cards: (() => {
    const cards = {} as Record<CardId, ResolvedCard>;
    cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
      }),
      support: {
        status: "implemented-dsl",
        cardId: toCardId("leader-red"),
        effectDefinitionId: "leader-red-sog",
        tested: true,
        rulesVersion: "r1",
        sourceTextHash: "leader-red-sog",
        behaviorHash: "leader-red-sog",
        cardDataVersion: "fixture",
      },
    };
    cards[toCardId("p1-stage")] = {
      ...resolvedCard({
        cardId: toCardId("p1-stage"),
        category: "stage",
      }),
      types: ["Navy"],
    };
    return cards;
  })(),
  effectDefinitions: {
    "leader-red-sog": {
      cardId: toCardId("leader-red"),
      implementationStatus: "implemented-dsl",
      metadata: {
        sourceTextHash: "leader-red-sog",
        rulesVersion: "r1",
        effectDefinitionsVersion: "fixture",
        tested: true,
        reviewedBy: "test",
        reviewedAt: "2026-05-21T00:00:00.000Z",
      },
      effects: [
        {
          id: "leader-red:start-of-game-stage" as never,
          category: "auto",
          trigger: { type: "startOfGame" },
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "search",
                  request: {
                    zone: "deck",
                    player: "self",
                    filter: { categories: ["stage"], typesAny: ["Navy"] },
                    min: 0,
                    max: 1,
                    destination: "stageArea",
                    revealTo: "chooserOnly",
                    shuffleAfter: false,
                  },
                },
              },
              {
                connector: "always",
                effect: {
                  type: "playSelected",
                  selection: "selected:start-of-game" as never,
                  ignoreCost: true,
                },
              },
            ],
          },
        },
      ],
    },
  },
});

const createInput = () => ({
  matchId: "match-sog" as never,
  firstPlayerId: p1,
  rngSeed: "seed-sog",
  playerOrder: [p1, p2] as const,
  leaderCardIds: {
    [p1]: toCardId("leader-red"),
    [p2]: toCardId("leader-blue"),
  },
  leaderLifeCounts: { [p1]: 3, [p2]: 3 },
  deckCardIds: {
    [p1]: [
      "p1-stage",
      "p1-a",
      "p1-b",
      "p1-c",
      "p1-d",
      "p1-e",
      "p1-f",
      "p1-g",
      "p1-h",
      "p1-i",
    ].map(toCardId),
    [p2]: [
      "p2-a",
      "p2-b",
      "p2-c",
      "p2-d",
      "p2-e",
      "p2-f",
      "p2-g",
      "p2-h",
      "p2-i",
      "p2-j",
    ].map(toCardId),
  },
  donDeckCardIds: {
    [p1]: ["p1-don-1", "p1-don-2"].map(toCardId),
    [p2]: ["p2-don-1", "p2-don-2"].map(toCardId),
  },
  cardManifest: baseManifest(),
  shuffleDecks: false,
});

const resolveSetupDecision = (
  state: ReturnType<typeof createInitialState>,
  cards: "none" | "first",
) => {
  const decision = must(state.pendingDecision, "setup pending decision");
  if (decision.type !== "selectCards") {
    throw new TypeError("Expected setup selectCards decision.");
  }
  const responseCards =
    cards === "none"
      ? []
      : [must(decision.candidates[0], "setup candidate").card];
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: responseCards },
  });
};

test("canonical setup decision path plays selected Stage before opening hand/life and excludes it from deck/hand/life", () => {
  const setup = createInitialState(createInput());
  const createdEvent = must(
    setup.eventJournal[0],
    "setup decisionCreated event",
  );
  assert.equal(createdEvent.type, "decisionCreated");
  assert.equal(createdEvent.seq, 1);
  const resolved = resolveSetupDecision(setup, "first");
  assert.equal(resolved.errors, undefined);
  const next = resolved.state;
  assert.equal(
    must(next.players[p1], "p1").stage?.cardId,
    toCardId("p1-stage"),
  );
  assert.equal(
    must(next.players[p1], "p1").hand.some(
      (card) => card.cardId === toCardId("p1-stage"),
    ),
    false,
  );
  assert.equal(
    must(next.players[p1], "p1").life.some(
      (lifeCard) => lifeCard.card.cardId === toCardId("p1-stage"),
    ),
    false,
  );
  assert.equal(
    must(next.players[p1], "p1").deck.some(
      (card) => card.cardId === toCardId("p1-stage"),
    ),
    false,
  );
});

test("zero-selection is legal and deterministic through canonical setup decision path", () => {
  const a = resolveSetupDecision(
    createInitialState(createInput()),
    "none",
  ).state;
  const b = resolveSetupDecision(
    createInitialState(createInput()),
    "none",
  ).state;
  assert.equal(hashCanonicalStateValue(a), hashCanonicalStateValue(b));
  assert.equal(must(a.players[p1], "p1").stage, undefined);
});

test("no matching candidate advances setup without impossible decision", () => {
  const input = createInput();
  input.deckCardIds[p1] = [
    "p1-a",
    "p1-b",
    "p1-c",
    "p1-d",
    "p1-e",
    "p1-f",
    "p1-g",
    "p1-h",
    "p1-i",
    "p1-j",
  ].map(toCardId);
  const setup = createInitialState(input);
  const continuation = must(setup.setupContinuation, "setup continuation");
  assert.equal(setup.pendingDecision, undefined);
  assert.equal(continuation.leaderLifeCounts[p1], 3);
  assert.equal(continuation.nextStartOfGamePlanIndex, 1);
});

test("type/deck-position variation resolves via same canonical decision path", () => {
  const input = createInput();
  input.deckCardIds[p1] = [
    "p1-a",
    "p1-b",
    "p1-stage",
    "p1-c",
    "p1-d",
    "p1-e",
    "p1-f",
    "p1-g",
    "p1-h",
    "p1-i",
  ].map(toCardId);
  const setup = createInitialState(input);
  const decision = must(setup.pendingDecision, "setup decision");
  assert.equal(decision.type, "selectCards");
  const selected = must(
    decision.candidates.find(
      (candidate) => candidate.card.cardId === toCardId("p1-stage"),
    ),
    "stage candidate",
  ).card;
  const resolved = applyAction(setup, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(
    must(resolved.state.players[p1], "p1").stage?.cardId,
    toCardId("p1-stage"),
  );
});

test("hidden-info safety: chooser sees candidate action, opponent sees no setup respond action", () => {
  const setup = createInitialState(createInput());
  const ownerView = filterStateForPlayer(setup, p1);
  const opponentView = filterStateForPlayer(setup, p2);
  const setupDecision = must(setup.pendingDecision, "setup decision");
  if (setupDecision.type !== "selectCards") {
    throw new TypeError("Expected setup selectCards decision.");
  }
  const setupCandidate = must(
    setupDecision.candidates[0],
    "setup candidate",
  ).card;
  assert.equal(ownerView.pendingDecision?.type, "selectCards");
  assert.equal(
    ownerView.revealedCards.some((record) =>
      record.cards.some(
        (card) =>
          card.instanceId === setupCandidate.instanceId &&
          card.cardId === setupCandidate.cardId,
      ),
    ),
    true,
  );
  assert.equal(
    opponentView.revealedCards.some((record) =>
      record.cards.some(
        (card) => card.instanceId === setupCandidate.instanceId,
      ),
    ),
    false,
  );
  assert.equal(
    opponentView.legalActions.some(
      (action) => action.type === "respondToDecision",
    ),
    false,
  );
});

test("occupied Stage replacement keeps cardMoved before cardTrashed ordering", () => {
  const input = createInput();
  input.deckCardIds[p1] = [
    "p1-a",
    "p1-stage",
    "p1-b",
    "p1-c",
    "p1-d",
    "p1-e",
    "p1-f",
    "p1-g",
    "p1-h",
    "p1-i",
  ].map(toCardId);
  const setup = createInitialState(input);
  const setupPlayer = must(setup.players[p1], "p1");
  const staged: typeof setup = {
    ...setup,
    players: {
      ...setup.players,
      [p1]: {
        ...setupPlayer,
        stage: {
          ...must(setupPlayer.deck[0], "old-stage"),
          zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
          state: "active",
          attachedDon: [],
        },
      },
    },
  };
  const decision = must(staged.pendingDecision, "setup decision");
  if (decision.type !== "selectCards") {
    throw new TypeError("Expected setup selectCards decision.");
  }
  const stageCandidate = must(
    decision.candidates.find(
      (candidate: (typeof decision.candidates)[number]) =>
        candidate.card.cardId === toCardId("p1-stage"),
    ),
    "stage candidate",
  ).card;
  const resolved = applyAction(staged, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [stageCandidate] },
  });
  const types = resolved.events.map((event) => event.type);
  const movedIndex = types.indexOf("cardMoved");
  const trashedIndex = types.indexOf("cardTrashed");
  assert.ok(movedIndex >= 0 && trashedIndex >= 0 && movedIndex < trashedIndex);
});

test("deterministic event ids/seq and no setup/mulligan id reuse through canonical setup+startMulliganFlow", () => {
  const setupResolved = resolveSetupDecision(
    createInitialState(createInput()),
    "first",
  ).state;
  if (setupResolved.status.type !== "setup") {
    throw new TypeError("Expected setup state before mulligan.");
  }
  const preMulliganState = setupResolved as PreMulliganSetupGameState;
  const mulliganStarted = startMulliganFlow(preMulliganState);
  assert.equal(mulliganStarted.errors, undefined);
  const decisionId = must(
    mulliganStarted.state.pendingDecision,
    "mulligan decision",
  ).id;
  const setupDecisionResolvedEvent = must(
    setupResolved.eventJournal.find(
      (event) => event.type === "decisionResolved",
    ),
    "setup decisionResolved event",
  );
  assert.notEqual(
    String(decisionId),
    String(
      (setupDecisionResolvedEvent.payload as { decisionId?: string })
        .decisionId,
    ),
  );
  assert.equal(
    setupResolved.eventJournal.every((event, index) => event.seq === index + 1),
    true,
  );
  assert.equal(
    mulliganStarted.state.eventJournal.every(
      (event, index) => event.seq === index + 1,
    ),
    true,
  );
});

test("unsupported startOfGame DSL fails closed at createInitialState", () => {
  const input = createInput();
  const manifest = input.cardManifest;
  const definition = must(
    manifest.effectDefinitions?.["leader-red-sog"],
    "leader-red-sog definition",
  );
  const firstBlock = must(definition.effects[0], "startOfGame block");
  const malformedBlock: EffectBlock = {
    id: "leader-red:malformed-start-of-game" as never,
    category: firstBlock.category,
    trigger: firstBlock.trigger,
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "search",
            request: {
              zone: "deck",
              player: "self",
              filter: { categories: ["stage"], typesAny: ["Navy"] },
              min: 0,
              max: 1,
              destination: "stageArea",
              revealTo: "chooserOnly",
              shuffleAfter: false,
            },
          },
        },
      ],
    },
  };
  definition.effects = [malformedBlock];
  assert.throws(
    () => createInitialState(input),
    /effectRuntimeError|unsupported/i,
  );
});

test("implemented-dsl leader missing effect definition fails closed at setup", () => {
  const input = createInput();
  delete input.cardManifest.effectDefinitions?.["leader-red-sog"];
  assert.throws(() => createInitialState(input), /effectRuntimeError|missing/i);
});

test("multi-step setup decisions keep contiguous seq and unique decision ids", () => {
  const input = createInput();
  input.cardManifest.cards[toCardId("leader-blue")] = {
    ...resolvedCard({
      cardId: toCardId("leader-blue"),
      category: "leader",
    }),
    support: {
      status: "implemented-dsl",
      cardId: toCardId("leader-blue"),
      effectDefinitionId: "leader-blue-sog",
      tested: true,
      rulesVersion: "r1",
      sourceTextHash: "leader-blue-sog",
      behaviorHash: "leader-blue-sog",
      cardDataVersion: "fixture",
    },
  };
  input.cardManifest.cards[toCardId("p2-stage")] = {
    ...resolvedCard({
      cardId: toCardId("p2-stage"),
      category: "stage",
    }),
    types: ["Navy"],
  };
  const effectDefinitions = must(
    input.cardManifest.effectDefinitions,
    "effect definitions",
  );
  effectDefinitions["leader-blue-sog"] = {
    cardId: toCardId("leader-blue"),
    implementationStatus: "implemented-dsl",
    metadata: {
      sourceTextHash: "leader-blue-sog",
      rulesVersion: "r1",
      effectDefinitionsVersion: "fixture",
      tested: true,
      reviewedBy: "test",
      reviewedAt: "2026-05-21T00:00:00.000Z",
    },
    effects: [
      {
        id: "leader-blue:start-of-game-stage" as never,
        category: "auto",
        trigger: { type: "startOfGame" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "search",
                request: {
                  zone: "deck",
                  player: "self",
                  filter: { categories: ["stage"], typesAny: ["Navy"] },
                  min: 0,
                  max: 1,
                  destination: "stageArea",
                  revealTo: "chooserOnly",
                  shuffleAfter: false,
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "playSelected",
                selection: "selected:start-of-game" as never,
                ignoreCost: true,
              },
            },
          ],
        },
      },
    ],
  };
  input.deckCardIds[p2] = [
    "p2-stage",
    "p2-a",
    "p2-b",
    "p2-c",
    "p2-d",
    "p2-e",
    "p2-f",
    "p2-g",
    "p2-h",
    "p2-i",
  ].map(toCardId);

  const setup = createInitialState(input);
  const firstDecision = must(setup.pendingDecision, "first decision");
  if (firstDecision.type !== "selectCards") {
    throw new TypeError("Expected first setup selectCards decision.");
  }
  const firstDecisionId = firstDecision.id;
  const first = applyAction(setup, {
    type: "respondToDecision",
    decisionId: firstDecisionId,
    response: {
      type: "cards",
      cards: [must(firstDecision.candidates[0], "first candidate").card],
    },
  });

  assert.equal(first.errors, undefined);
  const secondDecisionId = must(
    first.state.pendingDecision,
    "second decision",
  ).id;
  assert.notEqual(String(firstDecisionId), String(secondDecisionId));
  assert.equal(
    first.events.every(
      (event, index) => event.seq === setup.eventJournal.length + index + 1,
    ),
    true,
  );
  assert.equal(
    first.state.eventJournal.every((event, index) => event.seq === index + 1),
    true,
  );
  assert.equal(
    first.events.every(
      (event) => Number(event.createdAtStateSeq) === Number(setup.seq) + 1,
    ),
    true,
  );
});

test("setup selection rejects malformed card ref payloads that only spoof instanceId", () => {
  const setup = createInitialState(createInput());
  const decision = must(setup.pendingDecision, "setup decision");
  if (decision.type !== "selectCards") {
    throw new TypeError("Expected setup selectCards decision.");
  }
  const candidate = must(decision.candidates[0], "candidate").card;
  const malformed = {
    instanceId: candidate.instanceId,
  } as unknown as CardRef;
  const before = hashCanonicalStateValue(setup);
  const result = applyAction(setup, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [malformed] },
  });
  assert.equal(result.errors?.[0]?.type, "invalidDecisionResponse");
  assert.deepEqual(result.events, []);
  assert.equal(result.stateHash, before);
});

test("setup selection rejects malformed cards payload entries like null and zone null", () => {
  const setup = createInitialState(createInput());
  const decision = must(setup.pendingDecision, "setup decision");
  if (decision.type !== "selectCards") {
    throw new TypeError("Expected setup selectCards decision.");
  }
  const invalidResponses = [
    { type: "cards" as const, cards: [null] as unknown[] },
    {
      type: "cards" as const,
      cards: [
        {
          ...must(decision.candidates[0], "candidate").card,
          zone: null,
        },
      ],
    },
  ];
  for (const response of invalidResponses) {
    const before = hashCanonicalStateValue(setup);
    const result = applyAction(setup, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: response as unknown as { type: "cards"; cards: CardRef[] },
    });
    assert.equal(result.errors?.[0]?.type, "invalidDecisionResponse");
    assert.deepEqual(result.events, []);
    assert.equal(result.stateHash, before);
  }
});
