# Spotlight V2 Engine-Authored Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace reconstructed spotlight behavior with an engine-authored, append-only spotlight timeline so each user-facing spotlight moment is created exactly once at the gameplay source of truth, then filtered and played back without semantic reconstruction in the view or client layers.

**Architecture:** Add `spotlightEntryCreated` as a canonical engine event whose payload contains an `EffectSpotlightHistoryEntry`. Runtime/action code emits these entries when a card play, effect step, pending decision, replacement, or combat moment should be spotlighted. The player view filters visible spotlight events into `PlayerView.effectSpotlightHistory`; it does not infer entries from unrelated event payloads, active decisions, completed frames, combat events, or card-play side effects. The client consumes the ordered timeline as data and owns only cursor, dwell, pinning, pause, rewind, step, and catch-up behavior.

**Tech Stack:** TypeScript, React hooks, Vitest, `@optcg/types`, `@optcg/engine-core`, `@optcg/client`.

---

## Design Commitments

- `spotlightEntryCreated` is append-only. Do not add a general `spotlightEntryUpdated` path unless a failing test proves a spotlight fact is impossible to know at creation time.
- Spotlight entries are authored near the event that knows the truth. Effect runtime owns effect-text entries, battle actions own combat entries, and card-play handling owns no-effect card-play entries.
- `filter-state-for-player` filters spotlight entries. It must stop building spotlight entries from `activeEffectText`, `completedEffectTextsForCurrentFrame`, `currentEffectTextSpotlight`, `effectResolved`, `replacementApplied`, `attackDeclared`, `blockerActivated`, and `cardPlayed`.
- The client playback reducer must not parse keys, replay replacement entries because links arrived late, or distinguish "completed-frame" from event history.
- The renderer can stay. `EffectSpotlight.tsx`, CSS, card rendering, controls, and timer presentation are not part of the first replacement except where type wiring requires it.
- Hidden-information safety is preserved by explicit emission visibility plus player-event payload redaction. A private spotlight event may exist for one player, but public player views must only include events visible to that player, and public spotlight target links must not carry private candidate refs.
- Existing `PlayerView.effectSpotlightHistory` is retained for the public contract during this migration. A rename to `spotlightTimeline` can happen later after behavior is stable.

### Public Pending Identity

Pending spotlight pinning must use one recipient-safe public identity, not raw engine `DecisionId`.

- Add `PublicPendingDecisionId` as a branded string type in the public type layer.
- Derive `PublicPendingDecisionId` through one named helper, `publicPendingDecisionIdForAnchor`, from the final visible `decisionCreated` anchor event id plus the decision recipient player id. Do not derive it from `PendingDecision.id`, queue ids, effect ids, target signatures, candidate counts, or pre-rebase local ids.
- Add `spotlightPendingId: PublicPendingDecisionId` to the base `PublicDecision` interface; `PublicPendingDecision` is the exported union/alias of public decision variants and must inherit or include the same field in every variant used by `PlayerView.pendingDecision`.
- Use that same value as sanitized `EffectTextSpotlightHistoryEntry.pendingDecisionId` for live pending spotlight entries.
- `MatchApp.tsx` must pass `playerSnapshot?.view.pendingDecision?.spotlightPendingId` into `useEffectSpotlight`; spotlight code must not read `pendingDecision.id`.
- Raw `DecisionId` may remain on `PublicDecision.id` only as the existing action-response token for this plan. It must not be copied into spotlight entries, `effectSpotlightHistory`, spotlight event payloads, spotlight ids, keys, `semanticKey`, or client spotlight pinning inputs.
- Add regressions proving serialized `PlayerView.effectSpotlightHistory` and `PlayerView.events` do not contain the raw engine decision id, while current pending pinning still works through `spotlightPendingId`.

### Spotlight Identity Matrix

Use one identity rule per spotlight kind. Do not let the sanitizer choose a different identity source than the builder.

| Entry kind              | Raw anchor                                                 | Public `id`/`key` source                                                                                                    | Public `semanticKey` source                                     | `resolvedEventId`                           | `pendingDecisionId`                                                                                   |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| pending effect text     | final `decisionCreated` event id + split/active ordinal    | same final `decisionCreated` anchor + sanitized split/active ordinal                                                        | same final `decisionCreated` anchor + sanitized active span ids | omitted                                     | `PublicPendingDecisionId` derived from the same final `decisionCreated` anchor and decision recipient |
| resolved effect text    | final `effectResolved` event id + split/active ordinal     | final visible `effectResolved` anchor when safe, otherwise visible `spotlightEntryCreated` event id + sanitized ordinal     | sanitized source/kind/span facts plus final visible anchor      | final visible `effectResolved` event id     | omitted                                                                                               |
| replacement effect text | final `replacementApplied` event id + split/active ordinal | final visible `replacementApplied` anchor when safe, otherwise visible `spotlightEntryCreated` event id + sanitized ordinal | sanitized source/kind/span facts plus final visible anchor      | final visible `replacementApplied` event id | omitted                                                                                               |
| combat                  | final `attackDeclared` or `blockerActivated` event id      | final visible combat event anchor when safe, otherwise visible `spotlightEntryCreated` event id                             | sanitized combat kind plus final visible anchor                 | final visible combat event id               | omitted                                                                                               |
| played card             | final `cardPlayed` event id                                | final visible `cardPlayed` anchor when safe, otherwise visible `spotlightEntryCreated` event id                             | sanitized played-card kind plus final visible anchor            | final visible `cardPlayed` event id         | omitted                                                                                               |

For pending entries, sanitized `id`, `key`, and `semanticKey` must stay decision-anchor based. Do not recompute pending identity from the `spotlightEntryCreated` event id, because pinning and rebase regressions depend on the public pending identity matching `PlayerView.pendingDecision.spotlightPendingId`.

## Current Problems This Replaces

- Double events: client playback currently replays consumed entries when later timeline replacements add target links.
- Wrong highlight: active span selection is split across runtime presentation, pending decision narrowing, view splitting rules, and client playback semantics.
- Missing spotlight: server projection only accepts resolved effect presentations with nonempty active spans, and the deleted client fallback means missing server history has no recovery path.
- Coupling: `packages/engine-core/src/view/effect-spotlight-history.ts` reconstructs effect text, combat, played-card, no-effect decisions, completed execution frames, and live pending entries from unrelated state surfaces.

## File Structure

- Modify `packages/types/src/events.ts`
  - Add `spotlightEntryCreated` to `EngineEventType`.
- Modify `packages/types/src/decisions.ts`
  - Add `PublicPendingDecisionId`.
- Modify `packages/types/src/effect-presentation.ts`
  - Add `SpotlightEntryCreatedPayload` as the exported payload type.
  - Add an explicit `PlayedCardSpotlightHistoryEntry` union member for no-effect played-card spotlights.
  - Keep existing `EffectSpotlightHistoryEntry` union and `EffectSpotlightHistory`.
- Modify `packages/types/src/view.ts`
  - Add `spotlightPendingId` to the base `PublicDecision` interface so every `PublicPendingDecision` variant carries the spotlight-safe pinning identity.
- Modify `contracts/types/events.ts`, `contracts/types/decisions.ts`, `contracts/types/effect-presentation.ts`, and `contracts/types/view.ts`
  - Sync public contract copies after package type changes.
- Modify `packages/types/src/effect-presentation.test.ts`
  - Prove the event payload carries effect-text and combat entries.
- Modify `packages/types/src/view.test.ts`
  - Keep the `PlayerView.effectSpotlightHistory` contract aligned with authored entries.
- Create `packages/engine-core/src/spotlight/spotlight-entry.ts`
  - Own construction helpers for effect-text, combat, and card-play spotlight entries.
  - Own stable id/semantic-key construction.
- Create `packages/engine-core/src/spotlight/public-pending-identity.ts`
  - Own deterministic `PublicPendingDecisionId` construction from final decision anchor event ids.
- Modify `packages/engine-core/src/action-results.ts`
  - Add `appendSpotlightEntryCreatedEvent`.
- Modify `packages/engine-core/src/action-results.ts`
  - Emit resolved effect-text spotlight entries centrally from `appendEffectResolvedEvent` when `queuedEntry.presentation` exists.
- Modify replacement application modules under `packages/engine-core/src/replacement` and `packages/engine-core/src/life-trigger/actions.ts`
  - Emit resolved replacement spotlights instead of relying on `replacementApplied.presentation` reconstruction.
- Modify battle/card-play action modules that emit `attackDeclared`, `blockerActivated`, and `cardPlayed`.
  - Emit combat and no-effect played-card spotlight entries directly.
- Replace `packages/engine-core/src/view/effect-spotlight-history.ts`
  - Reduce it to a small projector from visible `spotlightEntryCreated` events.
- Modify `packages/engine-core/src/view/filter-state-for-player.ts`
  - Remove completed-frame/current-effect reconstruction and call the event-authored projector.
- Modify `packages/engine-core/src/view/filter-state-events.ts`
  - Preserve sanitized `spotlightEntryCreated` payloads in `PlayerView.events` and strip unsafe target-link cards.
- Modify `packages/client/src/react/use-effect-spotlight-playback.ts`
  - Replace reconciliation with append-only timeline snapshot handling.
- Modify `packages/client/src/react/use-effect-spotlight-display.ts`
  - Keep dwell/pinning, but rely on structured entry fields only.
- Modify `packages/client/src/react/use-effect-spotlight.ts`
  - Wire the simplified playback and display contracts.
- Modify `packages/client/src/react/use-effect-spotlight-playback.ts`
  - Accept the expanded public spotlight entry union as soon as `PlayedCardSpotlightHistoryEntry` is added.
- Modify `packages/client/src/react/MatchApp.tsx`
  - Continue using server-authored `effectSpotlightHistory` entries while preserving `presentKey` cursor seeding and the spotlight-safe current pending identity.
- Keep `packages/client/src/react/EffectSpotlight.tsx`
  - No planned visual or control redesign.

---

### Task 1: Add the Canonical Spotlight Event Contract

**Files:**

- Modify: `packages/types/src/events.ts`
- Modify: `packages/types/src/decisions.ts`
- Modify: `packages/types/src/effect-presentation.ts`
- Modify: `packages/types/src/view.ts`
- Modify: `packages/types/src/export-ownership.manifest.ts`
- Modify: `contracts/types/events.ts`
- Modify: `contracts/types/decisions.ts`
- Modify: `contracts/types/effect-presentation.ts`
- Modify: `contracts/types/view.ts`
- Modify: `packages/client/src/react/use-effect-spotlight-playback.ts`
- Modify: `packages/client/src/react/effect-spotlight-presentation.ts`
- Test: `packages/types/src/effect-presentation.test.ts`
- Test: `packages/types/src/view.test.ts`
- Test: `packages/types/src/export-cohesion.test.ts`

- [ ] **Step 1: Write the failing payload contract test**

In `packages/types/src/effect-presentation.test.ts`, add a test that constructs:

- an `EffectTextSpotlightHistoryEntry`
- a `PlayedCardSpotlightHistoryEntry`
- a `CombatSpotlightHistoryEntry`
- three `SpotlightEntryCreatedPayload` values
- a full typed `SpotlightEntryCreatedEngineEvent`
- a `PublicPendingDecisionId` used by both `PublicPendingDecision.spotlightPendingId` and a pending spotlight entry

