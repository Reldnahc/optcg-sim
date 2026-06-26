# Unified Event Reaction Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every supported "when event, do effect" card pass through one modular trigger capability contract so parser support, runtime admission, live queueing, diagnostics, and behavior probes cannot drift.

**Architecture:** Add a small trigger capability registry with one module per event family. Existing specialized mechanics remain in focused modules, but they are invoked through a shared dispatcher contract. Runtime admission and behavior probe scenario selection consume that same registry so a trigger/body cannot be certified without a live event path.

**Tech Stack:** TypeScript, Vitest, existing `@optcg/types`, `@optcg/engine-core`, `@optcg/cards`, and `@optcg/card-support` packages.

---

## File Structure

- Create `packages/engine-core/src/runtime/trigger-queueing/capabilities/types.ts`
  - Owns the shared trigger capability interfaces and diagnostic reason types.
- Create `packages/engine-core/src/runtime/trigger-queueing/capabilities/registry.ts`
  - Owns registration and lookup by `Trigger["type"]`.
- Create `packages/engine-core/src/runtime/trigger-queueing/capabilities/event-families.ts`
  - Declares small data-only capabilities for generic event-reaction families already handled by `event-reaction.ts`.
- Create `packages/engine-core/src/runtime/trigger-queueing/capabilities/specialized-families.ts`
  - Declares data-only capabilities for existing specialized routers such as `onOpponentAttack`, `handTrashedByEffect`, `opponentActivated`, and `onKO`.
- Modify `packages/engine-core/src/runtime/trigger-queueing/event-reaction-events.ts`
  - Replace local trigger/runtime event registries with registry-derived lists.
- Modify `packages/engine-core/src/effect-runtime-entry-adapters.ts`
  - Replace the hand-written trigger adapter chain with registry lookup where possible.
- Modify `packages/engine-core/src/effect-runtime-admission.ts`
  - Emit unsupported-entry diagnostics from the registry contract instead of only from local adapter availability.
- Modify `packages/card-support/src/behavior-probe-scenario-plans.ts`
  - Select behavior probe scenarios from registry metadata instead of a separate hand-coded trigger list.
- Add tests:
  - `packages/engine-core/src/runtime/trigger-queueing/capabilities/registry.test.ts`
  - `packages/engine-core/src/runtime/trigger-queueing/event-reaction-registry-parity.test.ts`
  - `packages/card-support/src/behavior-probe-trigger-registry-parity.test.ts`

## Task 1: Add The Capability Contract

**Files:**
- Create: `packages/engine-core/src/runtime/trigger-queueing/capabilities/types.ts`
- Create: `packages/engine-core/src/runtime/trigger-queueing/capabilities/registry.ts`
- Test: `packages/engine-core/src/runtime/trigger-queueing/capabilities/registry.test.ts`

- [ ] **Step 1: Write the failing registry contract test**

Add `packages/engine-core/src/runtime/trigger-queueing/capabilities/registry.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import type { Trigger } from "@optcg/types";

import {
  allTriggerQueueCapabilities,
  triggerQueueCapabilityForType,
} from "./registry.js";

const supportedTriggerTypes: readonly Trigger["type"][] = [
  "onPlay",
  "whenAttacking",
  "onOpponentAttack",
  "onKO",
  "endOfYourTurn",
  "main",
  "trigger",
  "counter",
  "handTrashedByEffect",
  "opponentActivated",
  "lifeRemoved",
  "damageDealt",
  "fieldRemoved",
  "cardDrawn",
  "cardPlayed",
  "cardRested",
  "donReturned",
  "donAttached",
  "attackDeclared",
  "endOfBattle",
  "effectQueued",
  "effectResolved",
  "triggerActivated",
];

test("registry exposes every currently supported queue trigger type once", () => {
  assert.deepEqual(
    allTriggerQueueCapabilities.map((capability) => capability.triggerType),
    supportedTriggerTypes,
  );
  assert.equal(new Set(supportedTriggerTypes).size, supportedTriggerTypes.length);
});

test("registry lookup returns source policy and router ownership", () => {
  assert.deepEqual(triggerQueueCapabilityForType("cardPlayed"), {
    triggerType: "cardPlayed",
    category: "auto",
    sourcePresencePolicies: ["mustRemainInSameZone"],
    router: "genericEventReaction",
    runtimeEventTypes: ["cardPlayed"],
    behaviorProbeScenario: { kind: "cardPlayed", category: "character" },
  });

  assert.equal(
    triggerQueueCapabilityForType("handTrashedByEffect")?.router,
    "specializedHandTrash",
  );
  assert.equal(
    triggerQueueCapabilityForType("onOpponentAttack")?.router,
    "specializedAttack",
  );
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @optcg/engine-core test -- runtime/trigger-queueing/capabilities/registry.test.ts
```

