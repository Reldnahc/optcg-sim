# AAA OPTCG Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-quality OPTCG bot that plays coherent turns, explains its choices, scales across decks through reusable game concepts, and can be regression-tested against real gameplay doctrine.

**Architecture:** Keep the existing `BotStrategy` legal-action boundary and bot lobby execution path, but replace the shallow "best immediate action" brain with an explainable planning system. The bot will use only engine-provided legal actions and player-visible state, build typed gameplay features, choose a strategic mode, evaluate short action sequences, and answer pending decisions through the same doctrine.

**Tech Stack:** TypeScript, Vitest, strict `packages/match-server` typecheck, existing `DevMatchSnapshot` and `DevVisibleAction` types, existing bot probe command `corepack pnpm bot:probe`, canonical repo verification commands in `package.json`.

---

## Strategic Source Material

Use these sources as doctrine inputs. Do not copy text into code. Use them to preserve the strategic model.

- Official rules: `https://en.onepiece-cardgame.com/pdf/rule_manual.pdf?20230623=`
- OnePiece.gg beginner strategy: `https://onepiece.gg/7-beginner-tips-to-improve-at-one-piece-tcg-quickly/`
- Dicebreaker rules overview, user-supplied: `https://www.dicebreaker.com/games/one-piece-card-game/how-to/how-to-play-one-piece-card-game`

The official rules define the legal levers. The guide defines practical priorities. If strategy advice conflicts with engine legality or official rules, engine legality and official rules win.

## Gameplay Doctrine That Must Not Drift

This section is part of the product spec. Every planner and score term should be traceable to one of these ideas.

### Resource Doctrine

- DON is both economy and combat pressure.
- The bot should usually plan its whole main phase before spending DON.
- The bot should avoid spending DON just because it can.
- The bot should reserve enough active DON for a planned play, event, or activated effect before allocating excess DON to attackers.
- The bot should value curve efficiency: spending 5 DON to play a meaningful 5-cost body is usually better than attaching 5 DON to a leader with no lethal or pressure plan.
- Unused active DON at end of turn is bad unless it represents a deliberate defensive or effect plan.
- Attached DON is temporary pressure. Played characters are persistent board investment.
- The bot should treat attached DON differently depending on whether it:
  - makes an attack live,
  - crosses a counter breakpoint,
  - creates lethal,
  - protects a future attacker,
  - or merely makes a number bigger without changing the opponent's required response.

### Combat Math Doctrine

- Attacker wins ties. A 5000 attack into a 5000 leader connects unless countered.
- The useful attack sizes are not linear. They are breakpoints against the target's current power and likely counter increments.
- Against a 5000 leader, common pressure bands are:
  - 5000: asks for 1000 counter or life.
  - 6000: asks for 2000 counter or two 1000 counters.
  - 7000: asks for 3000 counter, usually a real cost.
  - 9000: asks for 5000 counter, often a major defensive commitment.
- The bot should score attacks by required counter power/cards, not raw attack power alone.
- The bot should consider attack order:
  - When pressuring leader, lower-pressure attacks often come first to force inefficient counter decisions.
  - When pushing lethal, sequence attacks so the opponent must answer enough attacks with limited life and hand.
  - When removing board, attack high-value rested characters before spending all attackers on leader unless lethal is real.
- The bot should not make illegal low-power attacks. Existing candidate legality already filters this, and the planner must preserve that invariant.

### Life And Counter Doctrine

- Life is a resource, but zero life is dangerous.
- Early game, taking life can be correct because it increases hand size.
- The bot should not counter every leader hit just because it can.
- The bot should become more willing to counter as its life gets low.
- The bot should heavily prioritize countering or blocking attacks that are lethal.
- The bot should protect a valuable character when that character's future value exceeds the counter cost.
- The bot should avoid over-countering unless the excess counter is unavoidable and survival or high-value protection justifies it.
- The bot should prefer spending lower-opportunity-cost counters before discarding high-impact engine pieces.
- The bot should understand that 2000-counter cards are valuable defensive resources and should not casually play them as low-impact bodies.

### Board Versus Leader Doctrine

- Board control and leader pressure are both valid, but the correct mode changes.
- Default early and midgame mode:
  - develop board,
  - remove high-value rested threats,
  - avoid losing tempo,
  - preserve meaningful attackers.
- Pressure mode:
  - attack leader when opponent is low life,
  - when bot has multiple live attacks,
  - when opponent hand count is low,
  - or when the bot is behind and must race.
- Lethal mode:
  - calculate whether available attacks plus DON can beat opponent life, blockers, and estimated counter.
  - if yes, prioritize the lethal line over normal value.
- Stabilize mode:
  - remove threats, preserve life, and avoid giving opponent easy lethal.
- The bot should not tunnel on face damage while losing board unless lethal or race pressure is justified.

### Hidden Information Doctrine

- The bot must use only what the bot player is allowed to know.
- Opponent hidden hand contents are unknown unless visible in the player view because of reveal or public information.
- The bot can use opponent hand count, public trash, board, leader, life count, known revealed cards, and visible effects.
- The bot may use probabilistic assumptions like "unknown hand card averages 1000 to 2000 counter", but this must be explicit in scoring constants.
- The bot is allowed to know the opponent's registered decklist. This is intentional product behavior, not a hidden-state leak.
- Decklist knowledge may produce priors such as counter ratio, 2000-counter count, event count, blocker count, removal count, trigger density, average playable cost, and likely defensive event availability by active DON.
- Decklist knowledge must never reveal the current hidden hand, deck order, life contents, or exact future draws.
- Decklist priors must be adjusted by public information: cards in trash, field, life face-up, revealed cards, and known cards already played should reduce remaining deck estimates.
- Decision logs must not leak hidden information.

### Card Knowledge Doctrine

- The bot should be generic first.
- Card-specific exact IDs are allowed only in deck profile data or generated semantic tags, not in generic planners.
- Generic planners should reason about reusable card semantics:
  - playable body,
  - attacker,
  - blocker,
  - rush,
  - removal,
  - draw/search,
  - ramp,
  - power reduction,
  - counter value,
  - protection,
  - leader engine piece,
  - combo enabler,
  - combo payoff.
- Deck profiles may say "this deck values card X highly" or "this searcher prefers these targets."
- Deck profiles must not be required for liveness. A profile can make choices smarter, but the generic bot must always answer legal decisions.

### Product Quality Doctrine

- This is a first-class feature, not a quick heuristic patch.
- Every bot decision must be explainable.
- Every major doctrine claim must have at least one scenario test or probe.
- New bot behavior should fail tests when it regresses.
- The bot must never stall on a bot-owned pending decision.
- The bot must never invent game actions. It only submits engine-provided legal action indices or valid decision responses.
- Bot quality must be measurable through probes, scenario fixtures, and self-play metrics.

### Allowed Intelligence Doctrine

The bot may be slightly stronger than a human with imperfect memory by knowing the opponent's decklist and computing exact public-card-adjusted priors. This is acceptable because it creates better gameplay without crossing into current hidden-zone omniscience.

Allowed:

- registered opponent decklist,
- own decklist,
- card counts by ID,
- counter distribution in the opponent decklist,
- known remaining counter distribution after subtracting public cards,
- known remaining event/stage/character ratios,
- known remaining blocker/removal/search/rush role counts,
- probability estimates derived from hand count and remaining unknown cards.

Forbidden:

- current opponent hand identities unless publicly revealed,
- opponent deck order,
- face-down life identities unless revealed by rules,
- hidden trigger identities before the game reveals them,
- reading engine private state from outside the bot player's view.

Implementation rule: this intelligence must enter the bot as `BotOpponentDeckKnowledge` / `BotDeckPrior` data, not by giving the bot private game state.

## Current State Summary

Current useful pieces:

- `packages/match-server/src/bot-player.ts`
  - Public bot entry point. Keep this API stable.
- `packages/match-server/src/bot-strategy.ts`
  - Current orchestration. It chooses scored visible actions and handles pending decisions.
- `packages/match-server/src/bot-features.ts`
  - Current feature extraction for visible cards, DON attachment usefulness, lethal availability, hand counter power, and visible action facts.
- `packages/match-server/src/bot-score.ts`
  - Current action score breakdown.
- `packages/match-server/src/bot-combat-evaluation.ts`
  - Current tactical combat scoring and blocker/counter decisions.
- `packages/match-server/src/bot-default-profile.ts`
  - Generic fallback decision responses.
- `packages/match-server/src/bot-red-shanks-profile.ts`
  - Existing deck profile and card-specific policy overlay.
- `packages/match-server/src/bot-probe.ts`
  - Existing probe harness.

Current limitation:

- The bot mostly picks the best immediate legal action.
- It does not deeply plan a whole turn before spending resources.
- It does not have a durable, centralized board-state evaluator.
- It does not have enough scenario coverage for real gameplay doctrine.
- Its decision fallbacks are legal but often strategically naive.

## Target Architecture

Keep:

- `BotStrategy.chooseAction({ snapshot, botPlayerId })`
- legal action submission by action index
- pending decision response plumbing
- passive bot strategy
- current bot probe command
- existing Red Shanks profile as a first profile overlay

Add:

- bot doctrine document in code-adjacent tests and probe names
- opponent decklist prior model
- public-card-adjusted hidden hand/deck probability estimates
- expanded feature model
- central board-state evaluator
- strategic mode selector
- turn-level planner
- combat sequence planner
- defensive planner
- generic decision planner
- semantic card role model
- explainable reports
- quality probe suite

The bot call still returns one action. The planner chooses that one action by evaluating the turn or decision around it.

## File Map

### Public Boundaries To Preserve

- `packages/match-server/src/bot-player.ts`
  - Continue exporting `chooseBotAction`, `chooseBotActionReport`, `createBotStrategy`, `createPassiveBotStrategy`, and `defaultBotStrategy`.
- `packages/match-server/src/bot-types.ts`
  - Shared types. Extend carefully with exported planner/report types only when used by multiple modules.
- `packages/match-server/src/bot-strategy.ts`
  - Final responsibility: orchestrate pending decision planner, feature extraction, strategic mode, turn planner, and reporting.

### Existing Files To Modify

- `packages/match-server/src/bot-features.ts`
  - Expand visible feature extraction.
- `packages/match-server/src/bot-score.ts`
  - Convert into reusable score terms or keep as compatibility wrapper around new evaluator.
- `packages/match-server/src/bot-combat-evaluation.ts`
  - Move combat math toward reusable planner/evaluator helpers.
- `packages/match-server/src/bot-default-profile.ts`
  - Keep liveness fallbacks but stop treating fallback as strategy.
- `packages/match-server/src/bot-red-shanks-profile.ts`
  - Convert more card knowledge into declarative role/policy data.
- `packages/match-server/src/bot-profile-types.ts`
  - Expand semantic role and profile data types.
- `packages/match-server/src/bot-probe.ts`
  - Expand scenario list and report quality metrics.
- `packages/match-server/src/bot-*.test.ts`
  - Add scenario tests as each task lands.

### New Files

- `packages/match-server/src/bot-gameplay-doctrine.ts`
  - Named constants and documented score assumptions that map to this plan.
- `packages/match-server/src/bot-state-evaluator.ts`
  - Scores a visible board state and action result features.
- `packages/match-server/src/bot-strategic-mode.ts`
  - Chooses `survive`, `stabilize`, `develop`, `pressure`, `lethal`, or `cleanup`.
- `packages/match-server/src/bot-turn-planner.ts`
  - Produces ranked turn plans and first-action choice.
- `packages/match-server/src/bot-combat-planner.ts`
  - Plans attack target order and DON pressure lines.
- `packages/match-server/src/bot-defense-planner.ts`
  - Handles counter/blocker/event defense choices.
- `packages/match-server/src/bot-decision-planner.ts`
  - Handles generic non-combat decisions with scoring, then falls back safely.
- `packages/match-server/src/bot-card-semantics.ts`
  - Converts visible card data and profile data into reusable roles.
- `packages/match-server/src/bot-deck-knowledge.ts`
  - Builds legal bot priors from registered decklists and public card observations.
- `packages/match-server/src/bot-quality-scenarios.ts`
  - Scenario builders for doctrine probes.
- `packages/match-server/src/bot-quality-scenarios.test.ts`
  - Tests that doctrine scenarios pick the expected class of action.

## Core Types To Introduce

Add these to `packages/match-server/src/bot-types.ts` or the specific module listed by each task. Keep exported types minimal.

