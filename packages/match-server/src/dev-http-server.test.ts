import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createDevHttpServer } from "./dev-http-server.js";
import { createPremadeDevMatchSetup } from "./local-match.js";
import { createDefaultDevFixtureFetch } from "./default-dev-fixture-fetch.test-support.js";

const createFixtureDevHttpServer = () =>
  createDevHttpServer({ fetchCard: createDefaultDevFixtureFetch() });

describe("dev HTTP server", () => {
  test("creates independent local anonymous dev matches keyed by matchId", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const firstCreate = await fetch(`${server.url()}/api/matches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const secondCreate = await fetch(`${server.url()}/api/matches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(firstCreate.status, 201);
      assert.equal(secondCreate.status, 201);
      const first = (await firstCreate.json()) as {
        matchId?: string;
        snapshot?: { stateSeq?: number };
      };
      const second = (await secondCreate.json()) as {
        matchId?: string;
        snapshot?: { stateSeq?: number };
      };
      assert.equal(typeof first.matchId, "string");
      assert.equal(typeof second.matchId, "string");
      assert.notEqual(first.matchId, second.matchId);

      const actionResponse = await fetch(
        `${server.url()}/api/matches/${String(first.matchId)}/action`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playerId: "p1",
            actionIndex: 0,
            expectedStateSeq: first.snapshot?.stateSeq,
          }),
        },
      );
      assert.equal(actionResponse.status, 200);

      const firstStateResponse = await fetch(
        `${server.url()}/api/matches/${String(first.matchId)}/state`,
      );
      const secondStateResponse = await fetch(
        `${server.url()}/api/matches/${String(second.matchId)}/state`,
      );
      assert.equal(firstStateResponse.status, 200);
      assert.equal(secondStateResponse.status, 200);
      const firstState = (await firstStateResponse.json()) as {
        stateSeq?: number;
      };
      const secondState = (await secondStateResponse.json()) as {
        stateSeq?: number;
      };
      assert.notEqual(firstState.stateSeq, secondState.stateSeq);
      assert.equal(secondState.stateSeq, second.snapshot?.stateSeq);
    } finally {
      await server.close();
    }
  });

  test("returns not found for unknown local dev match ids", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(
        `${server.url()}/api/matches/missing-match/state`,
      );
      assert.equal(response.status, 404);
      const body = (await response.json()) as { errors?: string[] };
      assert.deepEqual(body.errors, ["Match missing-match not found."]);
    } finally {
      await server.close();
    }
  });

  test("serves filtered match state without exposing the engine state", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/state`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as unknown;
      const serialized = JSON.stringify(body);

      assert.ok(serialized.includes('"players"'));
      assert.equal(serialized.includes("cardManifest"), false);
      assert.equal(serialized.includes('"opponent":{"playerId":"p2"'), true);
      assert.equal(serialized.includes('"handCount"'), true);
    } finally {
      await server.close();
    }
  });

  test("serves public card metadata for browser board images", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/cards`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        players?: Record<
          string,
          { cards?: Record<string, { name?: string; imageUrl?: string }> }
        >;
      };
      const p1Catalog = body.players?.["p1"]?.cards;
      const p2Catalog = body.players?.["p2"]?.cards;
      const imu = p1Catalog?.["OP13-079"];
      if (imu === undefined) {
        throw new Error("Missing OP13-079 card metadata.");
      }

      assert.equal(imu.name, "Imu");
      assert.equal(imu.imageUrl?.startsWith("https://"), true);
      assert.equal(p1Catalog?.["OP13-080"], undefined);
      assert.equal(p2Catalog?.["OP13-080"], undefined);
      assert.equal(JSON.stringify(body).includes("effectDefinitions"), false);
      assert.equal(JSON.stringify(body).includes("cardManifest"), false);
    } finally {
      await server.close();
    }
  });

  test("accepts explicit decision responses without exposing hidden manifest data", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const stateResponse = await fetch(`${server.url()}/api/state`);
      assert.equal(stateResponse.status, 200);
      const stateBody = (await stateResponse.json()) as {
        players?: Record<
          string,
          {
            view?: {
              pendingDecision?: {
                id?: string;
                type?: string;
                candidates?: Array<{ card?: unknown }>;
              };
            };
          }
        >;
      };
      const decision = stateBody.players?.["p1"]?.view?.pendingDecision;
      assert.equal(decision?.type, "selectCards");
      const candidate = decision.candidates?.[0]?.card;
      if (decision.id === undefined || candidate === undefined) {
        throw new Error("Missing filtered setup decision candidate.");
      }

      const response = await fetch(`${server.url()}/api/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: "p1",
          decisionId: decision.id,
          response: { type: "cards", cards: [candidate] },
        }),
      });
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.equal(body.includes("cardManifest"), false);
      assert.equal(body.includes("effectDefinitions"), false);
      assert.equal(body.includes('"errors":[]'), true);
    } finally {
      await server.close();
    }
  });

  test("rejects explicit decision responses from the wrong player", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const stateResponse = await fetch(`${server.url()}/api/state`);
      const stateBody = (await stateResponse.json()) as {
        players?: Record<
          string,
          { view?: { pendingDecision?: { id?: string } } }
        >;
      };
      const decisionId = stateBody.players?.["p1"]?.view?.pendingDecision?.id;
      if (decisionId === undefined) {
        throw new Error("Missing p1 pending decision.");
      }

      const response = await fetch(`${server.url()}/api/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: "p2",
          decisionId,
          response: { type: "cards", cards: [] },
        }),
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as { errors?: string[] };
      assert.deepEqual(body.errors, [
        `Decision ${decisionId} is not pending for p2.`,
      ]);
    } finally {
      await server.close();
    }
  });

  test("serves browser assets that do not import server-only engine packages", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/app.js`);
      assert.equal(response.status, 200);
      const script = await response.text();

      assert.equal(script.includes("@optcg/engine-core"), false);
      assert.equal(script.includes("engine-core"), false);
    } finally {
      await server.close();
    }
  });

  test("serves the dev UI shell when a matchId query is present", async () => {
    const server = await createFixtureDevHttpServer();
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/?matchId=dev-local-match`);
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.equal(body.includes('id="app"'), true);
    } finally {
      await server.close();
    }
  });

  test("accepts an explicit premade match setup through reset", async () => {
    const server = await createFixtureDevHttpServer();
    const setup = await createPremadeDevMatchSetup({
      fetchCard: createDefaultDevFixtureFetch(),
    });
    const custom = {
      ...setup,
      matchId: "dev-http-custom-match",
      rngSeed: "dev-http-custom-seed",
      cardManifest: {
        ...setup.cardManifest,
        manifestHash: "dev-http-custom-manifest",
      },
    };
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${server.url()}/api/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setup: custom }),
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as { stateHash?: string };
      assert.equal(typeof body.stateHash, "string");

      const stateResponse = await fetch(`${server.url()}/api/state`);
      const stateBody = await stateResponse.text();
      assert.equal(stateBody.includes("dev-http-custom-manifest"), false);
      assert.equal(stateBody.includes("cardManifest"), false);
    } finally {
      await server.close();
    }
  });
});
