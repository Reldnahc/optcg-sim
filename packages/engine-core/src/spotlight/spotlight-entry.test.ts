import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ActiveEffectTextPresentation,
  CardId,
  CardRef,
  EffectId,
  EffectTextSpanId,
  EngineEvent,
  EngineEventId,
  InstanceId,
  PublicPendingDecisionId,
  QueueEntryId,
  SpotlightEntryCreatedPayload,
  StateSeq,
} from "@optcg/types";

import {
  appendReplacementSpotlightEntryCreatedEvents,
  appendSpotlightEntryCreatedEvent,
} from "../action-results.js";
import { createActiveState, p1, p2 } from "../action-test-fixtures.js";
import {
  combatSpotlightEntry,
  effectTextSpotlightEntry,
  entryCardRefDisclosure,
  pendingEffectTextSpotlightEntry,
  playedCardSpotlightEntry,
  splitEffectTextSpotlightPresentation,
  spotlightDisclosureVisibilityForCardRef,
  targetLinkDisclosure,
} from "./spotlight-entry.js";

const source = {
  playerId: p1,
  instanceId: "source-1" as InstanceId,
  cardId: "OP01-001" as CardId,
};

const target = {
  playerId: p2,
  instanceId: "target-1" as InstanceId,
  cardId: "OP01-002" as CardId,
};

const active: ActiveEffectTextPresentation = {
  source,
  textKind: "effect",
  activeSpanIds: ["span:body:draw"],
  targetLinks: [
    {
      spanId: "span:body:draw",
      relation: "selectedTarget",
      cards: [target],
    },
  ],
};

test("effectTextSpotlightEntry builds resolved effect-text entry from supplied final anchor", () => {
  const entry = effectTextSpotlightEntry({
    active,
    anchorEventId: "event:final:effectResolved" as EngineEventId,
    effectBlockId: "effect:draw" as EffectId,
    queueEntryId: "queue:draw" as QueueEntryId,
  });

  assert.equal(entry.mode, "resolved");
  assert.equal(entry.status, "resolved");
  assert.equal(entry.resolvedEventId, "event:final:effectResolved");
  assert.equal(entry.queueEntryId, "queue:draw");
  assert.equal(entry.effectBlockId, "effect:draw");
  assert.deepEqual(entry.active, active);
  assert.equal(
    entry.id,
    "spotlight:effect:event:final:effectResolved:span:body:draw",
  );
  assert.equal(
    entry.key,
    "spotlight:effect:event:final:effectResolved:span:body:draw",
  );
  assert.equal(
    entry.semanticKey,
    "effect|event:final:effectResolved|effect|span:body:draw",
  );
});

test("pendingEffectTextSpotlightEntry uses public pending id and final decision anchor", () => {
  const pendingDecisionId =
    "spotlight:pending:event:decision:recipient:p1" as PublicPendingDecisionId;
  const entry = pendingEffectTextSpotlightEntry({
    active,
    anchorEventId: "event:decision" as EngineEventId,
    pendingDecisionId,
  });

  assert.equal(entry.mode, "live");
  assert.equal(entry.status, "pending");
  assert.equal(entry.pendingDecisionId, pendingDecisionId);
  assert.equal(entry.resolvedEventId, undefined);
  assert.equal(entry.queueEntryId, undefined);
  assert.equal(entry.effectBlockId, undefined);
  assert.equal(entry.id, "spotlight:pending:event:decision:span:body:draw");
  assert.equal(entry.key, "spotlight:pending:event:decision:span:body:draw");
  assert.equal(entry.semanticKey.includes("decision:raw"), false);
});

test("combatSpotlightEntry builds combat entries for attacks and blockers", () => {
  const attack = combatSpotlightEntry({
    anchorEventId: "event:attack" as EngineEventId,
    combat: {
      eventKind: "attackDeclared",
      attacker: source,
      defender: target,
      attackerPower: 7000,
      defenderPower: 5000,
    },
  });
  const block = combatSpotlightEntry({
    anchorEventId: "event:blocker" as EngineEventId,
    combat: {
      eventKind: "blockerActivated",
      attacker: source,
      defender: target,
    },
  });

  assert.equal(attack.kind, "combat");
  assert.equal(attack.resolvedEventId, "event:attack");
  assert.equal(attack.semanticKey.startsWith("combat|attackDeclared|"), true);
  assert.equal(block.kind, "combat");
  assert.equal(block.resolvedEventId, "event:blocker");
  assert.equal(block.semanticKey.startsWith("combat|blockerActivated|"), true);
});

