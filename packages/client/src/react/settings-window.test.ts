import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { SettingsWindow } from "./SettingsWindow.js";

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

    assert.match(controlRail, /onSettingsOpen/u);
    assert.match(controlRail, /onClick=\{onSettingsOpen\}/u);
    assert.match(matchApp, /settingsWindowKey/u);
    assert.match(matchApp, /showSettingsWindow/u);
    assert.match(matchApp, /updateFloatingWindowOpen\(settingsWindowKey/u);
    assert.match(matchApp, /<SettingsWindow/u);
  });

  test("match app restores settings and tab config from persisted window state", async () => {
    const [matchApp, infoConfigHook] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "use-info-window-config.ts"), "utf8"),
    ]);

    assert.match(matchApp, /loadOpenWindowIds\(\)/u);
    assert.match(matchApp, /activeOpenWindowIds\.has\(settingsWindowKey\)/u);
    assert.match(matchApp, /useInfoWindowConfig/u);
    assert.match(infoConfigHook, /loadInfoWindowConfig\(\)/u);
    assert.match(infoConfigHook, /saveInfoWindowConfig/u);
  });
});
