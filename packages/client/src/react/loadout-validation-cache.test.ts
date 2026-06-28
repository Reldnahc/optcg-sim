import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { AccountLoadout } from "../account-client.js";
import {
  createLoadoutValidationCache,
  loadoutsWithCachedValidation,
  rememberLoadoutValidation,
} from "./loadout-validation-cache.js";

const loadout = (overrides: Partial<AccountLoadout> = {}): AccountLoadout => ({
  id: "loadout-1",
  name: "Deck",
  folderId: null,
  folderName: null,
  favorite: false,
  leaderCardId: "OP09-001",
  leaderVariantIndex: null,
  leaderImageUrl: null,
  leaderCropFocus: null,
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

describe("loadout validation cache", () => {
  test("hydrates validation by deck hash across loadouts", () => {
    const cache = createLoadoutValidationCache();
    rememberLoadoutValidation({
      cache,
      formatId: "sandbox-open",
      loadout: loadout({ id: "alice", deckHash: "same-deck" }),
      validation: { status: "playable", errors: [] },
      nowMs: 1_000,
    });

    const [hydrated] = loadoutsWithCachedValidation({
      cache,
      formatId: "sandbox-open",
      loadouts: [loadout({ id: "bob", deckHash: "same-deck" })],
      nowMs: 2_000,
    });

    assert.deepEqual(hydrated?.validation, {
      status: "playable",
      errors: [],
    });
  });

  test("falls back to loadout update identity when deck hash is hidden", () => {
    const cache = createLoadoutValidationCache();
    rememberLoadoutValidation({
      cache,
      formatId: "sandbox-open",
      loadout: loadout({ id: "loadout-1" }),
      validation: { status: "unplayable", errors: ["Invalid deck."] },
      nowMs: 1_000,
    });

    const [sameRevision] = loadoutsWithCachedValidation({
      cache,
      formatId: "sandbox-open",
      loadouts: [loadout({ id: "loadout-1" })],
      nowMs: 2_000,
    });
    const [updatedRevision] = loadoutsWithCachedValidation({
      cache,
      formatId: "sandbox-open",
      loadouts: [
        loadout({
          id: "loadout-1",
          updatedAt: "2026-06-02T00:00:00.000Z",
        }),
      ],
      nowMs: 2_000,
    });

    assert.deepEqual(sameRevision?.validation, {
      status: "unplayable",
      errors: ["Invalid deck."],
    });
    assert.deepEqual(updatedRevision?.validation, {
      status: "unchecked",
      errors: [],
    });
  });

  test("does not cache transient unverified results", () => {
    const cache = createLoadoutValidationCache();
    rememberLoadoutValidation({
      cache,
      formatId: "sandbox-open",
      loadout: loadout({ deckHash: "same-deck" }),
      validation: { status: "unverified", errors: ["Network failed."] },
      nowMs: 1_000,
    });

    const [hydrated] = loadoutsWithCachedValidation({
      cache,
      formatId: "sandbox-open",
      loadouts: [loadout({ deckHash: "same-deck" })],
      nowMs: 2_000,
    });

    assert.deepEqual(hydrated?.validation, {
      status: "unchecked",
      errors: [],
    });
  });

  test("does not cache without a lobby format", () => {
    const cache = createLoadoutValidationCache();
    rememberLoadoutValidation({
      cache,
      formatId: undefined,
      loadout: loadout({ deckHash: "same-deck" }),
      validation: { status: "playable", errors: [] },
      nowMs: 1_000,
    });

    const [hydrated] = loadoutsWithCachedValidation({
      cache,
      formatId: "sandbox-open",
      loadouts: [loadout({ deckHash: "same-deck" })],
      nowMs: 2_000,
    });
    const [missingFormat] = loadoutsWithCachedValidation({
      cache,
      formatId: undefined,
      loadouts: [loadout({ deckHash: "same-deck" })],
      nowMs: 2_000,
    });

    assert.deepEqual(hydrated?.validation, {
      status: "unchecked",
      errors: [],
    });
    assert.deepEqual(missingFormat?.validation, {
      status: "unchecked",
      errors: [],
    });
  });
});
