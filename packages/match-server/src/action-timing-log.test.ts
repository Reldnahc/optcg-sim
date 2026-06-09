import { strict as assert } from "node:assert";
import { describe, test, vi } from "vitest";

import { writeActionTimingLog } from "./action-timing-log.js";

const timingInput = {
  matchId: "match-1",
  playerId: "p1",
  clientActionId: "client-action-1",
  requestType: "submitAction",
  actionIndex: 0,
  accepted: true,
  stateSeq: 1,
  rawBytes: 128,
  applyMs: 12.3,
  totalServerMs: 14.5,
};

const captureStdout = (fn: () => void): string[] => {
  const chunks: string[] = [];
  const writeSpy = vi.spyOn(process.stdout, "write");
  writeSpy.mockImplementation((chunk: string | Uint8Array): boolean => {
    chunks.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
    );
    return true;
  });
  try {
    fn();
  } finally {
    writeSpy.mockRestore();
  }
  return chunks;
};

describe("action timing logs", () => {
  test("does not write timing logs by default", () => {
    const previous = process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"];
    delete process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"];
    try {
      const chunks = captureStdout(() => {
        writeActionTimingLog(timingInput);
      });

      assert.deepEqual(chunks, []);
    } finally {
      if (previous === undefined) {
        delete process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"];
      } else {
        process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"] = previous;
      }
    }
  });

  test("writes timing logs when explicitly enabled", () => {
    const previous = process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"];
    process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"] = "true";
    try {
      const chunks = captureStdout(() => {
        writeActionTimingLog(timingInput);
      });

      assert.equal(chunks.length, 1);
      assert.match(chunks[0] ?? "", /"type":"simActionTiming"/u);
      assert.match(chunks[0] ?? "", /"matchId":"match-1"/u);
    } finally {
      if (previous === undefined) {
        delete process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"];
      } else {
        process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"] = previous;
      }
    }
  });
});
