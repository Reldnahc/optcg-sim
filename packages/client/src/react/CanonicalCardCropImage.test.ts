import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  CARD_CROP_LEGAL_RECT,
  resolveCanonicalCropCenter,
  resolveFocalCropImageLayout,
} from "./CanonicalCardCropImage.js";

describe("CanonicalCardCropImage", () => {
  test("uses the same legal crop rectangle as poneglyph web", () => {
    assert.deepEqual(CARD_CROP_LEGAL_RECT, {
      x: 0.225,
      y: 0.083,
      width: 0.553,
      height: 0.526,
    });
  });

  test("resolves crop centers with the web canonical clamp", () => {
    const crop = resolveCanonicalCropCenter({
      focusX: 0.42,
      focusY: 0.18,
      frameAspect: 112 / 68,
      imageAspect: 63 / 88,
    });

    assert.equal(crop.x.toFixed(6), "0.501500");
    assert.equal(crop.y.toFixed(6), "0.203183");
    assert.equal(crop.zoom.toFixed(6), "1.808318");
  });

  test("uses focal points to position deck selector art", () => {
    const upperFocus = resolveFocalCropImageLayout({
      cropFocus: { x: 0.42, y: 0.18 },
      frameSize: { width: 112, height: 68 },
      imageSize: { width: 630, height: 880 },
    });
    const lowerFocus = resolveFocalCropImageLayout({
      cropFocus: { x: 0.7, y: 0.6 },
      frameSize: { width: 112, height: 68 },
      imageSize: { width: 630, height: 880 },
    });

    assert.notEqual(upperFocus.left.toFixed(2), lowerFocus.left.toFixed(2));
    assert.notEqual(upperFocus.top.toFixed(2), lowerFocus.top.toFixed(2));
  });
});
