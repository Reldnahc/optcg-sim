import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createDevUserSessionToken, parseDevSessionToken } from "./dev-auth.js";

describe("dev auth session token", () => {
  test("parses legacy user tokens without avatar data", () => {
    assert.deepEqual(parseDevSessionToken("user:user-1:session-1:Tester"), {
      type: "user",
      userId: "user-1",
      sessionId: "session-1",
      displayName: "Tester",
    });
  });

  test("round-trips avatar data in json user tokens", () => {
    const token = createDevUserSessionToken("user-1", "session-1", "Tester", {
      imageUrl: "https://cdn.example/avatar.png",
      crop: { x: 0.25, y: 0.1, size: 0.5 },
    });

    assert.deepEqual(parseDevSessionToken(token), {
      type: "user",
      userId: "user-1",
      sessionId: "session-1",
      displayName: "Tester",
      avatar: {
        imageUrl: "https://cdn.example/avatar.png",
        crop: { x: 0.25, y: 0.1, size: 0.5 },
      },
    });
  });
});
