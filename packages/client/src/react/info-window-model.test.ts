import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
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
});