```ts
export type BotStrategicMode =
  | "survive"
  | "stabilize"
  | "develop"
  | "pressure"
  | "lethal"
  | "cleanup";

export interface BotScoreTerm {
  readonly key: string;
  readonly value: number;
  readonly reason: string;
}

export interface BotExplainableScore {
  readonly total: number;
  readonly terms: readonly BotScoreTerm[];
}

export interface BotPlanStep {
  readonly actionIndex: number;
  readonly actionType: string;
  readonly label: string;
  readonly score: BotExplainableScore;
}

export interface BotTurnPlan {
  readonly mode: BotStrategicMode;
  readonly steps: readonly BotPlanStep[];
  readonly score: BotExplainableScore;
  readonly summary: string;
}

export interface BotCounterPrior {
  readonly unknownCardCount: number;
  readonly totalCounterPower: number;
  readonly counter1000Count: number;
  readonly counter2000Count: number;
  readonly averageCounterPower: number;
}

export interface BotOpponentDeckKnowledge {
  readonly knownDecklistCardIds: readonly string[];
  readonly remainingUnknownCounterPrior: BotCounterPrior;
  readonly remainingEventCount: number;
  readonly remainingBlockerCount: number;
  readonly remainingRemovalCount: number;
}
```

Do not expose these to the client unless a separate UI/debug feature asks for them.

## Task 1: Lock Gameplay Doctrine Into Constants And Tests

**Files:**

- Create: `packages/match-server/src/bot-gameplay-doctrine.ts`
- Create: `packages/match-server/src/bot-gameplay-doctrine.test.ts`
- Modify: `packages/match-server/src/bot-features.ts`

- [ ] **Step 1: Add doctrine constants**

Create `packages/match-server/src/bot-gameplay-doctrine.ts`.

```ts
export const botDoctrine = {
  assumedUnknownCounterPowerPerCard: 2_000,
  leaderBasePower: 5_000,
  usefulLeaderAttackBands: [5_000, 6_000, 7_000, 9_000],
  lowLifeThreshold: 2,
  dangerLifeThreshold: 1,
  highValueCharacterFloor: 8_000,
  highCounterValue: 2_000,
} as const;

export const counterPowerRequiredToStopAttack = ({
  attackerPower,
  targetPower,
}: {
  readonly attackerPower: number;
  readonly targetPower: number;
}): number | undefined =>
  attackerPower < targetPower ? undefined : attackerPower - targetPower + 1_000;

export const estimatedCounterCardsRequiredToStopAttack = ({
  attackerPower,
  targetPower,
  assumedCounterPowerPerCard = botDoctrine.assumedUnknownCounterPowerPerCard,
}: {
  readonly attackerPower: number;
  readonly targetPower: number;
  readonly assumedCounterPowerPerCard?: number;
}): number | undefined => {
  const requiredPower = counterPowerRequiredToStopAttack({
    attackerPower,
    targetPower,
  });
  return requiredPower === undefined
    ? undefined
    : Math.ceil(requiredPower / assumedCounterPowerPerCard);
};
```

- [ ] **Step 2: Test combat math doctrine**

Create `packages/match-server/src/bot-gameplay-doctrine.test.ts`.

```ts
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  counterPowerRequiredToStopAttack,
  estimatedCounterCardsRequiredToStopAttack,
} from "./bot-gameplay-doctrine.js";

describe("bot gameplay doctrine", () => {
  test("attacker wins ties, so equal power requires counter", () => {
    assert.equal(
      counterPowerRequiredToStopAttack({
        attackerPower: 5_000,
        targetPower: 5_000,
      }),
      1_000,
    );
  });

  test("leader attack pressure is scored by counter cards required", () => {
    assert.equal(
      estimatedCounterCardsRequiredToStopAttack({
        attackerPower: 7_000,
        targetPower: 5_000,
      }),
      2,
    );
    assert.equal(
      estimatedCounterCardsRequiredToStopAttack({
        attackerPower: 9_000,
        targetPower: 5_000,
      }),
      3,
    );
  });

  test("below-target attacks are not live attacks", () => {
    assert.equal(
      counterPowerRequiredToStopAttack({
        attackerPower: 4_000,
        targetPower: 5_000,
      }),
      undefined,
    );
  });
});
```

- [ ] **Step 3: Replace duplicated combat constants**

In `packages/match-server/src/bot-features.ts`, replace local counter math:

```ts
const assumedCounterPowerPerHandCard = 2_000;

export const counterCardsToStopAttack = (
  attackerPower: number,
  targetPower: number,
): number | undefined =>
  attackerPower < targetPower
    ? undefined
    : Math.ceil(
        (attackerPower - targetPower + 1_000) / assumedCounterPowerPerHandCard,
      );

const counterPowerToStopAttack = (
  attackerPower: number,
  targetPower: number,
): number | undefined =>
  attackerPower < targetPower ? undefined : attackerPower - targetPower + 1_000;
```

with:

```ts
import {
  counterPowerRequiredToStopAttack,
  estimatedCounterCardsRequiredToStopAttack,
} from "./bot-gameplay-doctrine.js";

export const counterCardsToStopAttack = (
  attackerPower: number,
  targetPower: number,
): number | undefined =>
  estimatedCounterCardsRequiredToStopAttack({ attackerPower, targetPower });

const counterPowerToStopAttack = (
  attackerPower: number,
  targetPower: number,
): number | undefined =>
  counterPowerRequiredToStopAttack({ attackerPower, targetPower });
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-gameplay-doctrine.test.ts packages/match-server/src/bot-features.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/match-server/src/bot-gameplay-doctrine.ts packages/match-server/src/bot-gameplay-doctrine.test.ts packages/match-server/src/bot-features.ts
git commit -m "feat: codify bot gameplay doctrine"
```

## Task 2: Make Bot Reports Explain Complete Choices

**Files:**

- Modify: `packages/match-server/src/bot-types.ts`
- Modify: `packages/match-server/src/bot-score.ts`
- Modify: `packages/match-server/src/bot-strategy.ts`
- Modify: `packages/match-server/src/bot-probe.ts`
- Test: `packages/match-server/src/bot-probe.test.ts`

- [ ] **Step 1: Extend report types**

In `packages/match-server/src/bot-types.ts`, add:

```ts
export interface BotScoreTerm {
  readonly key: string;
  readonly value: number;
  readonly reason: string;
}

export interface BotExplainableScore {
  readonly total: number;
  readonly terms: readonly BotScoreTerm[];
}

export interface BotRejectedCandidate {
  readonly actionIndex: number;
  readonly actionType: string;
  readonly reason: string;
}
```

Keep `BotScoreBreakdown` during transition, but every new planner should produce `BotExplainableScore`.

- [ ] **Step 2: Add a compatibility converter**

In `packages/match-server/src/bot-score.ts`, add:

```ts
import type { BotExplainableScore } from "./bot-types.js";

export const botScoreBreakdownToExplainableScore = (
  breakdown: BotScoreBreakdown,
): BotExplainableScore => ({
  total: breakdown.total,
  terms: [
    { key: "profile", value: breakdown.profile, reason: "profile" },
    { key: "combat", value: breakdown.combat, reason: "combat" },
    { key: "resource", value: breakdown.resource, reason: "resource" },
    { key: "tempo", value: breakdown.tempo, reason: "tempo" },
    { key: "risk", value: breakdown.risk, reason: "risk" },
    { key: "fallback", value: breakdown.fallback, reason: "fallback" },
    { key: "intent", value: breakdown.intent, reason: "intent" },
  ].filter((term) => term.value !== 0),
});
```

- [ ] **Step 3: Expand `BotStrategyActionReport`**

In `packages/match-server/src/bot-strategy.ts`, change the report interface:

```ts
export interface BotStrategyActionReport {
  readonly choice: BotActionChoice;
  readonly score?: BotScoreBreakdown | undefined;
  readonly explainableScore?: BotExplainableScore | undefined;
  readonly intent?: BotTurnIntent | undefined;
  readonly decisionReason?: BotDecisionReason | undefined;
  readonly rejectedCandidates?: readonly BotRejectedCandidate[] | undefined;
}
```

When returning a scored choice, set `explainableScore` using the converter.

- [ ] **Step 4: Probe should expose score terms**

In `packages/match-server/src/bot-probe.ts`, extend `BotProbeScenarioReport`:

```ts
readonly explainableScore?: BotExplainableScore | undefined;
```

In `runOneProbeScenario`, copy `report?.explainableScore`.

- [ ] **Step 5: Test report explainability**

In `packages/match-server/src/bot-probe.test.ts`, add:

```ts
test("reports explainable score terms for visible action choices", () => {
  const report = runBotProbe(defaultBotProbeScenarios);
  const visibleActionReport = report.scenarios.find(
    (scenario) => scenario.choice?.type === "submitAction",
  );

  assert.notEqual(visibleActionReport, undefined);
  assert.ok((visibleActionReport?.explainableScore?.terms.length ?? 0) > 0);
});
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-probe.test.ts packages/match-server/src/bot-score.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/match-server/src/bot-types.ts packages/match-server/src/bot-score.ts packages/match-server/src/bot-strategy.ts packages/match-server/src/bot-probe.ts packages/match-server/src/bot-probe.test.ts
git commit -m "feat: explain bot choices in probe reports"
```

## Task 3: Expand Visible Gameplay Features

**Files:**

- Modify: `packages/match-server/src/bot-features.ts`
- Modify: `packages/match-server/src/bot-features.test.ts`

- [ ] **Step 1: Add richer feature interfaces**

In `packages/match-server/src/bot-features.ts`, extend `BotSelfFeatures`:

```ts
export interface BotSelfFeatures {
  readonly lifeCount: number;
  readonly handCounterPower: number;
  readonly handCount: number;
  readonly donOnField: number;
  readonly activeDonCount: number;
  readonly characterCount: number;
  readonly attackerCount: number;
  readonly blockerCount: number;
}
```

Extend `BotOpponentFeatures`:

```ts
export interface BotOpponentFeatures {
  readonly lifeCount: number;
  readonly handCount: number;
  readonly characterCount: number;
  readonly blockerCount: number;
  readonly restedCharacterCount: number;
  readonly highestCharacterValue: number;
}
```

- [ ] **Step 2: Implement feature helpers**

Add helpers:

```ts
const isActiveDon = (card: BotVisibleCard): boolean =>
  card.zone.zone === "costArea" && card.rested !== true;

const hasKeyword = (card: BotVisibleCard, keyword: string): boolean =>
  card.keywords?.includes(keyword) === true;

const canCurrentlyAttack = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  instanceId: InstanceId,
): boolean =>
  (snapshot.players[botPlayerId]?.actions ?? []).some(
    (action) =>
      action.type === "declareAttack" &&
      action.attack?.attackerInstanceId === instanceId,
  );
```

If `PublicCardView` does not expose `rested`, inspect the actual type and use the field currently used by the client to show active/rested state. Do not add `any`. If no field exists, omit rested-specific features in this task and add a test proving the feature is unavailable rather than guessed.

- [ ] **Step 3: Populate self features**

In `buildBotFeatures`, compute:

```ts
const selfView = view?.self;
const selfCharacters = selfView?.characters ?? [];
const selfCostArea = selfView?.costArea ?? [];
```

Then populate:

```ts
self: {
  lifeCount: selfView?.life.count ?? 0,
  handCounterPower: selfHandCounterPower(snapshot, botPlayerId),
  handCount: selfView?.hand.length ?? 0,
  donOnField: botDonOnField(snapshot, botPlayerId),
  activeDonCount: selfCostArea.filter(isActiveDon).length,
  characterCount: selfCharacters.length,
  attackerCount: [selfView?.leader, ...selfCharacters].filter(
    (card): card is BotVisibleCard =>
      card !== undefined &&
      canCurrentlyAttack(snapshot, botPlayerId, card.instanceId),
  ).length,
  blockerCount: selfCharacters.filter((card) => hasKeyword(card, "blocker"))
    .length,
}
```

- [ ] **Step 4: Populate opponent features**

Compute:

```ts
const opponentView = view?.opponent;
const opponentCharacters = opponentView?.characters ?? [];
```

Then populate:

```ts
opponent: {
  lifeCount: opponentView?.life.count ?? 0,
  handCount: opponentView?.hand?.length ?? opponentView?.handCount ?? 0,
  characterCount: opponentCharacters.length,
  blockerCount: opponentCharacters.filter((card) => hasKeyword(card, "blocker"))
    .length,
  restedCharacterCount: opponentCharacters.filter(
    (card) => card.rested === true,
  ).length,
  highestCharacterValue: Math.max(
    0,
    ...opponentCharacters.map((card) =>
      visibleCardValue(card, { includeCounter: true }),
    ),
  ),
}
```

