import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createSimAuthClient } from "./sim-auth-client.js";

interface RecordedRequest {
  readonly url: string;
  readonly init?: RequestInit;
}

const responseJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("sim auth client", () => {
  test("returns null when the auth session endpoint returns 401", async () => {
    const client = createSimAuthClient({
      baseUrl: "https://auth.example",
      fetch() {
        return Promise.resolve(
          responseJson(
            { error: { status: 401, message: "Unauthorized" } },
            401,
          ),
        );
      },
    });

    const session = await client.getSession();

    assert.equal(session, null);
  });

  test("uses cookie-backed auth package calls for login and session checks", async () => {
    const requests: RecordedRequest[] = [];
    const client = createSimAuthClient({
      baseUrl: "https://auth.example",
      simAccessEnvironment: "dev",
      fetch(input, init) {
        const url = input instanceof Request ? input.url : String(input);
        requests.push({
          url,
          ...(init === undefined ? {} : { init }),
        });
        if (url.endsWith("/v1/sim/access?environment=dev")) {
          return Promise.resolve(
            responseJson({
              data: {
                allowed: true,
                environment: "dev",
              },
            }),
          );
        }
        return Promise.resolve(
          responseJson({
            data: {
              user: {
                id: "user-1",
                username: "tester",
                display_name: "Tester",
                email: null,
                email_verified: false,
              },
              session: {
                id: "session-1",
                expires_at: "2026-06-03T00:00:00.000Z",
              },
              token: "opaque-token",
            },
          }),
        );
      },
    });

    const session = await client.login({
      username: "tester",
      password: "password",
    });

    assert.equal(session.user.username, "tester");
    assert.deepEqual(
      requests.map((request) => request.url),
      [
        "https://auth.example/v1/auth/login",
        "https://auth.example/v1/sim/access?environment=dev",
      ],
    );
    assert.equal(requests[0]?.init?.credentials, "include");
    assert.equal(requests[1]?.init?.credentials, "include");
  });

  test("checks sim access before returning an existing session", async () => {
    const requests: RecordedRequest[] = [];
    const client = createSimAuthClient({
      baseUrl: "https://auth.example",
      simAccessEnvironment: "local",
      fetch(input, init) {
        const url = input instanceof Request ? input.url : String(input);
        requests.push({
          url,
          ...(init === undefined ? {} : { init }),
        });
        if (url.endsWith("/v1/sim/access?environment=local")) {
          return Promise.resolve(
            responseJson({
              data: {
                allowed: true,
                environment: "local",
              },
            }),
          );
        }
        return Promise.resolve(
          responseJson({
            data: {
              user: {
                id: "user-1",
                username: "tester",
                display_name: "Tester",
                email: null,
                email_verified: false,
              },
              session: {
                id: "session-1",
                expires_at: "2026-06-03T00:00:00.000Z",
              },
            },
          }),
        );
      },
    });

    const session = await client.getSession();

    assert.equal(session?.session.id, "session-1");
    assert.deepEqual(
      requests.map((request) => request.url),
      [
        "https://auth.example/v1/auth/session",
        "https://auth.example/v1/sim/access?environment=local",
      ],
    );
  });

  test("uses the submitted username as the initial display name when registering", async () => {
    const requests: RecordedRequest[] = [];
    const client = createSimAuthClient({
      baseUrl: "https://auth.example",
      fetch(input, init) {
        requests.push({
          url: input instanceof Request ? input.url : String(input),
          ...(init === undefined ? {} : { init }),
        });
        return Promise.resolve(
          responseJson({
            data: {
              user: {
                id: "user-1",
                username: "tester",
                display_name: "Tester",
                email: null,
                email_verified: false,
              },
              session: {
                id: "session-1",
                expires_at: "2026-06-03T00:00:00.000Z",
              },
              token: "opaque-token",
            },
          }),
        );
      },
    });

    await client.register({
      username: "Tester",
      password: "password",
      email: "",
    });

    const request = requests[0];
    if (request === undefined) throw new Error("Expected a register request");
    const body = request.init?.body;
    if (typeof body !== "string") {
      throw new Error("Expected register request body to be JSON text");
    }
    assert.equal(request.url, "https://auth.example/v1/auth/register");
    assert.equal(request.init?.credentials, "include");
    assert.deepEqual(JSON.parse(body), {
      username: "Tester",
      password: "password",
      display_name: "Tester",
      email: null,
    });
  });
});
