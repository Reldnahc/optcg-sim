import { describe, expect, it } from "vitest";

import type {
  CardId,
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
  it("does not create a generic played-card spotlight", () => {
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
      history?.entries.map((entry) => ({
        id: entry.id,
        key: entry.key,
        semanticKey: entry.semanticKey,
        status: entry.status,
        mode: entry.mode,
        activeSpanIds: entry.active.activeSpanIds,
        resolvedEventId: entry.resolvedEventId,
      })),
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
      history?.entries.map((entry) => ({
        id: entry.id,
        semanticKey: entry.semanticKey,
        status: entry.status,
        mode: entry.mode,
        pendingDecisionId: entry.pendingDecisionId,
        activeSpanIds: entry.active.activeSpanIds,
      })),
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

    expect(history?.entries.map((entry) => entry.active.activeSpanIds)).toEqual(
      [["span:search:selection"], ["span:search:remaining"]],
    );
    expect(history?.entries.map((entry) => entry.status)).toEqual([
      "resolved",
      "pending",
    ]);
    expect(history?.presentKey).toBe(history?.entries.at(-1)?.key);
  });
});
