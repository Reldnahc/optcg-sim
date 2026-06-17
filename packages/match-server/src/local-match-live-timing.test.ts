import { strict as assert } from "node:assert";
import { beforeAll, describe, test, vi } from "vitest";
import type { PlayerId } from "@optcg/types";
import type {
  ClientActionEnvelope,
  SessionActionResult,
} from "./session-types.js";

import {
  applyLocalDevDecision,
  createLocalDevMatch,
  getLocalDevSnapshot,
  getLocalDevSnapshotForPlayer,
  type DevMatchSetup,
} from "./local-match.js";
import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import { createSocketActionTiming } from "./action-timing-log.js";

const p1 = "p1" as PlayerId;

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

const createTestMatch = () =>
  createLocalDevMatch(structuredClone(premadeSetup));

const mustPlayerSnapshot = (
  snapshot: ReturnType<typeof getLocalDevSnapshot>,
  playerId: PlayerId,
) => {
  const player = snapshot.players[playerId];
  if (player === undefined) {
    throw new Error(`Missing snapshot for ${String(playerId)}.`);
  }
  return player;
};

const captureStdoutAsync = async (
  fn: () => Promise<void>,
): Promise<string[]> => {
  const chunks: string[] = [];
  const writeSpy = vi.spyOn(process.stdout, "write");
  writeSpy.mockImplementation((chunk: string | Uint8Array): boolean => {
    chunks.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
    );
    return true;
  });
  try {
    await fn();
  } finally {
    writeSpy.mockRestore();
  }
  return chunks;
};

const withActionTimingLogs = async (
  fn: () => Promise<string[]>,
): Promise<string[]> => {
  const previous = process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"];
  process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"] = "true";
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"];
    } else {
      process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"] = previous;
    }
  }
};

describe("local dev match live timing", () => {
  test("player snapshot action generation records legal-action subspans", async () => {
    const match = createTestMatch();
    const clientActionId = "client-action-snapshot-timing";
    const envelope = {
      protocolVersion: "test",
      matchId: match.state.matchId,
      playerId: p1,
      clientActionId,
      expectedStateSeq: match.state.seq,
      requestHash: "test-request-hash",
      request: {
        type: "submitAction" as const,
        playerId: p1,
        actionIndex: 0,
        expectedStateSeq: match.state.seq,
      },
    } satisfies ClientActionEnvelope;
    const raw = JSON.stringify(envelope);

    const chunks = await withActionTimingLogs(() =>
      captureStdoutAsync(() => {
        const timing = createSocketActionTiming(raw);
        timing.record(() => {
          getLocalDevSnapshotForPlayer(match, p1);
        });
        const sessionResult = {
          type: "actionResult" as const,
          matchId: match.state.matchId,
          clientActionId,
          accepted: true,
          stateSeq: match.state.seq,
          actionSeq: match.state.actionSeq,
          errors: [],
        } satisfies SessionActionResult;
        timing.write({
          matchId: match.state.matchId,
          playerId: p1,
          payload: { clientActionId },
          envelope,
          result: sessionResult,
        });
        return Promise.resolve();
      }),
    );

    assert.equal(chunks.length, 1);
    const payload = JSON.parse(chunks[0] ?? "{}") as {
      readonly spans?: readonly { readonly name: string }[];
    };
    const spanNames = payload.spans?.map((span) => span.name) ?? [];
    assert.ok(spanNames.includes("playerSnapshot:actions"));
    assert.ok(spanNames.includes("executableActions:getLegalActions"));
    assert.ok(spanNames.includes("executableActions:decorateLegalActions"));
  });

  test("explicit decision responses use live engine timing options", async () => {
    const match = createTestMatch();
    const before = getLocalDevSnapshot(match);
    const decision = mustPlayerSnapshot(before, p1).view.pendingDecision;
    if (decision?.type !== "selectCards") {
      throw new Error("Expected p1 setup selectCards decision.");
    }
    const candidate = decision.candidates[0]?.card;
    if (candidate === undefined) {
      throw new Error("Expected a public candidate for the decision player.");
    }
    const request = {
      type: "respondToDecision" as const,
      playerId: p1,
      decisionId: decision.id,
      response: { type: "cards" as const, cards: [candidate] },
    };
    const clientActionId = "client-action-direct-decision";
    const envelope = {
      protocolVersion: "test",
      matchId: match.state.matchId,
      playerId: p1,
      clientActionId,
      expectedStateSeq: before.stateSeq,
      expectedDecisionId: decision.id,
      requestHash: "test-request-hash",
      request,
    } satisfies ClientActionEnvelope;
    const raw = JSON.stringify(envelope);

    const chunks = await withActionTimingLogs(() =>
      captureStdoutAsync(async () => {
        const timing = createSocketActionTiming(raw);
        const result = await timing.apply(() =>
          applyLocalDevDecision(match, { ...request, includeSnapshot: false }),
        );
        assert.deepEqual(result.errors, []);
        const sessionResult = {
          type: "actionResult" as const,
          matchId: match.state.matchId,
          clientActionId,
          accepted: result.errors.length === 0,
          stateSeq: result.stateSeq,
          actionSeq: result.actionSeq,
          errors: result.errors,
        } satisfies SessionActionResult;
        timing.write({
          matchId: match.state.matchId,
          playerId: p1,
          payload: { clientActionId },
          envelope,
          result: sessionResult,
        });
      }),
    );

    assert.equal(chunks.length, 1);
    const payload = JSON.parse(chunks[0] ?? "{}") as {
      readonly spans?: readonly { readonly name: string }[];
    };
    const spanNames = payload.spans?.map((span) => span.name) ?? [];
    assert.ok(spanNames.includes("engine:applyAction:respondToDecision"));
    assert.ok(spanNames.includes("engine:decision:setupStartOfGame"));
  });
});
