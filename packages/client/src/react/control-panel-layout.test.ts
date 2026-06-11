import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  controlDockHeightFromDrag,
  controlDockSlotRect,
  controlRailWidthFromDrag,
  defaultControlDockHeightForViewport,
  defaultControlDockHeight,
  defaultControlRailWidthForViewport,
  defaultControlRailWidth,
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
      defaultControlDockHeightForViewport({
        viewportWidth: 1024,
        viewportHeight: 720,
      }),
      260,
    );
    assert.equal(
      defaultControlRailWidthForViewport({
        viewportWidth: 2560,
        viewportHeight: 1440,
      }),
      375,
    );
    assert.equal(
      defaultControlDockHeightForViewport({
        viewportWidth: 2560,
        viewportHeight: 1440,
      }),
      418,
    );
  });

  test("resizes the rail from the left edge without crossing the playmat", () => {
    assert.equal(
      controlRailWidthFromDrag({
        startWidth: defaultControlRailWidth,
        startClientX: 1200,
        currentClientX: 1000,
        viewportWidth: 1440,
        playmatRight: 980,
      }),
      444,
    );

    assert.equal(
      controlRailWidthFromDrag({
        startWidth: defaultControlRailWidth,
        startClientX: 1200,
        currentClientX: 700,
        viewportWidth: 1440,
        playmatRight: 980,
      }),
      444,
    );
  });

  test("normalizes stale saved control panel sizes for the current viewport", () => {
    assert.deepEqual(
      normalizeControlPanelLayoutForViewport({
        layout: {
          controlRailWidth: 900,
          controlDockHeight: 900,
        },
        viewportWidth: 1180,
        viewportHeight: 720,
        playmatRight: 920,
        controlPanelHeight: 520,
      }),
      {
        controlRailWidth: 244,
        controlDockHeight: 360,
      },
    );

    assert.deepEqual(
      normalizeControlPanelLayoutForViewport({
        layout: {
          controlRailWidth: 120,
          controlDockHeight: 80,
        },
        viewportWidth: 1180,
        viewportHeight: 720,
        playmatRight: 920,
        controlPanelHeight: 520,
      }),
      {
        controlRailWidth: 220,
        controlDockHeight: 180,
      },
    );
  });

  test("shrinks the rail from the left edge down to the minimum", () => {
    assert.equal(
      controlRailWidthFromDrag({
        startWidth: defaultControlRailWidth,
        startClientX: 1200,
        currentClientX: 1300,
        viewportWidth: 1440,
        playmatRight: 980,
      }),
      220,
    );
  });

  test("resizes the dock slot vertically inside the control panel", () => {
    assert.equal(
      controlDockHeightFromDrag({
        startHeight: defaultControlDockHeight,
        startClientY: 620,
        currentClientY: 540,
        controlPanelHeight: 680,
      }),
      400,
    );

    assert.equal(
      controlDockHeightFromDrag({
        startHeight: defaultControlDockHeight,
        startClientY: 620,
        currentClientY: 260,
        controlPanelHeight: 680,
      }),
      520,
    );

    assert.equal(
      controlDockHeightFromDrag({
        startHeight: defaultControlDockHeight,
        startClientY: 620,
        currentClientY: 900,
        controlPanelHeight: 680,
      }),
      180,
    );
  });

  test("uses the rendered bottom dock reserve when clamping dock height", () => {
    assert.equal(
      controlDockHeightFromDrag({
        startHeight: defaultControlDockHeight,
        startClientY: 620,
        currentClientY: 260,
        controlPanelHeight: 680,
        controlDockBottomReservedSpace: 40,
      }),
      480,
    );
    assert.equal(
      controlDockHeightFromDrag({
        startHeight: defaultControlDockHeight,
        startClientY: 620,
        currentClientY: 260,
        controlPanelHeight: 680,
        controlDockBottomReservedSpace: 88,
      }),
      432,
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

  test("control panel layout is loaded and saved through the match layout store", async () => {
    const [hookSource, appSource] = await Promise.all([
      readFile(join(sourceDirectory, "use-control-panel-layout.ts"), "utf8"),
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
    ]);

    assert.match(hookSource, /layoutStore\?: RevealWindowStateStore/u);
    assert.match(hookSource, /loadControlPanelLayout\(\)/u);
    assert.match(hookSource, /saveControlPanelLayout/u);
    assert.match(
      appSource,
      /useControlPanelLayout\(\{\s*layoutStore: revealWindowStateStore,?\s*\}\)/u,
    );
  });
});
