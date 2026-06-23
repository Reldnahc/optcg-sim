# AI Bot Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current one-action heuristic bot with a decision-safe, turn-aware, profile-data-driven bot that cannot stall on bot-owned decisions and can be tuned from explainable behavior.

**Architecture:** Keep the public `BotStrategy` and registry boundary, but split the internals into a decision responder, feature extractor, candidate/scoring model, turn intent planner, declarative deck profile data, and a behavior probe. Each slice must preserve liveness and pass focused tests before the next slice starts.

**Tech Stack:** TypeScript, Vitest, strict package typecheck via `corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit`, ESLint, existing `packages/match-server` snapshot/action types.

---

## Current Problem

The bot currently works mostly as a single-action scorer:

- `packages/match-server/src/bot-strategy.ts` builds evaluated visible actions, handles some pending decision cases, then falls back to normal action scoring.
- `packages/match-server/src/bot-action-evaluator.ts` returns a single utility number from a first-matching chain.
- `packages/match-server/src/bot-combat-evaluation.ts` owns tactical combat math and also has decision fallback behavior.
- `packages/match-server/src/bot-default-profile.ts` owns generic decision fallback.
- `packages/match-server/src/bot-red-shanks-profile.ts` mixes deck profile knowledge, search priorities, combat callbacks, overflow preservation, and card-specific decisions.

That setup is too coupled. The bad cases we are preventing:

1. Bot-owned pending decisions falling through to unrelated normal actions.
2. New public pending decision types being added without a fallback.
3. The bot choosing locally high-value actions that make the turn worse.
4. Deck profile behavior being hidden inside imperative callbacks.
5. Duplicate valuation and counter math drifting across modules.
6. Tuning a choice without knowing which reason caused it.

## Hard Invariants

These must remain true after every slice:

1. A bot-owned pending decision never reaches normal action scoring.
2. Every current public pending decision type has a generic fallback response.
3. Adding a new public pending decision type fails typecheck or tests until the responder handles it.
4. Profile-specific logic can improve a decision, but liveness does not depend on profile code.
5. `packages/match-server/src/dev-local-match-registry.ts` remains a thin executor.
6. The bot uses only `DevMatchSnapshot` public/player-facing data.
7. Generic bot code does not contain Red Shanks card-specific branches.
8. Each chosen action can expose intent and score reasons for tests/probes.

## File Map

Files to keep as public boundaries:

- `packages/match-server/src/bot-player.ts`
  - Keep `chooseBotAction(snapshot, botPlayerId)`.
  - Keep exports for `BotActionChoice`, `BotBehaviorProfile`, `BotStrategy`, `createBotStrategy`, and `defaultBotStrategy`.
- `packages/match-server/src/bot-types.ts`
  - Keep shared bot interfaces.
  - Extend with reason, feature, candidate, and profile types only when they are shared between modules.

Files to split or replace:

- `packages/match-server/src/bot-strategy.ts`
  - Final responsibility: orchestrate decision responder, features, intent, candidates, and scoring.
  - It should not own fallback decision logic or profile card branches.
- `packages/match-server/src/bot-default-profile.ts`
  - Final responsibility: generic default decision responses only.
  - Eventually rename behavior into `bot-decision-responder.ts` or keep as a private helper imported by it.
- `packages/match-server/src/bot-action-evaluator.ts`
  - Replace as the main brain.
  - Either remove it or reduce it to a compatibility wrapper around `bot-score.ts`.
- `packages/match-server/src/bot-combat-evaluation.ts`
  - Keep combat concepts, but move shared facts into `bot-features.ts`.
- `packages/match-server/src/bot-red-shanks-profile.ts`
  - Convert imperative callback branches into declarative profile data consumed by generic logic.

New files:

- `packages/match-server/src/bot-decision-responder.ts`
  - Owns bot-owned pending decision selection and reason metadata.
- `packages/match-server/src/bot-features.ts`
  - Computes visible facts once per strategy call.
- `packages/match-server/src/bot-candidates.ts`
  - Converts legal actions into scored candidate inputs.
- `packages/match-server/src/bot-score.ts`
  - Produces `BotScoreBreakdown` with total and reasons.
- `packages/match-server/src/bot-turn-intent.ts`
  - Chooses turn-level intent before action scoring.
- `packages/match-server/src/bot-profile-types.ts`
  - Defines declarative deck profile data.
- `packages/match-server/src/bot-probe.ts`
  - Runs behavior scenarios and fails on stalls.

## Keep And Delete

Keep:

- `BotStrategy` as the public boundary.
- Registry submission and delay behavior.
- Current liveness tests, expanded as Slice 0.
- Combat ideas: lethal pressure, counter cards needed, blocker for lethal, character threat valuation.
- Red Shanks knowledge, but only as profile data.
- Generic fallback responses, but owned by the responder path.

Delete or demote:

- `bot-action-evaluator.ts` as a first-matching central brain.
- `BotBehaviorProfile.scoreAction`, `.cardBehaviors`, and `.chooseDecision` as the long-term extension model.
- Card-ID-specific imperative branches in generic scoring/strategy.
- Duplicate `visibleCardValue`, counter-needed, hand-counter-power, and battle-card lookup helpers.
- Decision classification by string ID prefix where `causedBy` or typed decision data can carry intent.

## Task 0: Lock Decision Liveness Baseline

**Files:**

- Modify: `packages/match-server/src/bot-strategy.ts`
- Modify: `packages/match-server/src/bot-default-profile.ts`
- Modify: `packages/match-server/src/bot-decision-liveness.test.ts`

- [ ] **Step 1: Keep the matrix test covering all current public pending decision types**

The test must live in `packages/match-server/src/bot-decision-liveness.test.ts` and must include this case list:

