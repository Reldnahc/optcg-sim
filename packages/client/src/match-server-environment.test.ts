import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { matchServerBaseUrlFromEnvironment } from "./match-server-environment.js";

describe("match server environment", () => {
  test("keeps same-origin transport behavior by default", () => {
    assert.equal(matchServerBaseUrlFromEnvironment({}), "");
  });

  test("uses the configured deployed match server origin", () => {
    assert.equal(
      matchServerBaseUrlFromEnvironment({
        VITE_OPTCG_MATCH_SERVER_URL: " https://sim-dev.poneglyph.one/ ",
      }),
      "https://sim-dev.poneglyph.one/",
    );
  });
});