Expected: FAIL because the capability modules do not exist.

- [ ] **Step 3: Add the shared capability types**

Create `packages/engine-core/src/runtime/trigger-queueing/capabilities/types.ts`:

```ts
import type { EngineEvent, SourcePresencePolicy, Trigger } from "@optcg/types";

export type TriggerQueueRouter =
  | "genericEventReaction"
  | "specializedAttack"
  | "specializedBattleKo"
  | "specializedHandTrash"
  | "specializedMainEvent"
  | "specializedOnPlay"
  | "specializedOpponentActivation"
  | "specializedTurn"
  | "specializedTrigger"
  | "unsupported";

export type BehaviorProbeScenarioKind =
  | "attackDeclared"
  | "cardDrawn"
  | "cardPlayed"
  | "cardRested"
  | "counter"
  | "damageDealt"
  | "declareAttack"
  | "donAttached"
  | "donReturned"
  | "endOfBattle"
  | "endOfYourTurn"
  | "effectQueued"
  | "fieldRemoved"
  | "handTrashedByEffect"
  | "lifeRemoved"
  | "lifeTrigger"
  | "onBlock"
  | "onKO"
  | "opponentActivated"
  | "opponentAttack"
  | "playCard"
  | "triggerActivated";

export type BehaviorProbeScenarioCategory =
  | "character"
  | "event"
  | "leader";

export interface BehaviorProbeScenarioDescriptor {
  readonly kind: BehaviorProbeScenarioKind;
  readonly category: BehaviorProbeScenarioCategory;
}

export interface TriggerQueueCapability {
  readonly triggerType: Exclude<Trigger["type"], "anyOf" | "eventCount">;
  readonly category: "auto" | "activate";
  readonly sourcePresencePolicies: readonly SourcePresencePolicy[];
  readonly router: TriggerQueueRouter;
  readonly runtimeEventTypes: readonly EngineEvent["type"][];
  readonly behaviorProbeScenario?: BehaviorProbeScenarioDescriptor;
}
```

- [ ] **Step 4: Add capability families and the small registry barrel**

Create `packages/engine-core/src/runtime/trigger-queueing/capabilities/event-families.ts` with only `router: "genericEventReaction"` capabilities. Include these trigger types in this exact order:

```ts
export const genericEventReactionTriggerTypes = [
  "lifeRemoved",
  "damageDealt",
  "fieldRemoved",
  "cardDrawn",
  "cardPlayed",
  "cardRested",
  "donReturned",
  "donAttached",
  "attackDeclared",
  "endOfBattle",
  "onBlock",
  "effectQueued",
  "effectResolved",
  "triggerActivated",
] as const;
```

Create `packages/engine-core/src/runtime/trigger-queueing/capabilities/specialized-families.ts` with only specialized router capabilities. Include these trigger types in this exact order:

```ts
export const specializedTriggerQueueTypes = [
  "onPlay",
  "whenAttacking",
  "onOpponentAttack",
  "onKO",
  "endOfYourTurn",
  "main",
  "trigger",
  "counter",
  "handTrashedByEffect",
  "opponentActivated",
] as const;
```

In both files, define capabilities with the same `sourcePresencePolicies`, `runtimeEventTypes`, and `behaviorProbeScenario` values asserted by `registry.test.ts`. Keep each file data-only: no matching, queueing, admission, or probe logic goes into either file.

Create `packages/engine-core/src/runtime/trigger-queueing/capabilities/registry.ts` as the only lookup module:

```ts
import type { Trigger } from "@optcg/types";

import { genericEventReactionCapabilities } from "./event-families.js";
import { specializedTriggerQueueCapabilities } from "./specialized-families.js";
import type { TriggerQueueCapability } from "./types.js";

export const allTriggerQueueCapabilities = [
  ...specializedTriggerQueueCapabilities,
  ...genericEventReactionCapabilities,
] as const satisfies readonly TriggerQueueCapability[];

const capabilitiesByType: ReadonlyMap<
  TriggerQueueCapability["triggerType"],
  TriggerQueueCapability
> = new Map(
  allTriggerQueueCapabilities.map((value) => [value.triggerType, value]),
);

export const triggerQueueCapabilityForType = (
  triggerType: Trigger["type"],
): TriggerQueueCapability | undefined =>
  triggerType === "anyOf" || triggerType === "eventCount"
    ? undefined
    : capabilitiesByType.get(triggerType);
```

