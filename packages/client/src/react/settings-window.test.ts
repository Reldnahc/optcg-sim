import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { SettingsWindow } from "./SettingsWindow.js";
import { InfoTabbedWindow } from "./InfoTabbedWindow.js";
import { ControlRail } from "./ControlRail.js";
import { SettingsToggle } from "./SettingsToggle.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("settings window", () => {
  test("renders as a real closable floating window", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsWindow, {
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /class="[^"]*floating-window/u);
    assert.match(markup, /class="[^"]*settings-window/u);
    assert.match(markup, />Settings</u);
    assert.match(markup, /aria-label="Close Settings"/u);
  });

  test("match app wires the settings icon to the settings window", async () => {
    const [controlRail, matchApp] = await Promise.all([
      readFile(join(sourceDirectory, "ControlRail.tsx"), "utf8"),
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
    ]);

    assert.match(controlRail, /settingsControl/u);
    assert.match(matchApp, /<SettingsToggle/u);
    assert.match(matchApp, /toggleSettingsOpen/u);
    assert.match(matchApp, /settingsWindowKey/u);
    assert.match(matchApp, /showSettingsWindow/u);
    assert.match(matchApp, /updateFloatingWindowOpen\(settingsWindowKey/u);
    assert.match(matchApp, /<SettingsWindow/u);
    assert.match(matchApp, /completeInfoWindowDrag\("settings", rect\)/u);
  });

  test("settings icon uses the same open highlight contract as other controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
        settingsControl: createElement(SettingsToggle, {
          open: true,
          onToggle: () => undefined,
        }),
      }),
    );

    assert.match(markup, /class="settings-toggle is-open"/u);
    assert.match(markup, /aria-pressed="true"/u);
    assert.match(markup, /aria-label="Close settings"/u);
  });

  test("settings can render as a first-class tab in the shared info window", () => {
    const markup = renderToStaticMarkup(
      createElement(InfoTabbedWindow, {
        entries: [],
        logOpen: true,
        settingsOpen: true,
        tabIds: ["log", "settings"],
        activeTabId: "settings",
        minimized: false,
        onActiveTabChange: () => undefined,
        onToggleMinimized: () => undefined,
        onCloseActiveTab: () => undefined,
      }),
    );

    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-selected="true"[^>]*>Settings<\/button>/u);
    assert.match(markup, /aria-selected="false"[^>]*>Log<\/button>/u);
    assert.match(markup, /settings-window-content/u);
  });

  test("match app restores settings and tab config from persisted window state", async () => {
    const [matchApp, floatingWindowHook, infoConfigHook] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "use-floating-window-state.ts"), "utf8"),
      readFile(join(sourceDirectory, "use-info-window-config.ts"), "utf8"),
    ]);

    assert.match(floatingWindowHook, /loadOpenWindowIds\(\)/u);
    assert.match(matchApp, /activeOpenWindowIds\.has\(settingsWindowKey\)/u);
    assert.match(matchApp, /useInfoWindowConfig/u);
    assert.match(infoConfigHook, /loadInfoWindowConfig\(\)/u);
    assert.match(infoConfigHook, /saveInfoWindowConfig/u);
  });

  test("tool strip toggles activate resurfaced info tabs", async () => {
    const toolbarControls = await readFile(
      join(sourceDirectory, "info-window-toolbar-controls.ts"),
      "utf8",
    );

    assert.match(toolbarControls, /const activateInfoWindowTab/u);
    assert.match(toolbarControls, /setInfoWindowActiveTab\(tabId\)/u);
    assert.match(toolbarControls, /setControlDockActiveTabId\(windowKey\)/u);
    assert.match(toolbarControls, /activateInfoWindowTab\("preview"\)/u);
    assert.match(toolbarControls, /activateInfoWindowTab\("log"\)/u);
    assert.match(toolbarControls, /activateInfoWindowTab\("settings"\)/u);
  });
});
