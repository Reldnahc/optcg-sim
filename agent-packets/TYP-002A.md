<!-- agent-packet:story-id TYP-002A -->
<!-- agent-packet:story-path stories/approved/TYP-002A-live-view-dto-contract-authority.yaml -->
<!-- agent-packet:story-sha256 47fb5415a0b96e4e2dd6f9362cb13775dcd90a92d7b199c6cbd3bcccffe36cbf -->

# Story Packet

## Story

Spec Version: v6
Story Schema Version: 1.0.0
ID: TYP-002A
Epic ID: M1-001
Title: Define canonical live view DTO contracts
Type: implementation
Area: contracts
Primary Concern: view

## Why

Resolve the TYP-002 public/player/spectator view DTO authority gap by adding exact canonical live-view DTO contracts for player and initial spectator views without implementing filtering behavior.

## Authoritative Spec References

- 06-visibility-security.s003 (Player zone visibility)
- 03-game-state-events-decisions.s002 (Canonical state model)
- 06-visibility-security.s004 (PlayerView shape)
- 06-visibility-security.s007 (Legal-action visibility)
- 06-visibility-security.s008 (Spectator modes)
- 06-visibility-security.s020 (Original spectator model and v2 hardening)
- 06-visibility-security.s021 (Original state-filtering categories preserved)
- 22-v6-implementation-tightening.s006 (2. TypeScript model)
- 22-v6-implementation-tightening.s014 (10. Spectator policy)

## Relevant Spec Excerpts

### 06-visibility-security.s003 (Player zone visibility)

| Zone           | Self view                        | Opponent view                    |
| -------------- | -------------------------------- | -------------------------------- |
| Deck           | Count only                       | Count only                       |
| DON!! Deck     | Count only / cosmetic art policy | Count only / cosmetic art policy |
| Hand           | Full card data                   | Count only                       |
| Trash          | Full ordered public data         | Full ordered public data         |
| Leader Area    | Full public data                 | Full public data                 |
| Character Area | Full public data                 | Full public data                 |
| Stage Area     | Full public data                 | Full public data                 |
| Cost Area      | Full public DON!! state          | Full public DON!! state          |
| Life Area      | Count + face-up cards only       | Count + face-up cards only       |
| No Zone        | Only if revealed to that player  | Only if revealed to that player  |

### 03-game-state-events-decisions.s002 (Canonical state model)

The canonical `GameState` is server-only. It includes hidden information, RNG state, internal queues, snapshots, and metadata.

**v6 contract:** the compile-ready version of every interface in this document is [`contracts/canonical-types.ts`](contracts/canonical-types.ts). Markdown snippets below are explanatory and may be abbreviated. If a snippet conflicts with the contract file, the contract file wins.

Canonical naming decisions:

| Concept                | Canonical name             |
| ---------------------- | -------------------------- |
| State sequence         | `stateSeq`                 |
| Event collection       | `eventJournal`             |
| Battle sub-state       | `battle`                   |
| Effect queue           | `effectQueue`              |
| Continuous modifiers   | `continuousEffects`        |
| Decision answer action | `Action.respondToDecision` |
| Hidden/server-only RNG | `rng`                      |

Do not use `eventLog`, `activeBattle`, raw JavaScript `Set`, or transport envelopes inside canonical state. Serializable arrays are required for deterministic hashing.

```ts
type PlayerId = string & { __brand: "PlayerId" };
type CardId = string & { __brand: "CardId" };
type InstanceId = string & { __brand: "InstanceId" };
type MatchId = string & { __brand: "MatchId" };
type EngineEventId = string & { __brand: "EngineEventId" };

interface GameState {
  matchId: MatchId;
  status: MatchStatus;
  version: RuntimeVersionSet;
  seq: StateSeq;
  actionSeq: number;
  turn: TurnState;
  players: Record<PlayerId, PlayerState>;
  timers: TimerState;
  battle?: BattleState;
  pendingDecision?: PendingDecision;
  effectQueue: EffectQueueEntry[];
  deferredTriggers: DeferredTriggerBucket[];
  continuousEffects: ContinuousEffectRecord[];
  replacementState: ReplacementProcessState[];
  revealedCards: RevealRecord[];
  rng: RngState;
  eventJournal: EngineEvent[];
  audit: AuditEntry[];
}
```

