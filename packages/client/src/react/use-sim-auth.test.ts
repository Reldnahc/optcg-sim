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
      `user-json:${encodeURIComponent(
        JSON.stringify({
          type: "user",
          userId: "user-1",
          sessionId: "session-1",
          displayName: "Tester One",
        }),
      )}`,
    );
  });

  test("includes the account avatar crop for dev match identity", () => {
    const session = {
      user: {
        id: "user-1",
        username: "tester",
        display_name: "Tester One",
        email: null,
        email_verified: false,
        profile: {
          avatar: {
            card_image_id: "card-image-1",
            image_source: "scan",
            image_url: "https://cdn.example/avatar.png",
            crop: { x: 0.25, y: 0.1, size: 0.5 },
          },
        },
      },
      session: {
        id: "session-1",
        expiresAt: "2026-06-03T00:00:00.000Z",
      },
    } as SimAuthSession;

    const token = simAuthSessionToken(session);
    assert.equal(token.startsWith("user-json:"), true);
    assert.deepEqual(JSON.parse(decodeURIComponent(token.slice(10))), {
      type: "user",
      userId: "user-1",
      sessionId: "session-1",
      displayName: "Tester One",
      avatar: {
        imageUrl: "https://cdn.example/avatar.png",
        crop: { x: 0.25, y: 0.1, size: 0.5 },
      },
    });
  });

  test("includes the selected profile title for dev match identity", () => {
    const session = {
      user: {
        id: "user-1",
        username: "tester",
        display_name: "Tester One",
        email: null,
        email_verified: false,
        profile: {
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
        },
      },
      session: {
        id: "session-1",
        expiresAt: "2026-06-03T00:00:00.000Z",
      },
    } as SimAuthSession;

    const token = simAuthSessionToken(session);
    assert.equal(token.startsWith("user-json:"), true);
    assert.deepEqual(JSON.parse(decodeURIComponent(token.slice(10))), {
      type: "user",
      userId: "user-1",
      sessionId: "session-1",
      displayName: "Tester One",
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
});