- [ ] **Step 5: Test feature extraction**

In `packages/match-server/src/bot-features.test.ts`, add:

```ts
test("extracts resource, attacker, and blocker features", () => {
  const snapshot = snapshotWithActions([
    {
      index: 0,
      type: "declareAttack",
      label: "Attack leader",
      attack: {
        attackerInstanceId: "bot-leader" as InstanceId,
        targetInstanceId: "opponent-leader" as InstanceId,
      },
    },
  ]);

  const features = buildBotFeatures(snapshot, botPlayerId);

  assert.equal(features.self.handCount, 0);
  assert.equal(features.self.attackerCount, 1);
  assert.equal(features.opponent.lifeCount, 5);
});
```

Adjust fixture setup to include blocker/rested fields if existing helpers support them.

- [ ] **Step 6: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-features.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/match-server/src/bot-features.ts packages/match-server/src/bot-features.test.ts
git commit -m "feat: expand bot visible gameplay features"
```

## Task 4: Add Strategic Mode Selection

**Files:**

- Create: `packages/match-server/src/bot-strategic-mode.ts`
- Create: `packages/match-server/src/bot-strategic-mode.test.ts`
- Modify: `packages/match-server/src/bot-types.ts`

- [ ] **Step 1: Add mode type**

In `packages/match-server/src/bot-types.ts`, add:

```ts
export type BotStrategicMode =
  | "survive"
  | "stabilize"
  | "develop"
  | "pressure"
  | "lethal"
  | "cleanup";
```

- [ ] **Step 2: Implement mode selector**

Create `packages/match-server/src/bot-strategic-mode.ts`.

```ts
import { botDoctrine } from "./bot-gameplay-doctrine.js";
import type { BotFeatures } from "./bot-features.js";
import type { BotStrategicMode } from "./bot-types.js";

export interface BotStrategicModeReport {
  readonly mode: BotStrategicMode;
  readonly reasons: readonly string[];
}

export const chooseBotStrategicMode = (
  features: BotFeatures,
): BotStrategicModeReport => {
  if (features.combat.incomingBattleIsLethal) {
    return { mode: "survive", reasons: ["incoming lethal attack"] };
  }
  if (features.combat.hasAvailableLethalLine) {
    return { mode: "lethal", reasons: ["available lethal line"] };
  }
  if (
    features.self.lifeCount <= botDoctrine.dangerLifeThreshold &&
    features.opponent.characterCount > 0
  ) {
    return { mode: "stabilize", reasons: ["low life under board pressure"] };
  }
  if (
    features.opponent.lifeCount <= botDoctrine.lowLifeThreshold ||
    features.opponent.handCount <= 2
  ) {
    return { mode: "pressure", reasons: ["opponent low life or low hand"] };
  }
  if (
    features.opponent.highestCharacterValue >=
    botDoctrine.highValueCharacterFloor
  ) {
    return { mode: "stabilize", reasons: ["opponent high-value character"] };
  }
  if (
    features.actions.hasPlayableDevelopmentCard ||
    features.self.characterCount < 3
  ) {
    return { mode: "develop", reasons: ["need persistent board"] };
  }
  return { mode: "cleanup", reasons: ["no urgent pressure or development"] };
};
```

- [ ] **Step 3: Test mode selection**

Create `packages/match-server/src/bot-strategic-mode.test.ts`.

```ts
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { BotFeatures } from "./bot-features.js";
import { chooseBotStrategicMode } from "./bot-strategic-mode.js";

const features = (overrides: Partial<BotFeatures>): BotFeatures =>
  ({
    snapshot: {},
    botPlayerId: "p2",
    self: {
      lifeCount: 5,
      handCounterPower: 0,
      handCount: 5,
      donOnField: 0,
      activeDonCount: 0,
      characterCount: 0,
      attackerCount: 1,
      blockerCount: 0,
    },
    opponent: {
      lifeCount: 5,
      handCount: 5,
      characterCount: 0,
      blockerCount: 0,
      restedCharacterCount: 0,
      highestCharacterValue: 0,
    },
    cards: { visibleCards: [], byInstanceId: new Map() },
    actions: {
      byIndex: new Map(),
      hasProfitableEffect: false,
      hasPlayableDevelopmentCard: false,
      hasUsefulDonAttachment: false,
      hasAttack: false,
    },
    combat: {
      leaderAttackPressure: [],
      incomingBattleIsLethal: false,
      hasAvailableLethalLine: false,
      hasHighValueThreatAttack: false,
    },
    ...overrides,
  }) as BotFeatures;

describe("chooseBotStrategicMode", () => {
  test("survive beats every normal turn concern", () => {
    assert.equal(
      chooseBotStrategicMode(
        features({
          combat: {
            leaderAttackPressure: [],
            incomingBattleIsLethal: true,
            hasAvailableLethalLine: true,
            hasHighValueThreatAttack: true,
          },
        }),
      ).mode,
      "survive",
    );
  });

  test("available lethal becomes lethal mode", () => {
    assert.equal(
      chooseBotStrategicMode(
        features({
          combat: {
            leaderAttackPressure: [],
            incomingBattleIsLethal: false,
            hasAvailableLethalLine: true,
            hasHighValueThreatAttack: false,
          },
        }),
      ).mode,
      "lethal",
    );
  });

  test("low opponent life becomes pressure mode", () => {
    assert.equal(
      chooseBotStrategicMode(
        features({
          opponent: {
            lifeCount: 1,
            handCount: 5,
            characterCount: 0,
            blockerCount: 0,
            restedCharacterCount: 0,
            highestCharacterValue: 0,
          },
        }),
      ).mode,
      "pressure",
    );
  });
});
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-strategic-mode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/match-server/src/bot-types.ts packages/match-server/src/bot-strategic-mode.ts packages/match-server/src/bot-strategic-mode.test.ts
git commit -m "feat: classify bot strategic mode"
```

## Task 5: Add Central Board-State Evaluator

**Files:**

- Create: `packages/match-server/src/bot-state-evaluator.ts`
- Create: `packages/match-server/src/bot-state-evaluator.test.ts`

- [ ] **Step 1: Implement score builder**

Create `packages/match-server/src/bot-state-evaluator.ts`.

```ts
import type { BotFeatures } from "./bot-features.js";
import type {
  BotExplainableScore,
  BotScoreTerm,
  BotStrategicMode,
} from "./bot-types.js";

const score = (terms: readonly BotScoreTerm[]): BotExplainableScore => ({
  total: terms.reduce((total, term) => total + term.value, 0),
  terms: terms.filter((term) => term.value !== 0),
});

const term = (
  key: string,
  value: number,
  reason: string,
): BotScoreTerm => ({ key, value, reason });

export const evaluateVisibleBoardState = ({
  features,
  mode,
}: {
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
}): BotExplainableScore => {
  const lifeDelta = features.self.lifeCount - features.opponent.lifeCount;
  const boardDelta =
    features.self.characterCount - features.opponent.characterCount;
  const handDelta = features.self.handCount - features.opponent.handCount;
  const defenseRisk =
    features.self.lifeCount <= 1 ? -300 : features.self.lifeCount === 2 ? -120 : 0;
  const modePressure =
    mode === "pressure" || mode === "lethal"
      ? (5 - features.opponent.lifeCount) * 45
      : 0;
  const modeStability =
    mode === "stabilize" || mode === "survive"
      ? features.self.blockerCount * 80 - features.opponent.characterCount * 35
      : 0;

  return score([
    term("life", lifeDelta * 35, "life differential"),
    term("board", boardDelta * 90, "character board differential"),
    term("hand", handDelta * 20, "visible hand count differential"),
    term("defense-risk", defenseRisk, "low life risk"),
    term("pressure", modePressure, "pressure mode rewards opponent life loss"),
    term("stability", modeStability, "stabilize mode values defense"),
  ]);
};
```

- [ ] **Step 2: Test evaluator direction**

Create `packages/match-server/src/bot-state-evaluator.test.ts`.

```ts
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { BotFeatures } from "./bot-features.js";
import { evaluateVisibleBoardState } from "./bot-state-evaluator.js";

const base = (partial: Partial<BotFeatures>): BotFeatures =>
  ({
    self: {
      lifeCount: 3,
      handCounterPower: 0,
      handCount: 5,
      donOnField: 0,
      activeDonCount: 0,
      characterCount: 2,
      attackerCount: 1,
      blockerCount: 0,
    },
    opponent: {
      lifeCount: 3,
      handCount: 5,
      characterCount: 2,
      blockerCount: 0,
      restedCharacterCount: 0,
      highestCharacterValue: 0,
    },
    ...partial,
  }) as BotFeatures;

describe("evaluateVisibleBoardState", () => {
  test("more own board is better", () => {
    const even = evaluateVisibleBoardState({
      features: base({}),
      mode: "develop",
    });
    const ahead = evaluateVisibleBoardState({
      features: base({
        self: {
          lifeCount: 3,
          handCounterPower: 0,
          handCount: 5,
          donOnField: 0,
          activeDonCount: 0,
          characterCount: 4,
          attackerCount: 2,
          blockerCount: 0,
        },
      }),
      mode: "develop",
    });

    assert.ok(ahead.total > even.total);
  });

  test("low life is penalized", () => {
    const safe = evaluateVisibleBoardState({
      features: base({}),
      mode: "stabilize",
    });
    const danger = evaluateVisibleBoardState({
      features: base({
        self: {
          lifeCount: 1,
          handCounterPower: 0,
          handCount: 5,
          donOnField: 0,
          activeDonCount: 0,
          characterCount: 2,
          attackerCount: 1,
          blockerCount: 0,
        },
      }),
      mode: "stabilize",
    });

    assert.ok(danger.total < safe.total);
  });
});
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-state-evaluator.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/match-server/src/bot-state-evaluator.ts packages/match-server/src/bot-state-evaluator.test.ts
git commit -m "feat: evaluate bot board state"
```

## Task 6: Build Combat Planner

**Files:**

- Create: `packages/match-server/src/bot-combat-planner.ts`
- Create: `packages/match-server/src/bot-combat-planner.test.ts`
- Modify: `packages/match-server/src/bot-strategy.ts`

- [ ] **Step 1: Define combat plan result**

Create `packages/match-server/src/bot-combat-planner.ts`.

```ts
import type { DevVisibleAction } from "./dev-snapshot-types.js";
import {
  cardPower,
  counterCardsToStopAttack,
  findVisibleCard,
  visibleCardValue,
  type BotFeatures,
} from "./bot-features.js";
import type {
  BotExplainableScore,
  BotScoreTerm,
  BotStrategicMode,
} from "./bot-types.js";

export interface BotCombatPlanChoice {
  readonly action: DevVisibleAction;
  readonly score: BotExplainableScore;
}

const score = (terms: readonly BotScoreTerm[]): BotExplainableScore => ({
  total: terms.reduce((total, term) => total + term.value, 0),
  terms: terms.filter((term) => term.value !== 0),
});

const term = (
  key: string,
  value: number,
  reason: string,
): BotScoreTerm => ({ key, value, reason });
```

- [ ] **Step 2: Score attack actions by mode**

Add:

```ts
const attackTargetScore = ({
  action,
  features,
  mode,
}: {
  readonly action: DevVisibleAction;
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
}): BotExplainableScore | undefined => {
  if (action.type !== "declareAttack" || action.attack === undefined) {
    return undefined;
  }
  const attacker = findVisibleCard(
    features.snapshot,
    features.botPlayerId,
    action.attack.attackerInstanceId,
  );
  const target = findVisibleCard(
    features.snapshot,
    features.botPlayerId,
    action.attack.targetInstanceId,
  );
  const attackerPower = cardPower(attacker);
  const targetPower = cardPower(target);
  if (attackerPower === undefined || targetPower === undefined) {
    return undefined;
  }
  const cardsToStop = counterCardsToStopAttack(attackerPower, targetPower);
  if (cardsToStop === undefined) {
    return undefined;
  }
  const opponent = features.snapshot.players[features.botPlayerId]?.view.opponent;
  const attacksLeader =
    opponent?.leader.instanceId === action.attack.targetInstanceId;
  const attacksCharacter =
    opponent?.characters.some(
      (card) => card.instanceId === action.attack?.targetInstanceId,
    ) === true;
  const targetValue = visibleCardValue(target, { includeCounter: true });
  const pressureMultiplier =
    mode === "lethal" ? 120 : mode === "pressure" ? 75 : 35;
  const boardMultiplier =
    mode === "stabilize" || mode === "develop" ? 70 : 35;

  return score([
    term(
      "leader-pressure",
      attacksLeader ? cardsToStop * pressureMultiplier : 0,
      "attack leader by required counter cards",
    ),
    term(
      "board-removal",
      attacksCharacter ? Math.min(260, targetValue / 45) * boardMultiplier / 70 : 0,
      "attack valuable rested character",
    ),
    term(
      "lethal",
      mode === "lethal" && attacksLeader ? 500 : 0,
      "lethal mode prioritizes leader attacks",
    ),
  ]);
};

