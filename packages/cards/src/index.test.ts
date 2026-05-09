import { describe, expect, it } from "vitest";

import { packageName } from "./index.js";

describe("@optcg/cards package exports", () => {
  it("exposes a named package identity export", () => {
    expect(packageName).toBe("@optcg/cards");
  });

  it("loads package exports without requiring redis dependencies", async () => {
    const moduleExports = await import("./index.js");

    expect(moduleExports.createInMemoryCardDataCache).toBeTypeOf("function");
    expect(moduleExports.REDIS_CARD_DATA_CACHE_DEFERRED).toMatch(/deferred/i);
  });
});