```ts
const cases: readonly {
  readonly name: string;
  readonly decision: BotPendingDecision;
  readonly response: DecisionResponse;
}[] = [
  {
    name: "payCost",
    decision: payCostDecision,
    response: { type: "paymentDeclined" },
  },
  {
    name: "chooseTriggerOrder",
    decision: triggerOrderDecision,
    response: { type: "orderedIds", ids: ["trigger-1"] },
  },
  {
    name: "chooseEffectOption",
    decision: effectOptionDecision,
    response: { type: "effectOptionDeclined" },
  },
  {
    name: "chooseReplacement",
    decision: replacementDecision,
    response: { type: "replacement" },
  },
  {
    name: "chooseQuantity",
    decision: quantityDecision,
    response: { type: "chooseQuantity", quantity: 1 },
  },
  {
    name: "selectCards",
    decision: selectCardsDecision,
    response: { type: "cards", cards: [selectedCard] },
  },
  {
    name: "selectTargets",
    decision: selectTargetsDecision,
    response: { type: "targets", targets: [targetCard] },
  },
  {
    name: "orderCards",
    decision: orderCardsDecision,
    response: { type: "orderedIds", ids: [String(orderedCard.instanceId)] },
  },
  {
    name: "confirmLifeTrigger",
    decision: lifeTriggerDecision,
    response: { type: "lifeTrigger", choice: "addToHand" },
  },
  {
    name: "chooseOptionalActivation",
    decision: optionalActivationDecision,
    response: { type: "optionalActivation", choice: "decline" },
  },
  {
    name: "mulligan",
    decision: mulliganDecision,
    response: { type: "mulligan", keep: true },
  },
  {
    name: "declareLoopCount",
    decision: loopCountDecision,
    response: { type: "loopCount", count: 1 },
  },
  {
    name: "rollbackConsent",
    decision: rollbackConsentDecision,
    response: { type: "rollbackConsent", allow: true },
  },
];
```

Use the current local helper style in the test file. Do not introduce `any`.

- [ ] **Step 2: Keep the normal-action-blocked regression test**

The test must prove a visible `playCard` or `endMainPhase` is ignored while a bot-owned pending decision can be answered by fallback:

```ts
const chosen = chooseBotAction(
  snapshotWithDecision(
    {
      ...baseDecision("decision:normal-action-blocked", "chooseQuantity"),
      mode: "upTo",
      min: 0,
      max: 2,
    },
    [
      { index: 0, type: "playCard", label: "Play card" },
      { index: 1, type: "endMainPhase", label: "End turn" },
    ],
  ),
  botId,
);

assert.deepEqual(chosen, {
  type: "respondToDecision",
  decisionId: "decision:normal-action-blocked",
  response: { type: "chooseQuantity", quantity: 0 },
});
```

- [ ] **Step 3: Keep the bot-owned pending-decision guard in strategy**

`createBotStrategy` must preserve this ordering:

```ts
if (counterStepPass !== undefined) {
  return counterStepPass;
}
if (botOwnsPendingDecision) {
  const profileDecisionChoice = chooseProfilePendingDecision({
    snapshot,
    botPlayerId,
    profile,
  });
  if (profileDecisionChoice !== undefined) {
    return profileDecisionChoice;
  }
  const decisionAction = chooseBestVisibleDecisionAction(evaluated);
  if (decisionAction !== undefined) {
    return { type: "submitAction", actionIndex: decisionAction.index };
  }
  return chooseDefaultBotDecision({ snapshot, botPlayerId });
}
```

Do not allow code after this block to score normal actions for the same pending decision.

- [ ] **Step 4: Keep the exhaustive default decision guard**

`packages/match-server/src/bot-default-profile.ts` must end its switch with:

```ts
const unhandledBotDecision = (decision: never): never => {
  throw new Error(`Unhandled bot decision type: ${JSON.stringify(decision)}`);
};
```

and:

```ts
return unhandledBotDecision(decision);
```

- [ ] **Step 5: Run focused verification**

Run:

```text
corepack pnpm exec vitest run packages/match-server/src/bot-decision-liveness.test.ts packages/match-server/src/bot-player-decision-fallback.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
corepack pnpm exec eslint packages/match-server/src/bot-default-profile.ts packages/match-server/src/bot-strategy.ts packages/match-server/src/bot-decision-liveness.test.ts --max-warnings=0
```

Expected result:

- Vitest passes all liveness/fallback tests.
- Typecheck exits with code 0.
- ESLint exits with code 0.

- [ ] **Step 6: Commit Slice 0**

Commit only the liveness baseline files:

```text
git add packages/match-server/src/bot-strategy.ts packages/match-server/src/bot-default-profile.ts packages/match-server/src/bot-decision-liveness.test.ts
git commit -m "test: lock bot decision liveness"
```

## Task 1: Extract Decision Responder

**Files:**

- Create: `packages/match-server/src/bot-decision-responder.ts`
- Modify: `packages/match-server/src/bot-strategy.ts`
- Modify: `packages/match-server/src/bot-types.ts`
- Modify: `packages/match-server/src/bot-decision-liveness.test.ts`
- Test: `packages/match-server/src/bot-decision-responder.test.ts`

- [ ] **Step 1: Write responder tests before production code**

Create `packages/match-server/src/bot-decision-responder.test.ts` with tests for:

```ts
describe("chooseBotDecisionResponse", () => {
  test("returns undefined when no bot-owned pending decision exists", () => {
    const chosen = chooseBotDecisionResponse({
      snapshot: snapshotWithoutDecision(),
      botPlayerId,
      profile: {},
      evaluatedActions: [],
    });

    assert.equal(chosen, undefined);
  });

  test("uses profile decision before visible decision actions", () => {
    const chosen = chooseBotDecisionResponse({
      snapshot: snapshotWithDecision(selectCardsDecision),
      botPlayerId,
      profile: {
        chooseDecision: () => ({
          type: "respondToDecision",
          decisionId: selectCardsDecision.id,
          response: { type: "cards", cards: [profileCard] },
        }),
      },
      evaluatedActions: [{ action: visibleDecisionAction, utility: 999 }],
    });

    assert.deepEqual(chosen?.choice, {
      type: "respondToDecision",
      decisionId: selectCardsDecision.id,
      response: { type: "cards", cards: [profileCard] },
    });
    assert.equal(chosen?.reason.kind, "profile");
  });

  test("uses visible respondToDecision actions before fallback", () => {
    const chosen = chooseBotDecisionResponse({
      snapshot: snapshotWithDecision(quantityDecision),
      botPlayerId,
      profile: {},
      evaluatedActions: [{ action: visibleDecisionAction, utility: 100 }],
    });

    assert.deepEqual(chosen?.choice, {
      type: "submitAction",
      actionIndex: visibleDecisionAction.index,
    });
    assert.equal(chosen?.reason.kind, "visible-action");
  });

  test("uses fallback when no profile or visible response exists", () => {
    const chosen = chooseBotDecisionResponse({
      snapshot: snapshotWithDecision(quantityDecision),
      botPlayerId,
      profile: {},
      evaluatedActions: [],
    });

    assert.deepEqual(chosen?.choice, {
      type: "respondToDecision",
      decisionId: quantityDecision.id,
      response: { type: "chooseQuantity", quantity: quantityDecision.min },
    });
    assert.equal(chosen?.reason.kind, "fallback");
  });
});
```

