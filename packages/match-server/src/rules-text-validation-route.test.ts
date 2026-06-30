import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createMatchHttpServer } from "./match-http-server.js";

describe("rules text validation route", () => {
  test("validates rules text for authorized internal callers", async () => {
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      internalRulesTextValidationToken: "test-token",
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(
        `${server.url()}/internal/rules-text/validate`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-poneglyph-internal-token": "test-token",
          },
          body: JSON.stringify({
            effect: "[On Play] Draw 1 card.",
            trigger: null,
          }),
        },
      );

      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        readonly data: {
          readonly supported: boolean;
          readonly lines: readonly unknown[];
        };
      };
      assert.equal(body.data.supported, true);
      assert.equal(body.data.lines.length, 1);
    } finally {
      await server.close();
    }
  });

  test("rejects rules text validation without the internal token", async () => {
    const server = await createMatchHttpServer({
      createDefaultMatch: false,
      internalRulesTextValidationToken: "test-token",
    });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(
        `${server.url()}/internal/rules-text/validate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ effect: "[On Play] Draw 1 card." }),
        },
      );

      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        errors: ["Internal token is required."],
      });
    } finally {
      await server.close();
    }
  });

  test("does not expose rules text validation when the internal token is unset", async () => {
    const server = await createMatchHttpServer({ createDefaultMatch: false });
    await server.listen(0, "127.0.0.1");
    try {
      const response = await fetch(
        `${server.url()}/internal/rules-text/validate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ effect: "[On Play] Draw 1 card." }),
        },
      );

      assert.equal(response.status, 404);
    } finally {
      await server.close();
    }
  });
});
