import { describe, expect, it } from "vitest";

import type {
  CardId,
  EffectSpotlightHistoryEntry,
  EffectTextSpotlightHistoryEntry,
  EffectTextSpanId,
  EngineEvent,
  EngineEventId,
  InstanceId,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import { effectSpotlightHistoryFromPlayerViewState } from "./effect-spotlight-history.js";

const source = {
  playerId: "p1" as PlayerId,
  instanceId: "source-1" as InstanceId,
  cardId: "OP00-001" as CardId,
};

const attacker = {
  playerId: "p1" as PlayerId,
  instanceId: "attacker-1" as InstanceId,
  cardId: "OP00-003" as CardId,
};

const defender = {
  playerId: "p2" as PlayerId,
  instanceId: "defender-1" as InstanceId,
  cardId: "OP00-004" as CardId,
};

const expectEffectTextEntry = (
  entry: EffectSpotlightHistoryEntry,
): EffectTextSpotlightHistoryEntry => {
  if (entry.kind !== "combat") {
    return entry;
  }
  throw new Error("Expected effect text spotlight history entry.");
};

const resolvedSearchEvent = (
  id: string,
  activeSpanIds: readonly EffectTextSpanId[],
): EngineEvent => ({
  id: id as EngineEventId,
  seq: 1,
  type: "effectResolved",
  source,
  payload: {
    status: "resolved",
    presentation: {
      source,
      textKind: "effect",
      activeSpanIds,
    },
  },
  visibility: { type: "public" },
  createdAtStateSeq: 1 as StateSeq,
});

describe("effectSpotlightHistoryFromPlayerViewState", () => {
  it("creates a no-highlight played-card spotlight", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [
        {
          id: "event:card-played" as EngineEventId,
          seq: 1,
          type: "cardPlayed",
          payload: {
            playerId: "p1",
            instanceId: "played-1",
            cardId: "OP00-002",
            category: "character",
          },
          visibility: { type: "public" },
          createdAtStateSeq: 1 as StateSeq,
        },
      ],
      pendingDecisionId: undefined,
    });

    expect(history).toEqual({
      entries: [
        {
          id: "resolved:event:card-played:",
          key: "event:card-played",
          semanticKey: "p1|played-1|OP00-002|effect|",
          mode: "resolved",
          status: "resolved",
          active: {
            source: {
              playerId: "p1",
              instanceId: "played-1",
              cardId: "OP00-002",
            },
            textKind: "effect",
            activeSpanIds: [],
          },
          resolvedEventId: "event:card-played",
        },
      ],
      presentKey: "event:card-played",
    });
  });

  it("suppresses played-card spotlight across neutral events before effect queueing", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [
        {
          id: "event:played" as EngineEventId,
          seq: 1,
          type: "cardPlayed",
          payload: {
            playerId: "p1",
            instanceId: "played-1",
            cardId: "OP00-002",
            category: "character",
          },
          visibility: { type: "public" },
          createdAtStateSeq: 1 as StateSeq,
        },
        {
          id: "event:rule-check" as EngineEventId,
          seq: 2,
          type: "ruleProcessingChecked",
          payload: {},
          visibility: { type: "public" },
          createdAtStateSeq: 2 as StateSeq,
        },
        {
          id: "event:effect-queued" as EngineEventId,
          seq: 3,
          type: "effectQueued",
          payload: {
            queueEntryId: "queue-entry:played",
            effectId: "effect:played",
          },
          visibility: { type: "public" },
          createdAtStateSeq: 3 as StateSeq,
        },
      ],
      pendingDecisionId: undefined,
    });

    expect(history).toBeUndefined();
  });

  it("ignores resolved presentations without active spans", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [resolvedSearchEvent("event:empty", [])],
      pendingDecisionId: undefined,
    });

    expect(history).toBeUndefined();
  });

  it("projects structured resolved search timeline entries", () => {
    const event = resolvedSearchEvent("event:search", [
      "span:search:selection",
      "span:search:remaining",
    ]);

    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [event],
      pendingDecisionId: undefined,
    });

    expect(
      history?.entries.map((entry) => {
        const effectTextEntry = expectEffectTextEntry(entry);
        return {
          id: entry.id,
          key: entry.key,
          semanticKey: entry.semanticKey,
          status: entry.status,
          mode: entry.mode,
          activeSpanIds: effectTextEntry.active.activeSpanIds,
          resolvedEventId: entry.resolvedEventId,
        };
      }),
    ).toEqual([
      {
        id: "resolved:event:search:span:search:selection",
        key: "event:search:span:search:selection",
        semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
        status: "resolved",
        mode: "resolved",
        activeSpanIds: ["span:search:selection"],
        resolvedEventId: "event:search",
      },
      {
        id: "resolved:event:search:span:search:remaining",
        key: "event:search:span:search:remaining",
        semanticKey: "p1|source-1|OP00-001|effect|span:search:remaining",
        status: "resolved",
        mode: "resolved",
        activeSpanIds: ["span:search:remaining"],
        resolvedEventId: "event:search",
      },
    ]);
  });

  it("splits resolved choice option spans into separate timeline entries", () => {
    const event = resolvedSearchEvent("event:choice", [
      "span:choice",
      "span:choice:0:body",
      "span:choice:1:body",
    ]);

    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [event],
      pendingDecisionId: undefined,
    });

    expect(
      history?.entries.map(
        (entry) => expectEffectTextEntry(entry).active.activeSpanIds,
      ),
    ).toEqual([["span:choice:0:body"], ["span:choice:1:body"]]);
    expect(history?.entries.map((entry) => entry.key)).toEqual([
      "event:choice:span:choice:0:body",
      "event:choice:span:choice:1:body",
    ]);
  });

  it("splits resolved cost and body spans into separate timeline entries", () => {
    const event = resolvedSearchEvent("event:cost-body", [
      "span:cost:optional",
      "span:body",
    ]);

    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [event],
      pendingDecisionId: undefined,
    });

    expect(
      history?.entries.map(
        (entry) => expectEffectTextEntry(entry).active.activeSpanIds,
      ),
    ).toEqual([["span:cost:optional"], ["span:body"]]);
    expect(history?.entries.map((entry) => entry.key)).toEqual([
      "event:cost-body:span:cost:optional",
      "event:cost-body:span:body",
    ]);
  });

  it("replaces a resolved current pending span with the live pending entry", () => {
    const event = resolvedSearchEvent("event:search", [
      "span:search:selection",
      "span:search:remaining",
    ]);

    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:search:remaining"],
      },
      events: [event],
      pendingDecisionId: "decision:orderCards:search",
    });

    expect(
      history?.entries.map((entry) => {
        const effectTextEntry = expectEffectTextEntry(entry);
        return {
          id: entry.id,
          semanticKey: entry.semanticKey,
          status: entry.status,
          mode: entry.mode,
          pendingDecisionId: effectTextEntry.pendingDecisionId,
          activeSpanIds: effectTextEntry.active.activeSpanIds,
        };
      }),
    ).toEqual([
      {
        id: "resolved:event:search:span:search:selection",
        semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
        status: "resolved",
        mode: "resolved",
        pendingDecisionId: undefined,
        activeSpanIds: ["span:search:selection"],
      },
      {
        id: "pending:decision:orderCards:search:p1|source-1|OP00-001|effect|span:search:remaining",
        semanticKey: "p1|source-1|OP00-001|effect|span:search:remaining",
        status: "pending",
        mode: "live",
        pendingDecisionId: "decision:orderCards:search",
        activeSpanIds: ["span:search:remaining"],
      },
    ]);
  });

  it("projects current search remainder as the live present entry without duplicating it", () => {
    const event = resolvedSearchEvent("event:search", [
      "span:search:selection",
      "span:search:remaining",
    ]);

    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:search:remaining"],
      },
      events: [event],
      pendingDecisionId: "decision:orderCards:search",
    });

    expect(history).toEqual({
      entries: [
        {
          id: "resolved:event:search:span:search:selection",
          key: "event:search:span:search:selection",
          semanticKey: "p1|source-1|OP00-001|effect|span:search:selection",
          mode: "resolved",
          status: "resolved",
          active: {
            source,
            textKind: "effect",
            activeSpanIds: ["span:search:selection"],
          },
          resolvedEventId: "event:search",
        },
        {
          id: "pending:decision:orderCards:search:p1|source-1|OP00-001|effect|span:search:remaining",
          key: "decision:decision:orderCards:search|source-1|effect|span:search:remaining",
          semanticKey: "p1|source-1|OP00-001|effect|span:search:remaining",
          mode: "live",
          status: "pending",
          active: {
            source,
            textKind: "effect",
            activeSpanIds: ["span:search:remaining"],
          },
          pendingDecisionId: "decision:orderCards:search",
        },
      ],
      presentKey:
        "decision:decision:orderCards:search|source-1|effect|span:search:remaining",
    });
  });

  it("projects search selection resolved plus search remainder pending in order", () => {
    const event = resolvedSearchEvent("event:search", [
      "span:search:selection",
      "span:search:remaining",
    ]);

    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: {
        source,
        textKind: "effect",
        activeSpanIds: ["span:search:remaining"],
      },
      events: [event],
      pendingDecisionId: "decision:orderCards:search",
    });

    expect(
      history?.entries.map(
        (entry) => expectEffectTextEntry(entry).active.activeSpanIds,
      ),
    ).toEqual([["span:search:selection"], ["span:search:remaining"]]);
    expect(history?.entries.map((entry) => entry.status)).toEqual([
      "resolved",
      "pending",
    ]);
    expect(history?.presentKey).toBe(history?.entries.at(-1)?.key);
  });

  it("projects attack declaration as a combat spotlight entry", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [
        {
          id: "event:attack" as EngineEventId,
          seq: 1,
          type: "attackDeclared",
          payload: {
            attacker,
            target: defender,
            attackerPower: 7000,
            defenderPower: 5000,
          },
          visibility: { type: "public" },
          createdAtStateSeq: 1 as StateSeq,
        },
      ],
      pendingDecisionId: undefined,
    });

    expect(history).toEqual({
      entries: [
        {
          kind: "combat",
          id: "combat:event:attack",
          key: "event:attack",
          semanticKey:
            "combat|attackDeclared|p1|attacker-1|OP00-003|p2|defender-1|OP00-004|7000|5000",
          mode: "resolved",
          status: "resolved",
          combat: {
            eventKind: "attackDeclared",
            attacker,
            defender,
            attackerPower: 7000,
            defenderPower: 5000,
          },
          resolvedEventId: "event:attack",
        },
      ],
      presentKey: "event:attack",
    });
  });

  it("orders played-card spotlight before following combat spotlight", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [
        {
          id: "event:played" as EngineEventId,
          seq: 1,
          type: "cardPlayed",
          payload: {
            playerId: "p1",
            instanceId: "played-1",
            cardId: "OP00-002",
            category: "character",
          },
          visibility: { type: "public" },
          createdAtStateSeq: 1 as StateSeq,
        },
        {
          id: "event:attack" as EngineEventId,
          seq: 2,
          type: "attackDeclared",
          payload: {
            attacker,
            target: defender,
            attackerPower: 7000,
            defenderPower: 5000,
          },
          visibility: { type: "public" },
          createdAtStateSeq: 2 as StateSeq,
        },
      ],
      pendingDecisionId: undefined,
    });

    expect(history?.entries.map((entry) => entry.key)).toEqual([
      "event:played",
      "event:attack",
    ]);
    expect(history?.presentKey).toBe("event:attack");
  });

  it("projects blocker activation as attacker versus blocker", () => {
    const blocker = {
      playerId: "p2" as PlayerId,
      instanceId: "blocker-1" as InstanceId,
      cardId: "OP00-005" as CardId,
    };
    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [
        {
          id: "event:blocker" as EngineEventId,
          seq: 1,
          type: "blockerActivated",
          payload: {
            attacker,
            blocker,
            previousTarget: defender,
            currentTarget: blocker,
            attackerPower: 7000,
            defenderPower: 3000,
          },
          visibility: { type: "public" },
          createdAtStateSeq: 1 as StateSeq,
        },
      ],
      pendingDecisionId: undefined,
    });

    expect(history?.entries[0]).toMatchObject({
      kind: "combat",
      key: "event:blocker",
      combat: {
        eventKind: "blockerActivated",
        attacker,
        defender: blocker,
        attackerPower: 7000,
        defenderPower: 3000,
      },
    });
  });

  it("skips malformed combat spotlight payloads", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [
        {
          id: "event:bad-attack" as EngineEventId,
          seq: 1,
          type: "attackDeclared",
          payload: { attacker },
          visibility: { type: "public" },
          createdAtStateSeq: 1 as StateSeq,
        },
      ],
      pendingDecisionId: undefined,
    });

    expect(history).toBeUndefined();
  });

  it("skips non-public combat spotlight events", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      activeEffectText: undefined,
      events: [
        {
          id: "event:hidden-attack" as EngineEventId,
          seq: 1,
          type: "attackDeclared",
          payload: {
            attacker,
            target: defender,
            attackerPower: 7000,
            defenderPower: 5000,
          },
          visibility: { type: "replayOnly" },
          createdAtStateSeq: 1 as StateSeq,
        },
      ],
      pendingDecisionId: undefined,
    });

    expect(history).toBeUndefined();
  });
});