Use local helpers copied from `bot-decision-liveness.test.ts` when needed, but keep helpers small enough that the test remains readable.

- [ ] **Step 2: Add responder reason types**

Modify `packages/match-server/src/bot-types.ts`:

```ts
export type BotDecisionReason =
  | { readonly kind: "profile"; readonly profileId?: string }
  | { readonly kind: "visible-action"; readonly actionIndex: number }
  | { readonly kind: "fallback"; readonly decisionType: string }
  | { readonly kind: "counter-step-pass" };

export interface BotDecisionResponseChoice {
  readonly choice: BotActionChoice;
  readonly reason: BotDecisionReason;
}
```

- [ ] **Step 3: Create the responder module**

Create `packages/match-server/src/bot-decision-responder.ts`:

```ts
import type { PlayerView } from "@optcg/types";

import { chooseDefaultBotDecision } from "./bot-default-profile.js";
import type {
  BotActionChoice,
  BotBehaviorProfile,
  BotDecisionResponseChoice,
} from "./bot-types.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

export interface EvaluatedBotDecisionAction {
  readonly action: DevVisibleAction;
  readonly utility: number;
}

export interface BotDecisionResponseInput {
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: string;
  readonly profile: BotBehaviorProfile;
  readonly evaluatedActions: readonly EvaluatedBotDecisionAction[];
}

const chooseBestVisibleDecisionAction = (
  evaluatedActions: readonly EvaluatedBotDecisionAction[],
): DevVisibleAction | undefined =>
  [...evaluatedActions]
    .filter(({ action }) => action.type === "respondToDecision")
    .sort((left, right) => right.utility - left.utility)[0]?.action;

const isBotOwnedDecision = (
  decision: BotPendingDecision | undefined,
  botPlayerId: string,
): decision is BotPendingDecision =>
  decision !== undefined && decision.playerId === botPlayerId;

export const chooseBotDecisionResponse = ({
  snapshot,
  botPlayerId,
  profile,
  evaluatedActions,
}: BotDecisionResponseInput): BotDecisionResponseChoice | undefined => {
  const decision = snapshot.players[botPlayerId]?.view.pendingDecision;
  if (!isBotOwnedDecision(decision, botPlayerId)) {
    return undefined;
  }

  const profileChoice = profile.chooseDecision?.({ snapshot, botPlayerId });
  if (profileChoice !== undefined) {
    return {
      choice: profileChoice,
      reason: { kind: "profile", profileId: profile.id },
    };
  }

  const decisionAction = chooseBestVisibleDecisionAction(evaluatedActions);
  if (decisionAction !== undefined) {
    return {
      choice: { type: "submitAction", actionIndex: decisionAction.index },
      reason: { kind: "visible-action", actionIndex: decisionAction.index },
    };
  }

  const fallback = chooseDefaultBotDecision({ snapshot, botPlayerId });
  return fallback === undefined
    ? undefined
    : {
        choice: fallback,
        reason: { kind: "fallback", decisionType: decision.type },
      };
};
```

Adjust `botPlayerId` to `PlayerId` from `@optcg/types` in production code; the snippet shows shape, not permission to weaken types.

- [ ] **Step 4: Move counter-step pass into responder or document the temporary exception**

Preferred final code in responder:

```ts
export const chooseCounterStepDecisionResponse = (
  input: BotDecisionResponseInput,
): BotDecisionResponseChoice | undefined => {
  const decision =
    input.snapshot.players[input.botPlayerId]?.view.pendingDecision;
  const battleStep =
    input.snapshot.players[input.botPlayerId]?.view.battle?.step;
  if (
    decision === undefined ||
    decision.playerId !== input.botPlayerId ||
    battleStep !== "counter" ||
    decision.type !== "selectCards" ||
    decision.min !== 0 ||
    decision.max !== 0
  ) {
    return undefined;
  }
  return {
    choice: {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
    reason: { kind: "counter-step-pass" },
  };
};
```

If useful-counter action selection still needs evaluated `useCounter` actions, keep that specific helper in `bot-strategy.ts` for this slice and add this comment above it:

```ts
// Counter-step pass still needs evaluated useCounter utilities. Move this into
// the responder after score breakdown exposes a structured counter term.
```

- [ ] **Step 5: Make strategy call responder before normal action scoring**

`packages/match-server/src/bot-strategy.ts` should reduce to this shape around pending decisions:

```ts
const decisionResponse = chooseBotDecisionResponse({
  snapshot,
  botPlayerId,
  profile,
  evaluatedActions: evaluated,
});
if (decisionResponse !== undefined) {
  return decisionResponse.choice;
}
```

Normal `chooseBestAction(evaluated)` must appear only after this responder call.

- [ ] **Step 6: Run tests**

Run:

```text
corepack pnpm exec vitest run packages/match-server/src/bot-decision-responder.test.ts packages/match-server/src/bot-decision-liveness.test.ts packages/match-server/src/bot-player-decision-fallback.test.ts packages/match-server/src/bot-red-shanks-profile.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
corepack pnpm exec eslint packages/match-server/src/bot-decision-responder.ts packages/match-server/src/bot-strategy.ts packages/match-server/src/bot-types.ts packages/match-server/src/bot-decision-responder.test.ts packages/match-server/src/bot-decision-liveness.test.ts --max-warnings=0
```

- [ ] **Step 7: Review and commit Slice 1**

Reviewer questions:

- Can a bot-owned pending decision still fall through to normal action scoring?
- Does profile decision logic improve behavior without owning liveness?
- Are decision reasons available for the future probe?

Commit:

```text
git add packages/match-server/src/bot-decision-responder.ts packages/match-server/src/bot-strategy.ts packages/match-server/src/bot-types.ts packages/match-server/src/bot-decision-liveness.test.ts packages/match-server/src/bot-decision-responder.test.ts
git commit -m "refactor: extract bot decision responder"
```

