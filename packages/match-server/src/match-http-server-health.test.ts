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
import type { MatchPersistence } from "./session-types.js";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createBlockedActiveMatchPersistence = (): {
  readonly persistence: MatchPersistence;
  readonly listStarted: Promise<void>;
  readonly releaseList: () => void;
} => {
  const basePersistence = createInMemoryMatchPersistence();
  let listStartedResolve: () => void = () => undefined;
  let releaseListResolve: () => void = () => undefined;
  const listStarted = new Promise<void>((resolve) => {
    listStartedResolve = resolve;
  });
  const releaseList = new Promise<void>((resolve) => {
    releaseListResolve = resolve;
  });
  return {
    persistence: {
      ...basePersistence,
      async listActiveMatchIds() {
        listStartedResolve();
        await releaseList;
        return [];
      },
    },
    listStarted,
    releaseList: () => {
      releaseListResolve();
    },
  };
};

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

  test("serves health while an API request waits for active match recovery", async () => {
    const blockedPersistence = createBlockedActiveMatchPersistence();
    const serverPromise = createMatchHttpServer({
      createDefaultMatch: false,
      matchPersistence: blockedPersistence.persistence,
    });
    let server: MatchHttpServer | undefined;
    let listening = false;
    let apiRequest: Promise<Response> | undefined;
    try {
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
      const recoveryBeforeApi = await Promise.race([
        blockedPersistence.listStarted.then(() => "started" as const),
        delay(25).then(() => "not-started" as const),
      ]);
      assert.equal(recoveryBeforeApi, "not-started");

      apiRequest = fetch(`${server.url()}/api/matches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      await blockedPersistence.listStarted;
      const response = await fetch(`${server.url()}/health`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { data: { ok: true } });
    } finally {
      blockedPersistence.releaseList();
      await apiRequest;
      server ??= await serverPromise;
      if (listening) {
        await server.close();
      }
    }
  });

  test("creates lobbies without waiting for active match recovery", async () => {
    const blockedPersistence = createBlockedActiveMatchPersistence();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      matchPersistence: blockedPersistence.persistence,
    });
    await server.listen(0, "127.0.0.1");
    let lobbyRequest: Promise<Response> | undefined;
    try {
      lobbyRequest = fetch(`${server.url()}/api/lobbies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const response = await Promise.race([
        lobbyRequest,
        delay(25).then(() => "pending" as const),
      ]);

      assert.notEqual(response, "pending");
      assert.equal((response as Response).status, 201);
      const recoveryAfterLobby = await Promise.race([
        blockedPersistence.listStarted.then(() => "started" as const),
        delay(25).then(() => "not-started" as const),
      ]);
      assert.equal(recoveryAfterLobby, "not-started");
    } finally {
      blockedPersistence.releaseList();
      await lobbyRequest?.catch(() => undefined);
      await server.close();
    }
  });

  test("opens lobby websockets without waiting for active match recovery", async () => {
    const blockedPersistence = createBlockedActiveMatchPersistence();
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      matchPersistence: blockedPersistence.persistence,
    });
    await server.listen(0, "127.0.0.1");
    let socket: WebSocket | undefined;
    try {
      const createdResponse = await fetch(`${server.url()}/api/lobbies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(createdResponse.status, 201);
      const createdBody = (await createdResponse.json()) as {
        lobbyId?: unknown;
      };
      const lobbyId = createdBody.lobbyId;
      assert.equal(typeof lobbyId, "string");
      const joinedResponse = await fetch(
        `${server.url()}/api/lobbies/${String(lobbyId)}/join`,
        {
          method: "POST",
          headers: { "x-optcg-session-token": "user:user-1:session-1" },
        },
      );
      assert.equal(joinedResponse.status, 200);

      const socketUrl = new URL(
        `/api/lobbies/${String(lobbyId)}/ws`,
        server.url().replace(/^http/u, "ws"),
      );
      socketUrl.searchParams.set("playerId", "p1");
      socketUrl.searchParams.set("sessionToken", "user:user-1:session-1");
      socket = new WebSocket(socketUrl);

      const opened = await Promise.race([
        new Promise<"opened" | "failed">((resolve) => {
          socket?.addEventListener(
            "open",
            () => {
              resolve("opened");
            },
            {
              once: true,
            },
          );
          socket?.addEventListener(
            "error",
            () => {
              resolve("failed");
            },
            {
              once: true,
            },
          );
        }),
        delay(25).then(() => "pending" as const),
      ]);

      assert.equal(opened, "opened");
      const recoveryAfterSocket = await Promise.race([
        blockedPersistence.listStarted.then(() => "started" as const),
        delay(25).then(() => "not-started" as const),
      ]);
      assert.equal(recoveryAfterSocket, "not-started");
    } finally {
      blockedPersistence.releaseList();
      socket?.close();
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
