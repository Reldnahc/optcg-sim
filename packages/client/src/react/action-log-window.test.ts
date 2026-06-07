import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId, PlayerId } from "@optcg/types";

import { ActionLogButton } from "./ActionLogButton.js";
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
    assert.match(markup, /Log/u);
    assert.doesNotMatch(markup, /Action Log/u);
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

    assert.match(
      markup,
      /aria-label="Request rollback to Before Card played"/u,
    );
    assert.match(markup, /title="Request rollback to Before Card played"/u);
    assert.match(markup, /action-log-rollback-icon/u);
    assert.doesNotMatch(markup, />Request rollback</u);
    assert.match(markup, /Before Card played/u);
  });

  test("renders card-name mentions as preview hover targets", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionLogWindow, {
        entries: [
          {
            id: "event:1",
            seq: 1,
            text: "Played Saint Shepherd Ju Peter",
            cardMentions: [
              {
                label: "Saint Shepherd Ju Peter",
                card: {
                  cardId: "OP13-089" as CardId,
                  playerId: "p1" as PlayerId,
                  instanceId: "source-1" as InstanceId,
                  name: "Saint Shepherd Ju Peter",
                  category: "Character",
                },
              },
            ],
          },
        ],
        minimized: false,
        onToggleMinimized: () => undefined,
        onClose: () => undefined,
        onPreviewCard: () => undefined,
      }),
    );

    assert.match(markup, /action-log-card-mention/u);
    assert.match(markup, /title="Saint Shepherd Ju Peter"/u);
    assert.match(markup, />Saint Shepherd Ju Peter<\/button>/u);
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

  test("places rollback controls in the far-right log row column", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "action-log-window.css"),
      "utf8",
    );

    assert.match(
      styles,
      /\.action-log-entry\s*\{[^}]*grid-template-columns:\s*34px minmax\(0, 1fr\) 24px;/u,
    );
    assert.match(styles, /\.action-log-rollback\s*\{[^}]*width:\s*24px;/u);
    assert.match(styles, /\.action-log-rollback\s*\{[^}]*height:\s*24px;/u);
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

  test("control rail renders pending rollback status with cancellation", () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
        rollbackStatus: {
          message: "Rollback requested. Waiting for opponent.",
          canCancel: true,
        },
        onCancelRollback: () => undefined,
      }),
    );

    assert.match(markup, /Rollback requested\. Waiting for opponent\./u);
    assert.match(markup, /Cancel rollback request/u);
  });

  test("action log toggle exposes pressed state", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionLogButton, {
        open: true,
        onActivate: () => undefined,
      }),
    );

    assert.match(markup, /action-log-button is-open/u);
    assert.match(markup, /aria-pressed="true"/u);
    assert.match(markup, /Show action log/u);
  });

  test("action log window uses persisted floating window rectangle wiring", async () => {
    const [matchInfoWindows, actionLogWindow, infoWindowModel] =
      await Promise.all([
        readFile(join(sourceDirectory, "MatchInfoWindows.tsx"), "utf8"),
        readFile(join(sourceDirectory, "ActionLogWindow.tsx"), "utf8"),
        readFile(join(sourceDirectory, "info-window-model.ts"), "utf8"),
      ]);

    assert.match(infoWindowModel, /const actionLogWindowKey = "action-log";/u);
    assert.match(matchInfoWindows, /actionLogWindowKey/u);
    assert.match(
      matchInfoWindows,
      /activeFloatingWindowRects\[actionLogWindowKey\]\s*\?\?\s*defaultActionLogWindowRect/u,
    );
    assert.match(
      matchInfoWindows,
      /updateFloatingWindowRect\(actionLogWindowKey, rect\)/u,
    );
    assert.match(actionLogWindow, /initialRect\?: WindowRect/u);
    assert.match(actionLogWindow, /onRectChange=\{onRectChange\}/u);
  });

  test("action log window remembers whether it was open", async () => {
    const [matchApp, toolbarControls] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(
        join(sourceDirectory, "info-window-toolbar-controls.ts"),
        "utf8",
      ),
    ]);

    assert.match(matchApp, /activeOpenWindowIds\.has\(actionLogWindowKey\)/u);
    assert.match(
      toolbarControls,
      /focusInfoWindow\(\{ tabId: "log", windowKey: actionLogWindowKey \}\)/u,
    );
  });

  test("clicking an action-log card explicitly opens and activates preview", async () => {
    const [matchApp, toolbarControls] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(
        join(sourceDirectory, "info-window-toolbar-controls.ts"),
        "utf8",
      ),
    ]);

    assert.match(toolbarControls, /showCardPreview/u);
    assert.match(toolbarControls, /setPreviewOpen\(true\)/u);
    assert.match(
      toolbarControls,
      /focusInfoWindow\(\{ tabId: "preview", windowKey: cardPreviewWindowKey \}\)/u,
    );
    assert.match(matchApp, /showCardPreview\(actionLogCardModel\(card\)\)/u);
  });
});
