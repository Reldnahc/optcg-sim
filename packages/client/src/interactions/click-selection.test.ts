import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  clickSelectionIsComplete,
  progressClickSelection,
} from "./click-selection.js";

describe("generic click selection progression", () => {
  test("progresses clicked selections and completes when the full legal count is selected", () => {
    assert.deepEqual(
      progressClickSelection({
        selectableInstanceIds: ["don-1", "don-2", "don-3"],
        selectedInstanceIds: [],
        clickedInstanceId: "don-1",
        completionCount: 2,
      }),
      { selectedInstanceIds: ["don-1"], complete: false },
    );
    assert.deepEqual(
      progressClickSelection({
        selectableInstanceIds: ["don-1", "don-2", "don-3"],
        selectedInstanceIds: ["don-1"],
        clickedInstanceId: "don-3",
        completionCount: 2,
      }),
      { selectedInstanceIds: ["don-1", "don-3"], complete: true },
    );
  });

  test("allows unselecting and rejects illegal completed selections", () => {
    assert.deepEqual(
      progressClickSelection({
        selectableInstanceIds: ["don-1", "don-2", "don-3"],
        selectedInstanceIds: ["don-1"],
        clickedInstanceId: "don-1",
        completionCount: 2,
      }),
      { selectedInstanceIds: [], complete: false },
    );
    assert.deepEqual(
      progressClickSelection({
        selectableInstanceIds: ["don-1", "don-2", "don-3"],
        selectedInstanceIds: ["don-1"],
        clickedInstanceId: "don-3",
        completionCount: 2,
        isCompleteSelection: (instanceIds) =>
          instanceIds.join(",") === "don-1,don-2",
      }),
      { selectedInstanceIds: ["don-1"], complete: false },
    );
  });

  test("completes up-to selections when every available card has been selected", () => {
    assert.equal(
      clickSelectionIsComplete({
        selectableInstanceIds: ["don-1", "don-2"],
        selectedInstanceIds: ["don-1", "don-2"],
        max: 4,
      }),
      true,
    );
    assert.equal(
      clickSelectionIsComplete({
        selectableInstanceIds: ["don-1", "don-2", "don-3", "don-4"],
        selectedInstanceIds: ["don-1", "don-2"],
        max: 4,
      }),
      false,
    );
  });
});
