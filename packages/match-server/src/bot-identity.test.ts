import { strict as assert } from "node:assert";
import { test } from "vitest";

import {
  botTitleForDifficulty,
  createBotSubject,
  defaultBotDifficulty,
} from "./bot-identity.js";

test("bot identity defaults to novice difficulty", () => {
  assert.equal(defaultBotDifficulty, "novice");

  const subject = createBotSubject();

  assert.equal(subject.displayName, "Bot");
  assert.equal(subject.title?.key, "bot-novice");
  assert.equal(subject.title?.label, "Novice Bot");
});

test("bot title definitions include novice and advanced difficulties", () => {
  assert.deepEqual(
    [
      botTitleForDifficulty("novice").label,
      botTitleForDifficulty("advanced").label,
    ],
    ["Novice Bot", "Advanced Bot"],
  );
  assert.equal(botTitleForDifficulty("novice").key, "bot-novice");
  assert.equal(botTitleForDifficulty("advanced").key, "bot-advanced");
});
