import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import {
  clampRectToViewport,
  FloatingWindow,
  resolveOffscreenDropAction,
} from "./FloatingWindow.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const floatingWindowStylesPath = join(
  sourceDirectory,
  "styles",
  "floating-window.css",
);

describe("floating window", () => {
  test("renders a reusable draggable and resizable window shell", () => {
    const markup = renderToStaticMarkup(
      createElement(
        FloatingWindow,
        {
          title: "Trash",
          className: "trash-viewer",
          onClose: () => undefined,
        },
        createElement("p", undefined, "Window body"),
      ),
    );

    assert.match(markup, /floating-window trash-viewer/u);
    assert.match(markup, /floating-window-header/u);
    assert.match(markup, /floating-window-drag-handle/u);
    assert.match(markup, /floating-window-resize-handle/u);
    assert.match(markup, /transform:translate\(320px,\s*120px\)/u);
    assert.match(markup, /Window body/u);
    assert.match(markup, /aria-label="Close Trash"/u);
    assert.match(markup, />x</u);
  });

  test("uses fixed positioning and bounded resize affordances", async () => {
    const styles = await readFile(floatingWindowStylesPath, "utf8");

    assert.match(styles, /\.floating-window\s*\{[^}]*position:\s*fixed;/u);
    assert.match(styles, /\.floating-window\s*\{[^}]*min-width:/u);
    assert.match(styles, /\.floating-window\s*\{[^}]*min-height:/u);
    assert.match(
      styles,
      /\.floating-window-drag-handle\s*\{[^}]*cursor:\s*move;/u,
    );
    assert.match(
      styles,
      /\.floating-window-minimize,\s*\.floating-window-close\s*\{[^}]*border:\s*0;/u,
    );
    assert.match(
      styles,
      /\.floating-window-close:hover\s*\{[^}]*background:\s*#c42b1c;/u,
    );
    assert.match(
      styles,
      /\.floating-window-resize-handle\s*\{[^}]*cursor:\s*nwse-resize;/u,
    );
  });

  test("off-screen drops prefer minimize when a window supports minimize", () => {
    assert.equal(
      resolveOffscreenDropAction(
        { x: 1280, y: 120, width: 320, height: 220 },
        { width: 1280, height: 800 },
        { canMinimize: true, canClose: true },
      ),
      "minimize",
    );
  });

  test("off-screen drops close close-only windows", () => {
    assert.equal(
      resolveOffscreenDropAction(
        { x: 320, y: 800, width: 320, height: 220 },
        { width: 1280, height: 800 },
        { canMinimize: false, canClose: true },
      ),
      "close",
    );
  });

  test("partly visible drops stay open", () => {
    assert.equal(
      resolveOffscreenDropAction(
        { x: 1000, y: 120, width: 320, height: 220 },
        { width: 1280, height: 800 },
        { canMinimize: true, canClose: true },
      ),
      undefined,
    );
  });

  test("reopened windows clamp saved rectangles back onto the viewport", () => {
    assert.deepEqual(
      clampRectToViewport(
        { x: 1600, y: 900, width: 320, height: 220 },
        280,
        160,
        { width: 1280, height: 800 },
      ),
      { x: 960, y: 580, width: 320, height: 220 },
    );
  });

  test("docked windows use the supplied dock rectangle without min-size expansion", () => {
    const markup = renderToStaticMarkup(
      createElement(
        FloatingWindow,
        {
          title: "Docked",
          initialRect: { x: 1000, y: 420, width: 220, height: 160 },
          minWidth: 300,
          minHeight: 260,
          docked: true,
          onClose: () => undefined,
        },
        createElement("p", undefined, "Dock body"),
      ),
    );

    assert.match(markup, /width:220px/u);
    assert.match(markup, /height:160px/u);
    assert.doesNotMatch(markup, /floating-window-resize-handle/u);
  });
});
