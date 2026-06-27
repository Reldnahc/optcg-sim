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

  test("round-trips profile title data in json user tokens", () => {
    const token = createDevUserSessionToken(
      "user-1",
      "session-1",
      "Tester",
      undefined,
      {
        key: "regional-winner",
        label: "Regional Winner",
        style: {
          text_color: "#fde68a",
          font_family: "display",
          font_weight: 800,
          gradient: {
            from: "#facc15",
            via: "#fb923c",
            to: "#f43f5e",
            angle: 135,
          },
          outline_color: "#111827",
          glow_color: "#fde68a",
        },
      },
    );

    assert.deepEqual(parseDevSessionToken(token), {
      type: "user",
      userId: "user-1",
      sessionId: "session-1",
      displayName: "Tester",
      title: {
        key: "regional-winner",
        label: "Regional Winner",
        style: {
          text_color: "#fde68a",
          font_family: "display",
          font_weight: 800,
          gradient: {
            from: "#facc15",
            via: "#fb923c",
            to: "#f43f5e",
            angle: 135,
          },
          outline_color: "#111827",
          glow_color: "#fde68a",
        },
      },
    });
  });

  test("omits malformed profile titles and title style fields", () => {
    const token = `user-json:${encodeURIComponent(
      JSON.stringify({
        type: "user",
        userId: "user-1",
        sessionId: "session-1",
        title: {
          key: "regional-winner",
          label: "Regional Winner",
          style: {
            text_color: "rgb(255, 255, 255)",
            font_family: "script",
            font_weight: 950,
            gradient: {
              from: "#facc15",
              via: "gold",
              to: "#f43f5e",
              angle: Number.POSITIVE_INFINITY,
            },
            outline_color: "#111827",
            glow_color: "rgba(255, 255, 255, 0.5)",
            animation: "shine",
          },
        },
      }),
    )}`;

    assert.deepEqual(parseDevSessionToken(token), {
      type: "user",
      userId: "user-1",
      sessionId: "session-1",
      title: {
        key: "regional-winner",
        label: "Regional Winner",
        style: {
          gradient: {
            from: "#facc15",
            to: "#f43f5e",
          },
          outline_color: "#111827",
        },
      },
    });

    const missingKeyToken = `user-json:${encodeURIComponent(
      JSON.stringify({
        type: "user",
        userId: "user-1",
        sessionId: "session-1",
        title: { key: "", label: "Regional Winner" },
      }),
    )}`;

    assert.deepEqual(parseDevSessionToken(missingKeyToken), {
      type: "user",
      userId: "user-1",
      sessionId: "session-1",
    });
  });
});
