import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  GameState,
  Protection,
  ProtectionFieldRemovalClassification,
  ReplacementProcess,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import { toCardRef } from "../actions/state.js";
import { applyFieldRemovalProtection } from "./field-removal-protection.js";

const fieldRemovalProtection = (
  classification: ProtectionFieldRemovalClassification,
): Protection => ({
  process: "fieldRemoval",
  fieldRemoval: {
    processFamily: "fieldRemoval",
    classification,
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    targetScope: "thisCard",
    exclusions: {
      battleKO: "excluded",
      ruleProcessTrash: "excluded",
      controllerCost: "excluded",
      controllerOwnedEffect: "excluded",
      ambiguousCustomRemoval: "failClosed",
    },
  },
});

const setupProtectedCharacter = (
  protection: Protection,
): { state: GameState; target: CardInstance } => {
  const state = createActiveState();
  const player = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(player.hand[0], "target"),
    zone: "characterArea",
  });
  state.continuousEffects = [
    {
      id: `field-removal-protection:${String(target.instanceId)}`,
      source: toCardRef(target, p2),
      sourceSnapshot: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        ownerId: target.owner,
        controllerId: target.controller,
        zone: target.zone,
        category: "character",
        colors: ["red"],
        power: 3000,
        keywords: [],
      },
      controller: target.controller,
      modifier: {
        layer: "protection",
        target: { type: "self" },
        operation: { type: "protection", protection },
      },
      duration: { type: "permanent" },
      createdBy: { type: "ruleProcess", name: "broad-protection-test" },
      createdAtStateSeq: state.seq,
    },
  ];
  return { state, target };
};

const fieldRemovalProcess = (
  target: CardInstance,
  classification: ProtectionFieldRemovalClassification,
  sourceControllerId = p1,
  sourceKind: "cardEffect" | "cost" = "cardEffect",
): ReplacementProcess => ({
  id: `field-removal:${String(target.instanceId)}`,
  type: "moveZone",
  source: toCardRef(target, target.controller),
  target: toCardRef(target, target.controller),
  payload: {
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification,
      sourceKind,
      sourceControllerId,
    },
  },
  causedBy: { type: "ruleProcess", name: "broad-protection-test" },
  usedReplacementIds: [],
});

const koProcess = (
  target: CardInstance,
  sourceControllerId = p1,
  sourceKind: "cardEffect" | "cost" = "cardEffect",
): ReplacementProcess => ({
  ...fieldRemovalProcess(
    target,
    "moveFromFieldToTrash",
    sourceControllerId,
    sourceKind,
  ),
  type: "ko",
});

test("broad field-removal protection blocks opponent effect removal to any other zone", () => {
  const { state, target } = setupProtectedCharacter(
    fieldRemovalProtection("moveFromFieldToOtherZone"),
  );

  for (const classification of [
    "moveFromFieldToTrash",
    "moveFromFieldToHand",
    "moveFromFieldToDeck",
    "moveFromFieldToLife",
  ] satisfies ProtectionFieldRemovalClassification[]) {
    assert.deepEqual(
      applyFieldRemovalProtection(
        state,
        target,
        fieldRemovalProcess(target, classification),
      ),
      { ok: true, prevented: true },
    );
  }
});

test("broad field-removal protection still excludes controller costs", () => {
  const { state, target } = setupProtectedCharacter(
    fieldRemovalProtection("moveFromFieldToOtherZone"),
  );

  assert.deepEqual(
    applyFieldRemovalProtection(
      state,
      target,
      fieldRemovalProcess(target, "moveFromFieldToTrash", p2, "cost"),
    ),
    { ok: true, prevented: false },
  );
});

test("KO protection blocks matching opponent effect K.O. without blocking controller effects", () => {
  const { state, target } = setupProtectedCharacter({
    process: "ko",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
  });

  assert.deepEqual(
    applyFieldRemovalProtection(state, target, koProcess(target)),
    {
      ok: true,
      prevented: true,
    },
  );
  assert.deepEqual(
    applyFieldRemovalProtection(state, target, koProcess(target, p2)),
    { ok: true, prevented: false },
  );
});
