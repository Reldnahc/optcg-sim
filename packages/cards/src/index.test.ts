import { describe, expect, it } from "vitest";

import { packageName } from "./index.js";

describe("@optcg/cards package exports", () => {
  it("exposes a named package identity export", () => {
    expect(packageName).toBe("@optcg/cards");
  });
});