- [ ] **Step 5: Run the registry test**

Run:

```bash
pnpm --filter @optcg/engine-core test -- runtime/trigger-queueing/capabilities/registry.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the contract**

```bash
git add packages/engine-core/src/runtime/trigger-queueing/capabilities
git commit -m "feat: add trigger queue capability registry"
```

## Task 2: Drive Existing Runtime Gates From The Registry

**Files:**
- Modify: `packages/engine-core/src/effect-runtime-entry-adapters.ts`
- Modify: `packages/engine-core/src/runtime/trigger-queueing/event-reaction-events.ts`
- Test: `packages/engine-core/src/runtime/trigger-queueing/event-reaction-registry-parity.test.ts`

- [ ] **Step 1: Write parity tests**

Add `packages/engine-core/src/runtime/trigger-queueing/event-reaction-registry-parity.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import { autoRuntimeEntryAdapterForTriggerType } from "../../effect-runtime-entry-adapters.js";
import {
  allTriggerQueueCapabilities,
  triggerQueueCapabilityForType,
} from "./capabilities/registry.js";
import {
  autoEventReactionTriggerTypes,
  isAutoEventReactionRuntimeEventType,
} from "./event-reaction-events.js";

test("auto runtime entry adapters are backed by trigger capabilities", () => {
  for (const capability of allTriggerQueueCapabilities) {
    const adapter = autoRuntimeEntryAdapterForTriggerType(
      capability.triggerType,
    );
    assert.notEqual(adapter, undefined, capability.triggerType);
    assert.deepEqual(adapter?.sourcePresencePolicies, capability.sourcePresencePolicies);
  }
});

test("generic event reaction registry is derived from generic capabilities", () => {
  const generic = allTriggerQueueCapabilities.filter(
    (capability) => capability.router === "genericEventReaction",
  );
  assert.deepEqual(
    autoEventReactionTriggerTypes,
    generic.map((capability) => capability.triggerType),
  );

  for (const eventType of generic.flatMap(
    (capability) => capability.runtimeEventTypes,
  )) {
    assert.equal(isAutoEventReactionRuntimeEventType(eventType), true);
  }
});

test("specialized trigger families stay out of generic event reaction registry", () => {
  assert.equal(
    autoEventReactionTriggerTypes.includes("handTrashedByEffect"),
    false,
  );
  assert.equal(autoEventReactionTriggerTypes.includes("onOpponentAttack"), false);
  assert.equal(
    triggerQueueCapabilityForType("handTrashedByEffect")?.router,
    "specializedHandTrash",
  );
});
```

- [ ] **Step 2: Run parity tests and verify they fail before the refactor**

Run:

```bash
pnpm --filter @optcg/engine-core test -- runtime/trigger-queueing/event-reaction-registry-parity.test.ts
```

Expected: FAIL until the production files import the registry.

- [ ] **Step 3: Refactor entry adapters to use registry**

In `packages/engine-core/src/effect-runtime-entry-adapters.ts`, keep the public types and replace the long `if` chain inside `autoRuntimeEntryAdapterForTriggerType` with:

```ts
const capability = triggerQueueCapabilityForType(triggerType);
return capability === undefined || capability.category !== "auto"
  ? undefined
  : {
      category: "auto",
      sourcePresencePolicies: capability.sourcePresencePolicies,
      triggerType: capability.triggerType,
    };
```

Add the import:

```ts
import { triggerQueueCapabilityForType } from "./runtime/trigger-queueing/capabilities/registry.js";
```

- [ ] **Step 4: Refactor generic event-reaction events to use registry**

In `packages/engine-core/src/runtime/trigger-queueing/event-reaction-events.ts`, replace the literal trigger/runtime event lists with registry-derived lists:

```ts
import {
  allTriggerQueueCapabilities,
} from "./capabilities/registry.js";

const genericEventReactionCapabilities = allTriggerQueueCapabilities.filter(
  (capability) => capability.router === "genericEventReaction",
);