The effect-text payload should include:

```ts
{
  entry: {
    id: "spotlight:event:1:effect",
    key: "spotlight:event:1:effect",
    semanticKey: "effect|spotlight:event:1:0|span:body:draw",
    mode: "resolved",
    status: "resolved",
    active: {
      source,
      textKind: "effect",
      activeSpanIds: ["span:body:draw"],
    },
    resolvedEventId: "event:1" as EngineEventId,
    queueEntryId: "queue-entry:1" as QueueEntryId,
    effectBlockId: "effect:1" as EffectId,
  },
}
```

The combat payload should include a `kind: "combat"` entry with attacker, defender, optional powers, and `resolvedEventId`.

The played-card payload should include a `kind: "playedCard"` entry:

```ts
{
  entry: {
    kind: "playedCard",
    id: "spotlight:event:played:card",
    key: "spotlight:event:played:card",
    semanticKey: "playedCard|spotlight:event:played",
    mode: "resolved",
    status: "resolved",
    source,
    resolvedEventId: "event:played" as EngineEventId,
  },
}
```

Expected failure before implementation: `SpotlightEntryCreatedPayload` and `SpotlightEntryCreatedEngineEvent` do not exist or `EngineEventType` rejects `spotlightEntryCreated`.

- [ ] **Step 2: Add the public payload type**

In `packages/types/src/decisions.ts`, add:

```ts
export type PublicPendingDecisionId = string & {
  readonly __brand: "PublicPendingDecisionId";
};
```

In `packages/types/src/effect-presentation.ts`, add:

```ts
export type SpotlightDisclosureVisibility =
  | { readonly type: "public" }
  | { readonly type: "private"; readonly playerId: PlayerId };

export interface SpotlightTargetLinkDisclosure {
  readonly spanId: EffectTextSpanId;
  readonly relation: EffectTextTargetLink["relation"];
  readonly cardInstanceId: InstanceId;
  readonly visibility: SpotlightDisclosureVisibility;
}

export interface SpotlightEntryCardRefDisclosure {
  readonly role:
    | "effectSource"
    | "playedCardSource"
    | "combatAttacker"
    | "combatDefender";
  readonly cardInstanceId: InstanceId;
  readonly visibility: SpotlightDisclosureVisibility;
}

export interface SpotlightEntryDisclosure {
  readonly entryRefs?: readonly SpotlightEntryCardRefDisclosure[];
  readonly targetLinks?: readonly SpotlightTargetLinkDisclosure[];
}

export interface PlayedCardSpotlightHistoryEntry extends EffectSpotlightHistoryEntryBase {
  readonly kind: "playedCard";
  readonly source: CardRef;
  readonly resolvedEventId: EngineEventId;
}

export interface SpotlightEntryCreatedPayload {
  readonly entry: EffectSpotlightHistoryEntry;
  readonly disclosure?: SpotlightEntryDisclosure;
}
```

Update `EffectTextSpotlightHistoryEntry.pendingDecisionId` to use `PublicPendingDecisionId`, and update `EffectSpotlightHistoryEntry` so it includes `PlayedCardSpotlightHistoryEntry`.

In `packages/types/src/view.ts`, add `spotlightPendingId: PublicPendingDecisionId` to the base `PublicDecision` interface. `PublicPendingDecision` is the exported union/alias of public decision variants, so every variant exposed through `PlayerView.pendingDecision` must carry this field. Keep `PublicDecision.id: DecisionId` for the existing action-response protocol, but document and test that spotlight code uses `spotlightPendingId`.

`SpotlightEntryDisclosure` is raw-journal metadata used only to sanitize historical spotlight card refs with event-time disclosure evidence. It covers entry-defining refs (`active.source`, played-card `source`, combat attacker/defender) and target-link refs. `toPlayerEventForView` must not copy `disclosure` into `PlayerView.events` or `PlayerView.effectSpotlightHistory`.

Public DTO rule:

- `pendingDecisionId`, `queueEntryId`, and `effectBlockId` remain optional on public entry types.
- Sanitized public entries must be valid without raw queue/effect/private decision metadata.
- `pendingDecisionId`, when present on a public spotlight entry, is a `PublicPendingDecisionId` equal to the visible `PublicDecision.spotlightPendingId`, never raw `DecisionId`.
- Add a type test that constructs an effect-text spotlight entry without `pendingDecisionId`, `queueEntryId`, or `effectBlockId` and confirms it is assignable to `EffectSpotlightHistoryEntry`.
- Add a view type test that constructs a `PublicPendingDecision` with both `id` and `spotlightPendingId`, then constructs a pending spotlight entry whose `pendingDecisionId` equals `spotlightPendingId`.

Do not rename `EffectSpotlightHistory` in this task. Existing client and view code still use that public field.

- [ ] **Step 3: Add minimal client union support**

Update client spotlight playback/presentation types so the expanded `EffectSpotlightHistoryEntry` union is typecheckable before any engine emits `kind: "playedCard"` entries:

- `EffectSpotlightActiveSourceInput` must accept `PlayedCardSpotlightHistoryEntry`.
- playback may store and cursor over played-card entries without special semantics.
- presentation mapping may return a simple card-play fallback presentation for `kind: "playedCard"` or defer visual detail to Task 9, but it must not reject the entry type.

This is only type compatibility. Do not redesign playback behavior in this task.

- [ ] **Step 4: Register the public type export owner**

In `packages/types/src/export-ownership.manifest.ts`, add:

```ts
  PublicPendingDecisionId: "TYP-001A",
  SpotlightEntryCreatedPayload: "TYP-002A",
```

`packages/types/src/index.ts` already re-exports `effect-presentation.ts`; no new index export should be necessary.

- [ ] **Step 5: Add the typed event shape**

In `packages/types/src/events.ts`, add `"spotlightEntryCreated"` to `EngineEventType` and wire the payload type explicitly.

Required shape:

```ts
import type { SpotlightEntryCreatedPayload } from "./effect-presentation.js";

export type SpotlightEntryCreatedEngineEvent = EngineEvent & {
  readonly type: "spotlightEntryCreated";
  readonly payload: SpotlightEntryCreatedPayload;
};
```

If the repo has or gains an event payload map/discriminated union, add `spotlightEntryCreated: SpotlightEntryCreatedPayload` there as well.

In `packages/types/src/export-ownership.manifest.ts`, register:

```ts
  SpotlightEntryCreatedEngineEvent: "TYP-001C",
```

- [ ] **Step 6: Sync contracts**

Run:

```powershell
corepack pnpm run types:sync:write
```

Expected: `contracts/types/events.ts`, `contracts/types/decisions.ts`, `contracts/types/effect-presentation.ts`, and `contracts/types/view.ts` update to match package types. If additional contract files update, inspect them and keep only legitimate type-sync changes.

- [ ] **Step 7: Verify the contract slice**

Run:

```powershell
corepack pnpm exec vitest run packages/types/src/effect-presentation.test.ts packages/types/src/view.test.ts packages/types/src/export-cohesion.test.ts
corepack pnpm exec tsc -p packages/types/tsconfig.json --noEmit
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
corepack pnpm run types:sync:check
```

Expected: tests pass and type-sync check exits 0.

- [ ] **Step 8: Commit the contract slice**

Run:

```powershell
git status --short
git add packages/types/src/events.ts packages/types/src/decisions.ts packages/types/src/effect-presentation.ts packages/types/src/view.ts packages/types/src/effect-presentation.test.ts packages/types/src/view.test.ts packages/types/src/export-ownership.manifest.ts contracts/types/events.ts contracts/types/decisions.ts contracts/types/effect-presentation.ts contracts/types/view.ts packages/client/src/react/use-effect-spotlight-playback.ts packages/client/src/react/effect-spotlight-presentation.ts
git commit -m "Add spotlight entry event contract"
```

---

### Task 2: Add Engine Spotlight Entry Builders and Append Helper

**Files:**

- Create: `packages/engine-core/src/spotlight/spotlight-entry.ts`
- Modify: `packages/engine-core/src/action-results.ts`
- Test: `packages/engine-core/src/spotlight/spotlight-entry.test.ts`

- [ ] **Step 1: Write failing builder tests**

Create `packages/engine-core/src/spotlight/spotlight-entry.test.ts` with tests for:

- `effectTextSpotlightEntry` builds a resolved effect entry with stable `id`, `key`, `semanticKey`, `active`, `resolvedEventId`, `queueEntryId`, and `effectBlockId`.
- `pendingEffectTextSpotlightEntry` builds a live pending entry with public `pendingDecisionId: PublicPendingDecisionId`, a final decision/gameplay anchor event id for `id`/`key` construction, and no `resolvedEventId`.
- `combatSpotlightEntry` builds attack and blocker entries with `kind: "combat"`.
- `playedCardSpotlightEntry` builds a no-effect card-play entry with `kind: "playedCard"` and no `active` presentation.
- disclosure helpers capture only event-time visibility evidence needed for later sanitization of entry-defining card refs and target links, and do not copy hidden target signatures, candidate counts, private zone positions, or full hidden card payloads.
- Raw engine journal entries may use engine-only disambiguators, including source instance identity, because the canonical event journal is not the public DTO.
- Public/sanitized DTO semantic-key behavior is tested in Task 7 with the sanitizer, not in this raw builder task.

Do not include target-link card identities, private card ids, private instance ids, private candidate counts, or hidden target signatures in `semanticKey`. Target-link details belong in `active.targetLinks` and are redacted per recipient in `toAllowedSpotlightEntryCreatedPayload`; semantic keys exposed to clients must remain recipient-safe after redaction.

- [ ] **Step 2: Add spotlight entry builders**

Create `packages/engine-core/src/spotlight/spotlight-entry.ts`.

Required exported APIs:

```ts
export const effectTextSpotlightEntry = (...): EffectTextSpotlightHistoryEntry;
export const pendingEffectTextSpotlightEntry = (...): EffectTextSpotlightHistoryEntry;
export const combatSpotlightEntry = (...): CombatSpotlightHistoryEntry;
export const playedCardSpotlightEntry = (...): PlayedCardSpotlightHistoryEntry;
```

Use named parameter objects, not positional strings. Keep helper internals private.

Builder rules:

- Internal effect-text `semanticKey` begins with `effect|`.
- Internal combat `semanticKey` begins with `combat|`.
- Internal played-card `semanticKey` begins with `playedCard|`.
- Played-card entries are identified by `kind: "playedCard"`, not by `activeSpanIds: []`, `semanticKey`, or key prefix.
- Resolved raw `id` and `key` are deterministic from the gameplay anchor event context supplied by the caller, plus span or kind detail.
- Pending entries include `pendingDecisionId` only as `PublicPendingDecisionId`; raw and sanitized pending `id`, `key`, and `semanticKey` must derive from a final visible decision/gameplay anchor event id plus span detail, not from raw `PendingDecision.id`.
- Resolved entries include `resolvedEventId`.
- No builder should inspect full card text or parser rule names.
- Builders do not decide hidden-info visibility by themselves. Callers choose event visibility based on whether the spotlight moment's existence and source are public. Public spotlight moments may include target links that are private to some recipients; those details are sanitized per recipient by `toAllowedSpotlightEntryCreatedPayload` rather than forcing the whole event private.
- Builders or adjacent helpers may construct `SpotlightEntryDisclosure` for entry-defining card refs and target links, but only from explicit event-time visibility evidence supplied by the emitter.