export const chooseCombatPlanAction = ({
  actions,
  features,
  mode,
}: {
  readonly actions: readonly DevVisibleAction[];
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
}): BotCombatPlanChoice | undefined =>
  actions
    .flatMap((action) => {
      const actionScore = attackTargetScore({ action, features, mode });
      return actionScore === undefined
        ? []
        : [{ action, score: actionScore }];
    })
    .sort((left, right) => right.score.total - left.score.total)[0];
```

- [ ] **Step 3: Add scenario tests**

Create `packages/match-server/src/bot-combat-planner.test.ts`.

```ts
import { strict as assert } from "node:assert";
import type { InstanceId } from "@optcg/types";
import { describe, test } from "vitest";

import { chooseCombatPlanAction } from "./bot-combat-planner.js";
import type { BotFeatures } from "./bot-features.js";
import type { DevVisibleAction } from "./dev-snapshot-types.js";

describe("chooseCombatPlanAction", () => {
  test("pressure mode prefers leader pressure over low-value character attack", () => {
    const actions: readonly DevVisibleAction[] = [
      {
        index: 0,
        type: "declareAttack",
        label: "Attack character",
        attack: {
          attackerInstanceId: "bot-leader" as InstanceId,
          targetInstanceId: "small-character" as InstanceId,
        },
      },
      {
        index: 1,
        type: "declareAttack",
        label: "Attack leader",
        attack: {
          attackerInstanceId: "bot-leader" as InstanceId,
          targetInstanceId: "opponent-leader" as InstanceId,
        },
      },
    ];
    const features = combatFixture(actions);

    const choice = chooseCombatPlanAction({
      actions,
      features,
      mode: "pressure",
    });

    assert.equal(choice?.action.index, 1);
  });

  test("stabilize mode prefers removing high-value character", () => {
    const actions: readonly DevVisibleAction[] = [
      {
        index: 0,
        type: "declareAttack",
        label: "Attack character",
        attack: {
          attackerInstanceId: "bot-leader" as InstanceId,
          targetInstanceId: "big-character" as InstanceId,
        },
      },
      {
        index: 1,
        type: "declareAttack",
        label: "Attack leader",
        attack: {
          attackerInstanceId: "bot-leader" as InstanceId,
          targetInstanceId: "opponent-leader" as InstanceId,
        },
      },
    ];
    const features = combatFixture(actions);

    const choice = chooseCombatPlanAction({
      actions,
      features,
      mode: "stabilize",
    });

    assert.equal(choice?.action.index, 0);
  });
});
```

Implement `combatFixture` in the test using the existing fixture style from `bot-features.test.ts` or `bot-probe.ts`. It must include a visible bot leader, opponent leader, one small character, and one big character with current powers.

- [ ] **Step 4: Integrate as a preference layer**

In `packages/match-server/src/bot-strategy.ts`, after building `features` and mode report, call `chooseCombatPlanAction` before generic `chooseBestScoredCandidate` only when:

- there is no bot-owned pending decision,
- mode is `"pressure"`, `"lethal"`, `"stabilize"`, or `"develop"`,
- the combat planner returns a positive score.

Return the combat action with `explainableScore`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-combat-planner.test.ts packages/match-server/src/bot-strategy-priorities.test.ts packages/match-server/src/bot-probe.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/match-server/src/bot-combat-planner.ts packages/match-server/src/bot-combat-planner.test.ts packages/match-server/src/bot-strategy.ts
git commit -m "feat: plan bot combat choices by strategic mode"
```

## Task 7: Build Defensive Planner For Counters And Blockers

**Files:**

- Create: `packages/match-server/src/bot-defense-planner.ts`
- Create: `packages/match-server/src/bot-defense-planner.test.ts`
- Modify: `packages/match-server/src/bot-combat-evaluation.ts`
- Modify: `packages/match-server/src/bot-default-profile.ts`

- [ ] **Step 1: Implement defense planner**

Create `packages/match-server/src/bot-defense-planner.ts`.

```ts
import type { CardRef } from "@optcg/types";

import {
  cardPower,
  findVisibleCard,
  visibleCardValue,
  type BotFeatures,
} from "./bot-features.js";
import { counterPowerRequiredToStopAttack } from "./bot-gameplay-doctrine.js";
import type { BotDecisionContext } from "./bot-types.js";

export interface BotDefenseChoice {
  readonly cards: readonly CardRef[];
  readonly reason: string;
}

const battlePowers = ({
  snapshot,
  botPlayerId,
}: BotDecisionContext): { readonly attackerPower: number; readonly targetPower: number } | undefined => {
  const battle = snapshot.players[botPlayerId]?.view.battle;
  if (battle === undefined) {
    return undefined;
  }
  const attackerPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, battle.attacker.instanceId),
  );
  const targetPower = cardPower(
    findVisibleCard(snapshot, botPlayerId, battle.currentTarget.instanceId),
  );
  return attackerPower === undefined || targetPower === undefined
    ? undefined
    : { attackerPower, targetPower };
};

const isLeaderTarget = ({ snapshot, botPlayerId }: BotDecisionContext): boolean => {
  const view = snapshot.players[botPlayerId]?.view;
  return (
    view?.battle?.currentTarget.instanceId !== undefined &&
    view.battle.currentTarget.instanceId === view.self.leader.instanceId
  );
};

const isLethal = (context: BotDecisionContext): boolean => {
  const view = context.snapshot.players[context.botPlayerId]?.view;
  const battle = view?.battle;
  const powers = battlePowers(context);
  if (view === undefined || battle === undefined || powers === undefined) {
    return false;
  }
  return (
    isLeaderTarget(context) &&
    powers.attackerPower >= powers.targetPower &&
    battle.damageCount > view.self.life.count
  );
};

export const chooseCounterCardsForDefense = ({
  context,
  features,
}: {
  readonly context: BotDecisionContext;
  readonly features: BotFeatures;
}): BotDefenseChoice | undefined => {
  const decision =
    context.snapshot.players[context.botPlayerId]?.view.pendingDecision;
  if (
    decision?.type !== "selectCards" ||
    decision.playerId !== context.botPlayerId
  ) {
    return undefined;
  }
  const powers = battlePowers(context);
  if (powers === undefined) {
    return undefined;
  }
  const required = counterPowerRequiredToStopAttack(powers);
  if (required === undefined) {
    return { cards: [], reason: "attack is not live" };
  }
  const shouldDefend =
    isLethal(context) ||
    features.self.lifeCount <= 1 ||
    (!isLeaderTarget(context) &&
      visibleCardValue(
        findVisibleCard(
          context.snapshot,
          context.botPlayerId,
          context.snapshot.players[context.botPlayerId]?.view.battle
            ?.currentTarget.instanceId,
        ),
        { includeCounter: true },
      ) >= 8_000);
  if (!shouldDefend) {
    return { cards: [], reason: "life or target can be spent" };
  }
  const sorted = decision.choices
    .filter((choice) => choice.selectable)
    .map((choice) => ({
      card: choice.card,
      counter:
        findVisibleCard(context.snapshot, context.botPlayerId, choice.card.instanceId)
          ?.printedCounter ?? 0,
    }))
    .filter((choice) => choice.counter > 0)
    .sort((left, right) => left.counter - right.counter);

  const chosen: CardRef[] = [];
  let total = 0;
  for (const choice of sorted) {
    if (total >= required) {
      break;
    }
    chosen.push(choice.card);
    total += choice.counter;
  }
  return total >= required
    ? { cards: chosen, reason: "defense reaches required counter" }
    : undefined;
};
```

- [ ] **Step 2: Wire planner into fallback decision**

In `packages/match-server/src/bot-default-profile.ts`, before generic `selectCards` fallback, build features and call `chooseCounterCardsForDefense` for battle counter decisions.

```ts
const defenseChoice = chooseCounterCardsForDefense({
  context: { snapshot, botPlayerId },
  features: buildBotFeatures(snapshot, botPlayerId),
});
if (defenseChoice !== undefined) {
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: defenseChoice.cards },
  };
}
```

- [ ] **Step 3: Test lethal defense**

Create `packages/match-server/src/bot-defense-planner.test.ts` with fixtures copied from `bot-combat-evaluation.test.ts`.

Required tests:

```ts
test("uses enough counter to stop lethal leader attack", () => {
  const choice = chooseCounterCardsForDefense({
    context: lethalCounterContext(),
    features: buildBotFeatures(lethalCounterContext().snapshot, botPlayerId),
  });

  assert.deepEqual(
    choice?.cards.map((card) => String(card.instanceId)),
    ["counter-1000", "counter-2000"],
  );
});

test("takes non-lethal early leader hit instead of spending counter", () => {
  const context = nonLethalEarlyLeaderAttackContext();
  const choice = chooseCounterCardsForDefense({
    context,
    features: buildBotFeatures(context.snapshot, botPlayerId),
  });

  assert.deepEqual(choice?.cards, []);
});
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-defense-planner.test.ts packages/match-server/src/bot-default-profile.test.ts packages/match-server/src/bot-combat-evaluation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/match-server/src/bot-defense-planner.ts packages/match-server/src/bot-defense-planner.test.ts packages/match-server/src/bot-default-profile.ts packages/match-server/src/bot-combat-evaluation.ts
git commit -m "feat: plan bot defensive counter decisions"
```

## Task 8: Build Turn Planner For DON And Development

**Files:**

- Create: `packages/match-server/src/bot-turn-planner.ts`
- Create: `packages/match-server/src/bot-turn-planner.test.ts`
- Modify: `packages/match-server/src/bot-strategy.ts`

- [ ] **Step 1: Implement first-pass turn planner**

Create `packages/match-server/src/bot-turn-planner.ts`.

```ts
import type { DevVisibleAction } from "./dev-snapshot-types.js";
import { chooseCombatPlanAction } from "./bot-combat-planner.js";
import type { BotFeatures } from "./bot-features.js";
import type {
  BotExplainableScore,
  BotScoreTerm,
  BotStrategicMode,
  BotTurnPlan,
} from "./bot-types.js";

const score = (terms: readonly BotScoreTerm[]): BotExplainableScore => ({
  total: terms.reduce((total, term) => total + term.value, 0),
  terms: terms.filter((term) => term.value !== 0),
});

const term = (
  key: string,
  value: number,
  reason: string,
): BotScoreTerm => ({ key, value, reason });

const playableDevelopmentScore = (
  action: DevVisibleAction,
  mode: BotStrategicMode,
): BotExplainableScore | undefined => {
  if (action.type !== "playCard") {
    return undefined;
  }
  return score([
    term("development", mode === "develop" ? 260 : 140, "persistent board"),
    term("tempo", 80, "spend DON on board"),
  ]);
};

const effectScore = (action: DevVisibleAction): BotExplainableScore | undefined =>
  action.type === "activateEffect"
    ? score([term("effect", 180, "use available effect")])
    : undefined;

export const chooseTurnPlan = ({
  actions,
  features,
  mode,
}: {
  readonly actions: readonly DevVisibleAction[];
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
}): BotTurnPlan | undefined => {
  const combat = chooseCombatPlanAction({ actions, features, mode });
  const candidates = [
    ...actions.flatMap((action) => {
      const actionScore =
        effectScore(action) ?? playableDevelopmentScore(action, mode);
      return actionScore === undefined
        ? []
        : [{ action, score: actionScore }];
    }),
    ...(combat === undefined ? [] : [combat]),
  ].sort((left, right) => right.score.total - left.score.total);
  const best = candidates[0];
  if (best === undefined) {
    return undefined;
  }
  return {
    mode,
    steps: [
      {
        actionIndex: best.action.index,
        actionType: best.action.type,
        label: best.action.label,
        score: best.score,
      },
    ],
    score: best.score,
    summary: `${mode}: ${best.action.type}`,
  };
};
```

