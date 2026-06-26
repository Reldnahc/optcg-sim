import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Condition,
  EffectQueueEntry,
  Protection,
  ReplacementProcess,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { computeView } from "../view/compute-view.js";
import { setupFullCharacterPlayState } from "../play-card/test-fixtures.js";
import {
  buildSelectedTargetKoReplacementProcess,
  executeSelectedTargetEffectPrimitive,
  executeUnreplacedSelectedTargetKoProcess,
} from "../runtime/primitives/execute.js";
import { applyFieldRemovalProtection } from "./field-removal-protection.js";
import {
  appendSelfFieldRemovalProtection,
  applyPlayCardTestAction,
  attachOnKODrawEffect,
  attachReviewedKoReplacement,
  fieldRemovalProtection,
  koChooseEffect,
  moveP2HandCardToTrash,
  must,
  p1,
  p2,
  permanentDslProtectionDefinition,
  protectTargetFromOpponentEffectRemoval,
  replaceFieldRemovalAttemptPayload,
  setupFieldRemovalProtectionState,
} from "./field-removal-protection.test-support.js";
test("computeView exposes supported field-removal protection without mutating state", () => {
  const { state, target } = setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(state, target);
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const view = computeView(state);

  assert.deepEqual(view.cards[target.instanceId]?.protectedFrom, [
    fieldRemovalProtection(),
  ]);
  assert.deepEqual(state, before);
  assert.equal(hashCanonicalStateValue(state), beforeHash);
});

test("opponent effect field removal is prevented for a protected Character before mutation", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(state, target);
  const before = structuredClone(state);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(hashCanonicalStateValue(result.state), result.stateHash);
  assert.deepEqual(state, before);
});

test("false self trashCount condition leaves opponent effect field removal unprotected", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(
    state,
    target,
    fieldRemovalProtection(),
    {
      type: "trashCount",
      player: "self",
      op: "gte",
      value: 1,
    },
  );

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardKOd", "cardMoved", "donReturned"],
  );
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(nextP2.trash[0]?.instanceId, target.instanceId);
});

test("true self trashCount condition prevents opponent effect field removal before mutation", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  moveP2HandCardToTrash(state);
  protectTargetFromOpponentEffectRemoval(
    state,
    target,
    fieldRemovalProtection(),
    {
      type: "trashCount",
      player: "self",
      op: "gte",
      value: 1,
    },
  );
  const before = structuredClone(state);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.deepEqual(state, before);
});

test("reviewed permanent DSL protection prevents opponent effect field removal at threshold", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  moveP2HandCardToTrash(state);
  state.cardManifest.cards[target.cardId] = {
    ...must(state.cardManifest.cards[target.cardId], "target card"),
    support: {
      cardId: target.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:permanent:dsl:protection",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:permanent:dsl:protection": permanentDslProtectionDefinition(
      target.cardId,
    ),
  };

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
});

test("reviewed permanent DSL protection does not prevent below threshold", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  state.cardManifest.cards[target.cardId] = {
    ...must(state.cardManifest.cards[target.cardId], "target card"),
    support: {
      cardId: target.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:permanent:dsl:protection",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:permanent:dsl:protection": permanentDslProtectionDefinition(
      target.cardId,
    ),
  };

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");
  assert.equal(result.errors, undefined);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
});

test("inactive whileSourceOnField source-dependent protection disappears instead of blocking unrelated field removal", () => {
  const { state, target, targetRef, sourceOnField } =
    setupFieldRemovalProtectionState();
  appendSelfFieldRemovalProtection(
    state,
    sourceOnField,
    fieldRemovalProtection(),
    {
      type: "attachedDonCount",
      target: { type: "self" },
      op: "gte",
      value: 1,
    },
    { type: "whileSourceOnField" },
  );
  const p1State = must(state.players[p1], "p1");
  p1State.characters = [];
  p1State.trash = [
    {
      ...sourceOnField,
      zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
      attachedDon: [],
    },
  ];
  const process: ReplacementProcess = {
    id: "opponent-effect-field-removal-with-stale-protection",
    type: "trash",
    source: targetRef,
    target: targetRef,
    payload: {
      fieldRemovalAttempt: {
        processFamily: "fieldRemoval",
        classification: "moveFromFieldToTrash",
        sourceKind: "cardEffect",
        sourceControllerId: p1,
      },
    },
    causedBy: { type: "ruleProcess", name: "stale-protection-test" },
    usedReplacementIds: [],
  };

  const result = applyFieldRemovalProtection(state, target, process);

  assert.deepEqual(result, { ok: true, prevented: false });
});

