import { expect, test } from "vitest";

import type {
  ActiveEffectTextPresentation,
  CombatSpotlightHistoryEntry,
  EffectSpotlightHistoryEntry,
  EffectTextSourceMap,
  EffectTextSpotlightHistoryEntry,
  EffectTextSpan,
  EffectTextTargetLink,
  PlayedCardSpotlightHistoryEntry,
  SpotlightEntryCreatedPayload,
  SpotlightEntryDisclosure,
} from "./effect-presentation.js";
import type {
  CardId,
  CardRef,
  EffectId,
  EngineEventId,
  InstanceId,
  PlayerId,
  QueueEntryId,
  PublicPendingDecisionId,
  SpotlightEntryCreatedEngineEvent,
  StateSeq,
} from "./index.js";

test("effect presentation source map describes exact original text ranges", () => {
  const span: EffectTextSpan = {
    id: "span:sequence:1:body",
    role: "body",
    start: 35,
    end: 64,
    text: "K.O. up to 1 Character.",
    primitiveEvidence: ["instruction:ko"],
    effectPath: ["effect", "sequence"],
    sequenceIndex: 1,
  };
  const map: EffectTextSourceMap = {
    textKind: "effect",
    sourceText: "[On Play] Draw 1 card. Then, K.O. up to 1 Character.",
    spans: [span],
  };

  expect(map.spans[0]?.start).toBe(35);
  expect(map.spans[0]?.end).toBe(64);
});

test("active presentation links public targets to exact span ids", () => {
  const target: CardRef = {
    instanceId: "target-1" as InstanceId,
    cardId: "OP00-001" as CardId,
    playerId: "p2" as PlayerId,
  };
  const link: EffectTextTargetLink = {
    spanId: "span:sequence:1:body",
    cards: [target],
    relation: "selectedTarget",
  };
  const active: ActiveEffectTextPresentation = {
    source: {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-002" as CardId,
      playerId: "p1" as PlayerId,
    },
    activeSpanIds: ["span:sequence:1:body"],
    targetLinks: [link],
  };

  expect(active.targetLinks?.[0]?.cards[0]?.instanceId).toBe("target-1");
});

test("allows structured spotlight timeline entries without parsing display keys", () => {
  const active: ActiveEffectTextPresentation = {
    source: {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-001" as CardId,
      playerId: "p1" as PlayerId,
    },
    textKind: "effect",
    activeSpanIds: ["span:search:selection"],
  };

  const entry: EffectSpotlightHistoryEntry = {
    id: "resolved:event:1:span:search:selection",
    key: "event:1:span:search:selection",
    semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
    mode: "resolved",
    status: "resolved",
    active,
    resolvedEventId: "event:1" as EngineEventId,
    queueEntryId: "queue-entry:1" as QueueEntryId,
    effectBlockId: "effect:block:1" as EffectId,
  };

  expect(entry.pendingDecisionId).toBeUndefined();
  expect(entry.semanticKey).toContain("span:search:selection");
});

test("allows combat spotlight timeline entries without effect text", () => {
  const attacker: CardRef = {
    instanceId: "attacker-1" as InstanceId,
    cardId: "OP00-003" as CardId,
    playerId: "p1" as PlayerId,
  };
  const defender: CardRef = {
    instanceId: "defender-1" as InstanceId,
    cardId: "OP00-004" as CardId,
    playerId: "p2" as PlayerId,
  };

  const entry: EffectSpotlightHistoryEntry = {
    kind: "combat",
    id: "combat:event:1",
    key: "event:1",
    semanticKey: "combat|attackDeclared|attacker-1|defender-1|7000|5000",
    mode: "resolved",
    status: "resolved",
    combat: {
      eventKind: "attackDeclared",
      attacker,
      defender,
      attackerPower: 7000,
      defenderPower: 5000,
    },
    resolvedEventId: "event:1" as EngineEventId,
  };

  expect(entry.kind).toBe("combat");
  expect(entry.combat.eventKind).toBe("attackDeclared");
  if (entry.combat.eventKind !== "counterUsed") {
    expect(entry.combat.defenderPower).toBe(5000);
  }
});