## Task 2: Extract Bot Features

**Files:**

- Create: `packages/match-server/src/bot-features.ts`
- Create: `packages/match-server/src/bot-features.test.ts`
- Modify: `packages/match-server/src/bot-context.ts`
- Modify: `packages/match-server/src/bot-combat-evaluation.ts`
- Modify: `packages/match-server/src/bot-action-evaluator.ts`

- [ ] **Step 1: Write feature extractor tests**

Create `packages/match-server/src/bot-features.test.ts` with these tests:

```ts
describe("buildBotFeatures", () => {
  test("computes visible hand counter power", () => {
    const features = buildBotFeatures(
      snapshotWithHandCounters([2000, 1000]),
      botPlayerId,
    );
    assert.equal(features.self.handCounterPower, 3000);
  });

  test("finds visible cards by instance id", () => {
    const features = buildBotFeatures(snapshotWithKnownLeader(), botPlayerId);
    assert.equal(
      features.cards.byInstanceId.get("bot-leader")?.instanceId,
      "bot-leader",
    );
  });

  test("computes legal leader attack pressure", () => {
    const features = buildBotFeatures(snapshotWithLeaderSwing(), botPlayerId);
    assert.deepEqual(features.combat.leaderAttackPressure[0], {
      attackerInstanceId: "bot-leader",
      targetInstanceId: "opponent-leader",
      cardsToStop: 1,
    });
  });

  test("does not mark attach DON useful when target has no remaining attack", () => {
    const features = buildBotFeatures(
      snapshotWithRestedCharacterAndAttachDon(),
      botPlayerId,
    );
    assert.equal(
      features.actions.byIndex.get(1)?.hasRemainingAttackAfterAttachment,
      false,
    );
  });
});
```

- [ ] **Step 2: Create feature types**

Create `packages/match-server/src/bot-features.ts` with these exported shapes:

```ts
export interface BotFeatures {
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
  readonly self: BotSelfFeatures;
  readonly opponent: BotOpponentFeatures;
  readonly cards: BotCardFeatures;
  readonly actions: BotActionFeatures;
  readonly combat: BotCombatFeatures;
}

export interface BotSelfFeatures {
  readonly lifeCount: number;
  readonly handCounterPower: number;
  readonly donOnField: number;
}

export interface BotOpponentFeatures {
  readonly lifeCount: number;
  readonly handCount: number;
}

export interface BotCardFeatures {
  readonly visibleCards: readonly BotVisibleCard[];
  readonly byInstanceId: ReadonlyMap<string, BotVisibleCard>;
}

export interface BotActionFeatures {
  readonly byIndex: ReadonlyMap<number, BotVisibleActionFacts>;
}

export interface BotVisibleActionFacts {
  readonly relatedCards: readonly BotVisibleCard[];
  readonly hasRemainingAttackAfterAttachment: boolean;
}

export interface BotCombatFeatures {
  readonly leaderAttackPressure: readonly BotLeaderAttackPressure[];
}
```

- [ ] **Step 3: Move reusable helpers into feature extractor**

Move these behaviors into `bot-features.ts`:

- `cardPower`
- `visibleCards`
- `findVisibleCard`
- `relatedCardsForAction`
- visible card value base calculation
- counter cards needed to stop an attack
- hand counter power
- legal leader attack candidate calculation
- remaining attack check for DON attachment

Keep `bot-context.ts` as a compatibility barrel during this slice:

```ts
export {
  cardPower,
  findVisibleCard,
  relatedCardsForAction,
  visibleCards,
} from "./bot-features.js";
```

- [ ] **Step 4: Update combat and evaluator to consume features**

Change evaluator inputs from repeated snapshot lookup to a shared feature object:

```ts
export interface BotActionEvaluationInput {
  readonly context: BotActionContext;
  readonly features: BotFeatures;
  readonly pendingDecision?: BotPendingDecision | undefined;
  readonly tacticalScore?: number | undefined;
  readonly profileScore?: number | undefined;
  readonly cardScores: readonly number[];
}
```

In `bot-strategy.ts`, build features once:

```ts
const features = buildBotFeatures(snapshot, botPlayerId);
```

Pass `features` to combat and evaluator.

- [ ] **Step 5: Run tests**

Run:

```text
corepack pnpm exec vitest run packages/match-server/src/bot-features.test.ts packages/match-server/src/bot-combat-evaluation.test.ts packages/match-server/src/bot-strategy-priorities.test.ts packages/match-server/src/bot-red-shanks-profile.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
corepack pnpm exec eslint packages/match-server/src/bot-features.ts packages/match-server/src/bot-features.test.ts packages/match-server/src/bot-context.ts packages/match-server/src/bot-combat-evaluation.ts packages/match-server/src/bot-action-evaluator.ts packages/match-server/src/bot-strategy.ts --max-warnings=0
```

- [ ] **Step 6: Review and commit Slice 2**

Reviewer questions:

- Did duplicated valuation/counter math decrease?
- Does the feature extractor use only public snapshot data?
- Did behavior remain stable where intended?

Commit:

```text
git add packages/match-server/src/bot-features.ts packages/match-server/src/bot-features.test.ts packages/match-server/src/bot-context.ts packages/match-server/src/bot-combat-evaluation.ts packages/match-server/src/bot-action-evaluator.ts packages/match-server/src/bot-strategy.ts
git commit -m "refactor: centralize bot feature extraction"
```

## Task 3: Add Candidate Model And Score Breakdown

**Files:**

- Create: `packages/match-server/src/bot-candidates.ts`
- Create: `packages/match-server/src/bot-score.ts`
- Create: `packages/match-server/src/bot-score.test.ts`
- Modify: `packages/match-server/src/bot-action-evaluator.ts`
- Modify: `packages/match-server/src/bot-strategy.ts`
- Modify: `packages/match-server/src/bot-types.ts`
- Modify: `packages/match-server/src/bot-strategy-priorities.test.ts`
- Modify: `packages/match-server/src/bot-red-shanks-profile.test.ts`

- [ ] **Step 1: Write score reason tests**

Create `packages/match-server/src/bot-score.test.ts`:

```ts
describe("scoreBotCandidate", () => {
  test("explains lethal leader attacks", () => {
    const scored = scoreBotCandidate(
      candidateForLeaderLethal(),
      featuresForLethal(),
    );
    assert.equal(
      scored.breakdown.reasons.includes("combat:leader-lethal"),
      true,
    );
  });

  test("explains high-counter preservation", () => {
    const scored = scoreBotCandidate(
      candidateForHighCounterPlay(),
      featuresWithAttackOption(),
    );
    assert.equal(
      scored.breakdown.reasons.includes("resource:preserve-counter"),
      true,
    );
  });

  test("explains visible decision responses", () => {
    const scored = scoreBotCandidate(
      candidateForDecisionResponse(),
      featuresWithPendingDecision(),
    );
    assert.equal(
      scored.breakdown.reasons.includes("decision:visible-response"),
      true,
    );
  });
});
```

- [ ] **Step 2: Define candidate and score types**

Add to `packages/match-server/src/bot-candidates.ts`:

```ts
export interface BotActionCandidate {
  readonly action: DevVisibleAction;
  readonly relatedCards: readonly BotVisibleCard[];
  readonly facts: BotVisibleActionFacts;
}

export const buildBotActionCandidates = (
  features: BotFeatures,
): readonly BotActionCandidate[] =>
  (features.snapshot.players[features.botPlayerId]?.actions ?? []).map(
    (action) => ({
      action,
      relatedCards:
        features.actions.byIndex.get(action.index)?.relatedCards ?? [],
      facts:
        features.actions.byIndex.get(action.index) ?? defaultVisibleActionFacts,
    }),
  );
```

Add to `packages/match-server/src/bot-score.ts`:

```ts
export interface BotScoreBreakdown {
  readonly total: number;
  readonly profile: number;
  readonly combat: number;
  readonly resource: number;
  readonly tempo: number;
  readonly risk: number;
  readonly fallback: number;
  readonly intent: number;
  readonly reasons: readonly string[];
}

export interface ScoredBotCandidate {
  readonly candidate: BotActionCandidate;
  readonly breakdown: BotScoreBreakdown;
}
```

- [ ] **Step 3: Replace first-matching utility with additive terms**

Implement score functions with stable initial values equivalent to current behavior:

```ts
const emptyBreakdown = (): BotScoreBreakdown => ({
  total: 0,
  profile: 0,
  combat: 0,
  resource: 0,
  tempo: 0,
  risk: 0,
  fallback: 0,
  intent: 0,
  reasons: [],
});

const addTerm = (
  breakdown: BotScoreBreakdown,
  key: keyof Omit<BotScoreBreakdown, "total" | "reasons">,
  value: number,
  reason: string,
): BotScoreBreakdown => ({
  ...breakdown,
  [key]: breakdown[key] + value,
  total: breakdown.total + value,
  reasons: [...breakdown.reasons, reason],
});
```

Current first-matching behaviors must become additive terms with reasons:

- `decision:visible-response`
- `combat:leader-lethal`
- `combat:lethal-setup`
- `combat:leader-defense-counter`
- `combat:character-threat`
- `resource:preserve-counter`
- `resource:use-don-for-live-attack`
- `tempo:develop-board`
- `tempo:profitable-effect`
- `fallback:<action-type>`

- [ ] **Step 4: Keep compatibility wrapper temporarily**

If deleting `evaluateBotAction` would cause a wide patch, keep it as:

```ts
export const evaluateBotAction = (
  input: BotActionEvaluationInput,
): number | undefined => {
  const scored = scoreBotCandidate(
    candidateFromEvaluationInput(input),
    input.features,
  );
  return scored.breakdown.total;
};
```

No new code should add scoring logic to the wrapper.

- [ ] **Step 5: Update strategy to choose by breakdown**

In `bot-strategy.ts`:

```ts
const candidates = buildBotActionCandidates(features);
const scored = scoreBotCandidates({ candidates, features, profile });
const chosen = chooseBestScoredCandidate(scored);
```

The final returned action remains:

```ts
return { type: "submitAction", actionIndex: chosen.candidate.action.index };
```

- [ ] **Step 6: Add reason assertions to existing behavior tests**

Update selected tests so they assert reasons through a direct score helper rather than only `chooseBotAction`:

- `bot-strategy-priorities.test.ts`: board development reason.
- `bot-combat-evaluation.test.ts`: lethal or defense reason.
- `bot-red-shanks-profile.test.ts`: profile preservation or power reduction reason.

- [ ] **Step 7: Run tests**

Run:

```text
corepack pnpm exec vitest run packages/match-server/src/bot-score.test.ts packages/match-server/src/bot-strategy-priorities.test.ts packages/match-server/src/bot-combat-evaluation.test.ts packages/match-server/src/bot-red-shanks-profile.test.ts packages/match-server/src/bot-decision-liveness.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
corepack pnpm exec eslint packages/match-server/src/bot-candidates.ts packages/match-server/src/bot-score.ts packages/match-server/src/bot-score.test.ts packages/match-server/src/bot-action-evaluator.ts packages/match-server/src/bot-strategy.ts packages/match-server/src/bot-types.ts --max-warnings=0
```

- [ ] **Step 8: Review and commit Slice 3**

Reviewer questions:

- Can every selected action now expose a reason?
- Did first-matching score behavior stop being the central model?
- Are score terms composable enough for turn intent?

Commit:

```text
git add packages/match-server/src/bot-candidates.ts packages/match-server/src/bot-score.ts packages/match-server/src/bot-score.test.ts packages/match-server/src/bot-action-evaluator.ts packages/match-server/src/bot-strategy.ts packages/match-server/src/bot-types.ts packages/match-server/src/bot-strategy-priorities.test.ts packages/match-server/src/bot-red-shanks-profile.test.ts
git commit -m "refactor: score bot actions with explainable breakdowns"
```

## Task 4: Add Turn Intent Planner

**Files:**

- Create: `packages/match-server/src/bot-turn-intent.ts`
- Create: `packages/match-server/src/bot-turn-intent.test.ts`
- Modify: `packages/match-server/src/bot-score.ts`
- Modify: `packages/match-server/src/bot-strategy.ts`
- Modify: `packages/match-server/src/bot-types.ts`

- [ ] **Step 1: Write turn intent tests**

Create `packages/match-server/src/bot-turn-intent.test.ts`:

```ts
describe("chooseBotTurnIntent", () => {
  test("answers bot-owned pending decisions first", () => {
    const intent = chooseBotTurnIntent(featuresWithPendingDecision());
    assert.equal(intent.type, "answerDecision");
  });

  test("prioritizes survival during lethal battle", () => {
    const intent = chooseBotTurnIntent(featuresWithLethalIncomingBattle());
    assert.equal(intent.type, "surviveLethal");
  });

  test("prioritizes available lethal before normal development", () => {
    const intent = chooseBotTurnIntent(featuresWithAvailableLethal());
    assert.equal(intent.type, "findLethal");
  });

  test("develops board before low-value pressure", () => {
    const intent = chooseBotTurnIntent(
      featuresWithPlayableBoardCardAndWeakPressure(),
    );
    assert.equal(intent.type, "developBoard");
  });
});
```

- [ ] **Step 2: Define intent type**

Add to `packages/match-server/src/bot-turn-intent.ts`:

```ts
export type BotTurnIntent =
  | { readonly type: "answerDecision" }
  | { readonly type: "surviveLethal" }
  | { readonly type: "findLethal" }
  | { readonly type: "removeThreat" }
  | { readonly type: "developBoard" }
  | { readonly type: "useProfitableEffect" }
  | { readonly type: "allocateDon" }
  | { readonly type: "attack" }
  | { readonly type: "endTurn" };
```

- [ ] **Step 3: Implement deterministic intent ordering**

Initial rules:

```ts
export const chooseBotTurnIntent = (features: BotFeatures): BotTurnIntent => {
  if (
    features.snapshot.players[features.botPlayerId]?.view.pendingDecision
      ?.playerId === features.botPlayerId
  ) {
    return { type: "answerDecision" };
  }
  if (features.combat.incomingBattleIsLethal) {
    return { type: "surviveLethal" };
  }
  if (features.combat.hasAvailableLethalLine) {
    return { type: "findLethal" };
  }
  if (features.combat.hasHighValueThreatAttack) {
    return { type: "removeThreat" };
  }
  if (features.actions.hasProfitableEffect) {
    return { type: "useProfitableEffect" };
  }
  if (features.actions.hasPlayableDevelopmentCard) {
    return { type: "developBoard" };
  }
  if (features.actions.hasUsefulDonAttachment) {
    return { type: "allocateDon" };
  }
  if (features.actions.hasAttack) {
    return { type: "attack" };
  }
  return { type: "endTurn" };
};
```

Add missing boolean facts to `BotFeatures` in Task 2 style before using them here.

- [ ] **Step 4: Feed intent into scoring**

Modify `scoreBotCandidate` to accept intent:

```ts
export const scoreBotCandidate = ({
  candidate,
  features,
  intent,
  profile,
}: BotScoreInput): ScoredBotCandidate => {
  let breakdown = emptyBreakdown();
  breakdown = applyIntentTerm({ candidate, features, intent, breakdown });
  return applyRemainingTerms({ candidate, features, profile, breakdown });
};
```

Intent terms should add strong but not absolute bonuses:

- `intent:find-lethal`: boosts lethal attacks and DON attachments that enable lethal.
- `intent:survive-lethal`: boosts counter/blocker responses.
- `intent:develop-board`: boosts playable board cards and penalizes weak DON pressure.
- `intent:end-turn`: boosts `endMainPhase`.

- [ ] **Step 5: Run tests**

Run:

```text
corepack pnpm exec vitest run packages/match-server/src/bot-turn-intent.test.ts packages/match-server/src/bot-score.test.ts packages/match-server/src/bot-strategy-priorities.test.ts packages/match-server/src/bot-combat-evaluation.test.ts packages/match-server/src/bot-decision-liveness.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
corepack pnpm exec eslint packages/match-server/src/bot-turn-intent.ts packages/match-server/src/bot-turn-intent.test.ts packages/match-server/src/bot-score.ts packages/match-server/src/bot-strategy.ts packages/match-server/src/bot-types.ts --max-warnings=0
```

- [ ] **Step 6: Review and commit Slice 4**

Reviewer questions:

- Does intent prevent locally attractive but turn-bad moves?
- Are pending decisions still handled before action scoring?
- Are intent reasons visible in scored output?

Commit:

```text
git add packages/match-server/src/bot-turn-intent.ts packages/match-server/src/bot-turn-intent.test.ts packages/match-server/src/bot-score.ts packages/match-server/src/bot-strategy.ts packages/match-server/src/bot-types.ts
git commit -m "feat: add bot turn intent planning"
```

## Task 5: Convert Red Shanks To Declarative Profile Data

**Files:**

- Create: `packages/match-server/src/bot-profile-types.ts`
- Modify: `packages/match-server/src/bot-red-shanks-profile.ts`
- Modify: `packages/match-server/src/bot-power-reduction-behavior.ts`
- Modify: `packages/match-server/src/bot-character-overflow.ts`
- Modify: `packages/match-server/src/bot-score.ts`
- Modify: `packages/match-server/src/bot-decision-responder.ts`
- Modify: `packages/match-server/src/bot-red-shanks-profile.test.ts`

- [ ] **Step 1: Write declarative profile tests**

Add tests to `packages/match-server/src/bot-red-shanks-profile.test.ts`:

```ts
test("Red Shanks cheat targets are data, not decision callback branches", () => {
  assert.deepEqual(
    redShanksProfileData.cheatTargets.map((target) => target.cardId),
    ["OP06-007", "OP09-004", "ST23-002", "OP12-008"],
  );
});

test("Red Shanks search priorities are data-driven", () => {
  assert.deepEqual(redShanksProfileData.searchPriorities["OP09-002"], [
    "OP16-012",
    "OP09-004",
    "OP06-007",
    "ST23-002",
    "OP12-008",
    "OP09-011",
    "OP09-020",
    "OP09-002",
    "OP09-009",
    "OP09-014",
    "OP16-018",
  ]);
});
```

- [ ] **Step 2: Define profile data types**

Create `packages/match-server/src/bot-profile-types.ts`:

