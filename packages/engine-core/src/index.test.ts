import assert from "node:assert/strict";
import { test } from "vitest";

import * as engineCore from "./index.js";

test("keeps the skeleton entrypoint free of runtime exports", () => {
  assert.deepEqual(Object.keys(engineCore), []);
});
