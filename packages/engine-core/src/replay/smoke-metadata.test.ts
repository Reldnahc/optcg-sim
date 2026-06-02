import assert from "node:assert/strict";
import { test } from "vitest";

import {
  collectForbiddenKeys,
  loadFixtureV1,
  loadFixtureV2,
  loadPlayCardFixture,
} from "./smoke-test-support.js";

test("ENG-002F fixture rejects timestamp-like and transport-only metadata keys", () => {
  const fixture = loadFixtureV1();
  assert.equal(
    fixture.setupInput.cardManifest.createdAt,
    "2026-05-04T00:00:00.000Z",
  );
  assert.deepEqual(collectForbiddenKeys(fixture, ""), []);
  assert.deepEqual(
    collectForbiddenKeys(
      {
        ...fixture,
        receivedAt: "2026-05-04T00:00:00.000Z",
        connectionId: "conn-1",
        actionScript: [
          {
            ...fixture.actionScript[0],
            clientActionId: "client-action-1",
          },
        ],
      },
      "",
    ).sort(),
    ["actionScript[0].clientActionId", "connectionId", "receivedAt"],
  );
});

test("fixture determinism rejects transport/audit keys and allows deterministic manifest createdAt", () => {
  const fixture = loadFixtureV2();
  assert.equal(
    fixture.setupInput.cardManifest.createdAt,
    "2026-05-04T00:00:00.000Z",
  );
  assert.deepEqual(collectForbiddenKeys(fixture, ""), []);
  assert.deepEqual(
    collectForbiddenKeys(
      {
        ...fixture,
        connectionId: "conn-1",
        receivedAt: "2026-05-04T00:00:00.000Z",
        scenarios: [
          { ...fixture.scenarios[0], clientActionId: "client-action-1" },
        ],
      },
      "",
    ).sort(),
    ["connectionId", "receivedAt", "scenarios[0].clientActionId"],
  );
});

test("ENG-005C fixture determinism rejects transport/audit keys and allows deterministic manifest createdAt", () => {
  const fixture = loadPlayCardFixture();
  assert.equal(
    fixture.setupInput.cardManifest.createdAt,
    "2026-05-04T00:00:00.000Z",
  );
  assert.deepEqual(collectForbiddenKeys(fixture, ""), []);
  assert.deepEqual(
    collectForbiddenKeys(
      {
        ...fixture,
        audit: [{ receivedAt: "2026-05-04T00:00:00.000Z" }],
        clientId: "client-1",
        signature: "sig",
        scenarios: [
          {
            ...fixture.scenarios[0],
            actionScript: [
              {
                ...fixture.scenarios[0]?.actionScript[0],
                clientActionId: "client-action-1",
              },
            ],
          },
        ],
      },
      "",
    ).sort(),
    [
      "audit[0].receivedAt",
      "clientId",
      "scenarios[0].actionScript[0].clientActionId",
      "signature",
    ],
  );
});
