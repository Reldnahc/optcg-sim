import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";
import { createMatchHttpServer } from "./match-http-server.js";

describe("match HTTP server health", () => {
  test("serves health without creating a default dev match", async () => {
    const server = await createMatchHttpServer({ createDefaultMatch: false });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/health`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { data: { ok: true } });
    } finally {
      await server.close();
    }
  });

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

  test("allows configured browser origins", async () => {
    const server = await createMatchHttpServer({
      allowedBrowserOrigins: ["https://client.example"],
      createDefaultMatch: false,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/health`, {
        headers: { origin: "https://client.example" },
      });

      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("access-control-allow-origin"),
        "https://client.example",
      );
    } finally {
      await server.close();
    }
  });

  test("rejects unconfigured browser preflight origins", async () => {
    const server = await createMatchHttpServer({
      allowedBrowserOrigins: ["https://client.example"],
      createDefaultMatch: false,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/lobbies`, {
        method: "OPTIONS",
        headers: { origin: "https://other.example" },
      });

      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    } finally {
      await server.close();
    }
  });

  test("serves browser preflight for configured origins", async () => {
    const server = await createMatchHttpServer({
      allowedBrowserOrigins: ["https://client.example"],
      createDefaultMatch: false,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/lobbies`, {
        method: "OPTIONS",
        headers: { origin: "https://client.example" },
      });

      assert.equal(response.status, 204);
      assert.equal(
        response.headers.get("access-control-allow-origin"),
        "https://client.example",
      );
      assert.match(
        response.headers.get("access-control-allow-methods") ?? "",
        /POST/u,
      );
      assert.match(
        response.headers.get("access-control-allow-headers") ?? "",
        /x-optcg-session-token/u,
      );
    } finally {
      await server.close();
    }
  });
});