test("unrelated conditional protection record does not fail closed for the removed target", () => {
  const { state, target, targetRef, sourceOnField } =
    setupFieldRemovalProtectionState();
  appendSelfFieldRemovalProtection(
    state,
    sourceOnField,
    fieldRemovalProtection(),
    {
      type: "custom",
      check: "unsupported-unrelated-field-removal-condition",
    },
  );
  const process: ReplacementProcess = {
    id: "opponent-effect-field-removal-with-unrelated-protection",
    type: "trash",
    source: targetRef,
    target: targetRef,
    payload: {
      fieldRemovalAttempt: {
        processFamily: "fieldRemoval",
        classification: "moveFromFieldToTrash",
        sourceKind: "cardEffect",
        sourceControllerId: p1,
      },
    },
    causedBy: { type: "ruleProcess", name: "unrelated-protection-test" },
    usedReplacementIds: [],
  };

  const result = applyFieldRemovalProtection(state, target, process);

  assert.deepEqual(result, { ok: true, prevented: false });
});

test("sixth-character overflow rule-process trash removes a protected Character without ordinary On K.O. triggers", () => {
  const { state, newCharacter, existingCharacters } =
    setupFullCharacterPlayState(0);
  const selectedCharacter = must(existingCharacters[2], "selected character");
  attachOnKODrawEffect(state, selectedCharacter, "def-overflow-on-ko-draw");
  protectTargetFromOpponentEffectRemoval(state, selectedCharacter);
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeDeckLength = beforeP1.deck.length;

  const opened = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "overflow decision");
  const resolved = applyPlayCardTestAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [
        {
          instanceId: selectedCharacter.instanceId,
          cardId: selectedCharacter.cardId,
          playerId: p1,
          zone: selectedCharacter.zone,
        },
      ],
    },
  });
  const nextP1 = must(resolved.state.players[p1], "next p1");

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    nextP1.characters.some(
      (card) => card.instanceId === selectedCharacter.instanceId,
    ),
    false,
  );
  assert.equal(nextP1.trash[0]?.instanceId, selectedCharacter.instanceId);
  assert.equal(nextP1.characters[4]?.instanceId, newCharacter.instanceId);
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
      "spotlightEntryCreated",
    ],
  );
  assert.equal(
    resolved.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "effectQueued"),
    false,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "effectResolved"),
    false,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "cardDrawn"),
    false,
  );
  assert.equal(nextP1.deck.length, beforeDeckLength);
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("controller-owned effect field removal is not blocked by opponent-effect protection", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  const p2Source = must(state.players[p2], "p2").leader;
  const selfControlledEntry: EffectQueueEntry = {
    ...entry,
    controllerId: p2,
    source: {
      instanceId: p2Source.instanceId,
      cardId: p2Source.cardId,
      playerId: p2,
      zone: p2Source.zone,
    },
    sourceSnapshot: {
      instanceId: p2Source.instanceId,
      cardId: p2Source.cardId,
      ownerId: p2Source.owner,
      controllerId: p2Source.controller,
      zone: p2Source.zone,
      category: "leader",
      colors: ["red"],
      power: 5000,
      keywords: [],
    },
  };
  protectTargetFromOpponentEffectRemoval(state, target);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    selfControlledEntry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardKOd", "cardMoved", "donReturned"],
  );
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
  assert.equal(nextP2.trash[0]?.instanceId, target.instanceId);
});

test("K.O. protection source card filter prevents matching opponent Character effects", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(state, target, {
    process: "ko",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    sourceCardFilter: {
      categories: ["character"],
      power: { max: 5000 },
    },
  } satisfies Protection);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
});

test("K.O. protection source card filter ignores nonmatching opponent Character effects", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  state.cardManifest.cards[entry.source.cardId] = {
    ...must(state.cardManifest.cards[entry.source.cardId], "effect source"),
    power: 6000,
  };
  protectTargetFromOpponentEffectRemoval(state, target, {
    process: "ko",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    sourceCardFilter: {
      categories: ["character"],
      power: { max: 5000 },
    },
  } satisfies Protection);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardKOd", "cardMoved", "donReturned"],
  );
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
});

test("K.O. protection source card filter prevents effects from Characters without a named attribute", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  state.cardManifest.cards[entry.source.cardId] = {
    ...must(state.cardManifest.cards[entry.source.cardId], "effect source"),
    attributes: [],
  };
  protectTargetFromOpponentEffectRemoval(state, target, {
    process: "ko",
    sourceKind: "cardEffect",
    sourceControllerRelation: "eitherController",
    sourceCardFilter: {
      categories: ["character"],
      attributesNotAny: ["special"],
    },
  } satisfies Protection);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
});

test("K.O. protection source card filter allows effects from Characters with a named excluded attribute", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  state.cardManifest.cards[entry.source.cardId] = {
    ...must(state.cardManifest.cards[entry.source.cardId], "effect source"),
    attributes: ["special"],
  };
  protectTargetFromOpponentEffectRemoval(state, target, {
    process: "ko",
    sourceKind: "cardEffect",
    sourceControllerRelation: "eitherController",
    sourceCardFilter: {
      categories: ["character"],
      attributesNotAny: ["special"],
    },
  } satisfies Protection);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardKOd", "cardMoved", "donReturned"],
  );
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    false,
  );
});