Canonical live state also carries the authoritative per-player timer snapshot used for `PlayerView` and reconnect/state-sync payloads. Do not fabricate timer values in filtered views.

The browser does not receive this object.

### 06-visibility-security.s004 (PlayerView shape)

```ts
interface PlayerView {
  matchId: MatchId;
  playerId: PlayerId;
  stateSeq: StateSeq;
  actionSeq: number;
  turn: PublicTurnState;
  self: VisiblePlayerState;
  opponent: OpponentVisibleState;
  battle?: PublicBattleState;
  pendingDecision?: PublicDecision;
  legalActions: PublicLegalAction[];
  revealedCards: PublicRevealRecord[];
  events: EngineEvent[];
  timers: PublicTimerState;
}
```

Do not include:

- Deck order.
- Opponent hand card IDs.
- Face-down life card IDs.
- RNG seed/internal state.
- Effect queue internals.
- Private decision candidates not visible to recipient.
- Internal crash/recovery metadata.

Canonical public support DTOs for the initial live view contract:

```ts
type SpectatorPolicy = {
  mode: "disabled" | "live-filtered";
  allowHandRevealAfterGame: boolean;
};

interface PublicTurnState {
  globalTurn: number;
  playerTurnCounts: Record<PlayerId, number>;
  turnPlayerId: PlayerId;
  phase: "refresh" | "draw" | "don" | "main" | "end";
  step?: BattleStep;
}

interface PublicBattleState {
  attacker: CardRef;
  originalTarget: CardRef;
  currentTarget: CardRef;
  blocker?: CardRef;
  step: BattleStep;
  damageCount: number;
}

interface PublicCardView {
  instanceId: InstanceId;
  cardId: CardId;
  owner: PlayerId;
  controller: PlayerId;
  zone: ZoneRef;
  state?: "active" | "rested";
  attachedDonCount: number;
  turnPlayed?: number;
}

interface PublicLifeView {
  count: number;
  faceUpCards: PublicCardView[];
}

interface VisiblePlayerState {
  playerId: PlayerId;
  deckCount: number;
  donDeckCount: number;
  hand: PublicCardView[];
  trash: PublicCardView[];
  leader: PublicCardView;
  characters: PublicCardView[];
  stage?: PublicCardView;
  costArea: PublicCardView[];
  life: PublicLifeView;
  hasMulliganed: boolean;
  turnCount: number;
}

interface OpponentVisibleState {
  playerId: PlayerId;
  deckCount: number;
  donDeckCount: number;
  handCount: number;
  trash: PublicCardView[];
  leader: PublicCardView;
  characters: PublicCardView[];
  stage?: PublicCardView;
  costArea: PublicCardView[];
  life: PublicLifeView;
  hasMulliganed: boolean;
  turnCount: number;
}

type SpectatorVisiblePlayerState = OpponentVisibleState;

interface PublicDecision {
  id: DecisionId;
  type: string;
  playerId: PlayerId;
  prompt: string;
  causedBy: CausalityRef;
  timeoutMs?: number;
}

type PublicLegalAction =
  | { type: "playCard"; card: CardRef; costPaymentRequired?: boolean }
  | { type: "activateEffect"; source: CardRef; effectId: EffectId }
  | { type: "attachDon"; don: CardRef; target: CardRef }
  | { type: "declareAttack"; attacker: CardRef; target: CardRef }
  | { type: "activateBlocker"; blocker: CardRef }
  | { type: "useCounter"; card: CardRef; target: CardRef }
  | { type: "endMainPhase" }
  | { type: "concede"; playerId: PlayerId }
  | { type: "respondToDecision"; decisionId: DecisionId };

interface PublicRevealRecord {
  id: string;
  cards: CardRef[];
  visibility: "public" | "privateToRecipient";
  origin: ZoneRef | "topOfDeck" | "lifeDamage" | "custom";
  createdAtStateSeq: StateSeq;
  cleanupPolicy: "returnToOrigin" | "trashAfterResolution" | "none";
}

type SpectatorRevealRecord = Omit<PublicRevealRecord, "visibility"> & {
  visibility: "public";
};

type SpectatorEvent = Omit<EngineEvent, "visibility"> & {
  visibility: { type: "public" };
};
```