This first pass is intentionally shallow but establishes the `BotTurnPlan` interface. Later tasks deepen it into multi-action sequence planning.

- [ ] **Step 2: Add `BotTurnPlan` type**

In `packages/match-server/src/bot-types.ts`, add:

```ts
export interface BotPlanStep {
  readonly actionIndex: number;
  readonly actionType: string;
  readonly label: string;
  readonly score: BotExplainableScore;
}

export interface BotTurnPlan {
  readonly mode: BotStrategicMode;
  readonly steps: readonly BotPlanStep[];
  readonly score: BotExplainableScore;
  readonly summary: string;
}
```

- [ ] **Step 3: Test develop before low-value DON**

Create `packages/match-server/src/bot-turn-planner.test.ts`.

Required tests:

```ts
test("develop mode chooses playable body over low-value DON attachment", () => {
  const actions = [
    playCardAction(0, "body-in-hand"),
    attachDonAction(1, "don-1", "bot-leader"),
  ];
  const plan = chooseTurnPlan({
    actions,
    features: featuresForActions(actions),
    mode: "develop",
  });

  assert.equal(plan?.steps[0]?.actionIndex, 0);
});

test("pressure mode can choose combat over development", () => {
  const actions = [
    playCardAction(0, "body-in-hand"),
    leaderAttackAction(1),
  ];
  const plan = chooseTurnPlan({
    actions,
    features: pressureFeaturesForActions(actions),
    mode: "pressure",
  });

  assert.equal(plan?.steps[0]?.actionIndex, 1);
});
```

Use local fixture helpers in the test file. Do not import test helpers from production files.

- [ ] **Step 4: Integrate into strategy**

In `packages/match-server/src/bot-strategy.ts`, after decision handling and before legacy `chooseBestScoredCandidate`, call:

```ts
const modeReport = chooseBotStrategicMode(features);
const turnPlan = chooseTurnPlan({
  actions,
  features,
  mode: modeReport.mode,
});
if (turnPlan !== undefined) {
  return {
    choice: {
      type: "submitAction",
      actionIndex: turnPlan.steps[0].actionIndex,
    },
    explainableScore: turnPlan.score,
    intent,
  };
}
```

Keep legacy scoring fallback underneath until the new planner covers every normal action shape.

- [ ] **Step 5: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-turn-planner.test.ts packages/match-server/src/bot-strategy-priorities.test.ts packages/match-server/src/bot-probe.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/match-server/src/bot-turn-planner.ts packages/match-server/src/bot-turn-planner.test.ts packages/match-server/src/bot-types.ts packages/match-server/src/bot-strategy.ts
git commit -m "feat: choose bot actions through turn plans"
```

## Task 9: Deepen Turn Planner With DON Reservation

**Files:**

- Modify: `packages/match-server/src/bot-turn-planner.ts`
- Modify: `packages/match-server/src/bot-turn-planner.test.ts`

- [ ] **Step 1: Add DON reservation analysis**

In `bot-turn-planner.ts`, add:

```ts
interface BotDonReservation {
  readonly reservedForPlay: number;
  readonly freeForPressure: number;
  readonly reason: string;
}

const actionPrintedCost = (
  action: DevVisibleAction,
  features: BotFeatures,
): number => {
  const placementId = action.placement?.instanceId;
  if (action.type !== "playCard" || placementId === undefined) {
    return 0;
  }
  return (
    features.cards.byInstanceId.get(String(placementId))?.currentCost ??
    features.cards.byInstanceId.get(String(placementId))?.printedCost ??
    0
  );
};

const chooseDonReservation = ({
  actions,
  features,
  mode,
}: {
  readonly actions: readonly DevVisibleAction[];
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
}): BotDonReservation => {
  if (mode === "lethal") {
    return {
      reservedForPlay: 0,
      freeForPressure: features.self.activeDonCount,
      reason: "lethal mode uses DON for pressure",
    };
  }
  const bestPlayableCost = Math.max(
    0,
    ...actions.map((action) => actionPrintedCost(action, features)),
  );
  const reservedForPlay = Math.min(bestPlayableCost, features.self.activeDonCount);
  return {
    reservedForPlay,
    freeForPressure: Math.max(0, features.self.activeDonCount - reservedForPlay),
    reason:
      reservedForPlay > 0
        ? "reserve DON for board development"
        : "no play reservation",
  };
};
```

- [ ] **Step 2: Penalize attachments that consume reserved DON**

When scoring `attachDon`, only allow it when:

- mode is `pressure` or `lethal`, or
- `reservation.freeForPressure > 0`, or
- the attachment makes an attack live.

Add:

```ts
const attachmentScore = ({
  action,
  features,
  reservation,
}: {
  readonly action: DevVisibleAction;
  readonly features: BotFeatures;
  readonly reservation: BotDonReservation;
}): BotExplainableScore | undefined => {
  if (action.type !== "attachDon") {
    return undefined;
  }
  const facts = features.actions.byIndex.get(action.index);
  if (facts?.hasUsefulDonAttachment !== true) {
    return undefined;
  }
  const reservedPenalty =
    reservation.freeForPressure <= 0 && facts.donAttachmentUse !== "makeLive"
      ? -300
      : 0;
  return score([
    term("don-pressure", 120, "use DON for meaningful attack pressure"),
    term("don-reservation", reservedPenalty, reservation.reason),
  ]);
};
```

- [ ] **Step 3: Test reservation**

Add to `bot-turn-planner.test.ts`:

```ts
test("does not attach reserved DON before important development", () => {
  const actions = [
    playCardAction(0, "five-cost-body"),
    attachDonAction(1, "don-1", "bot-leader"),
  ];
  const plan = chooseTurnPlan({
    actions,
    features: featuresWithActiveDonAndPlayableCost(actions, 5, 5),
    mode: "develop",
  });

  assert.equal(plan?.steps[0]?.actionIndex, 0);
});

test("lethal mode may spend DON before development", () => {
  const actions = [
    playCardAction(0, "five-cost-body"),
    attachDonAction(1, "don-1", "bot-leader"),
  ];
  const plan = chooseTurnPlan({
    actions,
    features: lethalFeaturesWithUsefulAttachment(actions),
    mode: "lethal",
  });

  assert.equal(plan?.steps[0]?.actionIndex, 1);
});
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-turn-planner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/match-server/src/bot-turn-planner.ts packages/match-server/src/bot-turn-planner.test.ts
git commit -m "feat: reserve bot DON for planned development"
```

## Task 10: Add Generic Decision Planner

**Files:**

- Create: `packages/match-server/src/bot-decision-planner.ts`
- Create: `packages/match-server/src/bot-decision-planner.test.ts`
- Modify: `packages/match-server/src/bot-decision-responder.ts`
- Modify: `packages/match-server/src/bot-default-profile.ts`

- [ ] **Step 1: Implement generic decision scoring**

Create `packages/match-server/src/bot-decision-planner.ts`.

```ts
import type { CardRef, PlayerView } from "@optcg/types";

import { findVisibleCard, visibleCardValue } from "./bot-features.js";
import type { BotDecisionChoice, BotDecisionContext } from "./bot-types.js";

type BotPendingDecision = NonNullable<PlayerView["pendingDecision"]>;

const cardDecisionValue = (
  context: BotDecisionContext,
  card: CardRef,
): number =>
  visibleCardValue(
    findVisibleCard(context.snapshot, context.botPlayerId, card.instanceId),
    { includeCounter: true },
  );

const chooseHighestValueCards = (
  context: BotDecisionContext,
  decision: Extract<BotPendingDecision, { type: "selectCards" }>,
): readonly CardRef[] => {
  const count = Math.min(decision.max, Math.max(decision.min, 1));
  return decision.choices
    .filter((choice) => choice.selectable)
    .map((choice) => ({
      card: choice.card,
      value: cardDecisionValue(context, choice.card),
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, count)
    .map((choice) => choice.card);
};

const chooseLowestValueCards = (
  context: BotDecisionContext,
  decision: Extract<BotPendingDecision, { type: "selectCards" }>,
): readonly CardRef[] => {
  const count = Math.min(decision.max, Math.max(decision.min, 1));
  return decision.choices
    .filter((choice) => choice.selectable)
    .map((choice) => ({
      card: choice.card,
      value: cardDecisionValue(context, choice.card),
    }))
    .sort((left, right) => left.value - right.value)
    .slice(0, count)
    .map((choice) => choice.card);
};

const decisionLooksLikePayment = (decision: BotPendingDecision): boolean =>
  decision.type === "payCost" ||
  decision.causedBy?.type === "effect" ||
  /cost|trash|discard|pay/iu.test(decision.prompt);

export const chooseGenericBotDecision = (
  context: BotDecisionContext,
): BotDecisionChoice | undefined => {
  const decision = context.snapshot.players[context.botPlayerId]?.view
    .pendingDecision;
  if (decision === undefined || decision.playerId !== context.botPlayerId) {
    return undefined;
  }
  if (decision.type === "selectCards") {
    const cards = decisionLooksLikePayment(decision)
      ? chooseLowestValueCards(context, decision)
      : chooseHighestValueCards(context, decision);
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards },
    };
  }
  return undefined;
};
```

This is intentionally generic. Profile-specific search decisions still override it.

- [ ] **Step 2: Wire planner before fallback**

In `packages/match-server/src/bot-decision-responder.ts`, after profile choice and visible decision action choice, call `chooseGenericBotDecision`.

If it returns a choice, report reason:

```ts
reason: { kind: "fallback", decisionType: decision.type }
```

Later tasks can introduce a distinct `generic-planner` reason.

- [ ] **Step 3: Test high-value keep and low-value payment**

Create `packages/match-server/src/bot-decision-planner.test.ts`.

Required tests:

```ts
test("selects high-value card for generic keep/search-like selection", () => {
  const choice = chooseGenericBotDecision(searchLikeSelectionContext());

  assert.deepEqual(
    selectedInstanceIds(choice),
    ["high-value-card"],
  );
});

test("selects low-value card for generic payment-like selection", () => {
  const choice = chooseGenericBotDecision(paymentLikeSelectionContext());

  assert.deepEqual(
    selectedInstanceIds(choice),
    ["low-value-card"],
  );
});
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-decision-planner.test.ts packages/match-server/src/bot-decision-responder.test.ts packages/match-server/src/bot-default-profile.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/match-server/src/bot-decision-planner.ts packages/match-server/src/bot-decision-planner.test.ts packages/match-server/src/bot-decision-responder.ts packages/match-server/src/bot-default-profile.ts
git commit -m "feat: score generic bot card decisions"
```

## Task 11: Add Card Semantics Layer

**Files:**

- Create: `packages/match-server/src/bot-card-semantics.ts`
- Create: `packages/match-server/src/bot-card-semantics.test.ts`
- Modify: `packages/match-server/src/bot-profile-types.ts`
- Modify: `packages/match-server/src/bot-red-shanks-profile.ts`

- [ ] **Step 1: Expand semantic roles**

In `packages/match-server/src/bot-profile-types.ts`, replace `BotCardRole` with:

```ts
export type BotCardRole =
  | "attacker"
  | "blocker"
  | "rush"
  | "removal"
  | "searcher"
  | "draw"
  | "ramp"
  | "power-reduction"
  | "high-counter"
  | "engine-piece"
  | "combo-enabler"
  | "combo-payoff"
  | "preserve"
  | "low-priority-payment";
```

Keep existing role names by mapping:

- `cheat-enabler` becomes `combo-enabler`
- `cheat-target` becomes `combo-payoff`

If existing tests require old names during transition, allow both old and new names temporarily in the type, then remove old names in the same commit after updating profile data.

- [ ] **Step 2: Implement semantic extraction**

Create `packages/match-server/src/bot-card-semantics.ts`.

```ts
import type { PublicCardView } from "@optcg/types";

import type { BotCardRole, BotDeckProfileData } from "./bot-profile-types.js";

export interface BotCardSemantics {
  readonly cardId: string;
  readonly roles: ReadonlySet<BotCardRole>;
  readonly counterValue: number;
  readonly boardValue: number;
}

const printedPower = (card: PublicCardView): number =>
  card.currentPower ?? card.printedPower ?? 0;

const printedCost = (card: PublicCardView): number =>
  card.currentCost ?? card.printedCost ?? 0;

