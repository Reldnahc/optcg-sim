import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  dockedInfoWindowTabIds,
  dockedInfoWindowStateAfterDockTabDragOut,
  floatingGroupedInfoWindowIds,
  groupedInfoWindowIdsAfterDockDrop,
  groupedInfoWindowIdsAfterDrop,
  groupedInfoWindowIdsAfterDockTabDragOut,
  groupedInfoWindowIdsAfterTabDragOut,
  standaloneInfoWindowIds,
  groupedInfoWindowIds,
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

  test("dragging an info tab out of the control dock removes it from the saved group", () => {
    assert.deepEqual(
      groupedInfoWindowIdsAfterDockTabDragOut(allInfoTabs, "settings"),
      ["preview", "log"],
    );
    assert.deepEqual(
      groupedInfoWindowIdsAfterDockTabDragOut(["preview", "log"], "action-log"),
      [],
    );
    assert.deepEqual(
      groupedInfoWindowIdsAfterDockTabDragOut(
        ["preview", "log"],
        "collection:Player trash",
      ),
      ["preview", "log"],
    );
  });

  test("dragging one tab out of a docked two-tab group leaves the other tab docked", () => {
    assert.deepEqual(
      dockedInfoWindowStateAfterDockTabDragOut(
        ["preview", "log"],
        "action-log",
      ),
      {
        groupedIds: [],
        replacementDockWindowKeys: ["card-preview"],
        replacedDockWindowKeys: ["info-window"],
      },
    );
  });

  test("dragging one tab out of a docked three-tab group keeps the remaining group docked", () => {
    assert.deepEqual(
      dockedInfoWindowStateAfterDockTabDragOut(allInfoTabs, "settings"),
      {
        groupedIds: ["preview", "log"],
        replacementDockWindowKeys: [],
        replacedDockWindowKeys: [],
      },
    );
  });

  test("floating grouped tabs exclude tabs docked individually in the control panel", () => {
    assert.deepEqual(
      floatingGroupedInfoWindowIds({
        visibleIds: allInfoTabs,
        groupedIds: ["preview", "log"],
        dockedWindowIds: new Set(["action-log"]),
      }),
      [],
    );
    assert.deepEqual(
      floatingGroupedInfoWindowIds({
        visibleIds: allInfoTabs,
        groupedIds: allInfoTabs,
        dockedWindowIds: new Set(["settings"]),
      }),
      ["preview", "log"],
    );
  });

  test("floating grouped tabs stay available when the grouped info window itself is docked", () => {
    assert.deepEqual(
      floatingGroupedInfoWindowIds({
        visibleIds: allInfoTabs,
        groupedIds: ["preview", "log"],
        dockedWindowIds: new Set(["info-window"]),
      }),
      ["preview", "log"],
    );
  });

  test("docked grouped info tabs preserve their saved group order", () => {
    assert.deepEqual(
      dockedInfoWindowTabIds(new Set(["info-window"]), [
        "settings",
        "preview",
        "log",
      ]),
      ["settings", "preview", "log"],
    );
  });

  test("floating grouped info tabs preserve their saved group order", () => {
    assert.deepEqual(groupedInfoWindowIds(allInfoTabs, ["settings", "log"]), [
      "settings",
      "log",
    ]);
    assert.deepEqual(
      floatingGroupedInfoWindowIds({
        visibleIds: allInfoTabs,
        groupedIds: ["settings", "preview", "log"],
        dockedWindowIds: new Set(),
      }),
      ["settings", "preview", "log"],
    );
  });

  test("individually docked info tabs preserve the docked window order", () => {
    assert.deepEqual(
      dockedInfoWindowTabIds(
        new Set(["settings", "card-preview", "action-log"]),
        [],
      ),
      ["settings", "preview", "log"],
    );
  });
});
