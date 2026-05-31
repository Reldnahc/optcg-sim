import { describe, expect, test } from "vitest";
import type { MatchId, PlayerId } from "@optcg/types";

import { canonicalJson } from "./canonical-json.js";
import { idempotencyKey, requestHash } from "./action-envelope.js";
import type { SessionActionRequest } from "./session-types.js";

describe("session action envelopes", () => {
  test("canonical JSON is stable for object key order", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
  });

  test("canonical JSON omits undefined object fields like JSON transport", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson({ nested: { b: undefined, a: [2, 1] } })).toBe(
      '{"nested":{"a":[2,1]}}',
    );
  });

  test("canonical JSON rejects unsupported non-JSON values", () => {
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    expect(() => canonicalJson({ value: () => undefined })).toThrow(TypeError);
    expect(() => canonicalJson({ value: Symbol("x") })).toThrow(TypeError);
    expect(() => canonicalJson({ value: 1n })).toThrow(TypeError);
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(TypeError);
  });

  test("request hash is based on the current dev request payload only", () => {
    const first: SessionActionRequest = {
      type: "submitAction",
      playerId: "p1" as PlayerId,
      actionIndex: 3,
      expectedStateSeq: 8,
    };
    const second: SessionActionRequest = {
      expectedStateSeq: 8,
      actionIndex: 3,
      playerId: "p1" as PlayerId,
      type: "submitAction",
    };

    expect(requestHash(first)).toBe(requestHash(second));
  });

  test("idempotency key is match player and client action id", () => {
    expect(
      idempotencyKey({
        matchId: "match-1" as MatchId,
        playerId: "p1" as PlayerId,
        clientActionId: "client-action-1",
      }),
    ).toBe("match-1:p1:client-action-1");
  });
});
