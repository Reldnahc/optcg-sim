import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createMemoryClientStorage } from "../session.js";
import { createRevealWindowStateStore } from "./window-state-store.js";

describe("reveal window state store", () => {
  test("persists dismissed and minimized reveal ids by match", () => {
    const storage = createMemoryClientStorage();
    const matchOne = createRevealWindowStateStore({
      storage,
      matchId: "match-1",
    });
    const matchTwo = createRevealWindowStateStore({
      storage,
      matchId: "match-2",
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
      matchId: "match-1",
    });

    assert.deepEqual([...store.loadDismissedRevealIds()], []);
  });

  test("persists floating window rectangles by match", () => {
    const storage = createMemoryClientStorage();
    const matchOne = createRevealWindowStateStore({
      storage,
      matchId: "match-1",
    });
    const matchTwo = createRevealWindowStateStore({
      storage,
      matchId: "match-2",
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
      matchId: "match-1",
    });
    const matchTwo = createRevealWindowStateStore({
      storage,
      matchId: "match-2",
    });

    matchOne.saveOpenWindowIds(
      new Set(["action-log", "collection:Player trash"]),
    );

    assert.deepEqual(
      [...matchOne.loadOpenWindowIds()],
      ["action-log", "collection:Player trash"],
    );
    assert.deepEqual(
      [...matchTwo.loadOpenWindowIds()],
      ["card-preview", "action-log", "settings"],
    );
  });

  test("defaults unsaved windows to preview open and docked first", () => {
    const storage = createMemoryClientStorage();
    const store = createRevealWindowStateStore({
      storage,
      matchId: "match-1",
    });

    assert.deepEqual(
      [...store.loadOpenWindowIds()],
      ["card-preview", "action-log", "settings"],
    );
    assert.deepEqual(
      [...store.loadDockedWindowIds()],
      ["card-preview", "action-log", "settings"],
    );
  });

  test("preserves an intentionally saved empty window layout", () => {
    const storage = createMemoryClientStorage();
    const store = createRevealWindowStateStore({
      storage,
      matchId: "match-1",
    });

    store.saveOpenWindowIds(new Set());
    store.saveDockedWindowIds(new Set());

    assert.deepEqual([...store.loadOpenWindowIds()], []);
    assert.deepEqual([...store.loadDockedWindowIds()], []);
  });

  test("persists control panel width by match", () => {
    const storage = createMemoryClientStorage();
    const matchOne = createRevealWindowStateStore({
      storage,
      matchId: "match-1",
    });
    const matchTwo = createRevealWindowStateStore({
      storage,
      matchId: "match-2",
    });

    matchOne.saveControlPanelLayout({
      controlRailWidth: 340,
    });

    assert.deepEqual(matchOne.loadControlPanelLayout(), {
      controlRailWidth: 340,
    });
    assert.deepEqual(matchTwo.loadControlPanelLayout(), {});
  });

  test("ignores legacy saved dock height in the control panel layout", () => {
    const storage = createMemoryClientStorage();
    storage.setItem(
      "optcg:client:control-panel-layout:match-1",
      JSON.stringify({ controlRailWidth: 340, controlDockHeight: 420 }),
    );
    const store = createRevealWindowStateStore({
      storage,
      matchId: "match-1",
    });

    assert.deepEqual(store.loadControlPanelLayout(), {
      controlRailWidth: 340,
    });
  });

  test("fails closed to empty control panel layout for malformed stored data", () => {
    const storage = createMemoryClientStorage();
    storage.setItem(
      "optcg:client:control-panel-layout:match-1",
      JSON.stringify({ controlRailWidth: "340" }),
    );
    const store = createRevealWindowStateStore({
      storage,
      matchId: "match-1",
    });

    assert.deepEqual(store.loadControlPanelLayout(), {});
  });

  test("persists info window tab config by match", () => {
    const storage = createMemoryClientStorage();
    const matchOne = createRevealWindowStateStore({
      storage,
      matchId: "match-1",
    });
    const matchTwo = createRevealWindowStateStore({
      storage,
      matchId: "match-2",
    });

    matchOne.saveInfoWindowConfig({
      activeTabId: "settings",
      groupedTabIds: ["preview", "settings"],
    });

    assert.deepEqual(matchOne.loadInfoWindowConfig(), {
      activeTabId: "settings",
      groupedTabIds: ["preview", "settings"],
    });
    assert.deepEqual(matchTwo.loadInfoWindowConfig(), {
      activeTabId: "preview",
      groupedTabIds: [],
    });
  });

  test("loads legacy boolean info window grouping as all known tabs", () => {
    const storage = createMemoryClientStorage();
    storage.setItem(
      "optcg:client:info-window-config:match-1",
      JSON.stringify({ activeTabId: "log", grouped: true }),
    );
    const store = createRevealWindowStateStore({
      storage,
      matchId: "match-1",
    });

    assert.deepEqual(store.loadInfoWindowConfig(), {
      activeTabId: "log",
      groupedTabIds: ["preview", "log", "settings"],
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
      matchId: "match-1",
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
      matchId: "match-1",
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
      matchId: "match-1",
    });

    assert.deepEqual(store.loadInfoWindowConfig(), {
      activeTabId: "preview",
      groupedTabIds: [],
    });
  });
});