test("spotlight entry event payload carries authored timeline entries", () => {
  const source: CardRef = {
    instanceId: "source-spotlight" as InstanceId,
    cardId: "OP00-010" as CardId,
    playerId: "p1" as PlayerId,
  };
  const attacker: CardRef = {
    instanceId: "attacker-spotlight" as InstanceId,
    cardId: "OP00-011" as CardId,
    playerId: "p1" as PlayerId,
  };
  const defender: CardRef = {
    instanceId: "defender-spotlight" as InstanceId,
    cardId: "OP00-012" as CardId,
    playerId: "p2" as PlayerId,
  };
  const effectEntry: EffectTextSpotlightHistoryEntry = {
    id: "spotlight:event:1:effect",
    key: "spotlight:event:1:effect",
    semanticKey: "effect|spotlight:event:1:0|span:body:draw",
    mode: "resolved",
    status: "resolved",
    active: {
      source,
      textKind: "effect",
      activeSpanIds: ["span:body:draw"],
    },
    resolvedEventId: "event:1" as EngineEventId,
    queueEntryId: "queue-entry:1" as QueueEntryId,
    effectBlockId: "effect:1" as EffectId,
  };
  const combatEntry: CombatSpotlightHistoryEntry = {
    kind: "combat",
    id: "spotlight:event:combat",
    key: "spotlight:event:combat",
    semanticKey: "combat|spotlight:event:combat",
    mode: "resolved",
    status: "resolved",
    combat: {
      eventKind: "attackDeclared",
      attacker,
      defender,
      attackerPower: 7000,
      defenderPower: 5000,
    },
    resolvedEventId: "event:combat" as EngineEventId,
  };
  const playedCardEntry: PlayedCardSpotlightHistoryEntry = {
    kind: "playedCard",
    id: "spotlight:event:played:card",
    key: "spotlight:event:played:card",
    semanticKey: "playedCard|spotlight:event:played",
    mode: "resolved",
    status: "resolved",
    source,
    resolvedEventId: "event:played" as EngineEventId,
  };
  const disclosure: SpotlightEntryDisclosure = {
    entryRefs: [
      {
        role: "effectSource",
        cardInstanceId: source.instanceId,
        visibility: { type: "public" },
      },
    ],
    targetLinks: [
      {
        spanId: "span:body:draw",
        relation: "affectedCard",
        cardInstanceId: source.instanceId,
        visibility: { type: "private", playerId: "p1" as PlayerId },
      },
    ],
  };
  const effectPayload: SpotlightEntryCreatedPayload = {
    entry: effectEntry,
    disclosure,
  };
  const combatPayload: SpotlightEntryCreatedPayload = { entry: combatEntry };
  const playedPayload: SpotlightEntryCreatedPayload = {
    entry: playedCardEntry,
  };
  const event: SpotlightEntryCreatedEngineEvent = {
    id: "event:spotlight" as EngineEventId,
    seq: 5,
    type: "spotlightEntryCreated",
    payload: effectPayload,
    visibility: { type: "public" },
    createdAtStateSeq: 1 as StateSeq,
  };

  expect(effectPayload.entry.mode).toBe("resolved");
  expect(combatPayload.entry.kind).toBe("combat");
  expect(playedPayload.entry.kind).toBe("playedCard");
  expect(event.type).toBe("spotlightEntryCreated");
});

test("public spotlight entries can omit raw private engine metadata", () => {
  const source: CardRef = {
    instanceId: "source-public" as InstanceId,
    cardId: "OP00-013" as CardId,
    playerId: "p1" as PlayerId,
  };
  const pendingDecisionId =
    "public-pending:event:1:p1" as PublicPendingDecisionId;
  const entry: EffectSpotlightHistoryEntry = {
    id: "spotlight:decision:event:1:0",
    key: "spotlight:decision:event:1:0",
    semanticKey: "effect|decision:event:1|span:body:draw",
    mode: "live",
    status: "pending",
    active: {
      source,
      textKind: "effect",
      activeSpanIds: ["span:body:draw"],
    },
    pendingDecisionId,
  };

  expect(entry.pendingDecisionId).toBe(pendingDecisionId);
  expect(entry.resolvedEventId).toBeUndefined();
  expect(entry.queueEntryId).toBeUndefined();
  expect(entry.effectBlockId).toBeUndefined();
});