test("controller-cost field removal classification is not blocked by opponent-effect protection", () => {
  const { state, target, targetRef } = setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(state, target);
  const process: ReplacementProcess = {
    id: "controller-cost-field-removal",
    type: "trash",
    source: targetRef,
    target: targetRef,
    payload: {
      fieldRemovalAttempt: {
        processFamily: "fieldRemoval",
        classification: "moveFromFieldToTrash",
        sourceKind: "cost",
        sourceControllerId: p2,
      },
    },
    causedBy: { type: "ruleProcess", name: "controller-cost-test" },
    usedReplacementIds: [],
  };

  const result = applyFieldRemovalProtection(state, target, process);

  assert.deepEqual(result, { ok: true, prevented: false });
});

test("supported would-be-KOd replacement decision opens before field-removal protection prevents removal", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  const replacement = attachReviewedKoReplacement(state, target);
  protectTargetFromOpponentEffectRemoval(state, target);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );
  const nextP2 = must(result.state.players[p2], "next p2");

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.events.map((event) => [event.type, event.visibility]),
    [["decisionCreated", { type: "private", playerId: p2 }]],
  );
  const pendingDecision = must(
    result.state.pendingDecision,
    "replacement decision",
  );
  assert.equal(pendingDecision.type, "chooseReplacement");
  assert.deepEqual(pendingDecision.replacementIds, [
    `${String(target.instanceId)}:${String(replacement.id)}`,
  ]);
  assert.equal(
    nextP2.characters.some((card) => card.instanceId === target.instanceId),
    true,
  );
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === target.instanceId),
    false,
  );
});

test.each([
  {
    name: "missing source controller",
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: "cardEffect",
    },
    reason: "missing-source-controller",
  },
  {
    name: "unsupported destination",
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToHand",
      sourceKind: "cardEffect",
      sourceControllerId: p1,
    },
    reason: "unsupported-field-removal-destination",
  },
  {
    name: "custom handler removal",
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: "custom",
      sourceControllerId: p1,
    },
    reason: "ambiguous-field-removal-source",
  },
  {
    name: "ambiguous process source",
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: "cardEffect",
      sourceControllerId: p1,
      ambiguous: true,
    },
    reason: "ambiguous-field-removal-source",
  },
] satisfies {
  name: string;
  fieldRemovalAttempt: unknown;
  reason: string;
}[])(
  "fails closed before mutation for $name",
  ({ fieldRemovalAttempt, reason }) => {
    const { state, entry, target, targetRef } =
      setupFieldRemovalProtectionState();
    protectTargetFromOpponentEffectRemoval(state, target);
    const process = replaceFieldRemovalAttemptPayload(
      buildSelectedTargetKoReplacementProcess(entry, targetRef, 0),
      fieldRemovalAttempt,
    );
    const before = structuredClone(state);
    const beforeHash = hashCanonicalStateValue(state);

    const result = executeUnreplacedSelectedTargetKoProcess(
      state,
      [],
      entry.effectBlockId,
      process,
    );

    assert.deepEqual(result, {
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason },
      },
    });
    assert.deepEqual(state, before);
    assert.equal(hashCanonicalStateValue(state), beforeHash);
  },
);

test("fails closed before mutation for malformed field-removal protection metadata", () => {
  const { state, entry, target, targetRef } =
    setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(
    state,
    target,
    fieldRemovalProtection({
      sourceControllerRelation: "unknownController",
    }),
  );
  const before = structuredClone(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = executeSelectedTargetEffectPrimitive(
    state,
    entry,
    koChooseEffect(),
    [targetRef],
  );

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.equal(result.stateHash, beforeHash);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: entry.effectBlockId,
      details: { reason: "malformed-field-removal-protection" },
    },
  ]);
});

test.each([
  {
    name: "unsupported custom condition",
    condition: {
      type: "custom",
      check: "unsupported-field-removal-condition",
    },
  },
  {
    name: "malformed trashCount comparator",
    condition: {
      type: "trashCount",
      player: "self",
      op: "between",
      value: 1,
    } as unknown as Condition,
  },
] satisfies { name: string; condition: Condition }[])(
  "fails closed before mutation for $name on field-removal protection",
  ({ condition }) => {
    const { state, entry, target, targetRef } =
      setupFieldRemovalProtectionState();
    protectTargetFromOpponentEffectRemoval(
      state,
      target,
      fieldRemovalProtection(),
      condition,
    );
    const before = structuredClone(state);
    const beforeHash = hashCanonicalStateValue(state);

    const result = executeSelectedTargetEffectPrimitive(
      state,
      entry,
      koChooseEffect(),
      [targetRef],
    );

    assert.deepEqual(result.events, []);
    assert.deepEqual(result.state, before);
    assert.equal(result.stateHash, beforeHash);
    assert.deepEqual(result.errors, [
      {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason: "malformed-field-removal-protection" },
      },
    ]);
  },
);

test("computeView omits malformed field-removal protection metadata", () => {
  const { state, target } = setupFieldRemovalProtectionState();
  protectTargetFromOpponentEffectRemoval(
    state,
    target,
    fieldRemovalProtection({
      sourceControllerRelation: "unknownController",
    }),
  );

  const view = computeView(state);

  assert.deepEqual(view.cards[target.instanceId]?.protectedFrom, []);
});