- [ ] **Step 3: Add append helper**

In `packages/engine-core/src/action-results.ts`, add:

```ts
export const appendSpotlightEntryCreatedEvent = (
  state: GameState,
  events: EngineEvent[],
  entry: EffectSpotlightHistoryEntry,
  options: {
    readonly causedBy?: EngineEvent["causedBy"] | undefined;
    readonly disclosure?: SpotlightEntryDisclosure | undefined;
    readonly visibility: EngineEvent["visibility"];
  },
): SpotlightEntryCreatedEngineEvent => { ... };
```

Implementation requirements:

- Construct a typed `SpotlightEntryCreatedPayload` local value:

```ts
const payload: SpotlightEntryCreatedPayload = options.disclosure
  ? { entry, disclosure: options.disclosure }
  : { entry };
```

- Call `appendEvent(state, events, "spotlightEntryCreated", payload, options.visibility)`.
- Do not provide a default visibility. Every spotlight append call must make visibility explicit.
- Because `appendEvent` returns `void`, read `events.at(-1)` after appending, narrow it to `SpotlightEntryCreatedEngineEvent`, and throw if it is unexpectedly undefined or has the wrong event type.
- If `options.causedBy` is supplied, set `created.causedBy = options.causedBy`.
- If `options.causedBy` is not supplied, delete `created.causedBy` so the spotlight event does not inherit `appendEvent`'s default `{ type: "ruleProcess", name: "turnFlow" }`.
- Return the newly appended event.
- Do not derive `causedBy` by parsing `entry.id`, `entry.key`, or `entry.resolvedEventId`.
- Builder callers must pass an anchor event id into entry builders when ids should refer to the gameplay event that caused the spotlight. The builders must not depend on the not-yet-created `spotlightEntryCreated` event id.
- Add helper tests proving supplied causality is preserved and omitted causality stays absent.
- Add helper tests proving supplied `disclosure` is stored in the raw `spotlightEntryCreated` payload and omitted when not supplied.
- Add a source-scan or type-level helper test proving no `appendSpotlightEntryCreatedEvent` call can omit `visibility`.

- [ ] **Step 4: Make spotlight anchors rebase-aware**

Current engine flows use `rebaseEvents` when composing local event arrays into the final journal. Spotlight entries must never retain pre-rebase gameplay event ids in `entry.resolvedEventId`, sanitized `id`, sanitized `key`, or sanitized `semanticKey`.

Choose one implementation path and test it at the helper/builder level in this slice:

- Prefer building spotlight entries after the gameplay event has its final id.
- If a flow must build spotlight entries before final event ids are known, add a companion helper that rebases spotlight payload references when `rebaseEvents` remaps gameplay event ids.

Required tests:

- builder calls using a final anchor id place that final id in raw resolved entries.
- if a rebase helper is needed, it remaps `entry.resolvedEventId` and any raw `id`/`key`/`semanticKey` anchor components from a synthetic pre-rebase id to a final id.
- pending builder calls using a final decision anchor id derive public `pendingDecisionId`, raw `id`, `key`, and `semanticKey` from that final anchor, not from raw `PendingDecision.id`.

Concrete runtime-flow regressions belong with the first slices that emit those entries:

- Task 3 covers a rebased resolved-effect runtime flow where `entry.resolvedEventId` equals the final `effectResolved` id in `state.eventJournal`.
- Task 4 covers a rebased replacement subflow where `entry.resolvedEventId` equals the final `replacementApplied` id.
- Task 5 covers a rebased pending-decision flow where pending `id`, `key`, and `semanticKey` derive from the final `decisionCreated` anchor.
- Task 6 covers a rebased card-play/setup flow where `entry.resolvedEventId` equals the final `cardPlayed` id.
- Task 7 covers sanitized `id`, `key`, and `semanticKey` derivation from final visible event ids, not temporary pre-rebase ids.

- [ ] **Step 5: Verify the builder/helper slice**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/spotlight/spotlight-entry.test.ts
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected: tests pass and engine-core typecheck exits 0.

- [ ] **Step 6: Commit the builder/helper slice**

Run:

```powershell
git status --short
git add packages/engine-core/src/spotlight/spotlight-entry.ts packages/engine-core/src/spotlight/spotlight-entry.test.ts packages/engine-core/src/action-results.ts
git commit -m "Add engine spotlight entry builders"
```

---

### Task 3: Emit Authored Resolved Effect Spotlights

**Files:**

- Modify: `packages/engine-core/src/action-results.ts`
- Inspect and modify resolved-effect call sites found by `rg appendEffectResolvedEvent` when they only propagate the first appended event.
- Test: `packages/engine-core/src/effect-runtime-queue/entry-resolution.test.ts`
- Test: `packages/engine-core/src/effect-runtime-queue/target-decisions.test.ts`
- Test: `packages/engine-core/src/effect-runtime-sequence/frame-events.test.ts`
- Test: `packages/engine-core/src/effect-runtime-top-deck-placement.test.ts`
- Test: `packages/engine-core/src/runtime/failed-condition-presentation.test.ts`
- Test: `packages/engine-core/src/view/effect-spotlight-history.test.ts`
- Test: `packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts`
- Test: `packages/engine-core/src/view/filter-state-for-player-events.test.ts`

- [ ] **Step 0: Make `spotlightEntryCreated` presentation-only before first emission**

Before enabling any production runtime path to emit `spotlightEntryCreated`, inspect production event handling:

```powershell
rg -n "EngineEventType|event\\.type|switch \\(event\\.type\\)|event-history|eventHistory|triggerEventId|matchEventTrigger|replay|reduce" packages/engine-core/src
```

Update any exhaustive event handlers, replay reducers, event-history predicates, or trigger matchers so `spotlightEntryCreated` is explicitly ignored as gameplay input.

Add minimal regressions before later emission tasks:

- `packages/engine-core/src/runtime/event-hooks/matcher.test.ts`: `spotlightEntryCreated` does not match trigger hooks.
- `packages/engine-core/src/runtime/conditions/field-count.test.ts`: `spotlightEntryCreated` does not satisfy event-history predicates.
- `packages/engine-core/src/event-sequencing-regression.test.ts`: filtering out spotlight events leaves gameplay-event subsequence order unchanged, and no trigger anchors point at `spotlightEntryCreated`.
- a replay/state-reduction regression proving replaying a journal with `spotlightEntryCreated` events produces the same gameplay state as replaying the same journal with those events filtered out.

Add every production file changed by this inspection to this task's commit.

- [ ] **Step 1: Add failing resolved-effect event tests**

Add a test that runs a real effect sequence and asserts `state.eventJournal` contains one `spotlightEntryCreated` event per user-facing resolved effect step.

For search flow, assert the event order includes:

```ts
[
  ["effectResolved", "..."],
  ["spotlightEntryCreated", ["span:search:selection"]],
  ["spotlightEntryCreated", ["span:search:remaining"]],
];
```

Add a no-target-link regression: resolved spotlight entries for target effects must include target links in the initial `spotlightEntryCreated` payload. This is the test that lets us delete client replacement replay.

- [ ] **Step 2: Split active spans before event creation**

Move the current resolved span splitting rule out of `view/effect-spotlight-history.ts` and into spotlight entry creation.

Use a named helper in `spotlight-entry.ts`, for example:

```ts
export const splitEffectTextSpotlightPresentation = (
  active: ActiveEffectTextPresentation,
): readonly ActiveEffectTextPresentation[];
```

It must cover current supported span families:

- `span:sequence:*`
- `span:search:*`, excluding `span:search:then`
- `span:cost*`
- `span:body` and `span:body:*`
- `span:choice:N:*`, where `N` is a choice index

This is still a runtime presentation rule, but it now executes at authored-entry creation time instead of in view filtering.

- [ ] **Step 3: Emit from `appendEffectResolvedEvent` centrally**

Keep `appendEffectResolvedEvent` responsible for the ordinary `effectResolved` event and make it the default owner of resolved effect spotlight emission. Add authored spotlight emission immediately after the resolved event is appended when `queuedEntry.presentation` is defined and has spotlightable active spans.

Implementation shape:

- Change `appendEffectResolvedEvent` to return the original `effectResolved` gameplay event. Existing callers may ignore the return value.
- Capture the `effectResolved` event immediately after it is appended and before any `spotlightEntryCreated` events are appended.
- Never return, anchor, or derive gameplay causality from the later `spotlightEntryCreated` event.
- Build one spotlight entry per split active presentation.
- Append `spotlightEntryCreated` for each entry.
- Attach `SpotlightEntryDisclosure.entryRefs` for the effect source and `targetLinks` for target-link cards using event-time visibility evidence from the resolved effect context.
- Use public visibility when the resolved effect spotlight's existence and source are public. If target links include chooser-only or private card refs, keep the public spotlight entry and let `toPlayerEventForView(state, event, { playerId, visiblePublicPendingDecisionId })` redact target-link cards per recipient. Use private event visibility only when the spotlight's existence or source is private.
- Set causality to `{ type: "effect", queueEntryId: queuedEntry.id, effectId: queuedEntry.effectBlockId }`.
- Add a unit test proving `appendEffectResolvedEvent` returns the `effectResolved` event even when it also appends following `spotlightEntryCreated` events.

- [ ] **Step 4: Propagate all appended spotlight events from resolved-effect call sites**

Run:

```powershell
rg -n "appendEffectResolvedEvent\\(" packages/engine-core/src
rg -n "events\\[0\\]|resolvedEvents\\[0\\]|events\\.at\\(-1\\)|last event|lastEvent" packages/engine-core/src/effect-runtime-queue packages/engine-core/src/effect-runtime-sequence packages/engine-core/src/runtime packages/engine-core/src/effect-runtime*.ts
```

For every caller, verify whether it appends into a local array and later propagates only `resolvedEvents[0]`, `events[0]`, `events.at(-1)`, `lastEvent`, or a single `effectResolved` event. Update those call sites to propagate the full event list while preserving the original `effectResolved` event as the gameplay anchor for queueing, trigger ids, sequencing, and assertions.

Known areas to inspect and cover:

- `packages/engine-core/src/effect-runtime-queue/entry-resolution.ts`
- `packages/engine-core/src/effect-runtime-queue/target-decisions.ts`
- `packages/engine-core/src/effect-runtime-sequence/frame-events.ts`
- `packages/engine-core/src/effect-runtime-top-deck-placement.ts`
- `packages/engine-core/src/runtime/failed-condition-presentation.ts`
- `packages/engine-core/src/effect-runtime-play-source-overflow-resume.ts`
- `packages/engine-core/src/effect-runtime-activate-referenced-effect.ts`

For any caller that uses `rebaseEvents`, ensure spotlight entries are built after rebasing or remapped so `entry.resolvedEventId` points at the final `effectResolved` id.

Add focused tests proving authored `spotlightEntryCreated` events reach `state.eventJournal` or returned `EngineResult.events` in at least:

