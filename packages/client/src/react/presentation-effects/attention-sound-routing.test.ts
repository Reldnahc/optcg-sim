import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { planAttentionSoundRouting } from "./attention-sound-routing.js";

const baseBoard = {
  selfIsTurnPlayer: false,
  activeCardInstanceIds: undefined,
  statusBanner: undefined,
};

describe("attention sound routing", () => {
  test("seeds first observation while active without emitting a cue", () => {
    assert.deepEqual(
      planAttentionSoundRouting({
        previousLocalActive: undefined,
        board: { ...baseBoard, selfIsTurnPlayer: true },
        documentHidden: false,
        windowFocused: true,
      }),
      {
        nextPreviousLocalActive: true,
        soundIntents: [],
      },
    );
  });

  test("emits yourTurn when local active changes from false to true while visible and focused", () => {
    assert.deepEqual(
      planAttentionSoundRouting({
        previousLocalActive: false,
        board: { ...baseBoard, selfIsTurnPlayer: true },
        documentHidden: false,
        windowFocused: true,
      }),
      {
        nextPreviousLocalActive: true,
        soundIntents: [{ id: "sound:attention:active:true", cue: "yourTurn" }],
      },
    );
  });

  test("emits attention when local active changes from false to true while hidden or unfocused", () => {
    assert.deepEqual(
      planAttentionSoundRouting({
        previousLocalActive: false,
        board: { ...baseBoard, selfIsTurnPlayer: true },
        documentHidden: true,
        windowFocused: true,
      }).soundIntents,
      [{ id: "sound:attention:active:true", cue: "attention" }],
    );

    assert.deepEqual(
      planAttentionSoundRouting({
        previousLocalActive: false,
        board: { ...baseBoard, selfIsTurnPlayer: true },
        documentHidden: false,
        windowFocused: false,
      }).soundIntents,
      [{ id: "sound:attention:active:true", cue: "attention" }],
    );
  });

  test("does not emit while local active remains true", () => {
    assert.deepEqual(
      planAttentionSoundRouting({
        previousLocalActive: true,
        board: { ...baseBoard, selfIsTurnPlayer: true },
        documentHidden: false,
        windowFocused: true,
      }),
      {
        nextPreviousLocalActive: true,
        soundIntents: [],
      },
    );
  });

  test("does not treat active card highlights alone as local active", () => {
    assert.deepEqual(
      planAttentionSoundRouting({
        previousLocalActive: false,
        board: {
          ...baseBoard,
          selfIsTurnPlayer: false,
          activeCardInstanceIds: ["source-1"],
        },
        documentHidden: false,
        windowFocused: true,
      }),
      {
        nextPreviousLocalActive: false,
        soundIntents: [],
      },
    );
  });
});
