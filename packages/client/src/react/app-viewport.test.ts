import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  appViewportCssVariables,
  appViewportMetricsFromWindow,
} from "./app-viewport.js";

describe("app viewport", () => {
  test("prefers visual viewport dimensions when mobile browser chrome changes", () => {
    const metrics = appViewportMetricsFromWindow({
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: {
        width: 844,
        height: 390,
      },
    });

    assert.deepEqual(metrics, { width: 844, height: 390 });
  });

  test("renders viewport css variables from measured viewport pixels", () => {
    assert.deepEqual(appViewportCssVariables({ width: 812, height: 375 }), {
      "--app-viewport-width": "812px",
      "--app-viewport-height": "375px",
    });
  });
});
