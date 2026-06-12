# Duration Routing Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ad hoc duration parser chains with named semantic duration capability groups consumed by body parsers.

**Architecture:** Duration literals remain primitive parsers, but parser callers select named capability groups such as field effects, battle effects, restrictions, and replacement effects. The shared dispatcher tries the parsers in a group and fails closed when a wording is not allowed for that body family.

**Tech Stack:** TypeScript, Vitest, existing `packages/cards` parser architecture.

---

## File Structure

- Modify `packages/cards/src/durations/field-effect-durations.ts`: define duration parser types, named groups, and `parseDurationFromSet`.
- Modify `packages/cards/src/durations/index.ts`: export the named groups and dispatcher.
- Modify `packages/cards/src/durations/field-effect-durations.test.ts`: add focused tests for group membership, dispatcher behavior, and incompatible-duration fail-closed behavior.
- Modify parser callers that currently import `parseExplicitFieldEffectDuration` or individual duration parsers from `packages/cards/src/durations/index.ts`.
- Modify or add focused parser tests near the affected body families to prove cross-body reuse and incompatibility boundaries.

## Duration Groups

Use these names and initial membership:

```ts
export const fieldEffectDurationParsers = [
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseSelfNextTurnStartDuration,
  parseThisTurnDuration,
  parseThisBattleDuration,
] as const;

export const battleDurationParsers = [parseThisBattleDuration] as const;

export const restrictionDurationParsers = [
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseThisTurnDuration,
] as const;

export const replacementDurationParsers = [parseThisTurnDuration] as const;
```

Keep `parseExplicitFieldEffectDuration` as a compatibility alias during the first task only:

```ts
export const parseExplicitFieldEffectDuration = (
  input: ParseInput,
): DurationParseResult | undefined =>
  parseDurationFromSet(input, fieldEffectDurationParsers);
```

Delete the alias only after all callers have moved to named groups.

### Task 1: Add Central Duration Dispatcher And Groups

**Files:**

- Modify: `packages/cards/src/durations/field-effect-durations.ts`
- Modify: `packages/cards/src/durations/index.ts`
- Test: `packages/cards/src/durations/field-effect-durations.test.ts`

- [ ] **Step 1: Write failing dispatcher tests**

Add these tests to `packages/cards/src/durations/field-effect-durations.test.ts`:

```ts
import {
  battleDurationParsers,
  fieldEffectDurationParsers,
  parseDurationFromSet,
  replacementDurationParsers,
  restrictionDurationParsers,
} from "./index.js";

it("parses durations through named semantic capability groups", () => {
  expect(
    parseDurationFromSet(
      { text: "until the start of your next turn" },
      fieldEffectDurationParsers,
    ),
  ).toMatchObject({
    duration: { type: "untilStartOfNextTurn", player: "self" },
    evidence: ["duration:selfNextTurnStart"],
    rest: "",
  });

  expect(
    parseDurationFromSet({ text: "during this battle" }, battleDurationParsers),
  ).toMatchObject({
    duration: { type: "thisBattle" },
    evidence: ["duration:thisBattle"],
    rest: "",
  });
});

it("fails closed when a duration is outside the semantic group", () => {
  expect(
    parseDurationFromSet(
      { text: "during this battle" },
      restrictionDurationParsers,
    ),
  ).toBeUndefined();

  expect(
    parseDurationFromSet(
      { text: "until the start of your next turn" },
      replacementDurationParsers,
    ),
  ).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests to verify red**

Run:

```bash
npm.cmd run test -- packages/cards/src/durations/field-effect-durations.test.ts
```

Expected: FAIL because `parseDurationFromSet` and the named groups are not exported yet.

- [ ] **Step 3: Implement dispatcher and groups**

In `packages/cards/src/durations/field-effect-durations.ts`, add:

```ts
type DurationParser = (input: ParseInput) => DurationParseResult | undefined;

export type DurationParserSet = readonly DurationParser[];