- queue entry resolution
- target decisions
- completed sequence/frame events
- top-deck placement
- failed-condition presentation

- [ ] **Step 5: Confirm presentation-only regressions still hold with resolved emissions**

After resolved-effect spotlights emit in real flows, rerun the presentation-only regressions from Step 0 and add any missing assertions showing trigger ids, queue anchors, and sequencing still anchor to `effectResolved`, not the following `spotlightEntryCreated` event.

- [ ] **Step 6: Preserve condition-failed spotlights**

The existing code has condition-failed presentation paths. Add a focused test for a failed conditional sequence segment and assert it emits a spotlight event for the failed condition highlight.

Use the existing test area:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-draw-trash-sequence.test.ts
```

- [ ] **Step 7: Verify resolved-effect emission**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts packages/engine-core/src/effect-runtime-draw-trash-sequence.test.ts packages/engine-core/src/effect-runtime-queue/entry-resolution.test.ts packages/engine-core/src/effect-runtime-queue/target-decisions.test.ts packages/engine-core/src/effect-runtime-sequence/frame-events.test.ts packages/engine-core/src/effect-runtime-top-deck-placement.test.ts packages/engine-core/src/runtime/failed-condition-presentation.test.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts packages/engine-core/src/runtime/conditions/field-count.test.ts packages/engine-core/src/event-sequencing-regression.test.ts packages/engine-core/src/view/filter-state-for-player-events.test.ts
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected: tests pass. Any old tests expecting spotlight history to be reconstructed from `effectResolved.presentation` should be updated to expect `spotlightEntryCreated`.

- [ ] **Step 8: Commit the resolved-effect slice**

Run:

```powershell
git status --short
git add packages/engine-core/src/action-results.ts packages/engine-core/src/spotlight/spotlight-entry.ts packages/engine-core/src/spotlight/spotlight-entry.test.ts packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts packages/engine-core/src/effect-runtime-draw-trash-sequence.test.ts packages/engine-core/src/effect-runtime-queue/entry-resolution.test.ts packages/engine-core/src/effect-runtime-queue/target-decisions.test.ts packages/engine-core/src/effect-runtime-sequence/frame-events.test.ts packages/engine-core/src/effect-runtime-top-deck-placement.test.ts packages/engine-core/src/runtime/failed-condition-presentation.test.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts packages/engine-core/src/runtime/conditions/field-count.test.ts packages/engine-core/src/event-sequencing-regression.test.ts packages/engine-core/src/view/filter-state-for-player-events.test.ts
git commit -m "Emit authored resolved effect spotlights"
```

Before committing, inspect `git status --short` and stage any production resolved-effect call-site files changed by the propagation/rebase audit. Do not commit only tests plus `action-results.ts` if the audit required call-site changes.

---

### Task 4: Emit Authored Replacement Applied Spotlights

**Files:**

- Modify: `packages/engine-core/src/replacement/owner-deck-bottom-decision.ts`
- Modify: `packages/engine-core/src/replacement/pay-cost-actions.ts`
- Modify: `packages/engine-core/src/replacement/trash-from-hand-actions.ts`
- Modify: `packages/engine-core/src/replacement/rest-target-decision.ts`
- Modify: `packages/engine-core/src/replacement/field-removal-process/accepted.ts`
- Modify: `packages/engine-core/src/life-trigger/actions.ts`
- Test: `packages/engine-core/src/effect-runtime-replacement-application.test.ts`
- Test: focused replacement tests under `packages/engine-core/src/replacement`
- Test: `packages/engine-core/src/view/filter-state-for-player-events.test.ts`

- [ ] **Step 1: Add failing authored replacement tests**

Add tests proving each replacement application path that currently appends `replacementApplied` with a `presentation` also appends a `spotlightEntryCreated` event when the presentation has spotlightable active spans.

Minimum coverage:

- owner deck-bottom replacement
- pay-cost replacement
- trash-from-hand replacement
- rest-target replacement
- field-removal accepted replacement
- life-trigger replacement application

For each covered path, assert:

- `replacementApplied` still exists for gameplay audit/history.
- a following `spotlightEntryCreated` entry exists with `mode: "resolved"` and `status: "resolved"`.
- the spotlight event has `causedBy: { type: "replacement", replacementId }` when a replacement id exists.
- visibility is public when the replacement spotlight's existence and source are public; private target-link details are redacted per recipient.
- disclosure captures event-time visibility for the replacement effect source and target-link cards, so a historical replacement spotlight remains visible to recipients who could see it when authored even if cards move later.

Before moving past this step, append the exact replacement path inventory and focused test file for each emitting path to this task section. The verification command in Step 5 must include every newly named focused replacement test file.

Task 4 implementation inventory:

- `packages/engine-core/src/replacement/field-removal-process/accepted.ts`: emits presentation-bearing direct accepted field-removal replacements; focused coverage in `packages/engine-core/src/effect-runtime-replacement-application.test.ts`.
- `packages/engine-core/src/replacement/owner-deck-bottom-decision.ts`: emits from pending owner deck-bottom replacement decisions when pending payload carries presentation; covered through the shared replacement spotlight helper and replacement runtime verification.
- `packages/engine-core/src/replacement/pay-cost-actions.ts`: emits from pending pay-cost replacement decisions when pending payload carries presentation; covered through the shared replacement spotlight helper and replacement runtime verification.
- `packages/engine-core/src/replacement/trash-from-hand-actions.ts`: emits from pending trash-from-hand replacement decisions when pending payload carries presentation; covered through the shared replacement spotlight helper and replacement runtime verification.
- `packages/engine-core/src/replacement/rest-target-decision.ts`: emits from pending rest-target replacement decisions when pending payload carries presentation; covered through the shared replacement spotlight helper and replacement runtime verification.
- `packages/engine-core/src/life-trigger/actions.ts`: calls the replacement spotlight helper for the life-rule replacement path, but the current `replacementApplied` payload has no effect-text presentation source, so no authored spotlight is emitted until that path supplies presentation.

- [ ] **Step 2: Add a replacement spotlight emission helper**

In a replacement-local helper or `packages/engine-core/src/spotlight/spotlight-entry.ts`, add a function that takes:

```ts
{
  replacementAppliedEvent,
  presentation,
  replacementId,
  visibility,
}
```

and appends authored effect-text spotlight entries using the same split helper used by resolved effect spotlights.

Do not create a new `spotlightEntryUpdated` event for replacements. If target links are not known when `replacementApplied` is emitted, fix the replacement emitter so the authored entry has the final target links at creation time. Do not mark the whole event private just because some target-link details are private; only use private event visibility when the replacement spotlight's existence or source is private.

The helper must attach `SpotlightEntryDisclosure.entryRefs` for the effect source and `targetLinks` for target-link cards from the replacement's event-time visibility evidence.

- [ ] **Step 3: Emit from replacement application sites**

Before editing, search touched replacement modules for single-event propagation assumptions:

```powershell
rg -n "events\\[0\\]|resolvedEvents\\[0\\]|events\\.at\\(-1\\)|last event|lastEvent" packages/engine-core/src/replacement packages/engine-core/src/life-trigger/actions.ts
```

When a replacement path appends spotlight events into a local event array, propagate the full array while preserving the original `replacementApplied` event as the replacement audit/gameplay anchor.

Update the concrete `replacementApplied` emitters:

- `packages/engine-core/src/replacement/owner-deck-bottom-decision.ts`
- `packages/engine-core/src/replacement/pay-cost-actions.ts`
- `packages/engine-core/src/replacement/trash-from-hand-actions.ts`
- `packages/engine-core/src/replacement/rest-target-decision.ts`
- `packages/engine-core/src/replacement/field-removal-process/accepted.ts`
- `packages/engine-core/src/life-trigger/actions.ts`

After appending `replacementApplied`, append authored spotlight entries from the same presentation data. Do not rely on view code to inspect `replacementApplied.presentation`.

For replacement paths that use local arrays or rebased subflows, ensure `entry.resolvedEventId` points at the final `replacementApplied` event id after rebasing.

- [ ] **Step 4: Preserve hidden-info boundaries**

For private replacement decisions, add tests asserting the owner sees the spotlight and the opponent does not. For public replacement moments with private target details, add tests asserting both players see the spotlight, while only the recipient allowed to see the linked cards receives those target links.

- [ ] **Step 5: Verify replacement spotlight emission**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-replacement-application.test.ts packages/engine-core/src/replacement/field-removal-runtime.test.ts packages/engine-core/src/replacement/field-removal-rest-self-runtime.test.ts packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts packages/engine-core/src/replacement/field-removal-target-life-runtime.test.ts packages/engine-core/src/view/filter-state-for-player-events.test.ts
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected: tests pass and every resolved replacement highlight comes from `spotlightEntryCreated`.

- [ ] **Step 6: Commit the replacement slice**

Run:

```powershell
git status --short
git add packages/engine-core/src/replacement/owner-deck-bottom-decision.ts packages/engine-core/src/replacement/pay-cost-actions.ts packages/engine-core/src/replacement/trash-from-hand-actions.ts packages/engine-core/src/replacement/rest-target-decision.ts packages/engine-core/src/replacement/field-removal-process/accepted.ts packages/engine-core/src/life-trigger/actions.ts packages/engine-core/src/spotlight/spotlight-entry.ts packages/engine-core/src/effect-runtime-replacement-application.test.ts packages/engine-core/src/view/filter-state-for-player-events.test.ts
git commit -m "Emit authored replacement spotlights"
```

If additional focused replacement test files changed, stage only those exact files after inspecting `git status --short`.

---

### Task 5: Emit Authored Pending Decision Spotlights

**Files:**

- Modify concrete decision creation paths identified by the inventory step below.
- Create: `packages/engine-core/src/spotlight/public-pending-identity.ts`
- Modify: `packages/engine-core/src/view/public-decision-source.ts`
- Modify: `packages/engine-core/src/view/filter-state-for-player.ts`
- Test: `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`
- Test: `packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts`
- Test: `packages/engine-core/src/runtime/optional-activation/activate-main-presentation.test.ts`

- [ ] **Step 1: Inventory pending decision creation paths**

Run:

```powershell
rg -n "decisionCreated|pendingDecision:" packages/engine-core/src/runtime packages/engine-core/src/effect-runtime-sequence packages/engine-core/src/replacement packages/engine-core/src/effect-runtime*.ts packages/engine-core/src/play-card packages/engine-core/src/battle
```

Create a concrete checklist from the result before editing. At minimum, inspect these known decision families:

- `packages/engine-core/src/effect-runtime-sequence/frame-decisions.ts`
- `packages/engine-core/src/effect-runtime-sequence/remainder.ts`
- `packages/engine-core/src/effect-runtime-sequence/selected-segments.ts`
- `packages/engine-core/src/effect-runtime-sequence/select-targets.ts`
- `packages/engine-core/src/effect-runtime-sequence/target-decisions.ts`
- `packages/engine-core/src/effect-runtime-sequence/quantity-decisions.ts`
- `packages/engine-core/src/effect-runtime-sequence/life-state.ts`
- `packages/engine-core/src/effect-runtime-hand-selection.ts`
- `packages/engine-core/src/effect-runtime-top-deck-placement.ts`
- `packages/engine-core/src/effect-runtime-trigger-order-decision.ts`
- `packages/engine-core/src/effect-runtime-queue/choice-decisions.ts`
- `packages/engine-core/src/effect-runtime-queue/target-decisions.ts`
- `packages/engine-core/src/runtime/primitives/trash-from-hand.ts`
- `packages/engine-core/src/runtime/primitives/damage.ts`
- `packages/engine-core/src/replacement/field-removal-process/pause.ts`
- `packages/engine-core/src/replacement/field-removal-process/accepted.ts`

Before implementing this task, write the concrete inventory back into this plan as a checked sub-list under this step. Each decision family must be marked either:

- `emits spotlight via shared helper`, with a focused test named; or
- `no spotlight`, with a gameplay reason.

Do not proceed to Task 7 until every inventoried pending decision family has an entry in that sub-list and verification either includes one test per emitting family or a source-scan/assertion proving the shared helper covers it.

Before moving past this step, append the dynamically discovered decision-family checklist and exact focused test file for each emitting family to this task section. The verification command in Step 5 must include every newly named focused test file.

Task 5 implementation inventory:

- [x] `effect-runtime-queue/choice-decisions.ts` choose optional activation and choose quantity: emits pending spotlight via `appendPendingSpotlightEntryCreatedEvents` when the queued entry has presentation. Focused tests: `packages/engine-core/src/runtime/optional-activation/activate-main-presentation.test.ts`, `packages/engine-core/src/spotlight/public-pending-identity.test.ts`.
- [x] `effect-runtime-queue/target-decisions.ts` direct queued select-target prompts: emits pending spotlight from the queued entry presentation. Focused tests: `packages/engine-core/src/view/filter-state-effect-presentation.test.ts` for public pending-id redaction and authored event sanitization.
- [x] `effect-runtime-sequence/frame-decisions.ts` optional activation, optional/pay cost, return-DON, and choose-effect-option prompts: emits pending spotlight with runtime-selected spans. Focused tests: `packages/engine-core/src/runtime/optional-activation/activate-main-presentation.test.ts`.
- [x] `effect-runtime-sequence/select-targets.ts` and `effect-runtime-sequence/target-decisions.ts` sequence select-target prompts: emits pending spotlight using segment/index runtime evidence. Focused tests: `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`.
- [x] `effect-runtime-sequence/selected-segments.ts` and `effect-runtime-sequence/remainder.ts` search selection and remainder/order prompts: emits authored pending selection and remaining entries without replay duplication. Focused test: `packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts`.
- [x] `effect-runtime-sequence/quantity-decisions.ts`, `effect-runtime.ts`, `effect-runtime-hand-selection.ts`, `effect-runtime-top-deck-placement.ts`, `effect-runtime-sequence/life-state.ts`, and `runtime/primitives/trash-from-hand.ts`: emits pending spotlight from the effect entry presentation when present and always anchors `decisionAnchorEventId`. Focused test/source-scan: `packages/engine-core/src/spotlight/pending-spotlight-emission-source.test.ts` proves these decision creators call the shared helper; existing per-module suites continue to cover behavior.
- [x] `replacement/field-removal-process/accepted.ts`: emits pending spotlight from replacement presentation payloads for replacement pay-cost, trash-from-hand, owner deck-bottom, and rest-target sub-decisions. Focused test: `packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts`.
- [x] `replacement/field-removal-process/pause.ts`: anchors choose-replacement decisions; no spotlight emitted because the choose-replacement prompt has option labels but no active effect-text span evidence. Focused test: `packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts`.
- [x] `effect-runtime-trigger-order-decision.ts`: anchors trigger-order decisions; no spotlight emitted because the prompt orders queued triggers rather than a specific effect-text span. Focused test/source-scan: `packages/engine-core/src/spotlight/pending-spotlight-emission-source.test.ts`.
- [x] Battle, counter, damage, and play-card payment/placement decision families: no spotlight in this slice because these are combat/payment/placement system prompts without active effect-text presentation ownership. They keep existing view behavior and will be revisited by Task 6 for combat/card-play authored entries where applicable.
- [x] `view/filter-state-events.ts` and `view/effect-spotlight-history.ts`: player event sanitization keeps public pending spotlight entries but removes `pendingDecisionId` for non-acting players; spotlight history consumes authored live `spotlightEntryCreated` events and suppresses stale reconstructed duplicates. Focused tests: `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`, `packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts`.

- [ ] **Step 2: Add failing pending spotlight tests**

Add tests proving:

- A select-cards decision caused by an effect emits exactly one live pending `spotlightEntryCreated` entry.
- The pending entry active spans match the decision-specific active spans.
- Pending entry `pendingDecisionId`, `id`, `key`, and `semanticKey` derive from the final `decisionCreated` gameplay anchor event id, not from raw `PendingDecision.id` or a pre-rebase local event id.
- A rebased pending-decision flow still produces pending `pendingDecisionId`, `id`, `key`, and `semanticKey` values derived from the final `decisionCreated` id in `state.eventJournal`.
- The visible `PlayerView.pendingDecision.spotlightPendingId` equals the sanitized pending spotlight entry `pendingDecisionId`.
- A public-visible pending spotlight seen by the non-acting player omits `pendingDecisionId`, while the acting player's view includes `pendingDecisionId` equal to `pendingDecision.spotlightPendingId`.
- Search lifecycle creates selection/resolved and remainder/pending entries without duplicate selection replay.
- Optional activation prompts keep their current active effect text behavior but also have an authored pending spotlight entry.
- Replacement decisions that currently use `activeEffectTextPresentationFromPayloadValue` emit one pending spotlight event visible only to the appropriate player when the decision is private.
- Pending selection decisions with chooser-only candidates do not create public target links for the opponent.

- [ ] **Step 3: Add a decision spotlight emission helper**

Before editing, search touched decision modules for single-event propagation assumptions:

```powershell
rg -n "events\\[0\\]|resolvedEvents\\[0\\]|events\\.at\\(-1\\)|last event|lastEvent" packages/engine-core/src/runtime packages/engine-core/src/effect-runtime-sequence packages/engine-core/src/replacement packages/engine-core/src/effect-runtime*.ts packages/engine-core/src/play-card packages/engine-core/src/battle
```

When a decision path appends spotlight events into a local event array, propagate the full array while preserving the original `decisionCreated` event as the decision/audit anchor.

Create `packages/engine-core/src/spotlight/public-pending-identity.ts` with:

```ts
export const publicPendingDecisionIdForAnchor = ({
  decisionAnchorEventId,
  playerId,
}: {
  readonly decisionAnchorEventId: EngineEventId;
  readonly playerId: PlayerId;
}): PublicPendingDecisionId => { ... };
```

Use the helper in both pending spotlight emission and `toPublicDecision`. Do not duplicate string construction at call sites. If the final `decisionCreated` anchor is not already present on the pending-decision model, either store it there when the decision is created or pass it into `toPublicDecision` through a named context object; do not recover it by scanning unrelated event history.

Create or extend a helper that takes:

```ts
{
  state,
  events,
  pendingDecision,
  decisionAnchorEventId,
  recipientPlayerId,
  activeEffectText,
  visibility,
}
```

and appends a live `spotlightEntryCreated` event when `activeEffectText.activeSpanIds.length > 0`.

`decisionAnchorEventId` must be the final visible gameplay anchor for the decision, normally the finalized `decisionCreated` event id. `recipientPlayerId` must be the decision owner/recipient player, usually `pendingDecision.playerId`. The helper must derive one `PublicPendingDecisionId` with `publicPendingDecisionIdForAnchor({ decisionAnchorEventId, playerId: recipientPlayerId })` and use that value as the live spotlight entry `pendingDecisionId`. `toPublicDecision` must use the same helper and same final anchor to populate `spotlightPendingId` for that same recipient. If the decision path builds local event arrays before `rebaseEvents`, either call this helper after rebasing or remap the pending spotlight identity fields during the same rebase pass. Do not derive pending spotlight `pendingDecisionId`, `id`, `key`, or `semanticKey` from raw `PendingDecision.id`.

Do not make `filter-state-for-player` inspect `state.pendingDecision` to create spotlight entries.

Visibility rule:

- If the pending decision's existence and source are public, emit a public spotlight entry and let player-event sanitization redact target-link details per recipient.
- If the pending decision's existence or source is private to the acting player, emit a private spotlight entry for that player.
- If spotlight existence/source visibility cannot be proven from the decision data, do not emit a public spotlight entry.

- [ ] **Step 4: Move pending active-span narrowing to runtime entry creation**

`publicDecisionActiveEffectTextFromEffectQueue` may continue to populate `pendingDecision.presentation.activeEffectText` for public UI details, but it must stop being the source used by spotlight history.

Implementation rule:

- The same runtime evidence that creates or resumes the pending decision must choose the pending spotlight active spans.
- View helpers may redact or format decision presentation, but may not change spotlight timeline semantics.

- [ ] **Step 5: Verify pending decision emission**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts packages/engine-core/src/runtime/optional-activation/activate-main-presentation.test.ts packages/engine-core/src/replacement/presentation-payload.test.ts packages/engine-core/src/spotlight/public-pending-identity.test.ts packages/engine-core/src/spotlight/pending-spotlight-emission-source.test.ts packages/engine-core/src/replacement/field-removal-return-don-runtime.test.ts
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected: tests pass and no assertion depends on reconstructed live spotlight history from `activeEffectText`.

- [ ] **Step 6: Commit the pending-decision slice**

Run:

```powershell
git status --short
git commit -m "Emit authored pending decision spotlights"
```

Before committing, stage only the pending-decision files identified in Step 1, `packages/engine-core/src/spotlight/public-pending-identity.ts`, `packages/engine-core/src/view/filter-state-for-player.ts`, and their focused tests after inspecting `git status --short`. Do not use `git add packages/engine-core/src`.
If Step 1 updated this plan with the pending-decision checklist, also stage `docs/superpowers/plans/2026-06-22-spotlight-v2-engine-authored-timeline.md`.

---

### Task 6: Emit Authored Combat and Card-Play Spotlights

**Files:**

- Modify: `packages/engine-core/src/battle/actions.ts`
- Modify: `packages/engine-core/src/battle/block-actions.ts`
- Modify centralized post-card-play/rule-processing code under `packages/engine-core/src/play-card`
- Test: `packages/engine-core/src/view/effect-spotlight-history.test.ts`
- Test: `packages/engine-core/src/battle/actions.test.ts`
- Test: `packages/engine-core/src/battle/blocker-flow.test.ts`
- Test: `packages/engine-core/src/play-card/on-play-runtime.test.ts`
- Test: `packages/engine-core/src/play-card/stage-replacement.test.ts`
- Test: `packages/engine-core/src/play-card/character-overflow.test.ts`
- Test: `packages/engine-core/src/play-card/event.test.ts`
- Test: `packages/client/src/react/effect-spotlight-presentation.test.ts`

- [ ] **Step 1: Add failing authored combat tests**

Add engine tests proving:

- Declaring an attack appends an `attackDeclared` event and exactly one following `spotlightEntryCreated` combat entry.
- Activating blocker appends a `blockerActivated` event and exactly one following `spotlightEntryCreated` combat entry.
- Combat entries carry attacker/defender refs and current public power labels when those values are available.
- Non-public malformed combat payloads are no longer relevant to spotlight history because the view never reconstructs combat entries from raw combat events.

- [ ] **Step 2: Add failing authored card-play tests**

Add engine tests proving:

- Playing a character or stage with no queued effect emits one no-highlight card-play spotlight entry.
- Playing a card that queues an effect does not emit the no-effect played-card spotlight.
- Unsupported or failed-closed effect admission does not masquerade as a no-effect card-play spotlight unless the engine confirms no effect was queued and no supported effect attempted to resolve.
- Declining an optional activation does not produce a phantom resolved effect spotlight.

- [ ] **Step 3: Emit combat spotlights at battle action source**

Before editing combat paths, search touched modules for single-event propagation assumptions:

```powershell
rg -n "events\\[0\\]|events\\.at\\(-1\\)|last event|lastEvent" packages/engine-core/src/battle
```

In the same module that appends `attackDeclared`, append `spotlightEntryCreated` using `combatSpotlightEntry`.

In the blocker action path, append `spotlightEntryCreated` using `combatSpotlightEntry`.

Do not reconstruct combat entries in `view/effect-spotlight-history.ts`.

Combat spotlight entries must use `resolvedEventId` pointing to the `attackDeclared` or `blockerActivated` event. Their `causedBy`/anchor data must never point at the following `spotlightEntryCreated` event.

Combat spotlight events must attach `SpotlightEntryDisclosure.entryRefs` for attacker and defender visibility at event time, so historical combat spotlights remain visible to allowed recipients after later card movement.

- [ ] **Step 4: Emit card-play no-effect spotlights after queueing outcome is known**

Card-play spotlight logic must be based on actual queueing outcome, not later view inference and not every raw `cardPlayed` emitter.

Use or create a centralized post-card-play/rule-processing helper in the `packages/engine-core/src/play-card` flow that receives:

- the played card/source
- the resulting events
- the effect queue state before and after rule processing
- an explicit effect admission outcome such as `queuedEffectCount`, `supportedEffectAttempted`, and `failedClosedEffectAttempted`
- the card category

Implementation rule:

- If card play creates at least one effect queue entry for that source, do not emit a no-effect played-card spotlight.
- If card play creates no effect queue entry and the played card is a character or stage, emit one played-card spotlight entry.
- Event-card activation and other non-character/stage `cardPlayed` emitters must not get a no-effect played-card spotlight through copy-pasted local logic.
- Do not suppress or create this spotlight by scanning later `effectQueued` events in view code.
- Unsupported or failed-closed effect evidence suppresses the played-card no-effect spotlight through the explicit admission outcome. Only true no-effect character/stage plays get `kind: "playedCard"`.
- Played-card spotlight entries must use `resolvedEventId` pointing to the `cardPlayed` event. Their `causedBy`/anchor data must never point at the following `spotlightEntryCreated` event.
- Played-card spotlight events must attach `SpotlightEntryDisclosure.entryRefs` for the played card source at event time, so historical played-card spotlights remain visible to allowed recipients after the card later moves.
- For card-play/setup flows that use local arrays or `rebaseEvents`, ensure `entry.resolvedEventId` points at the final `cardPlayed` event id after rebasing.

Before editing play-card paths, search touched modules for single-event propagation assumptions:

```powershell
rg -n "events\\[0\\]|events\\.at\\(-1\\)|last event|lastEvent" packages/engine-core/src/play-card
```

- [ ] **Step 5: Verify combat/card-play emission**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/battle/actions.test.ts packages/engine-core/src/battle/blocker-flow.test.ts packages/engine-core/src/play-card/on-play-runtime.test.ts packages/engine-core/src/play-card/stage-replacement.test.ts packages/engine-core/src/play-card/character-overflow.test.ts packages/engine-core/src/play-card/event.test.ts packages/client/src/react/effect-spotlight-presentation.test.ts
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected: tests pass and authored spotlight events exist in event journals.

- [ ] **Step 6: Commit the combat/card-play slice**

Run:

```powershell
git status --short
git add packages/engine-core/src/battle/actions.ts packages/engine-core/src/battle/block-actions.ts packages/engine-core/src/battle/actions.test.ts packages/engine-core/src/battle/blocker-flow.test.ts packages/engine-core/src/play-card/on-play-runtime.test.ts packages/engine-core/src/play-card/stage-replacement.test.ts packages/engine-core/src/play-card/character-overflow.test.ts packages/engine-core/src/play-card/event.test.ts packages/client/src/react/effect-spotlight-presentation.test.ts
git commit -m "Emit authored combat and card play spotlights"
```

If a play-card helper or production file changed, stage only that exact file after inspecting `git status --short`.

---

### Task 7: Replace View Reconstruction With Event Filtering

**Files:**

- Replace: `packages/engine-core/src/view/effect-spotlight-history.ts`
- Create: `packages/engine-core/src/view/card-ref-visibility.ts`
- Modify: `packages/engine-core/src/view/filter-state-for-player.ts`
- Modify: `packages/engine-core/src/view/filter-state-events.ts`
- Test: `packages/engine-core/src/view/effect-spotlight-history.test.ts`
- Test: `packages/engine-core/src/view/filter-state-effect-presentation.test.ts`
- Test: `packages/engine-core/src/view/filter-state-for-player-events.test.ts`
- Test: `packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts`

- [ ] **Step 1: Add failing view-filter tests**

Rewrite `packages/engine-core/src/view/effect-spotlight-history.test.ts` around `spotlightEntryCreated` events.

Required tests:

- Projects ordered entries from visible `spotlightEntryCreated` events.
- Sets `presentKey` to the last visible spotlight entry key.
- Skips malformed payloads.
- Skips events hidden from the current player because `filter-state-for-player` passes only visible events.
- Does not create entries from `effectResolved`, `replacementApplied`, `cardPlayed`, `attackDeclared`, or `blockerActivated` when no `spotlightEntryCreated` event exists.
- Does not inspect `activeEffectText` or `pendingDecisionId`.

Also add `filter-state-for-player-events.test.ts` cases proving `toPlayerEventForView`:

- preserves a safe `spotlightEntryCreated` payload with an effect-text entry.
- preserves a safe `spotlightEntryCreated` payload with a combat entry.
- strips malformed spotlight payloads to `{}`.
- strips source, combat, played-card, and target-link card refs that are not visible to the receiving player through current `GameState` visibility or event-time `SpotlightEntryDisclosure`.
- does not leak private search candidates, private hand cards, or face-down life refs through public spotlight events.
- recomputes sanitized `id`, `key`, and `semanticKey` from recipient-safe fields after redaction.
- never exposes raw private ids, hidden signatures, candidate counts, or target-link metadata through `id`, `key`, or `semanticKey`.
- does not expose private spotlight events to the wrong player.
- stores raw `SpotlightEntryDisclosure` on the journal event, uses it to preserve event-time-visible entry-defining refs and target links after cards move or reveal records are cleaned up, and strips `disclosure` from both `PlayerView.events` and `PlayerView.effectSpotlightHistory`.
- redacts raw `PendingDecision.id` from spotlight payloads while preserving current pending pinning through `PlayerView.pendingDecision.spotlightPendingId`.

- [ ] **Step 2: Add player-aware card-ref visibility**

Create `packages/engine-core/src/view/card-ref-visibility.ts` and move the reusable card-ref visibility logic out of `filter-state-for-player.ts`.

Required API:

```ts
export interface LocatedVisibleCard {
  readonly card: CardInstance;
  readonly playerId: PlayerId;
}

