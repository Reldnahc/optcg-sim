import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
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
});
