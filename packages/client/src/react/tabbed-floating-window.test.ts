import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { InfoTabbedWindow } from "./InfoTabbedWindow.js";
import { TabbedFloatingWindow } from "./TabbedFloatingWindow.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("tabbed floating window", () => {
  test("renders only the active tab inside the reusable floating shell", () => {
    const markup = renderToStaticMarkup(
      createElement(TabbedFloatingWindow, {
        tabs: [
          {
            id: "preview",
            title: "Preview",
            content: createElement("p", undefined, "Preview content"),
          },
          {
            id: "log",
            title: "Log",
            content: createElement("p", undefined, "Log content"),
          },
        ],
        activeTabId: "log",
        minimized: false,
        onActiveTabChange: () => undefined,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /floating-window/u);
    assert.match(markup, /tabbed-floating-window/u);
    assert.match(markup, /floating-window-header-tabs/u);
    assert.match(markup, /floating-window-header-tabs[\s\S]*role="tablist"/u);
    assert.doesNotMatch(markup, /floating-window-body[\s\S]*role="tablist"/u);
    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-label="Window tabs"/u);
    assert.match(markup, /aria-selected="true"[^>]*>Log<\/button>/u);
    assert.match(markup, /aria-selected="false"[^>]*>Preview<\/button>/u);
    assert.match(markup, /Log content/u);
    assert.doesNotMatch(markup, /Preview content/u);
  });

  test("match app keeps windows independent until explicit drag grouping", async () => {
    const [matchApp, infoWindowModel] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "info-window-model.ts"), "utf8"),
    ]);

    assert.match(infoWindowModel, /const infoWindowKey = "info-window";/u);
    assert.match(matchApp, /infoWindowKey/u);
    assert.match(matchApp, /groupedInfoWindowIds/u);
    assert.match(
      matchApp,
      /showTabbedInfoWindow\s*=\s*groupedInfoWindowIds\.length\s*>=\s*2/u,
    );
    assert.match(matchApp, /InfoTabbedWindow/u);
    assert.match(matchApp, /tabIds=\{groupedInfoWindowIds\}/u);
    assert.match(matchApp, /floatingGroupedInfoWindowIds/u);
    assert.match(matchApp, /completeInfoWindowDrag\("preview", rect\)/u);
    assert.match(matchApp, /completeInfoWindowDrag\("log", rect\)/u);
    assert.match(matchApp, /completeInfoWindowDrag\("settings", rect\)/u);
    assert.match(matchApp, /tryGroupInfoWindow\(draggedWindowId, rect\)/u);
    assert.match(matchApp, /splitInfoWindowTab/u);
    assert.match(
      matchApp,
      /showTabbedInfoWindow && !activeDockedWindowIds\.has\(infoWindowKey\)/u,
    );
    assert.doesNotMatch(
      matchApp,
      /showTabbedInfoWindow && dockedInfoTabIds\.length === 0/u,
    );
    assert.doesNotMatch(
      matchApp,
      /showTabbedInfoWindow\s*=\s*showPreviewWindow\s*&&\s*showActionLogWindow/u,
    );
    assert.doesNotMatch(
      matchApp,
      /showTabbedInfoWindow\s*=\s*infoWindowsGrouped/u,
    );
  });

  test("tabbed windows expose tab drag-out callbacks for splitting", async () => {
    const [tabbedWindow, infoWindow] = await Promise.all([
      readFile(join(sourceDirectory, "TabbedFloatingWindow.tsx"), "utf8"),
      readFile(join(sourceDirectory, "InfoTabbedWindow.tsx"), "utf8"),
    ]);

    assert.match(tabbedWindow, /onTabDragOut/u);
    assert.match(tabbedWindow, /setPointerCapture/u);
    assert.match(infoWindow, /onTabDragOut/u);
  });

  test("tabbed windows reorder tabs before dragging them out of the tab strip", async () => {
    const [tabbedWindow, infoWindow, matchApp] = await Promise.all([
      readFile(join(sourceDirectory, "TabbedFloatingWindow.tsx"), "utf8"),
      readFile(join(sourceDirectory, "InfoTabbedWindow.tsx"), "utf8"),
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
    ]);

    assert.match(tabbedWindow, /tabDragIntentFromPoint/u);
    assert.match(tabbedWindow, /tabReorderTargetFromPointer/u);
    assert.match(tabbedWindow, /onTabReorder/u);
    assert.match(tabbedWindow, /tabStripRect/u);
    assert.match(infoWindow, /onTabReorder/u);
    assert.match(matchApp, /moveIdNear/u);
    assert.match(matchApp, /onTabReorder/u);
    assert.doesNotMatch(
      tabbedWindow,
      /distance\s*>?=\s*tabDragOutDistance[\s\S]*onTabDragOut/u,
    );
  });

  test("tab drag-out releases pointer capture before popping out", async () => {
    const tabbedWindow = await readFile(
      join(sourceDirectory, "TabbedFloatingWindow.tsx"),
      "utf8",
    );

    assert.match(tabbedWindow, /releasePointerCapture/u);
    assert.match(
      tabbedWindow,
      /releaseTabPointerCapture\([\s\S]*event\.currentTarget,[\s\S]*event\.pointerId,[\s\S]*\);[\s\S]*onTabDragOut/u,
    );
  });

  test("tabbed windows pop tabs out immediately instead of showing tear-out feedback", async () => {
    const markup = renderToStaticMarkup(
      createElement(TabbedFloatingWindow, {
        tabs: [
          {
            id: "preview",
            title: "Preview",
            content: createElement("p", undefined, "Preview content"),
          },
          {
            id: "log",
            title: "Log",
            content: createElement("p", undefined, "Log content"),
          },
        ],
        activeTabId: "preview",
        minimized: false,
        onActiveTabChange: () => undefined,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
      }),
    );
    const [tabbedWindow, tabbedStyles] = await Promise.all([
      readFile(join(sourceDirectory, "TabbedFloatingWindow.tsx"), "utf8"),
      readFile(
        join(sourceDirectory, "styles", "tabbed-floating-window.css"),
        "utf8",
      ),
    ]);

    assert.doesNotMatch(markup, /is-tab-tearing-out/u);
    assert.match(tabbedWindow, /onPointerMove[\s\S]*onTabDragOut/u);
    assert.match(
      tabbedWindow,
      /tabDragStart\.current\s*=\s*undefined;[\s\S]*onTabDragOut/u,
    );
    assert.doesNotMatch(tabbedStyles, /\.is-tab-tearing-out/u);
  });

  test("match app exposes combine drop feedback classes", async () => {
    const [matchApp, tabbedStyles] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(
        join(sourceDirectory, "styles", "tabbed-floating-window.css"),
        "utf8",
      ),
    ]);

    assert.match(matchApp, /combineDropTarget/u);
    assert.match(matchApp, /is-combine-drop-target/u);
    assert.match(
      matchApp,
      /groupedInfoWindowIds\.includes\(combineDropTarget\)/u,
    );
    assert.match(matchApp, /groupableInfoWindows/u);
    assert.match(matchApp, /combineDropTargetForWindow/u);
    assert.match(tabbedStyles, /\.is-combine-drop-target/u);
  });

  test("match app docks info tabs through the generic control dock host", async () => {
    const matchApp = await readFile(
      join(sourceDirectory, "MatchApp.tsx"),
      "utf8",
    );

    assert.match(matchApp, /dockInfoWindowTabs/u);
    assert.match(matchApp, /dockFloatingWindows/u);
    assert.match(matchApp, /controlDockTabs/u);
    assert.match(matchApp, /dockTabs=\{controlDockTabs\}/u);
    assert.doesNotMatch(matchApp, /groupedInfoWindowIdsAfterDockDrop/u);
    assert.match(matchApp, /completeInfoGroupDrag/u);
  });

  test("grouped info windows can show combine drop feedback on the parent shell", () => {
    const markup = renderToStaticMarkup(
      createElement(InfoTabbedWindow, {
        entries: [],
        logOpen: true,
        settingsOpen: true,
        tabIds: ["log", "settings"],
        activeTabId: "log",
        minimized: false,
        className: "is-combine-drop-target",
        onActiveTabChange: () => undefined,
        onToggleMinimized: () => undefined,
        onCloseActiveTab: () => undefined,
      }),
    );

    assert.match(
      markup,
      /class="[^"]*info-tabbed-window[^"]*is-combine-drop-target/u,
    );
  });

  test("grouped info windows render tabs in the saved tab order", () => {
    const markup = renderToStaticMarkup(
      createElement(InfoTabbedWindow, {
        entries: [],
        logOpen: true,
        settingsOpen: true,
        tabIds: ["settings", "log"],
        activeTabId: "settings",
        minimized: false,
        onActiveTabChange: () => undefined,
        onToggleMinimized: () => undefined,
        onCloseActiveTab: () => undefined,
      }),
    );

    assert.ok(
      markup.indexOf('data-tab-id="settings"') <
        markup.indexOf('data-tab-id="log"'),
    );
  });

  test("grouped info windows keep an empty preview tab visible", () => {
    const markup = renderToStaticMarkup(
      createElement(InfoTabbedWindow, {
        entries: [],
        logOpen: true,
        settingsOpen: false,
        tabIds: ["preview", "log"],
        activeTabId: "preview",
        minimized: false,
        onActiveTabChange: () => undefined,
        onToggleMinimized: () => undefined,
        onCloseActiveTab: () => undefined,
      }),
    );

    assert.match(markup, /data-tab-id="preview"/u);
    assert.match(markup, /aria-selected="true"[^>]*>Preview<\/button>/u);
    assert.match(markup, /Hover a card to preview it/u);
    assert.match(markup, /data-tab-id="log"/u);
  });

  test("match app keeps popped-out tabs attached to the drag gesture", async () => {
    const [
      matchApp,
      infoDragOutHook,
      poppedOutDragHook,
      routedPoppedOutDragHook,
    ] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "use-info-window-drag-out.ts"), "utf8"),
      readFile(join(sourceDirectory, "use-popped-out-window-drag.ts"), "utf8"),
      readFile(
        join(sourceDirectory, "use-routed-popped-out-window-drag.ts"),
        "utf8",
      ),
    ]);

    assert.match(matchApp, /useInfoWindowDragOut/u);
    assert.match(infoDragOutHook, /useRoutedPoppedOutWindowDrag/u);
    assert.match(infoDragOutHook, /onInfoGroupDragEnd,\s*\}/u);
    assert.match(infoDragOutHook, /pointerId: point\.pointerId/u);
    assert.match(poppedOutDragHook, /poppedOutDrag/u);
    assert.match(poppedOutDragHook, /setPoppedOutDrag/u);
    assert.match(routedPoppedOutDragHook, /onDragMove\(windowKey, rect\)/u);
    assert.match(routedPoppedOutDragHook, /onDragEnd\(windowKey, rect\)/u);
    assert.match(
      poppedOutDragHook,
      /document\.addEventListener\("pointermove"/u,
    );
    assert.match(poppedOutDragHook, /document\.addEventListener\("pointerup"/u);
    assert.match(
      poppedOutDragHook,
      /document\.addEventListener\([\s\S]*"mousemove"/u,
    );
    assert.match(
      poppedOutDragHook,
      /document\.addEventListener\([\s\S]*"mouseup"/u,
    );
    assert.match(poppedOutDragHook, /onRectChange\(drag\.windowKey/u);
    assert.match(poppedOutDragHook, /onDragMove\?\.\(drag\.windowKey/u);
    assert.match(poppedOutDragHook, /onDragEnd\?\.\(drag\.windowKey/u);
    assert.doesNotMatch(
      poppedOutDragHook,
      /document\.addEventListener\("pointercancel"/u,
    );
  });

  test("tabbed window styles keep the shell compact", async () => {
    const [floatingStyles, tabbedStyles] = await Promise.all([
      readFile(join(sourceDirectory, "styles", "floating-window.css"), "utf8"),
      readFile(
        join(sourceDirectory, "styles", "tabbed-floating-window.css"),
        "utf8",
      ),
    ]);

    assert.match(
      floatingStyles,
      /\.floating-window\s*\{[^}]*min-width:\s*280px;/u,
    );
    assert.match(
      floatingStyles,
      /\.floating-window\s*\{[^}]*min-height:\s*180px;/u,
    );
    assert.match(tabbedStyles, /\.floating-window-header-tabs\s*\{/u);
    assert.match(tabbedStyles, /\.floating-window-tab-panel\s*\{/u);
  });
});
