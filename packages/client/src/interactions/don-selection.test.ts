import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { InstanceId } from "@optcg/types";

import {
  findAttachDonActionIndex,
  toggleSelectedDonInstanceId,
} from "./don-selection.js";
import type { ClientVisibleAction } from "../transport.js";

describe("DON selection interaction", () => {
  test("toggles multiple selected DON cards without replacing previous picks", () => {
    assert.deepEqual(toggleSelectedDonInstanceId([], "don-1"), ["don-1"]);
    assert.deepEqual(toggleSelectedDonInstanceId(["don-1"], "don-2"), [
      "don-1",
      "don-2",
    ]);
    assert.deepEqual(toggleSelectedDonInstanceId(["don-1", "don-2"], "don-1"), [
      "don-2",
    ]);
  });

  test("finds the current attach action by DON and target ids", () => {
    const actions: ClientVisibleAction[] = [
      {
        index: 3,
        type: "attachDon",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "don-1" as InstanceId,
          targetInstanceId: "leader-1" as InstanceId,
        },
      },
      {
        index: 4,
        type: "attachDon",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "don-2" as InstanceId,
          targetInstanceId: "char-1" as InstanceId,
        },
      },
    ];

    assert.equal(findAttachDonActionIndex(actions, "don-2", "char-1"), 4);
    assert.equal(
      findAttachDonActionIndex(actions, "don-1", "char-1"),
      undefined,
    );
  });
});