export const deriveBotCardSemantics = ({
  card,
  profile,
}: {
  readonly card: PublicCardView;
  readonly profile?: BotDeckProfileData | undefined;
}): BotCardSemantics => {
  const cardId = String(card.cardId);
  const roles = new Set<BotCardRole>(profile?.cardRoles[cardId] ?? []);
  if (card.keywords?.includes("blocker") === true) {
    roles.add("blocker");
  }
  if ((card.printedCounter ?? 0) >= 2_000) {
    roles.add("high-counter");
  }
  if (printedPower(card) >= 5_000) {
    roles.add("attacker");
  }
  return {
    cardId,
    roles,
    counterValue: card.printedCounter ?? 0,
    boardValue: printedPower(card) + printedCost(card) * 1_000,
  };
};
```

- [ ] **Step 3: Update Red Shanks profile roles**

In `packages/match-server/src/bot-red-shanks-profile.ts`, update:

```ts
"OP16-012": ["combo-enabler", "preserve"],
"OP06-007": ["combo-payoff", "preserve"],
"OP09-004": ["combo-payoff", "preserve"],
"ST23-002": ["combo-payoff", "preserve"],
"OP12-008": ["combo-payoff", "preserve"],
```

Rename code references:

- `cheat-enabler` -> `combo-enabler`
- `cheat-target` -> `combo-payoff`

Keep variable names like `cheatTargets` only if changing them would create too much churn; otherwise rename to `comboTargets` in a separate commit.

- [ ] **Step 4: Test semantic derivation**

Create `packages/match-server/src/bot-card-semantics.test.ts`.

```ts
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { deriveBotCardSemantics } from "./bot-card-semantics.js";

describe("deriveBotCardSemantics", () => {
  test("derives blocker and high-counter roles from visible card data", () => {
    const semantics = deriveBotCardSemantics({
      card: publicCard("blocker", {
        keywords: ["blocker"],
        printedCounter: 2_000,
      }),
    });

    assert.equal(semantics.roles.has("blocker"), true);
    assert.equal(semantics.roles.has("high-counter"), true);
  });

  test("merges profile roles with generic roles", () => {
    const semantics = deriveBotCardSemantics({
      card: publicCard("engine", { cardId: "OP16-012" }),
      profile: {
        id: "test",
        cardRoles: { "OP16-012": ["combo-enabler", "preserve"] },
        searchPriorities: {},
        preserveCards: [],
        cheatTargets: [],
        effectPolicies: [],
      },
    });

    assert.equal(semantics.roles.has("combo-enabler"), true);
    assert.equal(semantics.roles.has("preserve"), true);
  });
});
```

Use a local `publicCard` helper with a complete `PublicCardView` shape.

- [ ] **Step 5: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-card-semantics.test.ts packages/match-server/src/bot-red-shanks-profile.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/match-server/src/bot-card-semantics.ts packages/match-server/src/bot-card-semantics.test.ts packages/match-server/src/bot-profile-types.ts packages/match-server/src/bot-red-shanks-profile.ts
git commit -m "feat: derive bot card semantics"
```

## Task 12: Add Quality Scenario Suite

**Files:**

- Create: `packages/match-server/src/bot-quality-scenarios.ts`
- Create: `packages/match-server/src/bot-quality-scenarios.test.ts`
- Modify: `packages/match-server/src/bot-probe.ts`

- [ ] **Step 1: Create scenario catalog**

Create `packages/match-server/src/bot-quality-scenarios.ts`.

```ts
import type { BotProbeScenario } from "./bot-probe.js";

export const botQualityScenarioIds = [
  "develop-before-low-value-don",
  "pressure-low-life-leader",
  "remove-high-value-rested-character",
  "take-early-nonlethal-life",
  "counter-lethal-leader-attack",
  "preserve-high-counter-card",
  "search-profile-priority",
  "pay-low-value-cost",
] as const;

export type BotQualityScenarioId = (typeof botQualityScenarioIds)[number];

export const botQualityScenarios = (): readonly BotProbeScenario[] => [
  developBeforeLowValueDonScenario(),
  pressureLowLifeLeaderScenario(),
  removeHighValueRestedCharacterScenario(),
  takeEarlyNonlethalLifeScenario(),
  counterLethalLeaderAttackScenario(),
  preserveHighCounterCardScenario(),
  searchProfilePriorityScenario(),
  payLowValueCostScenario(),
];
```

Implement each scenario using fixture helpers copied from `bot-probe.ts`. Keep helpers local to avoid production/test helper coupling. Each scenario must have:

- stable `id`
- `expectedChoiceRequired: true`
- snapshot with only player-visible information
- clear action labels

- [ ] **Step 2: Add expectations helper**

In the same file:

```ts
export const expectedActionTypeByScenarioId: ReadonlyMap<string, string> =
  new Map([
    ["develop-before-low-value-don", "playCard"],
    ["pressure-low-life-leader", "declareAttack"],
    ["remove-high-value-rested-character", "declareAttack"],
    ["counter-lethal-leader-attack", "useCounter"],
  ]);
```

For decision scenarios, assert response shape in the test instead of action type.

- [ ] **Step 3: Test quality scenarios**

Create `packages/match-server/src/bot-quality-scenarios.test.ts`.

```ts
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import {
  botQualityScenarios,
  expectedActionTypeByScenarioId,
} from "./bot-quality-scenarios.js";
import { runBotProbe } from "./bot-probe.js";

describe("bot quality scenarios", () => {
  test("bot does not stall on quality scenarios", () => {
    const report = runBotProbe(botQualityScenarios());

    assert.deepEqual(report.failures, []);
  });

  test("bot chooses expected action classes for doctrine scenarios", () => {
    const scenarios = botQualityScenarios();
    const report = runBotProbe(scenarios);

    for (const scenarioReport of report.scenarios) {
      const expectedType = expectedActionTypeByScenarioId.get(scenarioReport.id);
      if (expectedType === undefined) {
        continue;
      }
      const scenario = scenarios.find((candidate) => candidate.id === scenarioReport.id);
      const action =
        scenarioReport.choice?.type === "submitAction"
          ? scenario?.snapshot.players[scenario.botPlayerId]?.actions.find(
              (candidate) => candidate.index === scenarioReport.choice?.actionIndex,
            )
          : undefined;

      assert.equal(action?.type, expectedType, scenarioReport.id);
    }
  });
});
```

- [ ] **Step 4: Include quality scenarios in bot probe**

In `packages/match-server/src/bot-probe.ts`, append quality scenarios to `defaultBotProbeScenarios` or export a separate `runFullBotQualityProbe`.

Preferred:

```ts
export const runFullBotQualityProbe = (): BotProbeReport =>
  runBotProbe([...defaultBotProbeScenarios, ...botQualityScenarios()]);
```

Avoid importing `bot-probe.ts` from `bot-quality-scenarios.ts` in a cycle. If needed, move shared `BotProbeScenario` type to `bot-types.ts`.

- [ ] **Step 5: Run focused tests and probe**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-quality-scenarios.test.ts packages/match-server/src/bot-probe.test.ts
corepack pnpm bot:probe
```

Expected: tests PASS and probe reports no failures.

- [ ] **Step 6: Commit**

```bash
git add packages/match-server/src/bot-quality-scenarios.ts packages/match-server/src/bot-quality-scenarios.test.ts packages/match-server/src/bot-probe.ts packages/match-server/src/bot-probe.test.ts
git commit -m "test: add bot gameplay quality scenarios"
```

## Task 13: Add Opponent Decklist Knowledge Priors

**Files:**

- Create: `packages/match-server/src/bot-deck-knowledge.ts`
- Create: `packages/match-server/src/bot-deck-knowledge.test.ts`
- Modify: `packages/match-server/src/bot-types.ts`
- Modify: `packages/match-server/src/bot-features.ts`

- [ ] **Step 1: Add deck prior types**

In `packages/match-server/src/bot-types.ts`, add:

```ts
export interface BotDeckCardKnowledge {
  readonly cardId: string;
  readonly count: number;
  readonly printedCounter: number;
  readonly roles: readonly string[];
}

export interface BotCounterPrior {
  readonly unknownCardCount: number;
  readonly totalCounterPower: number;
  readonly counter1000Count: number;
  readonly counter2000Count: number;
  readonly averageCounterPower: number;
}

export interface BotOpponentDeckKnowledge {
  readonly knownDecklistCardIds: readonly string[];
  readonly remainingUnknownCounterPrior: BotCounterPrior;
  readonly remainingEventCount: number;
  readonly remainingBlockerCount: number;
  readonly remainingRemovalCount: number;
}
```

- [ ] **Step 2: Implement public-adjusted priors**

Create `packages/match-server/src/bot-deck-knowledge.ts`.

```ts
import type { BotVisibleCard } from "./bot-types.js";
import type {
  BotDeckCardKnowledge,
  BotOpponentDeckKnowledge,
} from "./bot-types.js";

const emptyCounterPrior = {
  unknownCardCount: 0,
  totalCounterPower: 0,
  counter1000Count: 0,
  counter2000Count: 0,
  averageCounterPower: 0,
} as const;

const publicCardCounts = (
  publicCards: readonly BotVisibleCard[],
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const card of publicCards) {
    const cardId = String(card.cardId);
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }
  return counts;
};

const remainingCards = ({
  decklist,
  publicCards,
}: {
  readonly decklist: readonly BotDeckCardKnowledge[];
  readonly publicCards: readonly BotVisibleCard[];
}): readonly BotDeckCardKnowledge[] => {
  const publicCounts = publicCardCounts(publicCards);
  return decklist.flatMap((card) => {
    const remainingCount = Math.max(
      0,
      card.count - (publicCounts.get(card.cardId) ?? 0),
    );
    return remainingCount === 0 ? [] : [{ ...card, count: remainingCount }];
  });
};

const counterPrior = (
  cards: readonly BotDeckCardKnowledge[],
): BotOpponentDeckKnowledge["remainingUnknownCounterPrior"] => {
  const unknownCardCount = cards.reduce((total, card) => total + card.count, 0);
  if (unknownCardCount === 0) {
    return emptyCounterPrior;
  }
  const totalCounterPower = cards.reduce(
    (total, card) => total + card.printedCounter * card.count,
    0,
  );
  return {
    unknownCardCount,
    totalCounterPower,
    counter1000Count: cards
      .filter((card) => card.printedCounter === 1_000)
      .reduce((total, card) => total + card.count, 0),
    counter2000Count: cards
      .filter((card) => card.printedCounter >= 2_000)
      .reduce((total, card) => total + card.count, 0),
    averageCounterPower: totalCounterPower / unknownCardCount,
  };
};

const roleCount = (
  cards: readonly BotDeckCardKnowledge[],
  role: string,
): number =>
  cards
    .filter((card) => card.roles.includes(role))
    .reduce((total, card) => total + card.count, 0);

export const buildOpponentDeckKnowledge = ({
  decklist,
  publicCards,
}: {
  readonly decklist: readonly BotDeckCardKnowledge[];
  readonly publicCards: readonly BotVisibleCard[];
}): BotOpponentDeckKnowledge => {
  const remaining = remainingCards({ decklist, publicCards });
  return {
    knownDecklistCardIds: decklist.map((card) => card.cardId),
    remainingUnknownCounterPrior: counterPrior(remaining),
    remainingEventCount: roleCount(remaining, "event"),
    remainingBlockerCount: roleCount(remaining, "blocker"),
    remainingRemovalCount: roleCount(remaining, "removal"),
  };
};
```

This module accepts decklist knowledge as data. It must not read private engine state.

- [ ] **Step 3: Add feature slot**

In `packages/match-server/src/bot-features.ts`, add optional knowledge:

```ts
import type { BotOpponentDeckKnowledge } from "./bot-types.js";

