import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const scanRoots = [
  "packages/engine-core/src/effect-runtime-sequence",
  "packages/engine-core/src/runtime/primitives",
];

type ExpectedDoor = {
  readonly path: string;
  readonly signals: readonly string[];
  readonly reason: string;
};

const writerSignals = [
  { label: "saveReference call", pattern: /\bsaveReference\s*\(/ },
  {
    label: "inline savedReferences write",
    pattern:
      /savedReferences\s*:\s*{[\s\S]{0,1200}kind:\s*"(selectedCards|selectedTargets|paidCost|producedObjects|chosenNumber)"/,
  },
  {
    label: "savedReferences frame update",
    pattern:
      /\bsavedReferences\s*:\s*(next|updated|loop|seed)\w*SavedReferences\b/,
  },
  {
    label: "initialSavedReferences seed",
    pattern:
      /initialSavedReferences[\s\S]{0,1200}kind:\s*"(selectedCards|selectedTargets|paidCost|producedObjects|chosenNumber)"/,
  },
] as const;

const readerSignals = [
  {
    label: "savedReferences direct lookup",
    pattern:
      /(?:(?:\b\w+\.)*(?:ledgers|nextLedgers|frame|currentFrame|pendingFrame)\.savedReferences|(?:\b\w+\.)*savedReferences)\[[^\]]+\]/,
  },
  {
    label: "saved field object resolution",
    pattern:
      /\b(resolveSavedFieldObject|resolveSavedTarget|applySavedFieldObject|applySavedFieldObjectSegments)\s*\(/,
  },
  {
    label: "savedReferences helper argument",
    pattern:
      /\b(savedReferences|ledgers\.savedReferences|frame\.savedReferences)\s*[,)]/,
  },
] as const;

const knownSavedReferenceWriters: ExpectedDoor[] = [
  {
    path: "packages/engine-core/src/effect-runtime-sequence/frames/optional.ts",
    signals: ["saveReference call"],
    reason: "optional branch producer after a paused optional segment",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/frames/start.ts",
    signals: ["initialSavedReferences seed"],
    reason: "trigger-context produced object seed",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/runner/for-each-saved-target.ts",
    signals: ["inline savedReferences write"],
    reason: "forEachSavedTarget current-item producer",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/runner/select-all-targets-segment.ts",
    signals: ["saveReference call"],
    reason: "selectAllTargets producer",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/draw-upto.ts",
    signals: ["inline savedReferences write"],
    reason: "drawUpTo chosenNumber producer",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/segments.ts",
    signals: ["saveReference call", "inline savedReferences write"],
    reason: "generic sequenced segment producers",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/move-cards-segment.ts",
    signals: ["inline savedReferences write"],
    reason: "moveCards selected-card and chosenNumber producers",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/select-cards.ts",
    signals: ["saveReference call", "inline savedReferences write"],
    reason: "selectCards and selectFromSet producers",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/select-targets.ts",
    signals: ["saveReference call"],
    reason: "selectTargets producer",
  },
  {
    path: "packages/engine-core/src/runtime/primitives/activate-selected-event.ts",
    signals: ["inline savedReferences write"],
    reason: "activateSelectedEvent selectedCards consumption ledger update",
  },
  {
    path: "packages/engine-core/src/runtime/primitives/play-selected.ts",
    signals: ["inline savedReferences write"],
    reason:
      "playSelected producedObjects producer and selectedCards consumption ledger update",
  },
];

const knownSavedReferenceReaders: ExpectedDoor[] = [
  {
    path: "packages/engine-core/src/effect-runtime-sequence/frames/effect-option.ts",
    signals: ["savedReferences helper argument"],
    reason: "frame plumbing carries saved references through effect options",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/frames/optional.ts",
    signals: ["savedReferences helper argument"],
    reason: "frame plumbing carries saved references through optional branches",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/frames/remainder.ts",
    signals: ["savedReferences helper argument"],
    reason:
      "frame plumbing carries saved references through remainder handling",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/frames/replacement.ts",
    signals: ["savedReferences helper argument"],
    reason: "frame plumbing carries saved references through replacements",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/frames/search-and-placement.ts",
    signals: ["savedReferences helper argument"],
    reason:
      "frame plumbing carries saved references through search-and-placement",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/frames/shared.ts",
    signals: ["savedReferences helper argument"],
    reason: "shared frame plumbing carries saved references",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/matching-life-cards.ts",
    signals: ["savedReferences helper argument"],
    reason:
      "matching Life card movement preserves existing saved references through segment results",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/move-cards-segment.ts",
    signals: ["savedReferences helper argument"],
    reason:
      "moveCards resolves dynamic counts from saved references and preserves ledgers",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/runner/for-each-saved-target.ts",
    signals: [
      "savedReferences direct lookup",
      "savedReferences helper argument",
    ],
    reason: "forEachSavedTarget source selection consumer and loop plumbing",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/runner/pause.ts",
    signals: ["savedReferences helper argument"],
    reason: "pause frame plumbing carries saved references",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/runner/select-all-targets-segment.ts",
    signals: ["savedReferences helper argument"],
    reason: "selectAllTargets producer plumbing preserves existing references",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/runner/trash-from-hand-segment.ts",
    signals: ["savedReferences helper argument"],
    reason:
      "trashFromHand runner preserves existing saved references while dynamic count resolution reads them",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/saved-field-object/saved-target-resolution.ts",
    signals: ["savedReferences helper argument"],
    reason: "savedFieldObject resolution passes saved references to primitive",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/saved-field-object/segment-appliers.ts",
    signals: ["savedReferences helper argument"],
    reason:
      "savedFieldObject segment appliers pass saved references to primitive",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/draw-upto.ts",
    signals: ["savedReferences helper argument"],
    reason:
      "drawUpTo preserves existing saved references while producing number",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/field-segments.ts",
    signals: ["savedReferences helper argument"],
    reason: "field savedFieldObject doors pass saved references to appliers",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/frame-decisions.ts",
    signals: ["savedReferences helper argument"],
    reason: "decision frame plumbing carries saved references",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/return-don-body.ts",
    signals: ["savedReferences helper argument"],
    reason: "return DON body preserves saved references through decisions",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/segments.ts",
    signals: ["savedReferences helper argument"],
    reason: "generic segment execution passes saved references",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/select-cards.ts",
    signals: ["savedReferences helper argument"],
    reason: "selectCards preserves existing saved references",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/select-targets.ts",
    signals: [
      "savedReferences direct lookup",
      "savedReferences helper argument",
    ],
    reason: "ownerConstraint reads saved owners and selection plumbing",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/selected-bounce.ts",
    signals: ["savedReferences direct lookup"],
    reason: "selected-card bounce consumer",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/selected-hand-deck-placement.ts",
    signals: ["savedReferences helper argument"],
    reason: "selected hand deck placement preserves saved references",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/selected-reveal.ts",
    signals: ["savedReferences direct lookup"],
    reason: "revealSelected consumer",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/selected-segments.ts",
    signals: [
      "savedReferences direct lookup",
      "savedReferences helper argument",
    ],
    reason:
      "moveSelected, attachSelectedDon, playSelected, activateSelectedEvent, and selectFromSet consumers",
  },
  {
    path: "packages/engine-core/src/effect-runtime-sequence/target-decisions.ts",
    signals: ["savedReferences helper argument"],
    reason: "target decision plumbing carries saved references",
  },
  {
    path: "packages/engine-core/src/runtime/primitives/activate-selected-event.ts",
    signals: [
      "savedReferences direct lookup",
      "savedReferences helper argument",
    ],
    reason: "activateSelectedEvent selectedCards consumer and ledger plumbing",
  },
  {
    path: "packages/engine-core/src/runtime/primitives/play-selected.ts",
    signals: [
      "savedReferences direct lookup",
      "savedReferences helper argument",
    ],
    reason: "playSelected selectedCards consumer and ledger plumbing",
  },
  {
    path: "packages/engine-core/src/runtime/primitives/target-ko.ts",
    signals: ["savedReferences direct lookup"],
    reason: "target KO savedFieldObject consumer",
  },
];

const findSourceFiles = async (path: string): Promise<string[]> => {
  const entries = await readdir(join(repoRoot, path), { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...(await findSourceFiles(child)));
      continue;
    }

    if (
      [".ts", ".tsx"].includes(extname(entry.name)) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      found.push(child);
    }
  }

  return found;
};

