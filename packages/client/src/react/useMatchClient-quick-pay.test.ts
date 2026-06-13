import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { describe, test } from "vitest";

describe("useMatchClient quick activate-main payment", () => {
  test("does not disarm quick-pay while an activate action is in flight", async () => {
    const source = await readFile(
      new URL("useMatchClient.ts", import.meta.url),
      "utf8",
    );

    assert.match(
      source,
      /if \(pendingDecision === undefined\) \{[\s\S]*if \(!actionInFlight\) \{[\s\S]*quickPayActivateMainArmed\.current = false/u,
    );
  });
});
