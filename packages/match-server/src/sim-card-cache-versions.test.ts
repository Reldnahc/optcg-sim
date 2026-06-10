import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  activeSimCardCacheVersionsKey,
  writeActiveSimCardCacheVersions,
} from "./sim-card-cache-versions.js";

describe("sim card cache active versions", () => {
  test("writes the active cache versions marker used by admin coverage", async () => {
    const writes: Array<{
      readonly key: string;
      readonly value: unknown;
      readonly ttlSeconds?: number;
    }> = [];

    await writeActiveSimCardCacheVersions(
      {
        getJson: () => Promise.resolve(undefined),
        setJson: (key, value, options) => {
          writes.push({
            key,
            value,
            ...(options?.ttlSeconds === undefined
              ? {}
              : { ttlSeconds: options.ttlSeconds }),
          });
          return Promise.resolve();
        },
      },
      {
        cardDataVersion: "cards-v1",
        effectDefinitionsVersion: "effects-v9",
        overlayVersion: "none",
      },
    );

    assert.equal(writes.length, 1);
    const [write] = writes;
    if (write === undefined) {
      throw new Error("Expected active version marker write.");
    }
    assert.equal(write.key, activeSimCardCacheVersionsKey);
    assert.equal(write.ttlSeconds, 60 * 60 * 24 * 7);
    const value = write.value as { readonly updatedAt?: unknown };
    assert.match(String(value.updatedAt), /^\d{4}-\d{2}-\d{2}T/u);
    assert.deepEqual(
      { ...value, updatedAt: "timestamp" },
      {
        cacheSchemaVersion: 1,
        versions: {
          cardDataVersion: "cards-v1",
          effectDefinitionsVersion: "effects-v9",
          overlayVersion: "none",
        },
        updatedAt: "timestamp",
      },
    );
  });
});