export const visibleCardsForPlayer = (
  state: GameState,
  playerId: PlayerId,
): readonly LocatedVisibleCard[] => { ... };

export const isCardRefVisibleToPlayer = (
  state: GameState,
  playerId: PlayerId,
  ref: CardRef,
): boolean => { ... };

export const isSpotlightCardRefVisibleToPlayer = (
  state: GameState,
  playerId: PlayerId,
  ref: CardRef,
  role:
    | SpotlightEntryCardRefDisclosure["role"]
    | { readonly type: "targetLink"; readonly spanId: EffectTextSpanId; readonly relation: EffectTextTargetLink["relation"] },
  disclosure: SpotlightEntryDisclosure | undefined,
): boolean => { ... };
```

Visibility definition:

- a player's own hand, trash, board, cost area, leader, stage, and face-up life are visible to that player.
- the opponent's trash, board, cost area, leader, stage, and face-up life are visible to that player.
- cards in `state.revealedCards` are visible when their reveal record visibility is public or private to the receiving player.
- setup-start pseudo-reveal behavior must match the cards exposed through `PlayerView.revealedCards`.
- spotlight entry-defining refs (`active.source`, played-card `source`, combat attacker/defender) and target-link cards may remain visible through `SpotlightEntryDisclosure` captured when the spotlight event was authored, even after the card moves or the reveal record is cleaned up.
- face-down life, deck, hidden reveal candidates, and opponent hand cards are not visible unless a reveal/public view surface already makes the exact card visible to that player.

Add tests for:

- a revealed deck card that is not in a static public zone but is visible through a reveal record.
- a previously revealed search card that later moves to hand, bottom, or trash and remains visible in spotlight history when `SpotlightEntryDisclosure` says it was public or private to that recipient at event time.
- a visible effect source, played-card source, and combat attacker/defender that later move to a hidden/currently non-visible zone but remain visible in historical spotlight entries only for recipients allowed by event-time `SpotlightEntryDisclosure`.
- a face-down life card that remains hidden when no visible reveal record exists.
- a setup-start revealed candidate that remains visible to the setup player and hidden from the opponent.

Update `filter-state-for-player.ts` to import these helpers instead of owning local copies.

- [ ] **Step 3: Add spotlight payload sanitization**

Change `toPlayerEventForView` to accept the receiving player:

```ts
export const toPlayerEventForView = (
  state: GameState,
  event: EngineEvent,
  context: {
    readonly playerId: PlayerId;
    readonly visiblePublicPendingDecisionId?: PublicPendingDecisionId | undefined;
  },
): EngineEvent => { ... };
```

Update all callers and tests for the new signature. `filterStateForPlayer` already computes `pendingDecision`; pass `pendingDecision?.spotlightPendingId` as `visiblePublicPendingDecisionId`. If another caller cannot supply this context, it must derive visible public pending identity through a named helper before preserving any spotlight `pendingDecisionId`.

In `packages/engine-core/src/view/filter-state-events.ts`, add a `toAllowedSpotlightEntryCreatedPayload(state, event, context)` helper that:

- reads only `payload.entry` and optional `payload.disclosure` from the raw event payload; ignore all other spotlight payload fields.
- accepts effect-text entries only when their `active` presentation passes the same safe presentation rules used for `effectResolved` and `replacementApplied`, and `active.source` is visible to `playerId` through current state visibility or event-time `SpotlightEntryDisclosure` role `"effectSource"`.
- rebuilds `active.targetLinks` from an allowlist: `spanId`, `relation`, and visible `cards` only.
- drops hidden target-link metadata such as signatures, candidate counts, hidden zone positions, original target-link ids, original target-link keys, and any unknown fields.
- keeps only target-link cards visible to `playerId` through current state visibility or event-time `SpotlightEntryDisclosure`; drops a target link entirely when no linked cards remain.
- accepts played-card entries only when `kind === "playedCard"` and `source` is visible to `playerId` through current state visibility or event-time `SpotlightEntryDisclosure` role `"playedCardSource"`.
- accepts combat entries only when attacker and defender refs are visible to `playerId` through current state visibility or event-time `SpotlightEntryDisclosure` roles `"combatAttacker"` and `"combatDefender"`.
- preserves `mode`, `status`, `kind`, and `resolvedEventId` only when those fields have the expected primitive shapes and are recipient-safe.
- preserves `pendingDecisionId` only when it equals `context.visiblePublicPendingDecisionId`; otherwise omit it. Do not remap raw `PendingDecision.id` inside the sanitizer.
- omits raw `queueEntryId` and `effectBlockId` from sanitized `PlayerView.events` and `effectSpotlightHistory` unless a focused test proves a specific value is public-safe and needed by the client.
- recomputes sanitized `id` and `key` from the Spotlight Identity Matrix above. Pending entries stay based on the final `decisionCreated` anchor and sanitized split/active ordinal; resolved entries use their visible gameplay anchor when safe and fall back to the visible `spotlightEntryCreated` event id only when the gameplay anchor is not public-safe. Do not pass through authored `id` or `key` values that may encode source instance ids, private decision ids, queue ids, target signatures, candidate counts, or hidden details.
- recomputes `semanticKey` from the sanitized entry using the Spotlight Identity Matrix before returning the payload. Do not pass through an authored `semanticKey` that may encode hidden target-link cards, private card ids, private instance ids, candidate counts, or hidden signatures.
- strips raw `disclosure` metadata from the returned player event payload.
- returns `{}` for malformed entries.

Then update `toAllowedPlayerEventPayload` so `event.type === "spotlightEntryCreated"` returns the sanitized payload instead of `{}`.

- [ ] **Step 4: Replace the projector implementation**

Reduce `packages/engine-core/src/view/effect-spotlight-history.ts` to:

```ts
export const effectSpotlightHistoryFromPlayerViewState = ({
  events,
}: {
  readonly events: readonly EngineEvent[];
}): EffectSpotlightHistory | undefined => { ... };
```

Implementation requirements:

- Iterate sanitized player events in order. Do not consume raw `visibleEvents` directly.
- Accept only `event.type === "spotlightEntryCreated"`.
- Validate `payload.entry` structurally enough to avoid crashing on malformed event payloads.
- Return `{ entries, presentKey }` when at least one entry exists.
- Return `undefined` when no valid visible spotlight entries exist.

Delete these responsibilities from the file:

- active effect text validation for non-event state
- resolved span splitting
- combat reconstruction from raw combat events
- played-card reconstruction from raw card-play events
- no-effect decision suppression
- completed-frame merging
- live duplicate matching
- current-effect matching
- `completed-frame:` and key-prefix logic

- [ ] **Step 5: Simplify `filter-state-for-player.ts`**

Remove:

- `entryWithCompletedSequencePresentation` import
- `sequenceEffectBlockForEntry` import
- `CompletedEffectTextSpotlight` and `CurrentEffectTextSpotlight` imports
- `completedEffectTextsForCurrentFrame`
- `currentEffectResolvedEventIds`
- `currentEffectTextSpotlight`
- the `activeEffectText`, `completedEffectTexts`, `currentEffectText`, and `pendingDecisionId` arguments to `effectSpotlightHistoryFromPlayerViewState`

Keep `activeEffectText` on `PlayerView` for the pending decision presentation until a later UI cleanup removes it. Ensure `toPublicDecision` populates `spotlightPendingId` from the same final decision anchor used by pending spotlight emission.

Update `filterStateForPlayer` to call `toPlayerEventForView(state, event, { playerId, visiblePublicPendingDecisionId: pendingDecision?.spotlightPendingId })` and pass the resulting `events` into `effectSpotlightHistoryFromPlayerViewState`, not raw `visibleEvents`, so history is built from the same sanitized player-event payloads exposed in `PlayerView.events`.

- [ ] **Step 6: Verify view filtering**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/engine-core/src/view/filter-state-for-player-events.test.ts packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected: tests pass and engine-core typecheck exits 0.

- [ ] **Step 7: Commit the view-filter slice**

Run:

```powershell
git status --short
git add packages/engine-core/src/view/effect-spotlight-history.ts packages/engine-core/src/view/filter-state-for-player.ts packages/engine-core/src/view/filter-state-events.ts packages/engine-core/src/view/card-ref-visibility.ts packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/engine-core/src/view/filter-state-for-player-events.test.ts packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts
git commit -m "Project spotlight history from authored events"
```

---

### Task 8: Simplify Client Playback Around Ordered Timeline Entries

**Files:**

- Modify: `packages/client/src/react/use-effect-spotlight-playback.ts`
- Modify: `packages/client/src/react/use-effect-spotlight-playback.test.ts`
- Modify: `packages/client/src/react/use-effect-spotlight.test.ts`
- Modify: `packages/client/src/react/use-effect-spotlight-search.test.ts`
- Modify: `packages/client/src/react/use-effect-spotlight-auto-advance.test.ts`
- Modify: `packages/client/src/react/use-effect-spotlight-pause.test.ts`

- [ ] **Step 1: Add failing no-replay playback tests**

Add tests proving:

- Receiving the same timeline snapshot twice does not append or replay entries.
- Receiving a same-key entry with different target links is treated as the same authored timeline entry and does not advance, replay, or become a supported semantic update path.
- A new appended authored entry is the only thing that advances visible playback.
- Catch-up goes to the current pending entry if present, otherwise to empty visible state.
- Pending catch-up/pinning matches `entry.pendingDecisionId` to public `pendingDecision.spotlightPendingId`, and does not match raw `pendingDecision.id`.
- Rewind from empty goes to the latest authored entry.
- Search selection and search remainder remain two authored entries in order, not one entry replaced by another.

- [ ] **Step 2: Remove replacement replay logic**

In `packages/client/src/react/use-effect-spotlight-playback.ts`, delete:

- `targetLinkSignature`
- `shouldReplayServerTimelineReplacement`
- `replacementReplayIndex`
- `isCompletedFrameProjection`
- completed-frame special cases in `serverTimelineKeepsEntry`

The reducer may dedupe existing entries by `key` or `id`, but it must not treat changed entry contents as a playback event. `semanticKey` is opaque metadata for diagnostics and grouping; it is not playback or display identity.

- [ ] **Step 3: Normalize source input to the shared history entry type**

Change playback input types so `EffectSpotlightActiveSourceInput` is exactly `EffectSpotlightHistoryEntry`.

Combat and effect-text display branching should use `entry.kind === "combat"` rather than parallel client-local interfaces.

- [ ] **Step 4: Verify client playback**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight-playback.test.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/use-effect-spotlight-search.test.ts packages/client/src/react/use-effect-spotlight-auto-advance.test.ts packages/client/src/react/use-effect-spotlight-pause.test.ts
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
```

