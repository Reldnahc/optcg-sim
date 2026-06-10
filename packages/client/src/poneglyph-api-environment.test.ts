import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { poneglyphApiBaseUrlFromEnvironment } from "./poneglyph-api-environment.js";

describe("poneglyph api environment", () => {
  test("targets the production public API by default", () => {
    assert.equal(
      poneglyphApiBaseUrlFromEnvironment({}),
      "https://api.poneglyph.one",
    );
  });

  test("uses configured public API origin", () => {
    assert.equal(
      poneglyphApiBaseUrlFromEnvironment({
        VITE_PONEGLYPH_API_BASE_URL: " https://api-dev.poneglyph.one/ ",
      }),
      "https://api-dev.poneglyph.one/",
    );
  });
});