export function parseDurationFromSet(
  input: ParseInput,
  parsers: DurationParserSet,
): DurationParseResult | undefined {
  for (const parser of parsers) {
    const parsed = parser(input);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

export const fieldEffectDurationParsers = [
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseSelfNextTurnStartDuration,
  parseThisTurnDuration,
  parseThisBattleDuration,
] as const;

export const battleDurationParsers = [parseThisBattleDuration] as const;

export const restrictionDurationParsers = [
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseThisTurnDuration,
] as const;

export const replacementDurationParsers = [parseThisTurnDuration] as const;
```

Replace the current `parseExplicitFieldEffectDuration` implementation with:

```ts
export const parseExplicitFieldEffectDuration = (
  input: ParseInput,
): DurationParseResult | undefined =>
  parseDurationFromSet(input, fieldEffectDurationParsers);
```

In `packages/cards/src/durations/index.ts`, export:

```ts
export {
  battleDurationParsers,
  fieldEffectDurationParsers,
  parseDurationFromSet,
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseExplicitFieldEffectDuration,
  parseSelfNextTurnStartDuration,
  parseThisBattleDuration,
  parseThisTurnDuration,
  replacementDurationParsers,
  restrictionDurationParsers,
  type DurationParserSet,
} from "./field-effect-durations.js";
```

- [ ] **Step 4: Run the duration tests to verify green**

Run:

```bash
npm.cmd run test -- packages/cards/src/durations/field-effect-durations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cards/src/durations/field-effect-durations.ts packages/cards/src/durations/index.ts packages/cards/src/durations/field-effect-durations.test.ts
git commit -m "Add duration parser capability groups"
```

### Task 2: Move Field Modifier Bodies To Field Effect Duration Group

**Files:**

- Modify: `packages/cards/src/instructions/modify-power/shared.ts`
- Modify: `packages/cards/src/instructions/modify-power/negative.ts`
- Modify: `packages/cards/src/instructions/modify-cost/shared.ts`
- Modify: `packages/cards/src/instructions/continuous-field-effects/base-power.ts`
- Modify: `packages/cards/src/instructions/continuous-field-effects/stat-gains.ts`
- Modify: `packages/cards/src/instructions/continuous-field-effects/keyword-grants/shared.ts`
- Modify: `packages/cards/src/instructions/continuous-field-effects/keyword-grants/keyword-and-attribute.ts`
- Modify: `packages/cards/src/instructions/continuous-field-effects/keyword-grants/targeted.ts`
- Test: existing parser tests covering power, cost, base power, keyword grant durations.

- [ ] **Step 1: Write or extend a cross-body parser test**

In the most focused existing parser test file for duration-heavy field effects, add assertions proving the same duration primitive flows through different body families:

```ts
it("parses self-next-turn duration through multiple field effect body families", () => {
  const power = parseCardEffectLine(
    "When a DON!! card on your field is returned to your DON!! deck, this Character gains +2000 power until the start of your next turn.",
  );
  expect(power).toMatchObject({
    block: {
      effect: {
        duration: { type: "untilStartOfNextTurn", player: "self" },
      },
    },
  });

  const keyword = parseCardEffectLine(
    "Up to 1 of your Leader or Character cards gains [Blocker] until the start of your next turn.",
  );
  expect(keyword).toMatchObject({
    block: {
      effect: {
        duration: { type: "untilStartOfNextTurn", player: "self" },
      },
    },
  });
});
```

If the exact keyword line does not parse today, use an existing keyword-grant wording from the local tests and change only the duration text.

- [ ] **Step 2: Run the focused test to verify red or current coverage**

Run the focused parser test file that contains the new test:

```bash
npm.cmd run test -- packages/cards/src/<chosen-test-file>.test.ts
```

Expected: either PASS if current alias already covers it, or FAIL if a body family is still using a narrower direct parser.

- [ ] **Step 3: Replace broad alias imports with named group dispatcher**

For each field modifier file, replace:

```ts
import { parseExplicitFieldEffectDuration } from "../../durations/index.js";
```

or equivalent relative import with:

```ts
import {
  fieldEffectDurationParsers,
  parseDurationFromSet,
} from "../../durations/index.js";
```

Then replace:

```ts
const duration = parseExplicitFieldEffectDuration({ text: modifier.rest });
```

with:

```ts
const duration = parseDurationFromSet(
  { text: modifier.rest },
  fieldEffectDurationParsers,
);
```

Use the correct relative import path for files below nested folders.

- [ ] **Step 4: Run the affected parser tests**

Run:

```bash
npm.cmd run test -- packages/cards/src/card-effect-event-reaction-scalable-parser.test.ts packages/cards/src/card-effect-line-parser-op16-primitives.test.ts packages/cards/src/card-effect-reusable-composition-parser.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cards/src/instructions packages/cards/src/*.test.ts
git commit -m "Route field effect durations through capability group"
```

### Task 3: Move Battle-Only Bodies To Battle Duration Group

**Files:**

- Modify: `packages/cards/src/segments/base-power-swap.ts`
- Modify: any body parser that should only accept `during this battle`.
- Test: add or extend a parser test for incompatible field-effect duration on battle-only bodies.

- [ ] **Step 1: Add fail-closed battle duration test**

Add a focused test next to existing base-power swap tests:

```ts
it("does not accept field-effect-only durations for battle-only base power swaps", () => {
  const result = parseCardEffectLine(
    "When this Leader attacks or is attacked, this Leader's base power becomes 9000 until the start of your next turn.",
  );

  expect(result).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
npm.cmd run test -- packages/cards/src/card-effect-reusable-composition-parser.test.ts
```

Expected: FAIL if the current parser accepts the incompatible duration, or PASS if it already fails closed.

- [ ] **Step 3: Replace local duration chain with battle group**

In `packages/cards/src/segments/base-power-swap.ts`, replace direct `parseThisTurnDuration` / `parseThisBattleDuration` routing with:

```ts
import {
  battleDurationParsers,
  parseDurationFromSet,
} from "../durations/index.js";
```

and:

```ts
const parsed = parseDurationFromSet({ text }, battleDurationParsers);
```

If the body legitimately supports `during this turn`, define a separate named group such as `basePowerSwapDurationParsers` in `durations/field-effect-durations.ts` instead of listing individual parser functions in the body file.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm.cmd run test -- packages/cards/src/card-effect-reusable-composition-parser.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cards/src/segments/base-power-swap.ts packages/cards/src/card-effect-reusable-composition-parser.test.ts packages/cards/src/durations/field-effect-durations.ts packages/cards/src/durations/index.ts
git commit -m "Route battle durations through capability group"
```

### Task 4: Move Restrictions And Replacement Effects To Semantic Groups

**Files:**

- Modify: `packages/cards/src/instructions/planned-field-effects/attack-restriction.ts`
- Modify: `packages/cards/src/instructions/planned-field-effects/blocker-restriction.ts`
- Modify: `packages/cards/src/instructions/planned-field-effects/refresh-lock.ts`
- Modify: `packages/cards/src/instructions/invalidate-effects.ts`
- Modify: `packages/cards/src/segments/replacement-effect/instead-effects/self.ts`
- Test: focused parser tests for attack/block/refresh restrictions and replacement self effects.

- [ ] **Step 1: Add incompatible-duration tests for restrictions**

Add tests proving restrictions do not silently accept unrelated duration families:

```ts
it("does not accept battle-only duration for attack restrictions", () => {
  const result = parseCardEffectLine(
    "Up to 1 of your opponent's active Characters cannot attack during this battle.",
  );

  expect(result).toBeUndefined();
});

it("does not accept opponent-next-end duration for this-turn replacement effects", () => {
  const result = parseCardEffectLine(
    "If this Character would be removed from the field by your opponent's effect, you may trash 1 card from your hand instead until the end of your opponent's next turn.",
  );

  expect(result).toBeUndefined();
});
```

Use exact existing replacement wording if this synthetic line does not match the current replacement parser.

- [ ] **Step 2: Run focused tests to verify red or current fail-closed behavior**

Run the focused test files containing those assertions.

Expected: PASS if already fail-closed, FAIL if a parser is too broad.

- [ ] **Step 3: Replace individual duration imports with named groups**

For restriction files, use:

```ts
import {
  parseDurationFromSet,
  restrictionDurationParsers,
} from "../../durations/index.js";
```

For replacement self effects, use:

```ts
import {
  parseDurationFromSet,
  replacementDurationParsers,
} from "../../../durations/index.js";
```

Replace `parseThisTurnDuration(...) ?? parseOpponentNextEndPhaseDuration(...)` chains with `parseDurationFromSet(..., restrictionDurationParsers)` or `parseDurationFromSet(..., replacementDurationParsers)`.

- [ ] **Step 4: Run focused parser tests**

Run:

```bash
npm.cmd run test -- packages/cards/src/card-effect-event-parser-life-trigger.test.ts packages/cards/src/card-effect-event-reaction-scalable-parser.test.ts packages/cards/src/card-effect-line-parser-op14-rested-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cards/src/instructions packages/cards/src/segments/replacement-effect packages/cards/src/*.test.ts
git commit -m "Route restriction durations through capability groups"
```

### Task 5: Remove Legacy Alias And Add Architecture Guard

**Files:**

- Modify: `packages/cards/src/durations/field-effect-durations.ts`
- Modify: `packages/cards/src/durations/index.ts`
- Modify: `packages/cards/src/architecture-boundaries.test.ts`

- [ ] **Step 1: Add architecture guard against body-level duration chains**

Add a test to `packages/cards/src/architecture-boundaries.test.ts`:

```ts
it("keeps body parsers on semantic duration groups", async () => {
  const files = await readCardsPackageSourceFiles();
  const bodyFiles = files.filter(
    (file) =>
      file.path.includes("/instructions/") || file.path.includes("/segments/"),
  );

  for (const file of bodyFiles) {
    expect(file.contents, file.path).not.toMatch(
      /parse(?:ThisTurn|ThisBattle|SelfNextTurnStart|OpponentNextEndPhase|OpponentNextRefreshPhase)Duration/u,
    );
    expect(file.contents, file.path).not.toMatch(
      /parseExplicitFieldEffectDuration/u,
    );
  }
});
```

- [ ] **Step 2: Run architecture test to verify red**

Run:

```bash
npm.cmd run test -- packages/cards/src/architecture-boundaries.test.ts
```

Expected: FAIL while direct duration imports or alias usages remain.

- [ ] **Step 3: Delete the legacy alias**

Remove `parseExplicitFieldEffectDuration` from:

- `packages/cards/src/durations/field-effect-durations.ts`
- `packages/cards/src/durations/index.ts`

Fix any remaining callers by choosing the correct named group. Do not add a new body-specific chain in the caller.

- [ ] **Step 4: Run full cards parser verification**

Run:

```bash
npm.cmd run test -- packages/cards/src/architecture-boundaries.test.ts packages/cards/src/durations/field-effect-durations.test.ts packages/cards/src/card-effect-event-reaction-scalable-parser.test.ts packages/cards/src/card-effect-reusable-composition-parser.test.ts packages/cards/src/card-effect-event-parser-life-trigger.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cards/src/durations packages/cards/src/architecture-boundaries.test.ts packages/cards/src/instructions packages/cards/src/segments
git commit -m "Enforce semantic duration parser groups"
```

## Self-Review

- Spec coverage: The plan creates named groups, a shared dispatcher, migrates callers, adds cross-body and incompatible-family tests, and removes the legacy ad hoc dispatcher.
- Placeholder scan: No `TBD`, `TODO`, or unbound placeholder steps remain. Synthetic tests that may need exact wording say to use existing local wording if the proposed line does not match current parser syntax.
- Type consistency: `DurationParserSet`, `parseDurationFromSet`, and all group names are defined in Task 1 before later tasks consume them.
