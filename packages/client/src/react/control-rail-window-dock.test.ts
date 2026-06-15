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
  test("renders connection status directly beside player names", () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        selfLabel: "Alice",
        opponentLabel: "Bob",
        selfConnectionStatus: "connected",
        opponentConnectionStatus: "disconnected",
        onAction: () => undefined,
        onHome: () => undefined,
      }),
    );

    assert.match(
      markup,
      /<h2><span class="player-name">Bob<\/span><span class="connection-status is-disconnected"/u,
    );
    assert.match(
      markup,
      /<h2><span class="player-name">Alice<\/span><span class="connection-status is-connected"/u,
    );
  });

  test("connection indicator uses a dedicated connected color", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    assert.match(
      styles,
      /\.connection-status\s*\{[^}]*width:\s*calc\(var\(--control-title-font-size\) \* 0\.44\);[^}]*border:\s*max\(1px,\s*calc\(var\(--card-outline-thin\) \* 0\.45\)\) solid\s*rgba\(0,\s*0,\s*0,\s*0\.72\);[^}]*transform:\s*translateY\(0\.04em\);/u,
    );
    assert.match(
      styles,
      /\.connection-status\.is-connected\s*\{[^}]*background:\s*#28f27a;[^}]*box-shadow:\s*0 0 0 calc\(var\(--card-outline-thin\) \* 0\.35\) rgba\(40,\s*242,\s*122,\s*0\.34\),\s*inset 0 0 0 1px rgba\(255,\s*255,\s*255,\s*0\.28\);/u,
    );
  });

  test("renders docked windows as tabbed content inside the control rail", async () => {
    const props = {
      errors: [],
      globalActions: [],
      disabled: false,
      dockHeight: 420,
      onAction: () => undefined,
      onHome: () => undefined,
      onDockResizePointerDown: () => undefined,
      dockTabs: [
        {
          id: "action-log",
          title: "Log",
          renderContent: () => createElement("p", null, "docked log body"),
        },
        {
          id: "settings",
          title: "Settings",
          renderContent: () => createElement("p", null, "docked settings body"),
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
        renderContent: () => React.ReactNode;
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
        onHome: () => undefined,
        dockTabs: [
          {
            id: "action-log",
            title: "Log",
            renderContent: () => createElement("p", null, "single docked log"),
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

  test("renders only the active dock tab content", () => {
    let activeRenderCount = 0;
    let inactiveRenderCount = 0;
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onHome: () => undefined,
        dockTabs: [
          {
            id: "action-log",
            title: "Log",
            renderContent: () => {
              inactiveRenderCount += 1;
              return createElement("p", null, "inactive log body");
            },
          },
          {
            id: "settings",
            title: "Settings",
            renderContent: () => {
              activeRenderCount += 1;
              return createElement("p", null, "active settings body");
            },
          },
        ],
        activeDockTabId: "settings",
        onDockTabChange: () => undefined,
        onDockTabClose: () => undefined,
      }),
    );

    assert.equal(activeRenderCount, 1);
    assert.equal(inactiveRenderCount, 0);
    assert.match(markup, /active settings body/u);
    assert.doesNotMatch(markup, /inactive log body/u);
  });

  test("docked tabs reorder inside the tab strip before dragging out", async () => {
    const [controlRailSource, dockingSource, floatingStateSource] =
      await Promise.all([
        readFile(join(sourceDirectory, "ControlRail.tsx"), "utf8"),
        readFile(
          join(sourceDirectory, "use-match-app-window-docking.ts"),
          "utf8",
        ),
        readFile(join(sourceDirectory, "use-floating-window-state.ts"), "utf8"),
      ]);

    assert.match(controlRailSource, /onDockTabReorder/u);
    assert.match(controlRailSource, /tabDragIntentFromPoint/u);
    assert.match(controlRailSource, /tabReorderTargetFromPointer/u);
    assert.match(controlRailSource, /tabStripRect/u);
    assert.match(dockingSource, /reorderDockTab/u);
    assert.match(dockingSource, /activeDockedWindowIds\.has\(infoWindowKey\)/u);
    assert.match(floatingStateSource, /reorderDockedWindow/u);
    assert.match(
      controlRailSource,
      /intent\s*===\s*"dragOut"[\s\S]*onDockTabDragOut/u,
    );
  });

  test("dock drop handlers do not return the dock rect to the floating shell", async () => {
    const dockingSource = await readFile(
      join(sourceDirectory, "use-match-app-window-docking.ts"),
      "utf8",
    );

    assert.doesNotMatch(
      dockingSource,
      /(?:dockFloatingWindows|dockInfoWindowTabs)\([\s\S]{0,260}return dockRect/u,
    );
  });

  test("dragging one tab out of a docked group preserves any remaining dock tab", async () => {
    const [dockingSource, dragOutSource] = await Promise.all([
      readFile(
        join(sourceDirectory, "use-match-app-window-docking.ts"),
        "utf8",
      ),
      readFile(join(sourceDirectory, "use-info-window-drag-out.ts"), "utf8"),
    ]);

    assert.match(dragOutSource, /dockedInfoWindowStateAfterDockTabDragOut/u);
    assert.match(dragOutSource, /replacementDockWindowKeys/u);
    assert.match(dragOutSource, /replacedDockWindowKeys/u);
    assert.match(dragOutSource, /onDockInfoWindowGroupSplit/u);
    assert.match(dockingSource, /onDockInfoWindowGroupSplit/u);
    assert.match(
      dockingSource,
      /dockFloatingWindows\(\{\s*windowKeys,\s*rect,\s*replacedWindowKeys,/u,
    );
    assert.match(
      dragOutSource,
      /dragOutDockWindow[\s\S]*updateFloatingWindowOpen\(windowKey,\s*true\)/u,
    );
  });
});
