import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { SimAuthSession } from "../sim-auth-client.js";
import { simAuthSessionToken } from "./use-sim-auth.js";

describe("sim auth session token", () => {
  test("includes the public account display name for dev match identity", () => {
    const session: SimAuthSession = {
      user: {
        id: "user-1",
        username: "tester",
        display_name: "Tester One",
        email: null,
        email_verified: false,
      },
      session: {
        id: "session-1",
        expiresAt: "2026-06-03T00:00:00.000Z",
      },
    };

    assert.equal(
      simAuthSessionToken(session),
      "user:user-1:session-1:Tester%20One",
    );
  });
});
