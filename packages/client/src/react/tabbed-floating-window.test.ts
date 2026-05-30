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
    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-label="Window tabs"/u);
    assert.match(markup, /aria-selected="true"[^>]*>Log<\/button>/u);
    assert.match(markup, /aria-selected="false"[^>]*>Preview<\/button>/u);
    assert.match(markup, /Log content/u);
    assert.doesNotMatch(markup, /Preview content/u);
  });

  test("match app combines preview and log into one tabbed info window", async () => {
    const matchApp = await readFile(
      join(sourceDirectory, "MatchApp.tsx"),
      "utf8",
    );

    assert.match(matchApp, /const infoWindowKey = "info-window";/u);
    assert.match(matchApp, /InfoTabbedWindow/u);
    assert.match(matchApp, /showTabbedInfoWindow/u);
    assert.match(matchApp, /setInfoWindowActiveTab\("preview"\)/u);
    assert.match(matchApp, /setInfoWindowActiveTab\("log"\)/u);
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
    assert.match(tabbedStyles, /\.floating-window-tab-strip\s*\{/u);
    assert.match(tabbedStyles, /\.floating-window-tab-panel\s*\{/u);
  });
});
