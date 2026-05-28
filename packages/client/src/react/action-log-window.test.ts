import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { ActionLogToggle } from "./ActionLogToggle.js";
import { ActionLogWindow } from "./ActionLogWindow.js";
import { ControlRail } from "./ControlRail.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("action log window", () => {
  test("renders log entries in a floating window", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionLogWindow, {
        entries: [
          { id: "event:1", seq: 1, text: "Game started" },
          { id: "event:2", seq: 2, text: "Card played" },
        ],
        minimized: false,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /floating-window/u);
    assert.match(markup, /action-log-window/u);
    assert.match(markup, /Action Log/u);
    assert.match(markup, /Game started/u);
    assert.match(markup, /Card played/u);
  });

  test("renders rollback request controls for rollbackable log rows", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionLogWindow, {
        entries: [
          {
            id: "event:1",
            seq: 1,
            text: "Card played",
            rollback: {
              rollbackPointId: "rollback:1",
              label: "Before Card played",
            },
          },
        ],
        minimized: false,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
        onRequestRollback: () => undefined,
      }),
    );

    assert.match(markup, /Request rollback/u);
    assert.match(markup, /Before Card played/u);
  });

  test("does not render rollback controls for ordinary log rows", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionLogWindow, {
        entries: [{ id: "event:1", seq: 1, text: "Card played" }],
        minimized: false,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
        onRequestRollback: () => undefined,
      }),
    );

    assert.doesNotMatch(markup, /Request rollback/u);
  });

  test("control rail places action log control to the right of preview control", async () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
        previewControl: createElement("button", { type: "button" }, "preview"),
        actionLogControl: createElement("button", { type: "button" }, "log"),
      }),
    );
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    assert.match(markup, /control-tool-strip/u);
    assert.match(markup, /control-preview-slot/u);
    assert.match(markup, /control-action-log-slot/u);
    assert.match(styles, /\.control-tool-strip\s*\{[^}]*display:\s*flex;/u);
  });

  test("action log toggle exposes pressed state", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionLogToggle, {
        open: true,
        onToggle: () => undefined,
      }),
    );

    assert.match(markup, /action-log-toggle is-open/u);
    assert.match(markup, /aria-pressed="true"/u);
  });
});
