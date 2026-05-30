import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  dockedInfoWindowTabIds,
  groupedInfoWindowIdsAfterDockDrop,
  groupedInfoWindowIdsAfterDrop,
  groupedInfoWindowIdsAfterTabDragOut,
  standaloneInfoWindowIds,
} from "./info-window-model.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";

const allInfoTabs: readonly InfoWindowTabId[] = ["preview", "log", "settings"];

describe("info window model", () => {
  test("dragging one tab out keeps the remaining parent tab group intact", () => {
    assert.deepEqual(
      groupedInfoWindowIdsAfterTabDragOut(allInfoTabs, "settings"),
      ["preview", "log"],
    );
    assert.deepEqual(standaloneInfoWindowIds(allInfoTabs, ["preview", "log"]), [
      "settings",
    ]);
  });

  test("dragging from a two-tab group leaves both windows standalone", () => {
    assert.deepEqual(
      groupedInfoWindowIdsAfterTabDragOut(["preview", "log"], "log"),
      [],
    );
    assert.deepEqual(standaloneInfoWindowIds(["preview", "log"], []), [
      "preview",
      "log",
    ]);
  });

  test("dropping a standalone window onto an existing tab group adds only that window", () => {
    assert.deepEqual(
      groupedInfoWindowIdsAfterDrop({
        visibleInfoWindowIds: allInfoTabs,
        currentGroupedInfoWindowIds: ["preview", "log"],
        draggedWindowId: "settings",
        targetWindowId: "log",
      }),
      ["preview", "log", "settings"],
    );
  });

  test("dropping onto a docked standalone info window creates a docked tab group", () => {
    assert.deepEqual(dockedInfoWindowTabIds(new Set(["action-log"]), []), [
      "log",
    ]);
    assert.deepEqual(
      groupedInfoWindowIdsAfterDockDrop({
        visibleInfoWindowIds: allInfoTabs,
        currentGroupedInfoWindowIds: [],
        dockedWindowIds: new Set(["action-log"]),
        draggedWindowIds: ["preview"],
      }),
      {
        groupedIds: ["preview", "log"],
        replacedWindowKeys: ["action-log", "card-preview"],
      },
    );
  });

  test("dropping onto an existing docked info tab group joins that group", () => {
    assert.deepEqual(
      dockedInfoWindowTabIds(new Set(["info-window"]), ["preview", "log"]),
      ["preview", "log"],
    );
    assert.deepEqual(
      groupedInfoWindowIdsAfterDockDrop({
        visibleInfoWindowIds: allInfoTabs,
        currentGroupedInfoWindowIds: ["preview", "log"],
        dockedWindowIds: new Set(["info-window"]),
        draggedWindowIds: ["settings"],
      }),
      {
        groupedIds: ["preview", "log", "settings"],
        replacedWindowKeys: [
          "info-window",
          "card-preview",
          "action-log",
          "settings",
        ],
      },
    );
  });
});