export interface BotFeatures {
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
  readonly self: BotSelfFeatures;
  readonly opponent: BotOpponentFeatures;
  readonly opponentDeckKnowledge?: BotOpponentDeckKnowledge | undefined;
  readonly cards: BotCardFeatures;
  readonly actions: BotActionFeatures;
  readonly combat: BotCombatFeatures;
}
```

Change `buildBotFeatures` signature:

```ts
export const buildBotFeatures = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
  options: {
    readonly opponentDeckKnowledge?: BotOpponentDeckKnowledge | undefined;
  } = {},
): BotFeatures => {
```

Return:

```ts
opponentDeckKnowledge: options.opponentDeckKnowledge,
```

- [ ] **Step 4: Test priors subtract public information**

Create `packages/match-server/src/bot-deck-knowledge.test.ts`.

```ts
import { strict as assert } from "node:assert";
import type { PublicCardView } from "@optcg/types";
import { describe, test } from "vitest";

import { buildOpponentDeckKnowledge } from "./bot-deck-knowledge.js";

const publicCard = (cardId: string): PublicCardView =>
  ({
    instanceId: `${cardId}:public`,
    cardId,
    owner: "p1",
    controller: "p1",
    zone: { playerId: "p1", zone: "trash" },
  }) as PublicCardView;

describe("buildOpponentDeckKnowledge", () => {
  test("computes counter priors from decklist", () => {
    const knowledge = buildOpponentDeckKnowledge({
      decklist: [
        { cardId: "C1", count: 4, printedCounter: 2_000, roles: [] },
        { cardId: "C2", count: 4, printedCounter: 1_000, roles: [] },
      ],
      publicCards: [],
    });

    assert.equal(knowledge.remainingUnknownCounterPrior.unknownCardCount, 8);
    assert.equal(knowledge.remainingUnknownCounterPrior.counter2000Count, 4);
    assert.equal(knowledge.remainingUnknownCounterPrior.counter1000Count, 4);
    assert.equal(knowledge.remainingUnknownCounterPrior.averageCounterPower, 1_500);
  });

  test("subtracts public cards from remaining priors", () => {
    const knowledge = buildOpponentDeckKnowledge({
      decklist: [
        { cardId: "C1", count: 4, printedCounter: 2_000, roles: [] },
        { cardId: "C2", count: 4, printedCounter: 1_000, roles: [] },
      ],
      publicCards: [publicCard("C1"), publicCard("C1")],
    });

    assert.equal(knowledge.remainingUnknownCounterPrior.unknownCardCount, 6);
    assert.equal(knowledge.remainingUnknownCounterPrior.counter2000Count, 2);
    assert.equal(knowledge.remainingUnknownCounterPrior.averageCounterPower, 1_333.3333333333333);
  });
});
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-deck-knowledge.test.ts packages/match-server/src/bot-features.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/match-server/src/bot-types.ts packages/match-server/src/bot-deck-knowledge.ts packages/match-server/src/bot-deck-knowledge.test.ts packages/match-server/src/bot-features.ts
git commit -m "feat: add bot opponent decklist priors"
```

## Task 14: Use Deck Priors In Combat And Defense

**Files:**

- Modify: `packages/match-server/src/bot-combat-planner.ts`
- Modify: `packages/match-server/src/bot-defense-planner.ts`
- Modify: `packages/match-server/src/bot-combat-planner.test.ts`
- Modify: `packages/match-server/src/bot-defense-planner.test.ts`

- [ ] **Step 1: Use average counter prior for leader pressure**

In `packages/match-server/src/bot-combat-planner.ts`, add:

```ts
const estimatedOpponentCounterPowerPerCard = (
  features: BotFeatures,
): number =>
  features.opponentDeckKnowledge?.remainingUnknownCounterPrior
    .averageCounterPower || 2_000;
```

When scoring leader attacks, add a term:

```ts
const counterPrior = estimatedOpponentCounterPowerPerCard(features);
const counterDensityPressure =
  attacksLeader && counterPrior < 1_500 ? 90 : attacksLeader && counterPrior > 1_800 ? -45 : 0;
```

Include:

```ts
term(
  "deck-prior",
  counterDensityPressure,
  "opponent decklist counter density adjusts leader pressure",
),
```

- [ ] **Step 2: Use defensive event/blocker priors conservatively**

In the same scoring function, add:

```ts
const defensivePriorPenalty =
  attacksLeader &&
  mode === "lethal" &&
  ((features.opponentDeckKnowledge?.remainingEventCount ?? 0) > 0 ||
    (features.opponentDeckKnowledge?.remainingBlockerCount ?? 0) > 0)
    ? -60
    : 0;
```

Include:

```ts
term(
  "deck-prior",
  defensivePriorPenalty,
  "opponent decklist has possible defensive resources",
),
```

This should adjust choices, not make the bot refuse real lethal.

- [ ] **Step 3: Use counter priors in defense risk**

In `packages/match-server/src/bot-defense-planner.ts`, add:

```ts
const botDeckCounterDensityIsHigh = (features: BotFeatures): boolean =>
  features.opponentDeckKnowledge?.remainingUnknownCounterPrior
    .averageCounterPower !== undefined &&
  features.opponentDeckKnowledge.remainingUnknownCounterPrior.averageCounterPower >=
    1_700;
```

Use this only for marginal non-lethal defense. Do not use it to skip lethal defense.

- [ ] **Step 4: Test deck priors affect attack choice**

In `bot-combat-planner.test.ts`, add:

```ts
test("low opponent counter density increases leader pressure", () => {
  const highCounter = chooseCombatPlanAction({
    actions: leaderAttackOnlyActions(),
    features: featuresWithOpponentCounterAverage(2_000),
    mode: "pressure",
  });
  const lowCounter = chooseCombatPlanAction({
    actions: leaderAttackOnlyActions(),
    features: featuresWithOpponentCounterAverage(1_000),
    mode: "pressure",
  });

  assert.ok((lowCounter?.score.total ?? 0) > (highCounter?.score.total ?? 0));
});
```

- [ ] **Step 5: Test priors do not override lethal defense**

In `bot-defense-planner.test.ts`, add:

```ts
test("deck priors never cause bot to take lethal", () => {
  const context = lethalCounterContext();
  const choice = chooseCounterCardsForDefense({
    context,
    features: {
      ...buildBotFeatures(context.snapshot, botPlayerId),
      opponentDeckKnowledge: lowCounterOpponentKnowledge(),
    },
  });

  assert.ok((choice?.cards.length ?? 0) > 0);
});
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-combat-planner.test.ts packages/match-server/src/bot-defense-planner.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/match-server/src/bot-combat-planner.ts packages/match-server/src/bot-defense-planner.ts packages/match-server/src/bot-combat-planner.test.ts packages/match-server/src/bot-defense-planner.test.ts
git commit -m "feat: apply opponent deck priors to bot combat"
```

## Task 15: Wire Registered Decklists Into Bot Features

**Files:**

- Modify: `packages/match-server/src/bot-strategy.ts`
- Modify: `packages/match-server/src/bot-types.ts`
- Modify: `packages/match-server/src/bot-player.ts`
- Modify: `packages/match-server/src/dev-local-match-registry.ts` or the current bot invocation owner
- Test: relevant bot lobby/local match test file

- [ ] **Step 1: Extend strategy input**

In `packages/match-server/src/bot-types.ts`, change:

```ts
export interface BotStrategy {
  readonly chooseAction: (input: {
    readonly snapshot: DevMatchSnapshot;
    readonly botPlayerId: PlayerId;
    readonly opponentDeckKnowledge?: BotOpponentDeckKnowledge | undefined;
  }) => BotActionChoice | undefined;
}
```

Update `chooseBotActionReport` and `createBotStrategy` inputs similarly.

- [ ] **Step 2: Preserve backwards compatibility**

In `packages/match-server/src/bot-player.ts`, keep:

```ts
export const chooseBotAction = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): BotActionChoice | undefined =>
  defaultBotStrategy.chooseAction({ snapshot, botPlayerId });
```

Add:

```ts
export const chooseBotActionWithKnowledge = ({
  snapshot,
  botPlayerId,
  opponentDeckKnowledge,
}: {
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
  readonly opponentDeckKnowledge?: BotOpponentDeckKnowledge | undefined;
}): BotActionChoice | undefined =>
  defaultBotStrategy.chooseAction({
    snapshot,
    botPlayerId,
    opponentDeckKnowledge,
  });
```

- [ ] **Step 3: Pass knowledge into features**

In `bot-strategy.ts`, when calling `buildBotFeatures`, pass:

```ts
const features = buildBotFeatures(snapshot, botPlayerId, {
  opponentDeckKnowledge,
});
```

- [ ] **Step 4: Build knowledge at bot execution boundary**

In the current bot invocation owner, locate where the match has both players' submitted decklists and where bot actions are requested. Build:

```ts
const opponentDeckKnowledge = buildOpponentDeckKnowledge({
  decklist: opponentDecklistKnowledgeCards,
  publicCards: visibleOpponentPublicCards,
});
```

Requirements:

- `opponentDecklistKnowledgeCards` must come from registered decklist/deck loadout data, not engine private state.
- `visibleOpponentPublicCards` must come from bot player's visible snapshot.
- If decklist data is unavailable, omit knowledge and continue with generic assumptions.
- Do not block bot liveness on deck knowledge.

- [ ] **Step 5: Test missing decklist fallback**

Add a test around `chooseBotActionReport`:

```ts
test("bot works without opponent deck knowledge", () => {
  const report = chooseBotActionReport({
    snapshot: playableCardSnapshot(),
    botPlayerId,
  });

  assert.notEqual(report?.choice, undefined);
});
```

- [ ] **Step 6: Test provided decklist knowledge reaches planner**

Add a test:

```ts
test("bot report includes deck prior term when opponent deck knowledge is supplied", () => {
  const report = chooseBotActionReport({
    snapshot: pressureAttackSnapshot(),
    botPlayerId,
    opponentDeckKnowledge: lowCounterOpponentKnowledge(),
  });

  assert.equal(
    report?.explainableScore?.terms.some(
      (term) => term.key === "deck-prior",
    ),
    true,
  );
});
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-strategy-priorities.test.ts packages/match-server/src/bot-probe.test.ts packages/match-server/src/match-http-server-bot-lobby.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/match-server/src/bot-types.ts packages/match-server/src/bot-player.ts packages/match-server/src/bot-strategy.ts packages/match-server/src/dev-local-match-registry.ts packages/match-server/src/bot-strategy-priorities.test.ts packages/match-server/src/match-http-server-bot-lobby.test.ts
git commit -m "feat: pass opponent deck knowledge to bot strategy"
```

## Task 16: Add Multi-Action Turn Planning

**Files:**

- Modify: `packages/match-server/src/bot-turn-planner.ts`
- Modify: `packages/match-server/src/bot-turn-planner.test.ts`

- [ ] **Step 1: Add planning horizon type**

In `bot-turn-planner.ts`, add:

```ts
export interface BotPlanningConfig {
  readonly maxSteps: number;
  readonly beamWidth: number;
}

export const defaultBotPlanningConfig: BotPlanningConfig = {
  maxSteps: 3,
  beamWidth: 4,
};
```

- [ ] **Step 2: Add static sequence planner**

Because the engine does not currently expose a cheap "apply legal action to cloned snapshot" helper from match-server, start with static sequence planning over currently visible actions. This is not full simulation. It is a production-safe improvement because it can still enforce ordering doctrine.

Add:

```ts
const actionConsumesAttacker = (action: DevVisibleAction): string | undefined =>
  action.type === "declareAttack" && action.attack !== undefined
    ? String(action.attack.attackerInstanceId)
    : undefined;

const actionConsumesDon = (action: DevVisibleAction): number =>
  action.type === "attachDon" ? 1 : 0;

const sequenceIsCoherent = (
  actions: readonly DevVisibleAction[],
): boolean => {
  const consumedAttackers = new Set<string>();
  let consumedDon = 0;
  for (const action of actions) {
    const attacker = actionConsumesAttacker(action);
    if (attacker !== undefined) {
      if (consumedAttackers.has(attacker)) {
        return false;
      }
      consumedAttackers.add(attacker);
    }
    consumedDon += actionConsumesDon(action);
  }
  return consumedDon <= actions.length;
};
```

Then extend `chooseTurnPlan` to build candidate sequences:

- candidate first action from existing scoring,
- candidate second action from remaining non-conflicting actions,
- candidate third action if score still improves,
- score is sum of step scores plus ordering bonuses.

- [ ] **Step 3: Add ordering bonuses**

Add:

```ts
const orderingBonus = (
  sequence: readonly DevVisibleAction[],
  mode: BotStrategicMode,
): BotScoreTerm[] => {
  const firstAttackIndex = sequence.findIndex(
    (action) => action.type === "declareAttack",
  );
  const firstPlayIndex = sequence.findIndex((action) => action.type === "playCard");
  return [
    {
      key: "ordering",
      value:
        firstAttackIndex >= 0 &&
        firstPlayIndex >= 0 &&
        firstAttackIndex < firstPlayIndex &&
        (mode === "pressure" || mode === "lethal")
          ? 140
          : 0,
      reason: "attack before development in pressure/lethal mode",
    },
    {
      key: "ordering",
      value:
        firstPlayIndex >= 0 &&
        firstAttackIndex >= 0 &&
        firstPlayIndex < firstAttackIndex &&
        mode === "develop"
          ? 100
          : 0,
      reason: "develop before pressure in develop mode",
    },
  ];
};
```

- [ ] **Step 4: Test sequencing**

Add to `bot-turn-planner.test.ts`:

```ts
test("pressure mode prefers attack-before-play sequence", () => {
  const actions = [
    playCardAction(0, "body"),
    leaderAttackAction(1),
  ];
  const plan = chooseTurnPlan({
    actions,
    features: pressureFeaturesForActions(actions),
    mode: "pressure",
    config: { maxSteps: 2, beamWidth: 4 },
  });

  assert.deepEqual(
    plan?.steps.map((step) => step.actionIndex),
    [1, 0],
  );
});