Expected: tests pass and client typecheck exits 0.

- [ ] **Step 5: Commit the playback slice**

Run:

```powershell
git status --short
git add packages/client/src/react/use-effect-spotlight-playback.ts packages/client/src/react/use-effect-spotlight-playback.test.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/use-effect-spotlight-search.test.ts packages/client/src/react/use-effect-spotlight-auto-advance.test.ts packages/client/src/react/use-effect-spotlight-pause.test.ts
git commit -m "Simplify spotlight playback for authored timeline"
```

---

### Task 9: Keep Display and Renderer on Structured Entries Only

**Files:**

- Modify: `packages/client/src/react/use-effect-spotlight-display.ts`
- Modify: `packages/client/src/react/effect-spotlight-presentation.ts`
- Modify: `packages/client/src/react/effect-spotlight-presentation.test.ts`
- Modify: `packages/client/src/react/use-effect-spotlight-display.test.ts`
- Modify: `packages/client/src/react/effect-spotlight.test.ts`

- [ ] **Step 1: Add failing display/presentation tests**

Add tests proving:

- Pending pinning uses public `entry.pendingDecisionId` matched against `pendingDecision.spotlightPendingId`, not raw `pendingDecision.id` or key prefix parsing.
- Combat rendering uses `CombatSpotlightHistoryEntry`.
- Effect-text rendering uses `EffectTextSpotlightHistoryEntry`.
- Played-card rendering uses `PlayedCardSpotlightHistoryEntry` with `kind: "playedCard"` and renders the card-play fallback without relying on empty active spans.
- Timer/dwell behavior does not depend on `semanticKey` changes.