Initial live-filtered spectator view is distinct from `PlayerView`:

```ts
interface SpectatorView {
  matchId: MatchId;
  stateSeq: StateSeq;
  actionSeq: number;
  spectatorPolicy: SpectatorPolicy;
  turn: PublicTurnState;
  players: Record<PlayerId, SpectatorVisiblePlayerState>;
  battle?: PublicBattleState;
  revealedCards: SpectatorRevealRecord[];
  events: SpectatorEvent[];
  timers: PublicTimerState;
}
```

Initial `SpectatorView` has no `pendingDecision` or `legalActions` field.
It does not include either player's hand card IDs, deck order, face-down life
card IDs, private reveal records, non-public events, RNG state, effect queue
internals, or audit entries. Full-information live spectating is deferred to a
future explicit policy story.

### 06-visibility-security.s007 (Legal-action visibility)

Legal actions can leak hidden information. The view should expose only what that recipient is entitled to know.

Examples:

- The defender should not see exactly why the server auto-passed the counter window.
- A player may see their own legal counter cards.
- The opponent sees only that the game progressed, not whether no counters existed or auto-pass was enabled.

### 06-visibility-security.s008 (Spectator modes)

Initial implementation spectator policy is intentionally narrow. Spectating is opt-in, not universally available on every match, and public ranked spectating is deferred. Delayed spectator modes are also deferred from initial implementation.

```ts
type SpectatorPolicy = {
  mode: "disabled" | "live-filtered";
  allowHandRevealAfterGame: boolean;
};
```

Canonical defaults:

| Game type / context  | Default spectator policy                                      |
| -------------------- | ------------------------------------------------------------- |
| Unranked queue       | `live-filtered`                                               |
| Ranked queue         | `disabled`                                                    |
| Custom lobby         | Host-configurable between `disabled` and `live-filtered` only |
| Tournament/broadcast | Deferred from initial implementation                          |
| Completed replay     | Full information after match completion                       |

The initial spectator implementation supports only live filtered views for explicitly spectatable matches. Delayed spectator modes remain future work and must not be partially implemented.

### 06-visibility-security.s020 (Original spectator model and v2 hardening)

The original simulator plan used a delayed spectator concept. That family is deferred from the initial implementation because it adds fairness, buffering, timer-consistency, and protocol complexity that is not required for the first spectating slice.

Supported spectator policies:

| Policy          | Relationship to original plan | Use                                                                           |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `disabled`      | No spectator stream           | Ranked queue and any match that is not explicitly spectatable                 |
| `live-filtered` | Initial supported mode        | Explicitly spectatable open/custom matches; shows board and public zones only |

Delayed spectator policies, delay buffers, and delayed full-information spectator contracts are deferred. Replay remains the full-information post-match surface.

### 06-visibility-security.s021 (Original state-filtering categories preserved)

The mechanical spec separated visibility into multiple view categories. The implementation should keep separate filters rather than one generic serializer.

| View                   | Purpose                      | Hidden-info policy                                                                 |
| ---------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `PlayerView`           | Active player UI             | Own hand visible; opponent hidden zones counted only.                              |
| `SpectatorView`        | Spectator UI                 | Initial `live-filtered` mode shows public board/zones and hidden-zone counts only. |
| `ReplayView`           | Completed replay             | Can show full state after match completion, subject to replay visibility policy.   |
| Temporary reveal view  | Resolving effects            | Shows only currently revealed cards to allowed recipients.                         |
| Battle-specific view   | Attack/block/counter windows | Shows battle context without leaking opponent counters unless revealed.            |
| Effect-resolution view | Search/look/choice prompts   | Private candidates visible only to choosing player unless effect says reveal.      |

