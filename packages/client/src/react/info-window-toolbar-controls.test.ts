import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { ClientCardModel } from "../view-model.js";
import {
  actionLogWindowKey,
  cardPreviewWindowKey,
  infoWindowKey,
  settingsWindowKey,
} from "./info-window-model.js";
import { createInfoWindowToolbarControls } from "./info-window-toolbar-controls.js";
import type { InfoWindowTabId } from "./InfoTabbedWindow.js";

const previewCard = (): ClientCardModel => ({
  instanceId: "preview-instance" as ClientCardModel["instanceId"],
  cardId: "OP00-001" as ClientCardModel["cardId"],
  name: "Preview Card",
  category: "Character",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const createHarness = (
  overrides: Partial<{
    previewOpen: boolean;
    actionLogOpen: boolean;
    settingsOpen: boolean;
    activeDockedWindowIds: ReadonlySet<string>;
    configuredGroupedInfoWindowIds: readonly InfoWindowTabId[];
  }> = {},
) => {
  const calls = {
    previewCards: [] as (ClientCardModel | undefined)[],
    previewOpen: [] as boolean[],
    previewMinimized: [] as boolean[],
    actionLogOpen: [] as boolean[],
    actionLogMinimized: [] as boolean[],
    settingsOpen: [] as boolean[],
    infoWindowMinimized: [] as boolean[],
    activeTabs: [] as InfoWindowTabId[],
    groupedTabs: [] as (readonly InfoWindowTabId[])[],
    dockActiveTabs: [] as (string | undefined)[],
    floatingOpen: [] as { key: string; open: boolean }[],
  };
  const controls = createInfoWindowToolbarControls({
    previewOpen: overrides.previewOpen ?? false,
    actionLogOpen: overrides.actionLogOpen ?? false,
    settingsOpen: overrides.settingsOpen ?? false,
    activeDockedWindowIds: overrides.activeDockedWindowIds ?? new Set(),
    configuredGroupedInfoWindowIds:
      overrides.configuredGroupedInfoWindowIds ?? [],
    setPreviewCard: (card) => {
      calls.previewCards.push(card);
    },
    setPreviewOpen: (open) => {
      calls.previewOpen.push(open);
    },
    setPreviewMinimized: (minimized) => {
      calls.previewMinimized.push(minimized);
    },
    setActionLogOpen: (open) => {
      calls.actionLogOpen.push(open);
    },
    setActionLogMinimized: (minimized) => {
      calls.actionLogMinimized.push(minimized);
    },
    setSettingsOpen: (open) => {
      calls.settingsOpen.push(open);
    },
    setInfoWindowMinimized: (minimized) => {
      calls.infoWindowMinimized.push(minimized);
    },
    setInfoWindowActiveTab: (tabId) => {
      calls.activeTabs.push(tabId);
    },
    setGroupedInfoWindowIds: (tabIds) => {
      calls.groupedTabs.push(tabIds);
    },
    setControlDockActiveTabId: (windowKey) => {
      calls.dockActiveTabs.push(windowKey);
    },
    updateFloatingWindowOpen: (key, open) => {
      calls.floatingOpen.push({ key, open });
    },
  });
  return { calls, controls };
};

describe("info window toolbar controls", () => {
  test("focuses an already-open action log instead of closing it", () => {
    const { calls, controls } = createHarness({ actionLogOpen: true });

    controls.focusActionLogWindow();

    assert.deepEqual(calls.actionLogOpen, [true]);
    assert.deepEqual(calls.actionLogMinimized, [false]);
    assert.deepEqual(calls.infoWindowMinimized, [false]);
    assert.deepEqual(calls.activeTabs, ["log"]);
    assert.deepEqual(calls.floatingOpen, [
      { key: actionLogWindowKey, open: true },
    ]);
  });

  test("focuses the control dock tab when the requested window is docked", () => {
    const { calls, controls } = createHarness({
      previewOpen: true,
      activeDockedWindowIds: new Set([cardPreviewWindowKey]),
    });

    controls.focusPreviewWindow();

    assert.deepEqual(calls.previewOpen, [true]);
    assert.deepEqual(calls.previewMinimized, [false]);
    assert.deepEqual(calls.activeTabs, ["preview"]);
    assert.deepEqual(calls.dockActiveTabs, [cardPreviewWindowKey]);
    assert.deepEqual(calls.floatingOpen, [
      { key: cardPreviewWindowKey, open: true },
    ]);
  });

  test("focuses the grouped floating shell when opening a grouped tab", () => {
    const { calls, controls } = createHarness({
      previewOpen: true,
      settingsOpen: false,
      configuredGroupedInfoWindowIds: ["preview", "settings"],
    });

    controls.focusSettingsWindow();

    assert.deepEqual(calls.settingsOpen, [true]);
    assert.deepEqual(calls.infoWindowMinimized, [false]);
    assert.deepEqual(calls.activeTabs, ["settings"]);
    assert.deepEqual(calls.floatingOpen, [
      { key: settingsWindowKey, open: true },
      { key: infoWindowKey, open: true },
    ]);
  });

  test("showing a card preview opens and focuses preview in one path", () => {
    const card = previewCard();
    const { calls, controls } = createHarness();

    controls.showCardPreview(card);

    assert.deepEqual(calls.previewCards, [card]);
    assert.deepEqual(calls.previewOpen, [true]);
    assert.deepEqual(calls.previewMinimized, [false]);
    assert.deepEqual(calls.activeTabs, ["preview"]);
    assert.deepEqual(calls.floatingOpen, [
      { key: cardPreviewWindowKey, open: true },
    ]);
  });
});
