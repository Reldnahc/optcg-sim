import assert from "node:assert/strict";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
  getLegalActions,
  hashCanonicalStateValue,
  respondToMulliganDecision,
  enterMainPhase,
} from "@optcg/engine-core";
import type {
  CardId,
  CardInstance,
  GameState,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";
import { describe, test } from "vitest";

import { bootFixtureMatch } from "./boot.js";
import { dispatchCliCommand, parseCliCommand } from "./commands.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

const keepPendingMulligan = (state: GameState): GameState => {
  const decision = state.pendingDecision;
  assert.equal(decision?.type, "mulligan");
  const result = respondToMulliganDecision(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "mulligan", keep: true },
  });
  assert.equal(result.errors, undefined);
  return result.state;
};

const bootActiveFixtureMatch = (): GameState =>
  keepPendingMulligan(keepPendingMulligan(bootFixtureMatch().state));

const bootMainPhaseFixtureMatch = (): GameState => {
  const active = bootActiveFixtureMatch();
  const refresh = advanceRefreshPhase(active);
  assert.equal(refresh.errors, undefined);
  const draw = advanceDrawPhase(refresh.state);
  assert.equal(draw.errors, undefined);
  const don = advanceDonPhase(draw.state);
  assert.equal(don.errors, undefined);
  const main = enterMainPhase(don.state);
  assert.equal(main.errors, undefined);
  return main.state;
};

const bootAttackFixtureMatch = (): GameState => {
  const state = bootMainPhaseFixtureMatch();
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  must(state.players[p1], "p1").leader.state = "active";
  must(state.players[p2], "p2").leader.state = "active";
  return state;
};

const stateSnapshot = (state: GameState): string => JSON.stringify(state);

const resolvedCard = (params: {
  cardId: CardId;
  category: "character" | "stage";
  cost?: number;
  power?: number;
  supportStatus?: ResolvedCard["support"]["status"];
}): ResolvedCard => ({
  cardId: params.cardId,
  language: "en",
  name: String(params.cardId),
  category: params.category,
  set: "TEST",
  setName: "Test Set",
  released: true,
  colors: ["red"],
  attributes: [],
  types: [],
  printedKeywords: [],
  variants: [],
  legality: {},
  officialFaq: [],
  errata: [],
  sourceTextHash: "source-hash",
  behaviorHash: "behavior-hash",
  support: {
    cardId: params.cardId,
    status: params.supportStatus ?? "vanilla-confirmed",
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: "fixture",
    sourceTextHash: "source-hash",
    behaviorHash: "behavior-hash",
  },
  ...(params.cost !== undefined ? { cost: params.cost } : {}),
  ...(params.power !== undefined ? { power: params.power } : {}),
});

const assertSummaryOutput = (output: string): void => {
  assert.match(output, /State seq: \d+/u);
  assert.match(output, /Status: /u);
  assert.match(output, /Phase: /u);
  assert.match(output, /Pending decision: /u);
  assert.match(output, /Legal actions for /u);
  assert.match(output, /State hash: /u);
};

describe("parseCliCommand", () => {
  test("parses every minimum CLI command shape deterministically", () => {
    assert.deepEqual(parseCliCommand("show"), {
      ok: true,
      command: { type: "show" },
    });
    assert.deepEqual(parseCliCommand("hand"), {
      ok: true,
      command: { type: "hand" },
    });
    assert.deepEqual(parseCliCommand("play 0"), {
      ok: true,
      command: { type: "play", handIndex: 0 },
    });
    assert.deepEqual(parseCliCommand("attach-don 1 leader"), {
      ok: true,
      command: { type: "attach-don", donIndex: 1, target: "leader" },
    });
    assert.deepEqual(parseCliCommand("attack leader opponent-leader"), {
      ok: true,
      command: {
        type: "attack",
        attacker: "leader",
        target: "opponent-leader",
      },
    });
    assert.deepEqual(parseCliCommand("counter 2"), {
      ok: true,
      command: { type: "counter", handIndex: 2 },
    });
    assert.deepEqual(parseCliCommand("pass"), {
      ok: true,
      command: { type: "pass" },
    });
    assert.deepEqual(parseCliCommand("respond keep"), {
      ok: true,
      command: { type: "respond", choice: "keep" },
    });
    assert.deepEqual(parseCliCommand("concede"), {
      ok: true,
      command: { type: "concede" },
    });
    assert.deepEqual(parseCliCommand("hash"), {
      ok: true,
      command: { type: "hash" },
    });
  });

  test("rejects invalid command shapes deterministically", () => {
    assert.deepEqual(parseCliCommand(""), {
      ok: false,
      error: "No command provided.",
    });
    assert.deepEqual(parseCliCommand("show extra"), {
      ok: false,
      error: "show does not accept arguments.",
    });
    assert.deepEqual(parseCliCommand("play -1"), {
      ok: false,
      error: "play requires a non-negative integer handIndex.",
    });
    assert.deepEqual(parseCliCommand("attach-don x leader"), {
      ok: false,
      error: "attach-don requires a non-negative integer donIndex.",
    });
    assert.deepEqual(parseCliCommand("attack leader"), {
      ok: false,
      error: "attack requires <attacker> and <target>.",
    });
    assert.deepEqual(parseCliCommand("respond"), {
      ok: false,
      error: "respond requires <choice>.",
    });
    assert.deepEqual(parseCliCommand("dance"), {
      ok: false,
      error: "Unsupported command: dance.",
    });
  });
});