### 22-v6-implementation-tightening.s006 (2. TypeScript model)

The old `16-typescript-interface-draft.md` was a draft and referenced undefined symbols. The implementation contract is now `contracts/canonical-types.ts`.

Resolved and normalized items include:

- `Color` -> `CardColor`
- `Attribute`
- `ZoneRef`
- `MatchCardManifest`
- `RngState`
- `EffectQueueEntry`
- `ContinuousEffect`
- `EventVisibility`
- `CardRef`
- `DecisionResponse`
- `Cost`
- `PaymentOption`
- `TargetRequest`
- `CardSelectionRequest`
- `EffectOption`
- `PublicEffectEvent` replacement via filtered `EngineEvent[]`
- `PlayerView` and initial live-filtered `SpectatorView`
- public live-view DTO support contracts
- spectator-safe public-only reveal and event DTOs
- `eventLog`/`eventJournal` conflict resolved to `eventJournal`
- `activeBattle`/`battle` conflict resolved to `battle`
- serializable arrays instead of `Set`

The contract compiles with:

```bash
cd contracts
tsc -p tsconfig.json
```

### 22-v6-implementation-tightening.s014 (10. Spectator policy)

Initial spectator scope is now singular and narrowed for implementation:

| Match type       | Default spectator policy                                        |
| ---------------- | --------------------------------------------------------------- |
| Casual public    | `live-filtered`                                                 |
| Ranked public    | `disabled`                                                      |
| Private lobby    | Host-configurable between `disabled` and `live-filtered` only   |
| Tournament       | Deferred from initial implementation                            |
| Completed replay | Full information, unless a future privacy policy says otherwise |

`delayed-filtered` and `delayed-full` are deferred from initial implementation. They remain future design options, not active implementation scope.

## Story Boundary

Own only the canonical type contract and @optcg/types export surface for initial live player and live-filtered spectator view DTOs. Stop before filterStateForPlayer/filterStateForSpectator behavior, server protocol payloads, browser client rendering, replay views, delayed spectator modes, or full-information live spectator policy.

## Scope

- add canonical `PlayerView` and `SpectatorView` type/interface definitions to `contracts/canonical-types.ts`
- add any directly required public support DTO contracts, using exact names owned by this story
- update `06-visibility-security.s004` and `06-visibility-security.s021` as needed so the spec names the exact canonical `SpectatorView` field set and support DTO definitions before implementation
- define the canonical `PlayerView` field set as `matchId`, `playerId`, `stateSeq`, `actionSeq`, `turn`, `self`, `opponent`, optional `battle`, optional recipient-filtered `pendingDecision`, recipient-filtered `legalActions`, `revealedCards`, filtered `events`, and `timers`
- define the canonical initial `SpectatorView` field set as `matchId`, `stateSeq`, `actionSeq`, `spectatorPolicy`, `turn`, `players`, optional `battle`, `revealedCards`, filtered public `events`, and `timers`
- define support DTOs named `PublicTurnState`, `PublicBattleState`, `PublicCardView`, `PublicLifeView`, `VisiblePlayerState`, `OpponentVisibleState`, `SpectatorVisiblePlayerState`, `PublicDecision`, `PublicLegalAction`, `PublicRevealRecord`, `SpectatorRevealRecord`, and `SpectatorEvent`, unless story review identifies an existing canonical name that should be reused instead
- export the new view DTO contracts from `@optcg/types` through the existing concern-split package structure
- define initial `SpectatorPolicy` as the object shape `{ mode: "disabled" | "live-filtered"; allowHandRevealAfterGame: boolean }`, with no delayed or full-information live mode
- define `SpectatorView` as distinct from `PlayerView` rather than as a pseudo-player view
- ensure `PlayerView` exposes own hidden-zone card identities only where the visibility spec permits them and represents opponent hidden zones by counts only
- ensure initial `live-filtered` `SpectatorView` exposes public board state, public zones, public turn/battle/timer context, hidden-zone counts, public reveal records, and public events only, with no `pendingDecision` or `legalActions` field and no private reveal/event payload type
- preserve full-information live spectator visibility as an explicitly deferred future policy story
- update the blocked TYP-002 authority-gap record only as needed to point at this replacement story

