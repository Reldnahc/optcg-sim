import { describe, expect, it } from "vitest";

import {
  masterProbeFetchDelayMs,
  masterProbeRetryDelaysMs,
  parseMasterProbeCliArgs,
} from "./master-probe-cli.js";

describe("master probe CLI", () => {
  it("uses a short default fetch throttle with 429 retry backoff", () => {
    expect(masterProbeFetchDelayMs).toBe(50);
    expect(masterProbeRetryDelaysMs).toEqual([2000, 4000, 8000]);
  });

  it("accepts a base URL and repeated set filters", () => {
    expect(
      parseMasterProbeCliArgs([
        "--base-url",
        "http://localhost:3000",
        "--set",
        "OP16",
        "--set",
        "OP15",
      ]),
    ).toEqual({
      ok: true,
      args: {
        baseUrl: "http://localhost:3000",
        setCodes: ["OP16", "OP15"],
      },
    });
  });
});