test("playedCardSpotlightEntry builds played-card entries without effect text active presentation", () => {
  const entry = playedCardSpotlightEntry({
    anchorEventId: "event:cardPlayed" as EngineEventId,
    source,
  });

  assert.equal(entry.kind, "playedCard");
  assert.equal(entry.source, source);
  assert.equal(entry.resolvedEventId, "event:cardPlayed");
  assert.equal("active" in entry, false);
  assert.equal(entry.semanticKey.startsWith("playedCard|"), true);
});

test("disclosure helpers capture only event-time visibility evidence", () => {
  const entryDisclosure = entryCardRefDisclosure({
    card: source,
    role: "effectSource",
    visibility: { type: "public" },
  });
  const linkDisclosure = targetLinkDisclosure({
    card: target,
    relation: "selectedTarget",
    spanId: "span:body:draw",
    visibility: { type: "private", playerId: p2 },
  });

  assert.deepEqual(entryDisclosure, {
    role: "effectSource",
    cardInstanceId: source.instanceId,
    visibility: { type: "public" },
  });
  assert.deepEqual(linkDisclosure, {
    spanId: "span:body:draw",
    relation: "selectedTarget",
    cardInstanceId: target.instanceId,
    visibility: { type: "private", playerId: p2 },
  });
  assert.equal("cardId" in entryDisclosure, false);
  assert.equal("zone" in linkDisclosure, false);
});

test("spotlightDisclosureVisibilityForCardRef is public only for non-hidden zones", () => {
  assert.deepEqual(spotlightDisclosureVisibilityForCardRef(source), {
    type: "public",
  });
  assert.deepEqual(
    spotlightDisclosureVisibilityForCardRef({
      ...target,
      zone: { zone: "hand", playerId: p2, slot: "hand", index: 0 },
    }),
    { type: "private", playerId: p2 },
  );
  assert.deepEqual(
    spotlightDisclosureVisibilityForCardRef({
      ...target,
      zone: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 0,
      },
    }),
    { type: "public" },
  );
});

test("appendSpotlightEntryCreatedEvent appends typed event with explicit visibility and causality", () => {
  const state = createActiveState();
  const events: EngineEvent[] = [];
  const entry = playedCardSpotlightEntry({
    anchorEventId: "event:cardPlayed" as EngineEventId,
    source,
  });
  const disclosure = {
    entryRefs: [
      entryCardRefDisclosure({
        card: source,
        role: "playedCardSource",
        visibility: { type: "public" },
      }),
    ],
  };

  const created = appendSpotlightEntryCreatedEvent(state, events, entry, {
    causedBy: { type: "ruleProcess", name: "test" },
    disclosure,
    visibility: { type: "private", playerId: p1 },
  });

  assert.equal(created.type, "spotlightEntryCreated");
  assert.equal(created.visibility.type, "private");
  assert.deepEqual(created.causedBy, { type: "ruleProcess", name: "test" });
  assert.equal(events.at(-1), created);
  assert.deepEqual(created.payload, { entry, disclosure });
});

test("appendSpotlightEntryCreatedEvent omits causality and disclosure when not supplied", () => {
  const state = createActiveState();
  const events: EngineEvent[] = [];
  const entry = playedCardSpotlightEntry({
    anchorEventId: "event:cardPlayed" as EngineEventId,
    source,
  });

  const created = appendSpotlightEntryCreatedEvent(state, events, entry, {
    visibility: { type: "public" },
  });

  assert.equal(created.type, "spotlightEntryCreated");
  assert.equal(created.causedBy, undefined);
  assert.deepEqual(created.payload satisfies SpotlightEntryCreatedPayload, {
    entry,
  });
});