test("develop mode prefers play-before-attack when lethal is absent", () => {
  const actions = [
    playCardAction(0, "body"),
    leaderAttackAction(1),
  ];
  const plan = chooseTurnPlan({
    actions,
    features: featuresForActions(actions),
    mode: "develop",
    config: { maxSteps: 2, beamWidth: 4 },
  });

  assert.deepEqual(
    plan?.steps.map((step) => step.actionIndex),
    [0, 1],
  );
});
```

- [ ] **Step 5: Strategy still submits only first action**

Verify `bot-strategy.ts` only submits `turnPlan.steps[0].actionIndex`. The rest of the plan is explanation and ordering guidance. The bot will re-plan after each engine state update.

- [ ] **Step 6: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-turn-planner.test.ts packages/match-server/src/bot-quality-scenarios.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/match-server/src/bot-turn-planner.ts packages/match-server/src/bot-turn-planner.test.ts
git commit -m "feat: plan bot action sequences"
```

## Task 17: Replace Legacy One-Action Fallback As The Main Brain

**Files:**

- Modify: `packages/match-server/src/bot-strategy.ts`
- Modify: `packages/match-server/src/bot-action-evaluator.ts`
- Modify: `packages/match-server/src/bot-action-evaluator.test.ts`
- Modify: `packages/match-server/src/bot-score.ts`
- Modify: `packages/match-server/src/bot-score.test.ts`

- [ ] **Step 1: Make turn planner the normal path**

In `bot-strategy.ts`, order must be:

1. If bot owns pending decision, use decision responder.
2. Build features.
3. Choose strategic mode.
4. Use defense planner if in opponent battle decision.
5. Use turn planner for normal visible actions.
6. Fall back to legacy `chooseBestScoredCandidate` only if planner returns undefined.
7. Fall back to generic decision response if still needed.

- [ ] **Step 2: Add test that legacy fallback is not used for normal scenarios**

In `bot-strategy-priorities.test.ts`, add:

```ts
test("normal visible action choices use turn planner explanation", () => {
  const report = chooseBotActionReport({
    snapshot: playableCardSnapshot(),
    botPlayerId,
  });

  assert.equal(report?.choice.type, "submitAction");
  assert.ok(
    report?.explainableScore?.terms.some((term) =>
      term.reason.includes("persistent board"),
    ),
  );
});
```

- [ ] **Step 3: Demote `bot-action-evaluator.ts`**

If no production caller still needs `evaluateBotAction`, either:

- remove `bot-action-evaluator.ts` and its tests, or
- keep it as a compatibility wrapper used only by tests.

Preferred wrapper:

```ts
export const evaluateBotAction = (
  input: BotActionEvaluationInput,
): number | undefined =>
  scoreBotCandidate({
    candidate: candidateFromEvaluationInput(input),
    features: input.features,
    context: input.context,
    pendingDecision: input.pendingDecision,
    tacticalScore: input.tacticalScore,
    profileScore: input.profileScore,
    cardScores: input.cardScores,
  }).breakdown.total;
```

Add a code comment:

```ts
// Compatibility scoring for legacy tests. Normal bot strategy uses the turn planner.
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-strategy-priorities.test.ts packages/match-server/src/bot-action-evaluator.test.ts packages/match-server/src/bot-score.test.ts packages/match-server/src/bot-probe.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/match-server/src/bot-strategy.ts packages/match-server/src/bot-action-evaluator.ts packages/match-server/src/bot-action-evaluator.test.ts packages/match-server/src/bot-score.ts packages/match-server/src/bot-score.test.ts packages/match-server/src/bot-strategy-priorities.test.ts
git commit -m "feat: make turn planner the primary bot brain"
```

## Task 18: Add Bot Quality Probe Output

**Files:**

- Modify: `packages/match-server/src/bot-probe.ts`
- Modify: `packages/match-server/src/bot-probe.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add quality summary to probe report**

In `bot-probe.ts`, extend `BotProbeReport`:

```ts
readonly quality: {
  readonly scenarioCount: number;
  readonly explainedChoiceCount: number;
  readonly unexplainedChoiceCount: number;
};
```

Set it in `runBotProbe`:

```ts
const explainedChoiceCount = reports.filter(
  (report) =>
    report.decisionReason !== undefined ||
    (report.explainableScore?.terms.length ?? 0) > 0,
).length;

return {
  scenarios: reports,
  failures,
  quality: {
    scenarioCount: reports.length,
    explainedChoiceCount,
    unexplainedChoiceCount: reports.length - explainedChoiceCount,
  },
};
```

- [ ] **Step 2: Fail probe on unexplained choices**

In `evaluateBotProbeFailures`, keep the existing explanation failure and make sure every unexplained choice creates a failure.

- [ ] **Step 3: Add script alias**

In `package.json`, keep existing `bot:probe` and add:

```json
"bot:quality": "tsx packages/match-server/src/bot-probe.ts"
```

If JSON ordering matters in this repo, place it immediately after `"bot:probe"`.

- [ ] **Step 4: Test quality summary**

In `bot-probe.test.ts`, add:

```ts
test("reports quality summary", () => {
  const report = runBotProbe(defaultBotProbeScenarios);

  assert.equal(report.quality.scenarioCount, defaultBotProbeScenarios.length);
  assert.equal(report.quality.unexplainedChoiceCount, 0);
});
```

- [ ] **Step 5: Run focused tests and probe**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-probe.test.ts packages/match-server/src/bot-quality-scenarios.test.ts
corepack pnpm bot:quality
```

Expected: tests PASS and probe exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/match-server/src/bot-probe.ts packages/match-server/src/bot-probe.test.ts
git commit -m "feat: report bot quality probe metrics"
```

## Task 19: Add Self-Play Metrics Harness

**Files:**

- Create: `packages/match-server/src/bot-self-play.ts`
- Create: `packages/match-server/src/bot-self-play.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Create self-play metric types**

Create `packages/match-server/src/bot-self-play.ts`.

```ts
export interface BotSelfPlayTurnMetric {
  readonly turnNumber: number;
  readonly botPlayerId: string;
  readonly actionCount: number;
  readonly endedByChoice: boolean;
  readonly unexplainedChoiceCount: number;
}

export interface BotSelfPlayReport {
  readonly gameCount: number;
  readonly completedGameCount: number;
  readonly stalledGameCount: number;
  readonly averageActionsPerTurn: number;
  readonly unexplainedChoiceCount: number;
}
```

- [ ] **Step 2: Implement pure metric aggregator first**

Add:

```ts
export const summarizeBotSelfPlayMetrics = (
  turns: readonly BotSelfPlayTurnMetric[],
): BotSelfPlayReport => {
  const actionCount = turns.reduce((total, turn) => total + turn.actionCount, 0);
  const unexplainedChoiceCount = turns.reduce(
    (total, turn) => total + turn.unexplainedChoiceCount,
    0,
  );
  return {
    gameCount: turns.length === 0 ? 0 : 1,
    completedGameCount: turns.some((turn) => turn.endedByChoice) ? 1 : 0,
    stalledGameCount: turns.some((turn) => !turn.endedByChoice) ? 1 : 0,
    averageActionsPerTurn: turns.length === 0 ? 0 : actionCount / turns.length,
    unexplainedChoiceCount,
  };
};
```

This starts with pure metrics. A later task can wire real local match execution without risking server behavior.

- [ ] **Step 3: Test aggregator**

Create `packages/match-server/src/bot-self-play.test.ts`.

```ts
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { summarizeBotSelfPlayMetrics } from "./bot-self-play.js";

describe("summarizeBotSelfPlayMetrics", () => {
  test("summarizes action and explanation counts", () => {
    const report = summarizeBotSelfPlayMetrics([
      {
        turnNumber: 1,
        botPlayerId: "p1",
        actionCount: 4,
        endedByChoice: true,
        unexplainedChoiceCount: 0,
      },
      {
        turnNumber: 2,
        botPlayerId: "p2",
        actionCount: 2,
        endedByChoice: true,
        unexplainedChoiceCount: 1,
      },
    ]);

    assert.equal(report.averageActionsPerTurn, 3);
    assert.equal(report.unexplainedChoiceCount, 1);
  });
});
```

- [ ] **Step 4: Add script placeholder that runs pure metrics test only**

Do not add a fake self-play executable. Add a test script alias:

```json
"bot:self-play:test": "corepack pnpm exec vitest run packages/match-server/src/bot-self-play.test.ts"
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-self-play.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/match-server/src/bot-self-play.ts packages/match-server/src/bot-self-play.test.ts
git commit -m "feat: add bot self-play metric model"
```

## Task 20: Full Verification

**Files:**

- No source changes unless verification exposes failures.

- [ ] **Step 1: Run bot-focused suite**

Run:

```bash
corepack pnpm exec vitest run packages/match-server/src/bot-*.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run bot probe**

Run:

```bash
corepack pnpm bot:probe
```

Expected: exits 0. JSON report has `failures: []`.

- [ ] **Step 3: Run match-server typecheck**

Run:

```bash
corepack pnpm exec tsc -p packages/match-server/tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run canonical checks if time permits**

Run:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm verify
```

Expected: PASS. If any broad command fails for unrelated pre-existing failures, record the exact failing command and first relevant failure.

- [ ] **Step 5: Commit verification-only fixes if needed**

Only commit if fixes were required.

```bash
git add <changed files>
git commit -m "fix: stabilize bot planner verification"
```

## Rollout Gates

Before this feature is considered ready:

- Bot-owned pending decisions never stall.
- Every default quality scenario passes.
- Every chosen visible action has an explainable score.
- Every decision response has a reason.
- Pressure, lethal, stabilize, develop, and survive modes all have tests.
- Defensive counter behavior has tests for:
  - lethal leader attack,
  - early non-lethal leader attack,
  - high-value character protection.
- Turn planning has tests for:
  - develop before low-value DON,
  - pressure attack before development,
  - lethal DON allocation,
  - not attaching DON with no live benefit.
- Generic decision behavior has tests for:
  - high-value keep/search,
  - low-value payment,
  - profile override winning over generic fallback.
- Red Shanks profile tests still pass.
- `corepack pnpm bot:probe` exits 0.

## Non-Goals

- Do not make the bot omniscient.
- Do not use opponent hidden hand contents.
- Do not hardcode every supported card into the generic planner.
- Do not rewrite the match server.
- Do not require a profile for liveness.
- Do not block this feature on machine learning or remote services.
- Do not expose bot debug reports in production UI unless a separate UI task requests it.

## Future Expansion After This Plan

These are not part of the first implementation pass:

- Full cloned-state simulation of action sequences.
- Monte Carlo opponent hand estimation.
- Profile generation from parsed effect DSL.
- Archetype-specific mulligan models.
- Difficulty levels.
- Training/tuning from replay data.
- Bot-vs-bot ladder metrics.

## Self-Review

Spec coverage:

- Thorough gameplay doctrine is included and tied to tasks.
- Current code boundaries are identified.
- The plan keeps legal action plumbing and avoids a full rewrite.
- Card-specific versus generic split is explicit.
- Quality/probe/test requirements are included.
- The plan treats the bot as a high-value feature with explainability and rollout gates.

Placeholder scan:

- No task depends on "TBD" behavior.
- Fixture helpers that must be copied from existing tests are explicitly identified where production code should not import test helpers.
- Every implementation task names files, code shape, commands, and expected results.

Type consistency:

- `BotStrategicMode`, `BotExplainableScore`, `BotScoreTerm`, and `BotTurnPlan` are introduced before use.
- Existing `BotScoreBreakdown` is kept during transition.
- `BotStrategy` public API remains stable.

Residual implementation risks:

- `PublicCardView` may not expose `rested`; Task 3 explicitly requires using the actual field or failing closed by omitting that feature.
- Static multi-action planning is not true engine simulation. It is still useful and safe because the bot re-plans after every submitted action.
- Some test snippets need local fixture helpers copied from existing bot tests. Keep those helpers test-local.