```ts
export type BotCardRole =
  | "searcher"
  | "cheat-enabler"
  | "cheat-target"
  | "power-reduction"
  | "high-counter"
  | "preserve";

export interface BotDeckProfileData {
  readonly id: string;
  readonly cardRoles: Partial<Record<string, readonly BotCardRole[]>>;
  readonly searchPriorities: Partial<Record<string, readonly string[]>>;
  readonly preserveCards: readonly string[];
  readonly cheatTargets: readonly BotCheatTargetPolicy[];
  readonly effectPolicies: readonly BotEffectPolicy[];
}

export interface BotCheatTargetPolicy {
  readonly sourceCardId: string;
  readonly cardId: string;
  readonly baseScore: number;
  readonly bonusWhenOpponentHasRemovableCharacter?: number;
}

export interface BotEffectPolicy {
  readonly sourceCardId: string;
  readonly kind: "powerReduction";
  readonly amount: number;
  readonly target: "opponentCharacter" | "currentAttacker";
  readonly restsSource: boolean;
}
```

- [ ] **Step 3: Export Red Shanks data**

In `bot-red-shanks-profile.ts`, define:

```ts
export const redShanksProfileData: BotDeckProfileData = {
  id: "red-shanks",
  cardRoles: {
    "OP16-012": ["cheat-enabler", "preserve"],
    "OP06-007": ["cheat-target", "preserve"],
    "OP09-004": ["cheat-target", "preserve"],
    "ST23-002": ["cheat-target", "preserve"],
    "OP12-008": ["cheat-target", "preserve"],
    "OP09-002": ["searcher"],
    "OP09-020": ["searcher"],
    "PRB02-002": ["searcher"],
    "OP09-011": ["power-reduction"],
  },
  searchPriorities: {
    "OP09-002": [
      "OP16-012",
      "OP09-004",
      "OP06-007",
      "ST23-002",
      "OP12-008",
      "OP09-011",
      "OP09-020",
      "OP09-002",
      "OP09-009",
      "OP09-014",
      "OP16-018",
    ],
    "OP09-020": [
      "OP16-012",
      "OP09-004",
      "OP06-007",
      "ST23-002",
      "OP12-008",
      "OP09-011",
      "OP09-020",
      "OP09-002",
      "OP09-009",
      "OP09-014",
      "OP16-018",
    ],
    "PRB02-002": [
      "OP16-012",
      "OP09-004",
      "OP06-007",
      "ST23-002",
      "OP12-008",
      "OP09-011",
      "OP09-020",
      "OP09-002",
      "OP09-009",
      "OP09-014",
      "OP16-018",
    ],
  },
  preserveCards: ["OP16-012", "OP06-007", "OP09-004", "ST23-002", "OP12-008"],
  cheatTargets: [
    {
      sourceCardId: "OP16-012",
      cardId: "OP06-007",
      baseScore: 250,
      bonusWhenOpponentHasRemovableCharacter: 150,
    },
    { sourceCardId: "OP16-012", cardId: "OP09-004", baseScore: 350 },
    { sourceCardId: "OP16-012", cardId: "ST23-002", baseScore: 300 },
    { sourceCardId: "OP16-012", cardId: "OP12-008", baseScore: 100 },
  ],
  effectPolicies: [
    {
      sourceCardId: "OP09-011",
      kind: "powerReduction",
      amount: 2000,
      target: "opponentCharacter",
      restsSource: true,
    },
    {
      sourceCardId: "OP09-001",
      kind: "powerReduction",
      amount: 1000,
      target: "currentAttacker",
      restsSource: false,
    },
  ],
};
```

- [ ] **Step 4: Add generic data consumers**

Move branch behavior into generic helpers:

```ts
export const chooseSearchResultFromProfile = (
  context: BotDecisionContext,
  profile: BotDeckProfileData,
): BotDecisionChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  if (decision?.type !== "selectCards") {
    return undefined;
  }
  const sourceCardId = String(decision.source?.cardId);
  const priorities = profile.searchPriorities[sourceCardId];
  if (priorities === undefined) {
    return undefined;
  }
  const priorityScore = new Map(
    priorities.map((cardId, index) => [cardId, priorities.length - index]),
  );
  const chosen = decision.choices
    .filter((choice) => choice.selectable)
    .sort(
      (left, right) =>
        (priorityScore.get(String(right.card.cardId)) ?? 0) -
        (priorityScore.get(String(left.card.cardId)) ?? 0),
    )[0]?.card;
  return chosen === undefined
    ? undefined
    : {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "cards", cards: [chosen] },
      };
};
```

Use the same data-driven pattern for:

- cheat target selection;
- overflow preserve cards;
- power reduction target choice;
- profile score terms for searchers, cheat enabler, and power reduction.

- [ ] **Step 5: Keep compatibility export**

`redShanksBotProfile` should remain:

```ts
export const redShanksBotProfile =
  createBotBehaviorProfile(redShanksProfileData);
```

The adapter can still satisfy `BotBehaviorProfile` while the rest of the strategy migrates.

- [ ] **Step 6: Run tests**

Run:

```text
corepack pnpm exec vitest run packages/match-server/src/bot-red-shanks-profile.test.ts packages/match-server/src/bot-strategy-priorities.test.ts packages/match-server/src/bot-decision-liveness.test.ts packages/match-server/src/bot-score.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
corepack pnpm exec eslint packages/match-server/src/bot-profile-types.ts packages/match-server/src/bot-red-shanks-profile.ts packages/match-server/src/bot-power-reduction-behavior.ts packages/match-server/src/bot-character-overflow.ts packages/match-server/src/bot-score.ts packages/match-server/src/bot-decision-responder.ts packages/match-server/src/bot-red-shanks-profile.test.ts --max-warnings=0
```

- [ ] **Step 7: Review and commit Slice 5**

Reviewer questions:

- Is Red Shanks knowledge expressed as data?
- Can another deck profile be added without editing strategy?
- Did generic code avoid hard-coded Red Shanks card IDs?

Commit:

```text
git add packages/match-server/src/bot-profile-types.ts packages/match-server/src/bot-red-shanks-profile.ts packages/match-server/src/bot-power-reduction-behavior.ts packages/match-server/src/bot-character-overflow.ts packages/match-server/src/bot-score.ts packages/match-server/src/bot-decision-responder.ts packages/match-server/src/bot-red-shanks-profile.test.ts
git commit -m "refactor: make Red Shanks bot profile declarative"
```

## Task 6: Add Bot Behavior Probe

**Files:**

