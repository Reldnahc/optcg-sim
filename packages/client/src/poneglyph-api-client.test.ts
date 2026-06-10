import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createPoneglyphApiClient } from "./poneglyph-api-client.js";

describe("poneglyph api client", () => {
  test("lists public formats from Poneglyph API", async () => {
    const requests: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      requests.push(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                name: "Standard",
                description: "Current official format",
                has_rotation: true,
                legal_blocks: 5,
                ban_count: 2,
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    };
    const client = createPoneglyphApiClient({
      baseUrl: "https://api.example/",
      fetch: fetchImpl,
    });

    const formats = await client.listFormats();

    assert.deepEqual(requests, ["https://api.example/v1/formats"]);
    assert.deepEqual(formats, [
      {
        name: "Standard",
        description: "Current official format",
        hasRotation: true,
        legalBlocks: 5,
        banCount: 2,
      },
    ]);
  });
});
