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
      onAction: () => undefined,
      onNewMatch: () => undefined,
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
    } satisfies ComponentProps<typeof ControlRail> & {
      dockTabs: readonly {
        id: string;
        title: string;
        content: React.ReactNode;
      }[];
      activeDockTabId: string;
      onDockTabChange: (id: string) => void;
      onDockTabClose: (id: string) => void;
    };

    const markup = renderToStaticMarkup(createElement(ControlRail, props));
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    assert.match(markup, /control-window-dock has-docked-window/u);
    assert.match(markup, /role="tablist"/u);
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
  });
});