- [ ] **Step 2: Remove remaining key-prefix semantics**

Search the client:

```powershell
rg -n "completed-frame|decision:|pending:|targetLinkSignature|replacementReplay" packages/client/src
rg -n "semanticKey" packages/client/src
```

Allowed remaining uses:

- `semanticKey` may be carried as opaque metadata and asserted in tests, but it must not drive playback cursor, display dwell, pinning, or highlight selection.
- public `pendingDecisionId` to `spotlightPendingId` matching is allowed.
- UI labels and CSS class names containing "spotlight" are allowed.

Remove key-prefix logic from display and presentation modules.

- [ ] **Step 3: Verify renderer-focused tests**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/use-effect-spotlight-display.test.ts packages/client/src/react/effect-spotlight-presentation.test.ts packages/client/src/react/effect-spotlight.test.ts
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
```

Expected: tests pass.

- [ ] **Step 4: Commit the display slice**

Run:

```powershell
git status --short
git add packages/client/src/react/use-effect-spotlight-display.ts packages/client/src/react/effect-spotlight-presentation.ts packages/client/src/react/effect-spotlight-presentation.test.ts packages/client/src/react/use-effect-spotlight-display.test.ts packages/client/src/react/effect-spotlight.test.ts
git commit -m "Use structured spotlight entries in display"
```

---

### Task 10: Delete Legacy Reconstruction and Fallback Surfaces

**Files:**

- Delete or keep deleted: `packages/client/src/react/effect-spotlight-source.ts`
- Delete or keep deleted: `packages/client/src/react/effect-spotlight-source.test.ts`
- Modify: `packages/client/src/react/MatchApp.tsx`
- Modify: `packages/client/src/react/playmat-structure.test.ts`
- Modify: `packages/engine-core/src/view/effect-spotlight-history.ts`
- Modify tests that still reference legacy fallback behavior.

- [ ] **Step 1: Add source-scan regression tests**

In `packages/client/src/react/playmat-structure.test.ts` or a new focused source test, assert:

- `MatchApp.tsx` does not import `effect-spotlight-source`.
- `MatchApp.tsx` passes `effectSpotlightHistory.entries` as the only active source list to `useEffectSpotlight`.
- `MatchApp.tsx` preserves `initialCursorKey: effectSpotlightHistory?.presentKey`.
- `MatchApp.tsx` passes `pendingDecision?.spotlightPendingId` to `useEffectSpotlight` for pinning and does not pass raw `pendingDecision.id`.
- no client file references `activeEffectTextSourcesForSpotlight`.

In `packages/engine-core/src/view/effect-spotlight-history.test.ts`, assert the projector does not create history from raw `effectResolved` or `attackDeclared` fixtures.

- [ ] **Step 2: Remove legacy imports and deleted-file references**

Keep the current deletion of:

- `packages/client/src/react/effect-spotlight-source.ts`
- `packages/client/src/react/effect-spotlight-source.test.ts`

Remove any test commands, structure assertions, or imports that still expect those files.

- [ ] **Step 3: Source-scan for old reconstruction concepts**

Run:

```powershell
rg -n "activeEffectTextSourcesForSpotlight|effect-spotlight-source|completed-frame|currentEffectTextSpotlight|completedEffectTextsForCurrentFrame|replacementReplay|shouldReplayServerTimelineReplacement|playedCardEntryForEvent|combatEntryForEvent|resolvedEntriesForEvent" packages
```

Expected: no production references. Test references are allowed only when asserting the old names are absent from source text.

- [ ] **Step 4: Verify legacy deletion**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/playmat-structure.test.ts packages/engine-core/src/view/effect-spotlight-history.test.ts
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
```

