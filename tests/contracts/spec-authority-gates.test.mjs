import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

function assertContainsWords(text, phrase) {
  const pattern = phrase
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll(" ", "\\s+");
  assert.match(text, new RegExp(pattern));
}

test("spec authority index separates canonical and historical files", async () => {
  const index = await readText("specs/README.md");

  assert.match(index, /## Canonical authority index/);
  assert.match(
    index,
    /GameState\/events\/decisions[\s\S]*03-game-state-events-decisions\.md/,
  );
  assert.match(
    index,
    /Effect DSL[\s\S]*05-effect-dsl-reference\.md[\s\S]*contracts\/effect-dsl\.schema\.json/,
  );
  assert.match(
    index,
    /terminal engine milestone[\s\S]*12-roadmap\.md[\s\S]*15-implementation-kickoff\.md/,
  );
  assert.match(index, /workflow[\s\S]*AGENTS\.md[\s\S]*docs\/workflow\//);
  assert.match(
    index,
    /Historical\/explanatory[\s\S]*16-typescript-interface-draft\.md/,
  );
});

test("TypeScript interface draft is historical and non-normative", async () => {
  const draft = await readText("specs/16-typescript-interface-draft.md");

  assert.match(draft, /^status:\s+"historical"$/m);
  assert.match(draft, /\bnon-normative\b/i);
  assert.match(
    draft,
    /must not use this draft over `contracts\/canonical-types\.ts` or package source types/i,
  );
  assert.doesNotMatch(draft, /^status:\s+"canonical"$/m);
});

test("event specs require append-order strictly increasing event sequences", async () => {
  const eventsSpec = await readText("specs/03-game-state-events-decisions.md");

  assert.match(
    eventsSpec,
    /EngineResult\.events from one accepted transition must be strictly increasing/,
  );
  assert.match(
    eventsSpec,
    /final `state\.eventJournal` must be strictly increasing/,
  );
  assert.match(
    eventsSpec,
    /Event `seq` values must be allocated by append order/,
  );
  assert.match(
    eventsSpec,
    /must not create multiple events in one `push` call when event IDs or seq values depend on `events\.length`/,
  );
});

test("Effect DSL policy classifies schema-supported and planned primitives", async () => {
  const dslSpec = await readText("specs/05-effect-dsl-reference.md");

  assert.match(
    dslSpec,
    /contracts\/effect-dsl\.schema\.json` is the executable JSON fixture contract/,
  );
  assert.match(dslSpec, /Schema-supported fixture subset/);
  assert.match(
    dslSpec,
    /Planned\/not fixture-authorable until schema coverage exists/,
  );
  assertContainsWords(
    dslSpec,
    "new fixture-authorable primitives must add schema coverage and validation fixtures",
  );

  for (const supportedPrimitive of [
    "trigger: onPlay",
    "condition: yourTurn",
    "condition: attachedDonCount",
    "cost: restDon",
    "effect: draw",
    "effect: ko",
    "effect: modifyPower",
    "effect: sequence",
    "effect: custom",
  ]) {
    assert.match(dslSpec, new RegExp(supportedPrimitive));
  }

  for (const plannedPrimitive of [
    "effect: drawUpTo",
    "effect: search",
    "effect: revealTop",
    "effect: playSelected",
    "effect: replacement",
    "condition: fieldCount",
    "cost: returnDon",
  ]) {
    assert.match(dslSpec, new RegExp(plannedPrimitive));
  }
});

test("Milestone 1 exit gates require full vanilla CLI, replay, sequencing, and real filterStateForPlayer tests", async () => {
  const roadmap = await readText("specs/12-roadmap.md");
  const kickoff = await readText("specs/15-implementation-kickoff.md");
  const milestoneOneGateTexts = [roadmap, kickoff];

  for (const requiredGate of [
    "CLI can play a complete vanilla match through normal legal actions",
    "Character play from hand exists",
    "Stage play from hand exists",
    "DON!! attach/refresh works",
    "Attacks against Leader and rested Character work",
    "Damage, life-to-hand, K.O., deck-out, and concession endings work",
    "Every accepted action has stable state hash output",
    "Event journal seq is strictly increasing",
    "Golden replay reconstructs final hash",
    "production `filterStateForPlayer` hidden-info tests consume real engine output",
  ]) {
    for (const text of milestoneOneGateTexts) {
      assertContainsWords(text, requiredGate);
    }
  }

  for (const text of milestoneOneGateTexts) {
    assertContainsWords(
      text,
      "Milestone 1 does not include server, client, Poneglyph live adapter, Redis, ranked, or broad card pool work",
    );
  }
});