const sourcePath = (path: string) =>
  relative(repoRoot, join(repoRoot, path)).replaceAll("\\", "/");

const matchedSignals = (
  source: string,
  signals: readonly { label: string; pattern: RegExp }[],
): string[] =>
  signals
    .filter((signal) => signal.pattern.test(source))
    .map((signal) => signal.label);

const assertExpectedDoorSignals = (
  observed: Map<string, readonly string[]>,
  expected: readonly ExpectedDoor[],
) => {
  assert.deepEqual(
    [...observed.keys()].sort(),
    expected.map((door) => door.path).sort(),
  );

  for (const door of expected) {
    const actualSignals = observed.get(door.path) ?? [];
    for (const signal of door.signals) {
      assert.equal(
        actualSignals.includes(signal),
        true,
        `${door.path} must match ${signal}: ${door.reason}`,
      );
    }
  }
};

test("saved-result contract inventory names every current saved-reference kind", async () => {
  const effectsSource = await readFile(
    new URL("../../../types/src/effects.ts", import.meta.url),
    "utf8",
  );

  for (const kind of [
    "selectedCards",
    "selectedTargets",
    "paidCost",
    "producedObjects",
    "chosenNumber",
  ]) {
    assert.equal(effectsSource.includes(`kind: "${kind}"`), true, kind);
  }
});

test("saved-result contract inventory has explicit writer coverage", async () => {
  const observed = new Map<string, readonly string[]>();
  const files = (await Promise.all(scanRoots.map(findSourceFiles))).flat();

  for (const path of files) {
    const source = await readFile(join(repoRoot, path), "utf8");
    const signals = matchedSignals(source, writerSignals);
    if (signals.length > 0) {
      observed.set(sourcePath(path), signals);
    }
  }

  assertExpectedDoorSignals(observed, knownSavedReferenceWriters);
});

test("saved-result contract inventory has explicit reader coverage", async () => {
  const observed = new Map<string, readonly string[]>();
  const files = (await Promise.all(scanRoots.map(findSourceFiles))).flat();

  for (const path of files) {
    const source = await readFile(join(repoRoot, path), "utf8");
    const signals = matchedSignals(source, readerSignals);
    if (signals.length > 0) {
      observed.set(sourcePath(path), signals);
    }
  }

  assertExpectedDoorSignals(observed, knownSavedReferenceReaders);
});
