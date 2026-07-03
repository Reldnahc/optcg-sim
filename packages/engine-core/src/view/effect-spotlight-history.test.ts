import { describe, expect, it } from "vitest";

import type {
  CardId,
  EngineEvent,
  EngineEventId,
  InstanceId,
  PlayerId,
  PublicPendingDecisionId,
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
  cardId: "OP00-002" as CardId,
};

const defender = {
  playerId: "p2" as PlayerId,
  instanceId: "defender-1" as InstanceId,
  cardId: "OP00-003" as CardId,
};

const event = (
  type: EngineEvent["type"],
  payload: EngineEvent["payload"],
  id: string,
): EngineEvent => ({
  id: id as EngineEventId,
  seq: 1,
  type,
  payload,
  visibility: { type: "public" },
  createdAtStateSeq: 1 as StateSeq,
});

const spotlightEvent = (
  entry: Record<string, unknown>,
  id: string,
): EngineEvent =>
  event(
    "spotlightEntryCreated",
    {
      disclosure: {
        entryRefs: [
          {
            role: "effectSource",
            cardInstanceId: source.instanceId,
            visibility: { type: "public" },
          },
        ],
      },
      entry,
    },
    id,
  );

const effectTextEntry = (
  id: string,
  mode: "live" | "resolved" = "resolved",
  status: "pending" | "resolved" = "resolved",
): Record<string, unknown> => ({
  kind: "effectText",
  id,
  key: id,
  semanticKey: `effectText|${id}`,
  mode,
  status,
  active: {
    source,
    textKind: "effect",
    activeSpanIds: ["span:body"],
  },
  ...(mode === "resolved" && status === "resolved"
    ? { resolvedEventId: `event:resolved:${id}` }
    : {}),
});

const combatEntry = (id: string): Record<string, unknown> => ({
  kind: "combat",
  id,
  key: id,
  semanticKey: `combat|${id}`,
  mode: "resolved",
  status: "resolved",
  combat: {
    eventKind: "attackDeclared",
    attacker,
    defender,
    attackerPower: 5000,
    defenderPower: 6000,
  },
  resolvedEventId: `event:combat:${id}`,
});

const counterCombatEntry = (id: string): Record<string, unknown> => ({
  kind: "combat",
  id,
  key: id,
  semanticKey: `combat|${id}`,
  mode: "resolved",
  status: "resolved",
  combat: {
    eventKind: "counterUsed",
    source,
    target: defender,
    counterPower: 1000,
  },
  resolvedEventId: `event:counter:${id}`,
});

const damageCombatEntry = (id: string): Record<string, unknown> => ({
  kind: "combat",
  id,
  key: id,
  semanticKey: `combat|${id}`,
  mode: "resolved",
  status: "resolved",
  combat: {
    eventKind: "damageDealt",
    attacker,
    defender,
    attackerPower: 7000,
    defenderPower: 5000,
    amount: 1,
  },
  resolvedEventId: `event:damage:${id}`,
});

const battleKoCombatEntry = (id: string): Record<string, unknown> => ({
  kind: "combat",
  id,
  key: id,
  semanticKey: `combat|${id}`,
  mode: "resolved",
  status: "resolved",
  combat: {
    eventKind: "battleKOd",
    attacker,
    defender,
    attackerPower: 7000,
    defenderPower: 5000,
  },
  resolvedEventId: `event:battle-ko:${id}`,
});

const playedCardEntry = (id: string): Record<string, unknown> => ({
  kind: "playedCard",
  id,
  key: id,
  semanticKey: `playedCard|${id}`,
  mode: "resolved",
  status: "resolved",
  source,
  resolvedEventId: `event:played:${id}`,
});

