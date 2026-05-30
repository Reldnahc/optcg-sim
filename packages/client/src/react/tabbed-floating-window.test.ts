import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

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
    assert.match(matchApp, /tryGroupInfoWindow\("preview", rect\)/u);
    assert.match(matchApp, /tryGroupInfoWindow\("log", rect\)/u);
    assert.match(matchApp, /tryGroupInfoWindow\("settings", rect\)/u);
    assert.match(matchApp, /splitInfoWindowTab/u);
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
    assert.match(matchApp, /groupableInfoWindows/u);
    assert.match(matchApp, /combineDropTargetForWindow/u);
    assert.match(tabbedStyles, /\.is-combine-drop-target/u);
  });

  test("match app keeps popped-out tabs attached to the drag gesture", async () => {
    const [matchApp, poppedOutDragHook] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "use-popped-out-window-drag.ts"), "utf8"),
    ]);

    assert.match(matchApp, /usePoppedOutWindowDrag/u);
    assert.match(matchApp, /pointerId: point\.pointerId/u);
    assert.match(poppedOutDragHook, /poppedOutDrag/u);
    assert.match(poppedOutDragHook, /setPoppedOutDrag/u);
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