Expected: tests pass and typechecks exit 0.

- [ ] **Step 5: Commit the deletion slice**

Run:

```powershell
git status --short
git add packages/client/src/react/MatchApp.tsx packages/client/src/react/playmat-structure.test.ts packages/engine-core/src/view/effect-spotlight-history.ts packages/engine-core/src/view/effect-spotlight-history.test.ts
git add -u packages/client/src/react/effect-spotlight-source.ts packages/client/src/react/effect-spotlight-source.test.ts
git commit -m "Remove legacy spotlight reconstruction"
```

---

### Task 11: End-to-End Regression Coverage

**Files:**

- Modify or add tests in `packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts`
- Modify or add tests in combat/card-play action test files touched earlier.
- Modify or add tests in `packages/engine-core/src/runtime/event-hooks/matcher.test.ts`
- Inspect and modify if needed: `packages/engine-core/src/runtime/event-hooks/matcher.ts`
- Modify or add tests in `packages/engine-core/src/runtime/conditions/field-count.test.ts`
- Inspect and modify if needed: `packages/engine-core/src/runtime/conditions/field-count.ts`
- Modify or add tests in `packages/engine-core/src/event-sequencing-regression.test.ts`
- Inspect replay/reducer/event-history production modules found by the source scan in Step 4.
- Modify: `packages/client/src/react/use-effect-spotlight-playback.test.ts`
- Modify: `packages/client/src/react/use-effect-spotlight.test.ts`

- [ ] **Step 1: Cover the three reported bug classes**

Add or update tests named around the reported failures:

- `does not replay a consumed spotlight when target links are present on the authored entry`
- `highlights the authored active spans for search selection and search remainder`
- `projects a spotlight entry for every authored effect step`
- `projects a spotlight entry for every authored replacement-applied step`
- `does not create duplicate combat spotlight entries`
- `does not miss private-to-owner replacement decision spotlight entries`

- [ ] **Step 2: Cover refresh/reconnect behavior**

Add a client hook test where initial `effectSpotlightHistory.entries` has multiple authored entries and `presentKey` points to the last entry.

Assert:

- initial cursor starts at `presentKey`
- rewind can go back
- catch-up returns to pending if pending exists, otherwise hides the card while controls remain
- pending catch-up/pinning still works when raw `pendingDecision.id` differs from sanitized `pendingDecision.spotlightPendingId`

- [ ] **Step 3: Cover hidden-info boundaries**

Add or update engine view tests:

- private search candidates do not leak through spotlight target links to the opponent
- private card ids, private instance ids, private decision ids, private queue ids, private candidate counts, and hidden target signatures do not appear anywhere in serialized `PlayerView.events` or `PlayerView.effectSpotlightHistory`, including `id`, `key`, `semanticKey`, payload fields, and target links
- historical effect-source, played-card-source, and combat attacker/defender refs remain visible only to recipients allowed by event-time disclosure after those cards later move to hidden/currently non-visible zones
- private replacement decisions produce owner-visible entries only
- public combat entries remain visible to both players

- [ ] **Step 4: Prove spotlight events are presentation-only**

Repeat the production handling audit from Task 3 after all emission slices are complete:

```powershell
rg -n "EngineEventType|event\\.type|switch \\(event\\.type\\)|event-history|eventHistory|triggerEventId|matchEventTrigger|replay|reduce" packages/engine-core/src
```

Update any exhaustive event handlers, replay reducers, event-history predicates, or trigger matchers missed by the earlier audit so `spotlightEntryCreated` is explicitly ignored as gameplay input. Add every production file changed by this inspection to this task's commit.

Add focused engine regressions proving `spotlightEntryCreated` events:

- do not match trigger hooks in `packages/engine-core/src/runtime/event-hooks/matcher.test.ts`
- do not satisfy event-history predicates in `packages/engine-core/src/runtime/conditions/field-count.test.ts`
- do not change `triggerEventId` anchors or relative ordering for adjacent gameplay events in `packages/engine-core/src/event-sequencing-regression.test.ts`
- are no-ops for replay/state reduction: replaying a journal with `spotlightEntryCreated` events produces the same gameplay state as replaying the same journal with those events filtered out.

- [ ] **Step 5: Verify focused regression suites**

Run:

```powershell
corepack pnpm exec vitest run packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts packages/engine-core/src/effect-runtime-replacement-application.test.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts packages/engine-core/src/runtime/conditions/field-count.test.ts packages/engine-core/src/event-sequencing-regression.test.ts packages/client/src/react/use-effect-spotlight-playback.test.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/use-effect-spotlight-search.test.ts packages/client/src/react/effect-spotlight-presentation.test.ts
```

Expected: tests pass.

- [ ] **Step 6: Commit regression coverage**

Run:

```powershell
git status --short
git add packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts packages/engine-core/src/effect-runtime-replacement-application.test.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts packages/engine-core/src/runtime/conditions/field-count.test.ts packages/engine-core/src/event-sequencing-regression.test.ts packages/client/src/react/use-effect-spotlight-playback.test.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/use-effect-spotlight-search.test.ts packages/client/src/react/effect-spotlight-presentation.test.ts
git commit -m "Cover authored spotlight regressions"
```

Before committing, stage only the exact regression test files changed in this task after inspecting `git status --short`; adjust the `git add` list if the source audit found additional production files or focused regression files.

---

### Task 12: Final Verification

**Files:**

- No production edits expected.

- [ ] **Step 1: Run targeted Spotlight V2 checks**

Run:

```powershell
corepack pnpm exec vitest run packages/types/src/effect-presentation.test.ts packages/types/src/view.test.ts packages/types/src/export-cohesion.test.ts packages/engine-core/src/spotlight/spotlight-entry.test.ts packages/engine-core/src/view/effect-spotlight-history.test.ts packages/engine-core/src/view/filter-state-effect-presentation.test.ts packages/engine-core/src/view/filter-state-for-player-events.test.ts packages/engine-core/src/effect-runtime-sequence/sequence-select-card-actions.test.ts packages/engine-core/src/effect-runtime-replacement-application.test.ts packages/engine-core/src/runtime/event-hooks/matcher.test.ts packages/engine-core/src/runtime/conditions/field-count.test.ts packages/engine-core/src/event-sequencing-regression.test.ts packages/client/src/react/use-effect-spotlight-playback.test.ts packages/client/src/react/use-effect-spotlight-display.test.ts packages/client/src/react/use-effect-spotlight-search.test.ts packages/client/src/react/use-effect-spotlight-auto-advance.test.ts packages/client/src/react/use-effect-spotlight-pause.test.ts packages/client/src/react/use-effect-spotlight.test.ts packages/client/src/react/effect-spotlight-presentation.test.ts packages/client/src/react/effect-spotlight.test.ts packages/client/src/react/playmat-structure.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 2: Run strict package typechecks**

Run:

```powershell
corepack pnpm exec tsc -p packages/types/tsconfig.json --noEmit
corepack pnpm exec tsc -p packages/engine-core/tsconfig.json --noEmit
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
corepack pnpm run types:sync:check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run broad verification unless infeasible**

Run:

```powershell
corepack pnpm run test
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run coverage
corepack pnpm run verify
```

Expected: all commands exit 0. If a command is infeasible in the environment, record the exact skipped command and the reason.

- [ ] **Step 4: Inspect final diff for architecture drift**

Run:

```powershell
git status --short
rg -n "activeEffectTextSourcesForSpotlight|effect-spotlight-source|completed-frame|replacementReplay|shouldReplayServerTimelineReplacement|playedCardEntryForEvent|combatEntryForEvent|resolvedEntriesForEvent|currentEffectTextSpotlight|completedEffectTextsForCurrentFrame|semanticKeyForActive|liveEntryKey|pendingEntryId|matchingResolvedEntryKeySinceLastQueue|matchingResolvedEntryKeyForCurrentEffect" packages
rg -n "effectResolved\\.presentation|replacementApplied\\.presentation" packages/engine-core/src packages/client/src
rg -n "completed-frame|decision:|pending:|targetLinkSignature|replacementReplay|semanticKey" packages/client/src
```

Expected:

- worktree is clean after commits, or only intentional files remain
- source scan has no production references to old reconstruction concepts
- any remaining references are source-scan tests that assert those names are absent
- client `semanticKey` references are limited to opaque pass-through, sanitized data fixtures, or tests proving it does not drive playback/display identity

---

## Acceptance Criteria

- Every displayed spotlight entry in `PlayerView.effectSpotlightHistory.entries` comes from a visible `spotlightEntryCreated` event.
- No player view code creates spotlight entries from raw effect, decision, combat, or card-play events.
- No client code reconstructs spotlight sources from `activeEffectText`, `pendingDecision`, or raw player events.
- No client playback code replays an already consumed entry because target links or replacement data changed.
- Search selection and search remainder are authored as distinct timeline entries in the intended order.
- Replacement-applied highlights are authored as `spotlightEntryCreated` events and are not reconstructed from `replacementApplied.presentation`.
- Combat attack and blocker moments are authored as combat spotlight entries exactly once.
- Played character/stage spotlights exist when no effect queues, and are absent when an effect queues.
- Hidden/private spotlight entries follow the same visibility rules as other engine events.
- Once a spotlight entry is visible to a player at creation time, it remains historically visible to that player after later card movement, subject to sanitized payload and event-time disclosure rules.
- Existing Spotlight visual rendering and controls still work against structured effect-text, combat, and played-card entries.

## Implementation Notes

- This is a replacement plan, not a repair plan. Keep compatibility only at the public view field boundary.
- Do not remove `PlayerView.activeEffectText` in this plan. It still feeds pending decision UI presentation and can be cleaned up separately.
- Do not introduce a server-side cursor, persisted rewind state, or client command mutation for spotlight controls.
- Do not parse full printed card lines, card IDs, parser rule names, or exact span text to decide whether a card gets a spotlight.
- Keep each task shippable and verified before moving to the next one. If a task uncovers a missing runtime source for spotlight facts, add a failing test at that source before changing the architecture.