describe("effectSpotlightHistoryFromPlayerViewState", () => {
  it("projects a spotlight entry for every authored effect step", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      events: [
        spotlightEvent(playedCardEntry("spotlight:played"), "event:1"),
        spotlightEvent(combatEntry("spotlight:combat"), "event:2"),
        spotlightEvent(effectTextEntry("spotlight:effect"), "event:3"),
      ],
    });

    expect(history?.entries.map((entry) => entry.key)).toEqual([
      "spotlight:played",
      "spotlight:combat",
      "spotlight:effect",
    ]);
    expect(history?.presentKey).toBe("spotlight:effect");
  });

  it("projects authored counter, life damage, and battle K.O. spotlight entries", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      events: [
        spotlightEvent(
          counterCombatEntry("spotlight:counter"),
          "event:counter-spotlight",
        ),
        spotlightEvent(
          damageCombatEntry("spotlight:damage"),
          "event:damage-spotlight",
        ),
        spotlightEvent(
          battleKoCombatEntry("spotlight:battle-ko"),
          "event:battle-ko-spotlight",
        ),
      ],
    });

    expect(
      history?.entries.map((entry) =>
        entry.kind === "combat" ? entry.combat.eventKind : entry.kind,
      ),
    ).toEqual(["counterUsed", "damageDealt", "battleKOd"]);
    expect(history?.presentKey).toBe("spotlight:battle-ko");
  });

  it("does not reconstruct spotlights from raw gameplay events", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      events: [
        event(
          "effectResolved",
          {
            presentation: {
              source,
              textKind: "effect",
              activeSpanIds: ["span:body"],
            },
          },
          "event:effect-resolved",
        ),
        event(
          "replacementApplied",
          {
            presentation: {
              source,
              textKind: "effect",
              activeSpanIds: ["span:replacement"],
            },
          },
          "event:replacement",
        ),
        event("cardPlayed", { ...source, category: "character" }, "event:play"),
        event(
          "attackDeclared",
          { attacker, target: defender, attackerPower: 5000 },
          "event:attack",
        ),
        event(
          "blockerActivated",
          { attacker, blocker: defender, defenderPower: 6000 },
          "event:blocker",
        ),
      ],
    });

    expect(history).toBeUndefined();
  });

  it("keeps live pending effect text only when it is authored in the event", () => {
    const pendingDecisionId =
      "pending:spotlight:public:1" as PublicPendingDecisionId;
    const history = effectSpotlightHistoryFromPlayerViewState({
      events: [
        spotlightEvent(
          {
            ...effectTextEntry("spotlight:pending", "live", "pending"),
            pendingDecisionId,
          },
          "event:pending",
        ),
      ],
    });

    expect(history?.entries).toEqual([
      {
        kind: "effectText",
        id: "spotlight:pending",
        key: "spotlight:pending",
        semanticKey: "effectText|spotlight:pending",
        mode: "live",
        status: "pending",
        active: {
          source,
          textKind: "effect",
          activeSpanIds: ["span:body"],
        },
        pendingDecisionId,
      },
    ]);
  });

  it("removes stale pending effect text once a later matching entry resolves", () => {
    const pendingDecisionId =
      "pending:spotlight:public:1" as PublicPendingDecisionId;
    const history = effectSpotlightHistoryFromPlayerViewState({
      events: [
        spotlightEvent(
          {
            ...effectTextEntry("spotlight:pending", "live", "pending"),
            pendingDecisionId,
          },
          "event:pending",
        ),
        spotlightEvent(
          effectTextEntry("spotlight:resolved", "resolved", "resolved"),
          "event:resolved",
        ),
      ],
    });

    expect(history?.entries.map((entry) => entry.key)).toEqual([
      "spotlight:resolved",
    ]);
    expect(history?.presentKey).toBe("spotlight:resolved");
  });

  it("skips malformed spotlight payloads", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      events: [
        spotlightEvent(
          {
            ...effectTextEntry("spotlight:invalid"),
            key: undefined,
          },
          "event:invalid-missing-key",
        ),
        spotlightEvent(
          {
            ...effectTextEntry("spotlight:invalid-span"),
            active: {
              source,
              textKind: "effect",
              activeSpanIds: ["body"],
            },
          },
          "event:invalid-span",
        ),
      ],
    });

    expect(history).toBeUndefined();
  });

  it("ignores spotlightEntryCreated events without a safe entry", () => {
    const history = effectSpotlightHistoryFromPlayerViewState({
      events: [
        spotlightEvent(
          {
            kind: "combat",
            id: "spotlight:combat",
            key: "spotlight:combat",
            semanticKey: "combat",
            mode: "live",
            status: "pending",
            combat: {
              eventKind: "attackDeclared",
              attacker,
              defender,
            },
          },
          "event:unsafe-combat",
        ),
        spotlightEvent(
          {
            kind: "combat",
            id: "spotlight:damage",
            key: "spotlight:damage",
            semanticKey: "combat",
            mode: "resolved",
            status: "resolved",
            combat: {
              eventKind: "damageDealt",
              attacker,
              defender,
              attackerPower: 7000,
            },
            resolvedEventId: "event:unsafe-damage",
          },
          "event:unsafe-damage-spotlight",
        ),
        spotlightEvent(
          {
            kind: "combat",
            id: "spotlight:battle-ko",
            key: "spotlight:battle-ko",
            semanticKey: "combat",
            mode: "resolved",
            status: "resolved",
            combat: {
              eventKind: "battleKOd",
              attacker,
              defender,
              attackerPower: 7000,
            },
            resolvedEventId: "event:unsafe-battle-ko",
          },
          "event:unsafe-battle-ko-spotlight",
        ),
        spotlightEvent(
          {
            kind: "playedCard",
            id: "spotlight:played",
            key: "spotlight:played",
            semanticKey: "playedCard",
            mode: "resolved",
            status: "resolved",
            source: { instanceId: source.instanceId },
          },
          "event:unsafe-played",
        ),
      ],
    });

    expect(history).toBeUndefined();
  });
});