export const autoEventReactionTriggerTypes =
  genericEventReactionCapabilities.map(
    (capability) => capability.triggerType,
  ) as readonly EventReactionTriggerType[];

const autoEventReactionRuntimeEventTypes: ReadonlySet<EngineEvent["type"]> =
  new Set(
    genericEventReactionCapabilities.flatMap(
      (capability) => capability.runtimeEventTypes,
    ),
  );
```

Keep the existing exported functions unchanged.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
pnpm --filter @optcg/engine-core test -- runtime/trigger-queueing/event-reaction-registry-parity.test.ts runtime/trigger-queueing/event-reaction-events.test.ts effect-runtime-block-support.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit runtime registry parity**

```bash
git add packages/engine-core/src/effect-runtime-entry-adapters.ts packages/engine-core/src/runtime/trigger-queueing/event-reaction-events.ts packages/engine-core/src/runtime/trigger-queueing/event-reaction-registry-parity.test.ts
git commit -m "refactor: derive trigger runtime gates from registry"
```

## Task 3: Add Diagnostic Coverage For Router Drift

**Files:**
- Modify: `packages/engine-core/src/effect-runtime-admission.ts`
- Test: `packages/engine-core/src/runtime/trigger-queueing/capabilities/registry.test.ts`

- [ ] **Step 1: Extend the registry test for diagnostics metadata**

Append this test to `registry.test.ts`:

```ts
test("every implemented trigger capability declares a non-unsupported router", () => {
  for (const capability of allTriggerQueueCapabilities) {
    assert.notEqual(capability.router, "unsupported", capability.triggerType);
    if (capability.router === "genericEventReaction") {
      assert.notEqual(
        capability.runtimeEventTypes.length,
        0,
        capability.triggerType,
      );
    }
  }
});
```

- [ ] **Step 2: Improve unsupported-envelope reason**

In `packages/engine-core/src/effect-runtime-admission.ts`, import `triggerQueueCapabilityForType` and use it in `unsupportedEnvelope`:

```ts
const unsupportedEnvelopeReason = (block: EffectBlock): string => {
  const capability = triggerQueueCapabilityForType(block.trigger.type);
  if (capability === undefined) {
    return "unsupported trigger/category/source-presence envelope";
  }
  return `unsupported ${capability.router} trigger/category/source-presence envelope`;
};
```

Then replace the hard-coded reason inside `unsupportedEnvelope` with:

```ts
const reason = unsupportedEnvelopeReason(block);
```

and pass `reason` to both records.

- [ ] **Step 3: Run admission tests**

Run:

```bash
pnpm --filter @optcg/engine-core test -- runtime/trigger-queueing/capabilities/registry.test.ts runtime-support-gate-parity.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit diagnostics**

```bash
git add packages/engine-core/src/effect-runtime-admission.ts packages/engine-core/src/runtime/trigger-queueing/capabilities/registry.test.ts
git commit -m "test: guard trigger queue router diagnostics"
```

## Task 4: Drive Behavior Probe Scenario Selection From The Registry

**Files:**
- Modify: `packages/card-support/src/behavior-probe-scenario-plans.ts`
- Test: `packages/card-support/src/behavior-probe-trigger-registry-parity.test.ts`

- [ ] **Step 1: Write behavior probe parity test**

Add `packages/card-support/src/behavior-probe-trigger-registry-parity.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import { allTriggerQueueCapabilities } from "@optcg/engine-core/runtime/trigger-queueing/capabilities/registry";

test("behavior probe has a declared scenario for every probed trigger capability", () => {
  const missing = allTriggerQueueCapabilities
    .filter((capability) => capability.router !== "unsupported")
    .filter((capability) => capability.behaviorProbeScenario === undefined)
    .map((capability) => capability.triggerType);

  assert.deepEqual(missing, ["effectResolved"]);
});
```

If package exports do not expose that deep path, add a named export from `packages/engine-core/src/index.ts`:

```ts
export {
  allTriggerQueueCapabilities,
  triggerQueueCapabilityForType,
} from "./runtime/trigger-queueing/capabilities/registry.js";
export type {
  BehaviorProbeScenarioKind,
  TriggerQueueCapability,
} from "./runtime/trigger-queueing/capabilities/types.js";
```

Then import from `@optcg/engine-core`.

- [ ] **Step 2: Refactor scenario planning**