test("appendReplacementSpotlightEntryCreatedEvents anchors authored entries to replacementApplied", () => {
  const state = createActiveState();
  const replacementApplied: EngineEvent = {
    id: "event:replacementApplied" as EngineEventId,
    seq: 1,
    type: "replacementApplied",
    payload: {},
    visibility: { type: "public" },
    createdAtStateSeq: 1 as StateSeq,
  };
  const events: EngineEvent[] = [replacementApplied];

  const [created] = appendReplacementSpotlightEntryCreatedEvents({
    state,
    events,
    replacementAppliedEvent: replacementApplied,
    replacementId: "replacement:test",
    presentation: {
      ...active,
      activeSpanIds: ["span:replacement"],
      targetLinks: [
        {
          spanId: "span:replacement",
          relation: "affectedCard",
          cards: [target],
        },
      ],
    },
  });

  assert.ok(created !== undefined);
  assert.equal(created.type, "spotlightEntryCreated");
  assert.equal(created.payload.entry.resolvedEventId, replacementApplied.id);
  assert.deepEqual(created.causedBy, {
    type: "replacement",
    replacementId: "replacement:test",
  });
  assert.equal(events.at(-1), created);
  assert.deepEqual(created.payload.disclosure?.targetLinks, [
    {
      spanId: "span:replacement",
      relation: "affectedCard",
      cardInstanceId: target.instanceId,
      visibility: { type: "public" },
    },
  ]);
});

test("appendReplacementSpotlightEntryCreatedEvents keeps private source visibility private", () => {
  const state = createActiveState();
  const replacementApplied: EngineEvent = {
    id: "event:replacementApplied:private-source" as EngineEventId,
    seq: 1,
    type: "replacementApplied",
    payload: {},
    visibility: { type: "public" },
    createdAtStateSeq: 1 as StateSeq,
  };
  const events: EngineEvent[] = [replacementApplied];
  const privateSource: CardRef = {
    ...source,
    zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
  };

  const [created] = appendReplacementSpotlightEntryCreatedEvents({
    state,
    events,
    replacementAppliedEvent: replacementApplied,
    replacementId: "replacement:private-source",
    presentation: {
      ...active,
      source: privateSource,
      activeSpanIds: ["span:replacement"],
    },
  });

  assert.ok(created !== undefined);
  assert.deepEqual(created.visibility, { type: "private", playerId: p1 });
  assert.deepEqual(created.payload.disclosure?.entryRefs, [
    {
      role: "effectSource",
      cardInstanceId: privateSource.instanceId,
      visibility: { type: "private", playerId: p1 },
    },
  ]);
});

test("appendSpotlightEntryCreatedEvent options require visibility", () => {
  type AppendOptions = Parameters<typeof appendSpotlightEntryCreatedEvent>[3];
  const options = {
    visibility: { type: "public" },
  } satisfies AppendOptions;

  assert.deepEqual(options, { visibility: { type: "public" } });
});

test("builders store supplied final anchor ids for rebase-aware callers", () => {
  const preRebaseId = "event:local:1:effectResolved";
  const finalAnchorId = "event:final:9:effectResolved" as EngineEventId;
  const entry = effectTextSpotlightEntry({
    active,
    anchorEventId: finalAnchorId,
  });

  assert.equal(entry.resolvedEventId, finalAnchorId);
  assert.equal(entry.id.includes(preRebaseId), false);
  assert.equal(entry.key.includes(preRebaseId), false);
  assert.equal(entry.semanticKey.includes(preRebaseId), false);
});

test("splitEffectTextSpotlightPresentation splits only supported resolved span families", () => {
  const linkedTarget = {
    spanId: "span:body:draw" as EffectTextSpanId,
    relation: "selectedTarget" as const,
    cards: [target],
  };
  const split = splitEffectTextSpotlightPresentation({
    ...active,
    activeSpanIds: [
      "span:sequence:0:body",
      "span:search:selection",
      "span:search:then",
      "span:cost:optional",
      "span:body",
      "span:body:draw",
      "span:replacement",
      "span:choice:1:body",
      "span:condition",
    ] as EffectTextSpanId[],
    targetLinks: [
      linkedTarget,
      {
        spanId: "span:choice:1:body",
        relation: "affectedCard",
        cards: [source],
      },
    ],
  });

  assert.deepEqual(
    split.map((entry) => entry.activeSpanIds),
    [
      ["span:sequence:0:body"],
      ["span:search:selection"],
      ["span:cost:optional"],
      ["span:body"],
      ["span:body:draw"],
      ["span:replacement"],
      ["span:choice:1:body"],
    ],
  );
  assert.deepEqual(
    split.map((entry) => entry.targetLinks ?? []),
    [
      [],
      [],
      [],
      [],
      [linkedTarget],
      [],
      [
        {
          spanId: "span:choice:1:body",
          relation: "affectedCard",
          cards: [source],
        },
      ],
    ],
  );
});
