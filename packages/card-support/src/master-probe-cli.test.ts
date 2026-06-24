import { describe, expect, it } from "vitest";

import {
  masterProbeFetchDelayMs,
  masterProbeRetryDelaysMs,
} from "./master-probe-cli.js";

describe("master probe CLI", () => {
  it("uses a short default fetch throttle with 429 retry backoff", () => {
    expect(masterProbeFetchDelayMs).toBe(50);
    expect(masterProbeRetryDelaysMs).toEqual([2000, 4000, 8000]);
  });
});
