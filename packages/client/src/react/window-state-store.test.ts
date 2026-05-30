import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { MatchId } from "@optcg/types";

import { createMemoryClientStorage } from "../session.js";
import { createRevealWindowStateStore } from "./window-state-store.js";

describe("reveal window state store", () => {
  test("persists dismissed and minimized reveal ids by match", () => {
    const storage = createMemoryClientStorage();
    const matchOne = createRevealWindowStateStore({
      storage,
      matchId: "match-1" as MatchId,
    });
    const matchTwo = createRevealWindowStateStore({
      storage,
      matchId: "match-2" as MatchId,
    });

    matchOne.saveDismissedRevealIds(new Set(["reveal-1", "reveal-2"]));
    matchOne.saveMinimizedRevealIds(new Set(["reveal-2"]));

    assert.deepEqual(
      [...matchOne.loadDismissedRevealIds()],
      ["reveal-1", "reveal-2"],
    );
    assert.deepEqual([...matchOne.loadMinimizedRevealIds()], ["reveal-2"]);
    assert.deepEqual([...matchTwo.loadDismissedRevealIds()], []);
    assert.deepEqual([...matchTwo.loadMinimizedRevealIds()], []);
  });

  test("fails closed to empty sets for malformed stored data", () => {
    const storage = createMemoryClientStorage();
    storage.setItem(
      "optcg:client:reveal-window-state:match-1:dismissed",
      JSON.stringify({ revealId: "not-an-array" }),
    );
    const store = createRevealWindowStateStore({
      storage,
      matchId: "match-1" as MatchId,
    });

    assert.deepEqual([...store.loadDismissedRevealIds()], []);
  });

  test("persists floating window rectangles by match", () => {
    const storage = createMemoryClientStorage();
    const matchOne = createRevealWindowStateStore({
      storage,
      matchId: "match-1" as MatchId,
    });
    const matchTwo = createRevealWindowStateStore({
      storage,
      matchId: "match-2" as MatchId,
    });

    matchOne.saveWindowRects({
      "card-preview": { x: 10, y: 20, width: 300, height: 400 },
      "collection:Trash": { x: 30, y: 40, width: 500, height: 260 },
    });

    assert.deepEqual(matchOne.loadWindowRects(), {
      "card-preview": { x: 10, y: 20, width: 300, height: 400 },
      "collection:Trash": { x: 30, y: 40, width: 500, height: 260 },
    });
    assert.deepEqual(matchTwo.loadWindowRects(), {});
  });

  test("persists open floating window ids by match", () => {
    const storage = createMemoryClientStorage();
    const matchOne = createRevealWindowStateStore({
      storage,
      matchId: "match-1" as MatchId,
    });
    const matchTwo = createRevealWindowStateStore({
      storage,
      matchId: "match-2" as MatchId,
    });

    matchOne.saveOpenWindowIds(
      new Set(["action-log", "collection:Player trash"]),
    );

    assert.deepEqual(
      [...matchOne.loadOpenWindowIds()],
      ["action-log", "collection:Player trash"],
    );
    assert.deepEqual([...matchTwo.loadOpenWindowIds()], []);
  });

  test("persists info window tab config by match", () => {
    const storage = createMemoryClientStorage();
    const matchOne = createRevealWindowStateStore({
      storage,
      matchId: "match-1" as MatchId,
    });
    const matchTwo = createRevealWindowStateStore({
      storage,
      matchId: "match-2" as MatchId,
    });

    matchOne.saveInfoWindowConfig({
      activeTabId: "settings",
      grouped: true,
    });

    assert.deepEqual(matchOne.loadInfoWindowConfig(), {
      activeTabId: "settings",
      grouped: true,
    });
    assert.deepEqual(matchTwo.loadInfoWindowConfig(), {
      activeTabId: "preview",
      grouped: false,
    });
  });

  test("fails closed to empty open window ids for malformed stored data", () => {
    const storage = createMemoryClientStorage();
    storage.setItem(
      "optcg:client:open-floating-windows:match-1",
      JSON.stringify({ window: "action-log" }),
    );
    const store = createRevealWindowStateStore({
      storage,
      matchId: "match-1" as MatchId,
    });

    assert.deepEqual([...store.loadOpenWindowIds()], []);
  });

  test("fails closed to empty window rectangles for malformed stored data", () => {
    const storage = createMemoryClientStorage();
    storage.setItem(
      "optcg:client:floating-window-rects:match-1",
      JSON.stringify({
        good: { x: 10, y: 20, width: 300, height: 400 },
        bad: { x: "10", y: 20, width: 300, height: 400 },
      }),
    );
    const store = createRevealWindowStateStore({
      storage,
      matchId: "match-1" as MatchId,
    });

    assert.deepEqual(store.loadWindowRects(), {
      good: { x: 10, y: 20, width: 300, height: 400 },
    });
  });

  test("fails closed to default info window config for malformed stored data", () => {
    const storage = createMemoryClientStorage();
    storage.setItem(
      "optcg:client:info-window-config:match-1",
      JSON.stringify({ activeTabId: "settings", grouped: "yes" }),
    );
    const store = createRevealWindowStateStore({
      storage,
      matchId: "match-1" as MatchId,
    });

    assert.deepEqual(store.loadInfoWindowConfig(), {
      activeTabId: "preview",
      grouped: false,
    });
  });
});