In `packages/card-support/src/behavior-probe-scenario-plans.ts`, replace the hand-coded event trigger chain with a helper:

```ts
const scenarioForTriggerType = (
  triggerType: Trigger["type"],
): BehaviorProbeScenarioKind | undefined =>
  triggerQueueCapabilityForType(triggerType)?.behaviorProbeScenario;
```

Use it in `scenarioKindForEffect` for primitive triggers and in `planBehaviorProbeScenarios` when all effects share a trigger family.

Keep existing bespoke rules for:

- `trigger` mixed with non-trigger blocks choosing `lifeTrigger`
- `replacement`
- `permanent`
- `startOfYourTurn`
- unsupported triggers returning `unsupported:<trigger type>`

- [ ] **Step 3: Run behavior probe tests**

Run:

```bash
pnpm --filter @optcg/card-support test -- behavior-probe-trigger-registry-parity.test.ts behavior-probe.test.ts behavior-probe-life-removed.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit behavior probe parity**

```bash
git add packages/card-support/src/behavior-probe-scenario-plans.ts packages/card-support/src/behavior-probe-trigger-registry-parity.test.ts packages/engine-core/src/index.ts
git commit -m "refactor: derive behavior probe trigger scenarios from registry"
```

## Task 5: Add Live Queueing Drift Tests For Known Risk Families

**Files:**
- Test: `packages/engine-core/src/runtime/trigger-queueing/capabilities/live-router-parity.test.ts`

- [ ] **Step 1: Write live-router parity tests**

Create `packages/engine-core/src/runtime/trigger-queueing/capabilities/live-router-parity.test.ts` with three focused tests:

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  allTriggerQueueCapabilities,
  triggerQueueCapabilityForType,
} from "./registry.js";

test("all generic event reaction capabilities declare runtime events", () => {
  const missing = allTriggerQueueCapabilities
    .filter((capability) => capability.router === "genericEventReaction")
    .filter((capability) => capability.runtimeEventTypes.length === 0)
    .map((capability) => capability.triggerType);

  assert.deepEqual(missing, []);
});

test("specialized routers are explicit and cannot accidentally become generic", () => {
  assert.equal(
    triggerQueueCapabilityForType("handTrashedByEffect")?.router,
    "specializedHandTrash",
  );
  assert.equal(
    triggerQueueCapabilityForType("opponentActivated")?.router,
    "specializedOpponentActivation",
  );
  assert.equal(
    triggerQueueCapabilityForType("onOpponentAttack")?.router,
    "specializedAttack",
  );
  assert.equal(
    triggerQueueCapabilityForType("onKO")?.router,
    "specializedBattleKo",
  );
});

test("event-count wrappers inherit routing from their child trigger in support code", () => {
  assert.equal(triggerQueueCapabilityForType("eventCount"), undefined);
});
```

- [ ] **Step 2: Run live-router parity tests**

Run:

```bash
pnpm --filter @optcg/engine-core test -- runtime/trigger-queueing/capabilities/live-router-parity.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit drift tests**

```bash
git add packages/engine-core/src/runtime/trigger-queueing/capabilities/live-router-parity.test.ts
git commit -m "test: guard trigger router drift"
```

## Task 6: Final Verification

**Files:**
- No source edits.

- [ ] **Step 1: Run focused package tests**

Run:

```bash
pnpm --filter @optcg/engine-core test -- runtime/trigger-queueing effect-runtime-block-support.test.ts runtime-support-gate-parity.test.ts
pnpm --filter @optcg/card-support test -- behavior-probe.test.ts behavior-probe-trigger-registry-parity.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run repo verification if feasible**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm verify
```

Expected: PASS. If any command does not exist or is too broad for the environment, record the exact skipped command and reason in the final response.

- [ ] **Step 3: Confirm clean worktree**

Run:

```bash
git status --short
```

Expected: no output.

## Self-Review

- Spec coverage: The plan unifies trigger capability metadata, derives current runtime gates from that metadata, adds diagnostics, derives behavior probe scenario selection from the same source, and adds drift tests for specialized routers.
- Placeholder scan: No TODO/TBD placeholders remain.
- Type consistency: `TriggerQueueCapability`, `TriggerQueueRouter`, and `BehaviorProbeScenarioKind` are introduced before use. The registry exports are used consistently.
- Scope check: This does not rewrite the actual queueing mechanics. It creates the shared contract first so later movement of router internals can happen safely without giant files.
