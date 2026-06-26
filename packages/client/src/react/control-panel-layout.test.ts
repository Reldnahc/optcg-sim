import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  controlDockSlotRect,
  defaultControlRailWidthForViewport,
  desktopCardHeightForViewport,
  normalizeControlPanelLayoutForViewport,
  resolveControlDockSnapRect,
  resizeDockedWindowRects,
} from "./control-panel-layout.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("control panel layout", () => {
  test("derives default control dimensions from the desktop card scale", () => {
    assert.equal(
      desktopCardHeightForViewport({
        viewportWidth: 1024,
        viewportHeight: 720,
      }),
      97.2,
    );
    assert.equal(
      defaultControlRailWidthForViewport({
        viewportWidth: 1024,
        viewportHeight: 720,
      }),
      248,
    );
    assert.equal(
      defaultControlRailWidthForViewport({
        viewportWidth: 2560,
        viewportHeight: 1440,
      }),
      375,
    );
  });

  test("fills the available right-side control slot for the current viewport", () => {
    assert.deepEqual(
      normalizeControlPanelLayoutForViewport({
        layout: {
          controlRailWidth: 220,
        },
        viewportWidth: 1440,
        viewportHeight: 900,
        playmatRight: 980,
      }),
      {
        controlRailWidth: 444,
      },
    );

    assert.deepEqual(
      normalizeControlPanelLayoutForViewport({
        layout: {
          controlRailWidth: 900,
        },
        viewportWidth: 1180,
        viewportHeight: 720,
        playmatRight: 920,
      }),
      {
        controlRailWidth: 244,
      },
    );
  });

  test("uses the normal full rail width when no playmat is measured", () => {
    assert.deepEqual(
      normalizeControlPanelLayoutForViewport({
        layout: {
          controlRailWidth: 900,
        },
        viewportWidth: 1440,
        viewportHeight: 900,
        playmatRight: 0,
      }),
      {
        controlRailWidth: 380,
      },
    );
  });

  test("snaps a floating window flush into the control dock when dropped over it", () => {
    assert.deepEqual(
      resolveControlDockSnapRect({
        rect: { x: 1080, y: 580, width: 320, height: 260 },
        dockRect: { x: 1090, y: 590, width: 330, height: 220 },
      }),
      { x: 1090, y: 590, width: 330, height: 220 },
    );
  });

  test("does not snap when a floating window misses the control dock", () => {
    assert.equal(
      resolveControlDockSnapRect({
        rect: { x: 700, y: 120, width: 320, height: 260 },
        dockRect: { x: 1090, y: 590, width: 330, height: 220 },
      }),
      undefined,
    );
  });

  test("does not snap when a floating window only grazes the control dock edge", () => {
    assert.equal(
      resolveControlDockSnapRect({
        rect: { x: 1350, y: 590, width: 320, height: 260 },
        dockRect: { x: 1090, y: 590, width: 330, height: 220 },
      }),
      undefined,
    );
  });

  test("resizes docked windows to the current control dock slot", () => {
    const next = resizeDockedWindowRects({
      rects: {
        log: { x: 20, y: 30, width: 300, height: 200 },
        preview: { x: 50, y: 60, width: 320, height: 240 },
      },
      dockedWindowIds: new Set(["log"]),
      dockRect: { x: 900, y: 480, width: 420, height: 320 },
    });

    assert.deepEqual(next, {
      log: controlDockSlotRect({
        dockRect: { x: 900, y: 480, width: 420, height: 320 },
      }),
      preview: { x: 50, y: 60, width: 320, height: 240 },
    });
  });

  test("control panel layout is derived from viewport measurements instead of persisted resizing", async () => {
    const [hookSource, appSource] = await Promise.all([
      readFile(join(sourceDirectory, "use-control-panel-layout.ts"), "utf8"),
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
    ]);

    assert.doesNotMatch(hookSource, /layoutStore\?: ControlPanelLayoutStore/u);
    assert.doesNotMatch(hookSource, /loadControlPanelLayout\(\)/u);
    assert.doesNotMatch(hookSource, /saveControlPanelLayout/u);
    assert.doesNotMatch(hookSource, /estimatedCenteredPlaymatRightEdge/u);
    assert.match(appSource, /useControlPanelLayout\(\)/u);
    assert.doesNotMatch(appSource, /createControlPanelLayoutStore/u);
  });
});
