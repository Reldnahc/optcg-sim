import assert from "node:assert/strict";
import { test } from "vitest";

import { ENGINE_CORE_PACKAGE_NAME } from "./index.js";

test("exposes a minimal non-gameplay package entrypoint", () => {
  assert.equal(ENGINE_CORE_PACKAGE_NAME, "@optcg/engine-core");
});
