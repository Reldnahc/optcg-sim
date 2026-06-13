import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  ContinuousEffectRecord,
  InstanceId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../../action-test-fixtures.js";
import { computeView } from "../../view/compute-view.js";

const toCardId = (value: string): CardId => value as CardId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;

const setMainTurnAfterFirstTurn = (
  state: ReturnType<typeof createActiveState>,
): void => {
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
};

const withCharacter = (
  playerId: PlayerId,
  cardId: CardId,
  index: number,
  params: { state?: "active" | "rested" } = {},
): CardInstance => ({
  instanceId: toInstanceId(
    `${String(playerId)}:char:${String(index)}:${String(cardId)}`,
  ),
  cardId,
  owner: playerId,
  controller: playerId,
  zone: { zone: "characterArea", playerId, slot: "character", index },
  state: params.state ?? "active",
  attachedDon: [],
});

const installCharacterMetadata = (
  state: ReturnType<typeof createActiveState>,
  cardId: CardId,
  params: Partial<Pick<ResolvedCard, "printedKeywords">> = {},
): void => {
  const printedKeywords =
    params.printedKeywords === undefined
      ? {}
      : { printedKeywords: params.printedKeywords };
  state.cardManifest.cards[cardId] = resolvedCard({
    cardId,
    category: "character",
    cost: 3,
    power: 3000,
    ...printedKeywords,
  });
};

const attackPermissionRecord = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): ContinuousEffectRecord => ({
  id: "allow-attack-active-characters",
  source: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    playerId: source.controller,
    zone: source.zone,
  },
  sourceSnapshot: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    ownerId: source.owner,
    controllerId: source.controller,
    zone: source.zone,
    category: "character",
    colors: ["red"],
    power: 3000,
    keywords: [],
  },
  controller: source.controller,
  modifier: {
    layer: "attackPermission",
    target: { type: "self" },
    operation: {
      type: "attackPermission",
      permission: "attackActiveCharacters",
    },
  },
  duration: { type: "thisTurn" },
  createdBy: {
    type: "ruleProcess",
    name: "continuous-attack-permission-test",
  },
  createdAtStateSeq: state.seq,
});

test("allowAttackActiveCharacters permission adds active Character attack targets", () => {
  const state = createActiveState();
  setMainTurnAfterFirstTurn(state);
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p1State.characters = [withCharacter(p1, toCardId("char-attacker"), 0)];
  p2State.characters = [
    withCharacter(p2, toCardId("char-active"), 0, { state: "active" }),
    withCharacter(p2, toCardId("char-rested"), 1, { state: "rested" }),
  ];
  const attacker = must(p1State.characters[0], "attacker");
  const activeTarget = must(p2State.characters[0], "active target");
  const restedTarget = must(p2State.characters[1], "rested target");
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  for (const card of [attacker, activeTarget, restedTarget]) {
    installCharacterMetadata(state, card.cardId);
  }

  const withoutPermission = computeView(state);
  assert.deepEqual(withoutPermission.legalAttackTargets[attacker.instanceId], [
    p2State.leader.instanceId,
    restedTarget.instanceId,
  ]);

  state.continuousEffects = [attackPermissionRecord(state, attacker)];

  const withPermission = computeView(state);
  assert.deepEqual(withPermission.legalAttackTargets[attacker.instanceId], [
    p2State.leader.instanceId,
    activeTarget.instanceId,
    restedTarget.instanceId,
  ]);
});
