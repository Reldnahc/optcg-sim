import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { ControlRail } from "./ControlRail.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("control rail window dock", () => {
  test("renders docked windows as tabbed content inside the control rail", async () => {
    const props = {
      errors: [],
      globalActions: [],
      disabled: false,
      dockHeight: 420,
      onAction: () => undefined,
      onNewMatch: () => undefined,
      onDockResizePointerDown: () => undefined,
      dockTabs: [
        {
          id: "action-log",
          title: "Log",
          content: createElement("p", null, "docked log body"),
        },
        {
          id: "settings",
          title: "Settings",
          content: createElement("p", null, "docked settings body"),
        },
      ],
      activeDockTabId: "settings",
      onDockTabChange: () => undefined,
      onDockTabClose: () => undefined,
      onDockTabDragOut: () => undefined,
      onDockGroupDragOut: () => undefined,
    } satisfies ComponentProps<typeof ControlRail> & {
      dockTabs: readonly {
        id: string;
        title: string;
        content: React.ReactNode;
      }[];
      activeDockTabId: string;
      onDockTabChange: (id: string) => void;
      onDockTabClose: (id: string) => void;
      onDockTabDragOut: (id: string) => void;
      onDockGroupDragOut: () => void;
    };

    const markup = renderToStaticMarkup(createElement(ControlRail, props));
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    assert.match(markup, /control-window-dock has-docked-window/u);
    assert.match(markup, /--control-window-dock-height:420px/u);
    assert.match(markup, /aria-label="Resize dock"/u);
    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-label="Pop out docked window group"/u);
    assert.match(markup, /control-dock-window-grab-nub/u);
    assert.match(markup, />Log<\/button>/u);
    assert.match(markup, />Settings<\/button>/u);
    assert.match(markup, /docked settings body/u);
    assert.doesNotMatch(markup, /docked log body/u);
    assert.match(
      styles,
      /\.control-window-dock\.has-docked-window\s*\{[^}]*pointer-events:\s*auto;/u,
    );
    assert.match(styles, /\.control-dock-window\s*\{[^}]*width:\s*100%;/u);
    assert.match(styles, /\.control-dock-window\s*\{[^}]*height:\s*100%;/u);
    assert.match(styles, /\.control-window-dock-resize-handle\s*\{/u);
    assert.match(styles, /\.control-dock-window-grab-nub\s*\{/u);
  });

  test("renders a single docked window as one draggable tab", async () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
        dockTabs: [
          {
            id: "action-log",
            title: "Log",
            content: createElement("p", null, "single docked log"),
          },
        ],
        activeDockTabId: "action-log",
        onDockTabChange: () => undefined,
        onDockTabClose: () => undefined,
        onDockTabDragOut: () => undefined,
      }),
    );
    const controlRailSource = await readFile(
      join(sourceDirectory, "ControlRail.tsx"),
      "utf8",
    );
    const dragOutSource = await readFile(
      join(sourceDirectory, "use-info-window-drag-out.ts"),
      "utf8",
    );

    assert.match(markup, /control-window-dock has-docked-window/u);
    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-selected="true"[^>]*>Log<\/button>/u);
    assert.match(markup, /single docked log/u);
    assert.doesNotMatch(markup, /Pop out Log/u);
    assert.match(controlRailSource, /onDockTabDragOut/u);
    assert.match(controlRailSource, /tabDragOutDistance/u);
    assert.match(dragOutSource, /dragOutDockWindow/u);
    assert.match(dragOutSource, /startPoppedOutDrag/u);
  });

  test("dock drop handlers do not return the dock rect to the floating shell", async () => {
    const matchAppSource = await readFile(
      join(sourceDirectory, "MatchApp.tsx"),
      "utf8",
    );

    assert.doesNotMatch(
      matchAppSource,
      /(?:dockFloatingWindows|dockInfoWindowTabs)\([\s\S]{0,260}return dockRect/u,
    );
  });

  test("dragging one tab out of a docked group preserves any remaining dock tab", async () => {
    const [matchAppSource, dragOutSource] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "use-info-window-drag-out.ts"), "utf8"),
    ]);

    assert.match(dragOutSource, /dockedInfoWindowStateAfterDockTabDragOut/u);
    assert.match(dragOutSource, /replacementDockWindowKeys/u);
    assert.match(dragOutSource, /replacedDockWindowKeys/u);
    assert.match(dragOutSource, /onDockInfoWindowGroupSplit/u);
    assert.match(matchAppSource, /onDockInfoWindowGroupSplit/u);
    assert.match(
      matchAppSource,
      /dockFloatingWindows\(\{\s*windowKeys,\s*rect,\s*replacedWindowKeys,/u,
    );
    assert.match(
      dragOutSource,
      /dragOutDockWindow[\s\S]*updateFloatingWindowOpen\(windowKey,\s*true\)/u,
    );
  });
});