describe("dispatchCliCommand", () => {
  test("renders show, hand, and hash without mutating state", () => {
    const state = bootFixtureMatch().state;
    const before = stateSnapshot(state);
    const beforeHash = hashCanonicalStateValue(state);

    const show = dispatchCliCommand(state, "show");
    const hand = dispatchCliCommand(state, "hand", { playerId: p1 });
    const hash = dispatchCliCommand(state, "hash");

    assert.equal(show.state, state);
    assert.equal(hand.state, state);
    assert.equal(hash.state, state);
    assert.equal(stateSnapshot(state), before);
    assert.equal(show.stateHash, beforeHash);
    assert.equal(hand.stateHash, beforeHash);
    assert.equal(hash.output, `State hash: ${beforeHash}`);
    assert.match(show.output, /Developer-local terminal state/u);
    assert.match(hand.output, /Developer-local hand for p1/u);
  });

  test("dispatches respond keep and respond mulligan for pending mulligan decisions", () => {
    const keepState = bootFixtureMatch().state;
    const keep = dispatchCliCommand(keepState, "respond keep");
    assert.equal(keep.errors.length, 0);
    assert.equal(keep.state.seq, 2);
    assert.equal(keep.state.pendingDecision?.playerId, p2);
    assertSummaryOutput(keep.output);

    const mulliganState = bootFixtureMatch().state;
    const beforeHand = must(mulliganState.players[p1], "p1").hand.map(
      (card: CardInstance) => card.instanceId,
    );
    const mulligan = dispatchCliCommand(mulliganState, "respond mulligan");
    const afterHand = must(mulligan.state.players[p1], "p1").hand.map(
      (card: CardInstance) => card.instanceId,
    );
    assert.equal(mulligan.errors.length, 0);
    assert.equal(mulligan.state.seq, 2);
    assert.equal(must(mulligan.state.players[p1], "p1").hasMulliganed, true);
    assert.notDeepEqual(afterHand, beforeHand);
    assertSummaryOutput(mulligan.output);
  });

  test("fails closed without mutation for unsupported respond choices or no pending decision", () => {
    const pending = bootFixtureMatch().state;
    const pendingBefore = stateSnapshot(pending);
    const unsupported = dispatchCliCommand(pending, "respond maybe");
    assert.equal(unsupported.state, pending);
    assert.deepEqual(unsupported.errors, [
      "Unsupported respond choice: maybe.",
    ]);
    assert.equal(stateSnapshot(pending), pendingBefore);

    const active = bootActiveFixtureMatch();
    const activeBefore = stateSnapshot(active);
    const noDecision = dispatchCliCommand(active, "respond keep");
    assert.equal(noDecision.state, active);
    assert.deepEqual(noDecision.errors, [
      "No supported pending decision for respond keep.",
    ]);
    assert.equal(stateSnapshot(active), activeBefore);
  });

  test("dispatches pass through the end-main-phase action path", () => {
    const state = bootMainPhaseFixtureMatch();
    const result = dispatchCliCommand(state, "pass");

    assert.equal(result.errors.length, 0);
    assert.equal(result.state.turn.phase, "refresh");
    assert.equal(result.state.turn.turnPlayerId, p2);
    assert.equal(result.state.seq, state.seq + 1);
    assertSummaryOutput(result.output);
  });

  test("dispatches attach-don using deterministic cost-area and target references", () => {
    const state = bootMainPhaseFixtureMatch();
    const turnPlayer = must(state.players[p1], "p1");
    const don = must(turnPlayer.costArea[0], "cost area 0");

    const result = dispatchCliCommand(state, "attach-don 0 leader");

    assert.equal(result.errors.length, 0);
    assert.deepEqual(must(result.state.players[p1], "p1").leader.attachedDon, [
      don.instanceId,
    ]);
    assert.equal(
      must(result.state.players[p1], "p1").costArea[0]?.state,
      undefined,
    );
    assertSummaryOutput(result.output);
  });

  test("dispatches attack using deterministic attacker and target references", () => {
    const state = bootAttackFixtureMatch();
    const beforeLife = must(state.players[p2], "p2").life.length;

    const result = dispatchCliCommand(state, "attack leader opponent-leader");

    assert.equal(result.errors.length, 0);
    assert.equal(must(result.state.players[p1], "p1").leader.state, "rested");
    assert.equal(
      must(result.state.players[p2], "p2").life.length,
      beforeLife - 1,
    );
    assertSummaryOutput(result.output);
  });

  test("dispatches play using the selected hand card instance id", () => {
    const state = bootMainPhaseFixtureMatch();
    const actor = must(state.players[p1], "p1");
    const character = must(actor.hand[0], "hand 0");
    state.cardManifest.cards[character.cardId] = resolvedCard({
      cardId: character.cardId,
      category: "character",
      cost: 0,
      power: 2000,
    });

    const result = dispatchCliCommand(state, "play 0");

    assert.equal(result.errors.length, 0);
    assert.equal(
      must(result.state.players[p1], "p1").characters[0]?.instanceId,
      character.instanceId,
    );
    assert.equal(
      must(result.state.players[p1], "p1").hand.some(
        (card) => card.instanceId === character.instanceId,
      ),
      false,
    );
    assert.deepEqual(
      result.events.map((event) => event.type),
      ["cardRevealed", "cardMoved", "cardPlayed", "ruleProcessingChecked"],
    );
    assertSummaryOutput(result.output);
  });

  test("surfaces pending engine decisions created by play", () => {
    const state = bootMainPhaseFixtureMatch();
    const actor = must(state.players[p1], "p1");
    const character = must(actor.hand[0], "hand 0");
    state.cardManifest.cards[character.cardId] = resolvedCard({
      cardId: character.cardId,
      category: "character",
      cost: 1,
      power: 3000,
    });

    const result = dispatchCliCommand(state, "play 0");

    assert.equal(result.errors.length, 0);
    assert.equal(result.state.pendingDecision?.type, "payCost");
    assert.equal(result.state.pendingDecision.playerId, p1);
    assert.match(result.output, /Pending decision: payCost /u);
    assert.match(result.output, /Legal actions for p1:/u);
    assert.match(result.output, /respond-to-decision decision=/u);
    assertSummaryOutput(result.output);
  });

  test("fails closed without mutation for stale play hand indexes", () => {
    const state = bootMainPhaseFixtureMatch();
    const before = stateSnapshot(state);
    const beforeHash = hashCanonicalStateValue(state);

    const result = dispatchCliCommand(state, "play 99");

    assert.equal(result.state, state);
    assert.equal(result.stateHash, beforeHash);
    assert.equal(stateSnapshot(state), before);
    assert.deepEqual(result.errors, ["No hand card at index 99 for p1."]);
    assert.match(result.output, /CLI errors:\n {2}No hand card at index 99/u);
    assertSummaryOutput(result.output);
  });

  test("surfaces illegal engine playCard errors without CLI-only mutation", () => {
    const state = bootMainPhaseFixtureMatch();
    const actor = must(state.players[p1], "p1");
    const unsupported = must(actor.hand[0], "hand 0");
    state.cardManifest.cards[unsupported.cardId] = resolvedCard({
      cardId: unsupported.cardId,
      category: "character",
      cost: 0,
      power: 2000,
      supportStatus: "unsupported",
    });
    const before = stateSnapshot(state);
    const beforeHash = hashCanonicalStateValue(state);
    assert.equal(
      getLegalActions(state, p1).some(
        (action) =>
          action.type === "playCard" &&
          action.cardInstanceId === unsupported.instanceId,
      ),
      false,
    );

    const result = dispatchCliCommand(state, "play 0");

    assert.equal(result.state, state);
    assert.equal(result.stateHash, beforeHash);
    assert.equal(stateSnapshot(state), before);
    assert.deepEqual(result.errors, [
      "illegalAction: playCard card is unsupported.",
    ]);
    assert.match(
      result.output,
      /Engine errors:\n {2}illegalAction: playCard card is unsupported/u,
    );
    assertSummaryOutput(result.output);
  });

  test("dispatches concede through the engine action path", () => {
    const state = bootFixtureMatch().state;
    const result = dispatchCliCommand(state, "concede");

    assert.equal(result.errors.length, 0);
    assert.deepEqual(result.state.status, { type: "completed", winner: p2 });
    assert.equal(result.state.pendingDecision, undefined);
    assertSummaryOutput(result.output);
  });

  test("recognizes counter but fails closed without mutation", () => {
    const state = bootFixtureMatch().state;
    const before = stateSnapshot(state);

    const counter = dispatchCliCommand(state, "counter 0");

    assert.equal(counter.state, state);
    assert.deepEqual(counter.errors, [
      "counter 0 is unsupported by the current CLI story.",
    ]);
    assert.match(counter.output, /CLI errors:\n {2}counter 0 is unsupported/u);
    assert.equal(stateSnapshot(state), before);
  });

  test("preserves illegal engine-core action results without mutating prior state or hash", () => {
    const state = bootFixtureMatch().state;
    const before = stateSnapshot(state);
    const beforeHash = hashCanonicalStateValue(state);

    const result = dispatchCliCommand(state, "pass");

    assert.equal(result.state, state);
    assert.equal(result.stateHash, beforeHash);
    assert.equal(stateSnapshot(state), before);
    assert.deepEqual(result.errors, [
      "illegalAction: Phase actions are illegal while a decision is pending.",
    ]);
    assert.match(result.output, /Engine errors:/u);
    assertSummaryOutput(result.output);
  });
});