## Out of Scope

- implementing `filterStateForPlayer`
- implementing `filterStateForSpectator`
- producing concrete filtered view fixtures from `GameState`
- server protocol envelopes or WebSocket payload handling
- browser or client package code
- replay view contracts or replay visibility policy
- delayed spectator buffers or delayed spectator DTOs
- full-information live spectator mode, judge mode, or broadcast mode
- changing gameplay rules, event emission, decision generation, or engine behavior

## Allowed Touch Points

<!-- prettier-ignore -->
- specs/06-visibility-security.md
- specs/22-v6-implementation-tightening.md
- contracts/canonical-types.ts
- packages/types/src/**
- stories/blocked/TYP-002-public-view-dto-contract-authority-gap.yaml

## Constraints

- must pass pnpm verify
- must pass package-local @optcg/types typecheck and tests
- must not implement filtering behavior or derive live DTO values from GameState
- must not introduce hidden-information leakage into public or spectator-facing DTOs
- must not model delayed or full-information live spectator modes in this story
- generated story must receive story-review agent review before it is presented as approval-ready or moved to stories/approved

## Required Tests

- contract compile test proving the canonical type contract exports `PlayerView`, `SpectatorView`, `SpectatorPolicy`, and all required support DTOs
- package-name type import test proving the new view DTOs are exported from `@optcg/types`
- type-level negative tests proving `PlayerView` cannot expose opponent hidden card identity fields or private engine internals
- type-level negative tests proving `PlayerView.pendingDecision` and `PlayerView.legalActions` cannot expose private opponent candidates or private legal-action reasons
- type-level negative tests proving initial `SpectatorView` cannot expose either player's hidden card identity fields, any legal actions, any pending decisions, private reveal records, non-public events, or private engine internals
- export ownership/cohesion test update assigning each new canonical export to this story exactly once

## Expected Output

- code changes
- tests
- brief implementation note
- explicit assumptions list

## Acceptance Criteria

- `contracts/canonical-types.ts` defines exact `PlayerView` and distinct `SpectatorView` contracts
- `@optcg/types` exports the new view DTO contracts and support DTOs through the package-name import surface
- `SpectatorPolicy` is the exact object shape from `06-visibility-security.s008`, with `mode: "disabled" | "live-filtered"` and `allowHandRevealAfterGame: boolean`
- `06-visibility-security.s004` and `06-visibility-security.s021` define exact canonical field sets for `PlayerView`, `SpectatorView`, and required support DTOs
- `PlayerView` does not include opponent hand card IDs, deck order, face-down opponent life card IDs, RNG state, effect queue internals, audit entries, or private decision candidates
- `PlayerView.pendingDecision` and `PlayerView.legalActions` are explicitly recipient-filtered and cannot expose private opponent candidates or private legal-action reasons
- initial `SpectatorView` has no `pendingDecision` or `legalActions` field and does not include either player's hand card IDs, deck order, face-down life card IDs, private reveal records, non-public events, RNG state, effect queue internals, or audit entries
- the story leaves full-information live spectating explicitly deferred instead of partially modeled

## Ambiguity Rule

Policy: fail_and_escalate

If the story or cited specification is ambiguous, do not invent behavior. Report the ambiguity and stop at the narrowest safe point.

## Agent Instruction Footer

```text
You are implementing a constrained story in an existing codebase.
The cited specification is authoritative.
Do not invent behavior not supported by the cited spec.
Stay within scope.
Stay within the approved story boundary and allowed touch points.
Follow repo tooling and code standard requirements.
Include tests for the listed acceptance criteria.
If the spec is ambiguous, report the ambiguity instead of guessing.
```
