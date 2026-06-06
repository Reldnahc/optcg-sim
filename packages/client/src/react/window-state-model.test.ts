import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  floatingWindowStateAfterDockedWindowReorder,
  floatingWindowStateAfterFloatingGroupOpen,
  floatingWindowStateAfterActivation,
  floatingWindowStateAfterCollectionOpenChange,
  floatingWindowStateAfterOpenChange,
  type FloatingWindowRectState,
} from "./window-state-model.js";

describe("floating window state model", () => {
  test("closing a docked window preserves its dock membership for reopen", () => {
    const current: FloatingWindowRectState = {
      scope: "match-1",
      rects: {
        "action-log": { x: 900, y: 500, width: 300, height: 220 },
      },
      openWindowIds: new Set(["action-log"]),
      dockedWindowIds: new Set(["action-log"]),
      floatingWindowZOrder: [],
    };

    const closed = floatingWindowStateAfterOpenChange({
      current,
      scope: "match-1",
      windowKey: "action-log",
      open: false,
    });
    const reopened = floatingWindowStateAfterOpenChange({
      current: closed,
      scope: "match-1",
      windowKey: "action-log",
      open: true,
    });

    assert.deepEqual([...closed.openWindowIds], []);
    assert.deepEqual([...closed.dockedWindowIds], ["action-log"]);
    assert.deepEqual([...reopened.openWindowIds], ["action-log"]);
    assert.deepEqual([...reopened.dockedWindowIds], ["action-log"]);
  });

  test("closing a docked collection window preserves its dock membership for reopen", () => {
    const current: FloatingWindowRectState = {
      scope: "match-1",
      rects: {
        "collection:Player trash": { x: 900, y: 500, width: 300, height: 220 },
      },
      openWindowIds: new Set(["collection:Player trash"]),
      dockedWindowIds: new Set(["collection:Player trash"]),
      floatingWindowZOrder: [],
    };

    const closed = floatingWindowStateAfterCollectionOpenChange({
      current,
      scope: "match-1",
      windowKey: "collection:Player trash",
      open: false,
    });
    const reopened = floatingWindowStateAfterCollectionOpenChange({
      current: closed,
      scope: "match-1",
      windowKey: "collection:Player trash",
      open: true,
    });

    assert.deepEqual([...closed.openWindowIds], []);
    assert.deepEqual([...closed.dockedWindowIds], ["collection:Player trash"]);
    assert.deepEqual([...reopened.openWindowIds], ["collection:Player trash"]);
    assert.deepEqual(
      [...reopened.dockedWindowIds],
      ["collection:Player trash"],
    );
  });

  test("reordering docked windows preserves the requested dock tab order", () => {
    const current: FloatingWindowRectState = {
      scope: "match-1",
      rects: {},
      openWindowIds: new Set(["action-log", "settings", "collection:Trash"]),
      dockedWindowIds: new Set(["action-log", "settings", "collection:Trash"]),
      floatingWindowZOrder: [],
    };

    const next = floatingWindowStateAfterDockedWindowReorder({
      current,
      scope: "match-1",
      draggedWindowKey: "collection:Trash",
      targetWindowKey: "action-log",
      placement: "before",
    });

    assert.deepEqual(
      [...next.dockedWindowIds],
      ["collection:Trash", "action-log", "settings"],
    );
    assert.deepEqual(
      [...next.openWindowIds],
      ["action-log", "settings", "collection:Trash"],
    );
  });

  test("activating a floating window moves it to the top of z-order", () => {
    const current: FloatingWindowRectState = {
      scope: "match-1",
      rects: {},
      openWindowIds: new Set(["action-log", "settings", "preview"]),
      dockedWindowIds: new Set(["settings"]),
      floatingWindowZOrder: ["preview", "action-log"],
    };

    const next = floatingWindowStateAfterActivation({
      current,
      scope: "match-1",
      windowKey: "preview",
    });

    assert.deepEqual(next.floatingWindowZOrder, ["action-log", "preview"]);
  });

  test("activating closed or docked windows does not add them to floating z-order", () => {
    const current: FloatingWindowRectState = {
      scope: "match-1",
      rects: {},
      openWindowIds: new Set(["action-log", "settings"]),
      dockedWindowIds: new Set(["settings"]),
      floatingWindowZOrder: ["action-log"],
    };

    const closed = floatingWindowStateAfterActivation({
      current,
      scope: "match-1",
      windowKey: "preview",
    });
    const docked = floatingWindowStateAfterActivation({
      current,
      scope: "match-1",
      windowKey: "settings",
    });

    assert.deepEqual(closed.floatingWindowZOrder, ["action-log"]);
    assert.deepEqual(docked.floatingWindowZOrder, ["action-log"]);
  });

  test("opening a floating group clears stale member docking and persists the group host", () => {
    const current: FloatingWindowRectState = {
      scope: "match-1",
      rects: {
        "action-log": { x: 760, y: 120, width: 280, height: 340 },
        "info-window": { x: 440, y: 180, width: 320, height: 340 },
      },
      openWindowIds: new Set(["card-preview", "action-log", "settings"]),
      dockedWindowIds: new Set(["action-log", "settings"]),
      floatingWindowZOrder: ["card-preview"],
    };

    const next = floatingWindowStateAfterFloatingGroupOpen({
      current,
      scope: "match-1",
      windowKey: "info-window",
      rect: { x: 500, y: 140, width: 360, height: 380 },
      replacedWindowKeys: ["card-preview", "action-log"],
    });

    assert.deepEqual(
      [...next.openWindowIds],
      ["card-preview", "action-log", "settings", "info-window"],
    );
    assert.deepEqual([...next.dockedWindowIds], ["settings"]);
    assert.deepEqual(next.rects["info-window"], {
      x: 500,
      y: 140,
      width: 360,
      height: 380,
    });
    assert.deepEqual(next.floatingWindowZOrder, [
      "card-preview",
      "info-window",
    ]);
  });
});
