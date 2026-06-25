import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { resolveActiveMatchPersistence } from "./active-match-persistence.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";

describe("active match persistence", () => {
  test("does not derive active match recovery from redis url by default", async () => {
    const persistence = await resolveActiveMatchPersistence({
      redisUrl: "redis://example.invalid:6379",
    });

    assert.equal(persistence, undefined);
  });

  test("keeps explicit match persistence as the active recovery opt-in", async () => {
    const explicitPersistence = createInMemoryMatchPersistence();

    const persistence = await resolveActiveMatchPersistence({
      matchPersistence: explicitPersistence,
      redisUrl: "redis://example.invalid:6379",
    });

    assert.equal(persistence, explicitPersistence);
  });
});
