import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, test } from "vitest";

import {
  createDefaultDevFixtureFetch,
  createFixtureDevMatchSetup,
} from "./default-dev-fixture-fetch.test-support.js";
import { createMatchHttpServer } from "./match-http-server.js";
import { createInMemoryMatchPersistence } from "./match-persistence.js";
import type { MatchHttpServer } from "./match-http-server.js";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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

  test("serves health while active match recovery is still loading", async () => {
    const basePersistence = createInMemoryMatchPersistence();
    let listStartedResolve: () => void = () => undefined;
    let releaseListResolve: () => void = () => undefined;
    const listStarted = new Promise<void>((resolve) => {
      listStartedResolve = resolve;
    });
    const releaseList = new Promise<void>((resolve) => {
      releaseListResolve = resolve;
    });
    const serverPromise = createMatchHttpServer({
      createDefaultMatch: false,
      matchPersistence: {
        ...basePersistence,
        async listActiveMatchIds() {
          listStartedResolve();
          await releaseList;
          return [];
        },
      },
    });
    let server: MatchHttpServer | undefined;
    let listening = false;
    try {
      await listStarted;
      const earlyResult = await Promise.race([
        serverPromise.then((createdServer) => {
          server = createdServer;
          return "returned" as const;
        }),
        delay(25).then(() => "pending" as const),
      ]);
      assert.equal(earlyResult, "returned");
      if (server === undefined) {
        throw new Error("Server creation finished without a server.");
      }

      await server.listen(0, "127.0.0.1");
      listening = true;
      const response = await fetch(`${server.url()}/health`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { data: { ok: true } });
    } finally {
      releaseListResolve();
      server ??= await serverPromise;
      if (listening) {
        await server.close();
      }
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

  test("serves configured static client assets for non-API routes", async () => {
    const staticDirectory = await mkdtemp(join(tmpdir(), "optcg-sim-static-"));
    await writeFile(
      join(staticDirectory, "index.html"),
      "<!doctype html><title>Sim client</title>",
      "utf8",
    );
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      staticAssetsDirectory: staticDirectory,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/`);

      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("content-type"),
        "text/html; charset=utf-8",
      );
      assert.equal(
        await response.text(),
        "<!doctype html><title>Sim client</title>",
      );
    } finally {
      await server.close();
      await rm(staticDirectory, { recursive: true, force: true });
    }
  });

  test("keeps API routes out of static client fallback", async () => {
    const staticDirectory = await mkdtemp(join(tmpdir(), "optcg-sim-static-"));
    await writeFile(
      join(staticDirectory, "index.html"),
      "<!doctype html><title>Sim client</title>",
      "utf8",
    );
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      staticAssetsDirectory: staticDirectory,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/missing`);

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        errors: ["API route not found."],
      });
    } finally {
      await server.close();
      await rm(staticDirectory, { recursive: true, force: true });
    }
  });

  test("falls back to the static client for app routes", async () => {
    const staticDirectory = await mkdtemp(join(tmpdir(), "optcg-sim-static-"));
    await writeFile(
      join(staticDirectory, "index.html"),
      "<!doctype html><title>Sim client</title>",
      "utf8",
    );
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      staticAssetsDirectory: staticDirectory,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/lobbies/lobby-1`);

      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("content-type"),
        "text/html; charset=utf-8",
      );
      assert.equal(
        await response.text(),
        "<!doctype html><title>Sim client</title>",
      );
    } finally {
      await server.close();
      await rm(staticDirectory, { recursive: true, force: true });
    }
  });

  test("does not fall back to the static client for missing assets", async () => {
    const staticDirectory = await mkdtemp(join(tmpdir(), "optcg-sim-static-"));
    await writeFile(
      join(staticDirectory, "index.html"),
      "<!doctype html><title>Sim client</title>",
      "utf8",
    );
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      staticAssetsDirectory: staticDirectory,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/assets/missing.js`);

      assert.equal(response.status, 404);
      assert.equal(await response.text(), "Not found");
    } finally {
      await server.close();
      await rm(staticDirectory, { recursive: true, force: true });
    }
  });

  test("serves static webp image assets with image content type", async () => {
    const staticDirectory = await mkdtemp(join(tmpdir(), "optcg-sim-static-"));
    await mkdir(join(staticDirectory, "assets", "sim", "cards"), {
      recursive: true,
    });
    await writeFile(
      join(staticDirectory, "assets", "sim", "cards", "don.webp"),
      new Uint8Array([1, 2, 3]),
    );
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      staticAssetsDirectory: staticDirectory,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/assets/sim/cards/don.webp`);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/webp");
      assert.deepEqual(
        new Uint8Array(await response.arrayBuffer()),
        new Uint8Array([1, 2, 3]),
      );
    } finally {
      await server.close();
      await rm(staticDirectory, { recursive: true, force: true });
    }
  });

  test("can disable template dev match creation in deployed mode", async () => {
    const server = await createMatchHttpServer({
      allowTemplateMatches: false,
      createDefaultMatch: false,
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/matches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        errors: [
          "Create a lobby and submit account loadouts to start a match.",
        ],
      });
    } finally {
      await server.close();
    }
  });
});
