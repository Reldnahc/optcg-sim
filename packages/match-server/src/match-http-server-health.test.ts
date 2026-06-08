import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";
import { createMatchHttpServer } from "./match-http-server.js";

describe("match HTTP server health", () => {
  test("serves a production health endpoint", async () => {
    const server = await createMatchHttpServer({
      setup: await createFixtureDevMatchSetup(),
      fetchCard: createDefaultDevFixtureFetch(),
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/health`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { data: { ok: true } });
    } finally {
      await server.close();
    }
  });
});
