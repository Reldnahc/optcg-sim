import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardRef,
  EffectId,
  PlayerId,
  ReplacementTrigger,
  Target,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../../action-test-fixtures.js";
import { buildKoReplacementProcess } from "../field-removal-process/builders.js";
import { opponentReplacementCoveredTargets } from "./applicability.js";
import type { SupportedReplacementEffectBlock } from "./types.js";

const toEffectId = (value: string): EffectId => value as EffectId;

const cardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

test("opponent field-removal replacement evaluates shared turn conditions", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = {
    ...must(p2State.hand[0], "replacement source"),
    zone: {
      zone: "characterArea" as const,
      playerId: p2,
      slot: "character" as const,
      index: 0,
    },
    state: "active" as const,
    attachedDon: [],
  };
  const target = {
    ...must(p2State.hand[1], "replacement target"),
    zone: {
      zone: "characterArea" as const,
      playerId: p2,
      slot: "character" as const,
      index: 1,
    },
    state: "active" as const,
    attachedDon: [],
  };
  const effectSource = {
    ...must(p1State.hand[0], "effect source"),
    zone: {
      zone: "characterArea" as const,
      playerId: p1,
      slot: "character" as const,
      index: 0,
    },
    state: "active" as const,
    attachedDon: [],
  };
  p1State.characters = [effectSource];
  p2State.characters = [source, target];

  const replacementTarget: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: { categories: ["character"] },
  };
  const when: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceKind: "cardEffect",
    target: replacementTarget,
  };
  const effect: SupportedReplacementEffectBlock = {
    id: toEffectId("replacement:opponent-turn-rest-self"),
    category: "replacement",
    trigger: { type: "replacement", replacement: when },
    optional: true,
    condition: { type: "opponentTurn" },
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    effect: {
      type: "replacement",
      when,
      instead: { type: "rest", target: { type: "self" } },
    },
  };
  const resolvedSource = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
  });
  const resolvedTarget = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 5000,
  });
  state.cardManifest.cards[source.cardId] = resolvedSource;
  state.cardManifest.cards[target.cardId] = resolvedTarget;
  const process = buildKoReplacementProcess({
    id: "replacement-process:opponent-turn",
    effectId: "ko-target",
    source: cardRef(effectSource, p1),
    sourceControllerId: p1,
    sourceKind: "cardEffect",
    target: cardRef(target, p2),
    causedBy: { type: "ruleProcess", name: "replacement-condition-test" },
  });
  const locatedSource = {
    card: source,
    playerId: p2,
    ref: cardRef(source, p2),
    resolved: resolvedSource,
  };
  const validatedTargets = [
    {
      located: { card: target, playerId: p2, zone: "characterArea" as const },
      ref: cardRef(target, p2),
      resolved: resolvedTarget,
    },
  ];

  state.turn.turnPlayerId = p1;
  assert.deepEqual(
    opponentReplacementCoveredTargets(
      state,
      process,
      locatedSource,
      validatedTargets,
      effect,
    ),
    [cardRef(target, p2)],
  );

  state.turn.turnPlayerId = p2;
  assert.deepEqual(
    opponentReplacementCoveredTargets(
      state,
      process,
      locatedSource,
      validatedTargets,
      effect,
    ),
    [],
  );
});