- Create: `packages/match-server/src/bot-probe.ts`
- Create: `packages/match-server/src/bot-probe.test.ts`
- Modify: `packages/match-server/package.json` if package scripts are local there
- Modify: root `package.json` only if this repo keeps match-server scripts at the root

- [ ] **Step 1: Write probe tests**

Create `packages/match-server/src/bot-probe.test.ts`:

```ts
describe("runBotProbe", () => {
  test("reports no stalls for baseline scenarios", () => {
    const report = runBotProbe(defaultBotProbeScenarios);
    assert.deepEqual(report.failures, []);
  });

  test("reports pending decision fallback usage", () => {
    const report = runBotProbe([probeScenarioWithQuantityDecision()]);
    assert.equal(report.scenarios[0]?.decisionReason?.kind, "fallback");
  });

  test("fails when a required choice is undefined", () => {
    const report = runBotProbe([probeScenarioWithNoLegalBotChoice()]);
    assert.equal(report.failures[0]?.kind, "stall");
  });
});
```

- [ ] **Step 2: Define stable report types**

Create `packages/match-server/src/bot-probe.ts`:

```ts
export interface BotProbeScenario {
  readonly id: string;
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
  readonly expectedChoiceRequired: boolean;
}

export interface BotProbeScenarioReport {
  readonly id: string;
  readonly choice: BotActionChoice | undefined;
  readonly intent?: BotTurnIntent | undefined;
  readonly score?: BotScoreBreakdown | undefined;
  readonly decisionReason?: BotDecisionReason | undefined;
  readonly turnLength: number;
}

export interface BotProbeFailure {
  readonly scenarioId: string;
  readonly kind: "stall" | "missing-decision-response";
  readonly message: string;
}

export interface BotProbeReport {
  readonly scenarios: readonly BotProbeScenarioReport[];
  readonly failures: readonly BotProbeFailure[];
}
```

- [ ] **Step 3: Add initial scenarios**

`defaultBotProbeScenarios` must include:

- empty board early turn;
- playable card vs low-value DON attach;
- lethal available;
- lethal defense;
- search decision;
- character overflow decision;
- optional cost decision;
- replacement decision;
- Red Shanks OP16 cheat line;
- power reduction target decision.

Each scenario must be built from explicit `DevMatchSnapshot` test helpers in the file. Do not call network, database, or hidden engine state.

- [ ] **Step 4: Implement probe runner**

Probe runner:

```ts
export const runBotProbe = (
  scenarios: readonly BotProbeScenario[] = defaultBotProbeScenarios,
): BotProbeReport => {
  const reports = scenarios.map(runOneProbeScenario);
  return {
    scenarios: reports,
    failures: reports.flatMap((report) => failureForScenario(report)),
  };
};
```

Failure rules:

- If `expectedChoiceRequired` is true and `choice` is undefined, report `stall`.
- If the snapshot has a bot-owned pending decision and the choice is not `respondToDecision` or a visible `respondToDecision` submit action, report `missing-decision-response`.
- If scenario report lacks both `intent` and `decisionReason`, report `stall` because it cannot be explained.

- [ ] **Step 5: Add script**

First inspect package scripts:

```text
corepack pnpm pkg get scripts
```

If scripts are rooted, add:

```json
"bot:probe": "tsx packages/match-server/src/bot-probe.ts"
```

If scripts are package-local, add the same script to `packages/match-server/package.json`.

- [ ] **Step 6: Run tests**

Run:

```text
corepack pnpm exec vitest run packages/match-server/src/bot-probe.test.ts packages/match-server/src/bot-decision-liveness.test.ts packages/match-server/src/bot-turn-intent.test.ts packages/match-server/src/bot-score.test.ts packages/match-server/src/bot-red-shanks-profile.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
corepack pnpm exec eslint packages/match-server/src/bot-probe.ts packages/match-server/src/bot-probe.test.ts --max-warnings=0
```

Then run the probe script:

```text
corepack pnpm run bot:probe
```

Expected:

- Probe exits code 0.
- Output includes one report per scenario.
- No failures are reported.

- [ ] **Step 7: Review and commit Slice 6**

Reviewer questions:

- Does the probe catch stalls and missing decision responses?
- Is output stable enough to compare between bot changes?
- Does the probe explain bad choices with intent or score reasons?

Commit:

```text
git add packages/match-server/src/bot-probe.ts packages/match-server/src/bot-probe.test.ts package.json packages/match-server/package.json
git commit -m "test: add bot behavior probe"
```

## Final Verification

After all slices:

```text
corepack pnpm exec vitest run packages/match-server/src/bot-decision-liveness.test.ts packages/match-server/src/bot-decision-responder.test.ts packages/match-server/src/bot-features.test.ts packages/match-server/src/bot-score.test.ts packages/match-server/src/bot-turn-intent.test.ts packages/match-server/src/bot-probe.test.ts packages/match-server/src/bot-player-decision-fallback.test.ts packages/match-server/src/bot-player.test.ts packages/match-server/src/bot-combat-evaluation.test.ts packages/match-server/src/bot-red-shanks-profile.test.ts packages/match-server/src/bot-strategy-priorities.test.ts
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
corepack pnpm run typecheck
corepack pnpm run test -- packages/match-server/src
corepack pnpm run bot:probe
```

Expected:

- Focused Vitest command passes.
- Match-server package typecheck passes.
- Repo typecheck passes.
- Match-server tests pass.
- Bot probe exits with no failures.

## Self-Review

Spec coverage:

- Decision liveness is covered by Task 0 and Task 1.
- Feature duplication is covered by Task 2.
- Explainable scoring is covered by Task 3.
- Turn sequencing is covered by Task 4.
- Red Shanks profile coupling is covered by Task 5.
- Regression/probe visibility is covered by Task 6.

Placeholder scan:

- The plan contains no placeholder markers or open-ended test instructions.
- Every slice names exact files and commands.
- Code snippets define the shapes needed by later tasks.

Type consistency:

- `BotDecisionReason` feeds the responder and probe.
- `BotFeatures` feeds candidates, score, and intent.
- `BotScoreBreakdown` feeds strategy tests and probe reports.
- `BotDeckProfileData` feeds Red Shanks data and generic profile consumers.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-23-ai-bot-overhaul.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, with checkpoints after each slice.

Recommended path: Subagent-Driven, because the slices touch independent modules and each slice needs a review against the invariants.
