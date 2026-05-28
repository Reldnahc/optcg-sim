import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { FloatingWindow } from "./FloatingWindow.js";

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
    assert.match(markup, /Close/u);
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
      /\.floating-window-resize-handle\s*\{[^}]*cursor:\s*nwse-resize;/u,
    );
  });
});
