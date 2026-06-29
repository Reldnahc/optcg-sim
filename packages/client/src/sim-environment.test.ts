import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  allowsLocalRawDeckSubmissions,
  simAccessEnvironmentForLocation,
} from "./sim-environment.js";

describe("sim environment", () => {
  test("allows raw deck submissions only for local browser hosts", () => {
    assert.equal(
      allowsLocalRawDeckSubmissions({ hostname: "localhost" }),
      true,
    );
    assert.equal(
      allowsLocalRawDeckSubmissions({ hostname: "127.0.0.1" }),
      true,
    );
    assert.equal(
      allowsLocalRawDeckSubmissions({ hostname: "local-sim.poneglyph.one" }),
      true,
    );
    assert.equal(
      allowsLocalRawDeckSubmissions({ hostname: "sim-dev.poneglyph.one" }),
      false,
    );
    assert.equal(
      allowsLocalRawDeckSubmissions({ hostname: "sim.poneglyph.one" }),
      false,
    );
  });

  test("maps browser hosts to sim access environments", () => {
    assert.equal(
      simAccessEnvironmentForLocation({ hostname: "localhost" }),
      "local",
    );
    assert.equal(
      simAccessEnvironmentForLocation({ hostname: "local-sim.poneglyph.one" }),
      "local",
    );
    assert.equal(
      simAccessEnvironmentForLocation({ hostname: "sim-dev.poneglyph.one" }),
      "dev",
    );
  });
});
