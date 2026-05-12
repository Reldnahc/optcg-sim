import { describe, expect, test } from "vitest";
import type {
  CardInstance,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import { applyAction, getLegalActions } from "./actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "./action-test-fixtures.js";
import {
  setupAttackState,
  setupOpenedCounterStepPassDecision,
} from "./battle-actions-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";
import { queueDrawForP1 } from "./effect-runtime-queue-processing-test-support.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";
import { setupMainPlayState } from "./play-card-test-fixtures.js";

const unsupportedSupport = { status: "unsupported" as const, tested: false };

const installUnsupportedHandCard = (
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  card: Omit<Parameters<typeof resolvedCard>[0], "cardId">,
): CardInstance => {
  const player = must(state.players[playerId], "player");
  const handCard = must(player.hand[0], "hand card");
  const unsupportedCard = { ...handCard, cardId: toCardId(cardId) };
  player.hand[0] = unsupportedCard;
  state.cardManifest.cards[unsupportedCard.cardId] = resolvedCard({
    ...card,
    cardId: unsupportedCard.cardId,
    support: unsupportedSupport,
  });
  return unsupportedCard;
};

const expectFailClosedWithoutMutation = (
  state: GameState,
  result: EngineResult,
  beforeStateJson: string,
) => {
  expect(result.errors?.length).toBeGreaterThan(0);
  expect(result.events).toEqual([]);
  expect(JSON.stringify(state)).toBe(beforeStateJson);
  expect(JSON.stringify(result.state)).toBe(beforeStateJson);
};

describe("unsupported non-vanilla closeout", () => {
  test("unsupported non-vanilla Characters do not become legal play actions", () => {
    const state = setupMainPlayState();
    const card = installUnsupportedHandCard(
      state,
      p1,
      "unsupported-on-play-character",
      {
        category: "character",
        cost: 0,
        power: 3000,
        effectText: "[On Play] Draw 1 card.",
      },
    );

    const legalActions = getLegalActions(state, p1);
    expect(legalActions.some((action) => action.type === "playCard")).toBe(
      false,
    );

    const beforeStateJson = JSON.stringify(state);
    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });

    expect(result.errors).toEqual([
      { type: "illegalAction", reason: "playCard card is unsupported." },
    ]);
    expectFailClosedWithoutMutation(state, result, beforeStateJson);
  });

  test("unsupported Main Events do not become legal play actions", () => {
    const state = setupMainPlayState();
    const card = installUnsupportedHandCard(
      state,
      p1,
      "unsupported-main-event",
      {
        category: "event",
        cost: 0,
        effectText: "[Main] Draw 1 card.",
      },
    );

    const legalActions = getLegalActions(state, p1);
    expect(legalActions.some((action) => action.type === "playCard")).toBe(
      false,
    );

    const beforeStateJson = JSON.stringify(state);
    const result = applyAction(state, {
      type: "playCard",
      cardInstanceId: card.instanceId,
    });

    expect(result.errors).toEqual([
      { type: "illegalAction", reason: "playCard card is unsupported." },
    ]);
    expectFailClosedWithoutMutation(state, result, beforeStateJson);
  });

  test("unsupported Counter Events do not become legal counter actions", () => {
    const { openedState, counterCard } = setupOpenedCounterStepPassDecision();
    openedState.cardManifest.cards[counterCard.cardId] = resolvedCard({
      cardId: counterCard.cardId,
      category: "event",
      cost: 0,
      effectText: "[Counter] +1000.",
      support: unsupportedSupport,
    });

    const legalActions = getLegalActions(openedState, p2);
    expect(legalActions.some((action) => action.type === "useCounter")).toBe(
      false,
    );

    const beforeStateJson = JSON.stringify(openedState);
    const result = applyAction(openedState, {
      type: "useCounter",
      cardInstanceId: counterCard.instanceId,
      target: must(openedState.battle, "battle").currentTarget,
    });

    expect(result.errors).toEqual([
      {
        type: "illegalAction",
        reason: "Counter Events are unsupported in the Counter Step.",
      },
    ]);
    expectFailClosedWithoutMutation(openedState, result, beforeStateJson);
  });

  test("attacker PlayerView legal actions do not reveal unsupported defender Counter Events", () => {
    const state = setupAttackState();
    const beforeView = filterStateForPlayer(state, p1);
    const defender = must(state.players[p2], "p2");
    const counterEvent = must(defender.hand[0], "counter event");
    state.cardManifest.cards[counterEvent.cardId] = resolvedCard({
      cardId: counterEvent.cardId,
      category: "event",
      cost: 0,
      effectText: "[Counter] +1000.",
      support: unsupportedSupport,
    });

    const afterView = filterStateForPlayer(state, p1);

    expect(afterView.legalActions).toEqual(beforeView.legalActions);
    expect(
      afterView.legalActions.some((action) => action.type === "declareAttack"),
    ).toBe(true);
    expect(
      JSON.stringify(afterView).includes(String(counterEvent.cardId)),
    ).toBe(false);
  });

  test("queued effects from unsupported cards fail closed without runtime events", () => {
    const state = createActiveState();
    const queuedEffect = queueDrawForP1();
    state.effectQueue = [queuedEffect];
    state.cardManifest.cards[queuedEffect.source.cardId] = resolvedCard({
      cardId: queuedEffect.source.cardId,
      category: "character",
      cost: 0,
      power: 3000,
      effectText: "[On Play] Draw 1 card.",
      support: unsupportedSupport,
    });

    const beforeStateJson = JSON.stringify(state);
    const result = processEffectRuntime(state);

    expect(result.errors?.[0]).toMatchObject({
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
    });
    expectFailClosedWithoutMutation(state, result, beforeStateJson);
  });
});
