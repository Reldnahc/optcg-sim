# Visibility And Observation Boundaries Implementation Plan

> **For agentic workers:** Execute this plan before moving bot code into a new
> package. Steps use checkbox (`- [ ]`) syntax and should land as focused
> commits.

**Goal:** Ensure player transports and live bots receive only recipient-filtered
information, with no public contract defined as a projection of internal
`GameState`.

**Architecture:** Keep three distinct models:

1. An internal match snapshot may contain trusted server data and both player
   views, but never crosses a transport or bot boundary.
2. A player state-sync snapshot contains one recipient's filtered `PlayerView`,
   compatible wire fields, and public metadata only.
3. A `BotObservation` contains exactly the filtered information and legal
   actions available to that bot seat, plus only format knowledge explicitly
   public to human players.

**Authoritative References:**

- `01-system-architecture.s006`, `.s011`, `.s012`, `.s013`
- `06-visibility-security.s002`, `.s004`, `.s019`, `.s023`
- `07-match-server-protocol`
- `docs/code-standard.md` hidden-information and package-boundary sections

---

## Scope

### In Scope

- Split the current overloaded `DevMatchSnapshot` contract.
- Replace `GameState[turn]` with `PublicTurnState` on client-facing data.
- Build bot inputs from the bot seat's filtered player snapshot.
- Remove default bot access to the opponent's submitted deck IDs.
- Preserve current HTTP/WebSocket response compatibility unless a separately
  approved protocol version changes it.
- Add hidden-information and type-level boundary tests.

### Out Of Scope

- Bot scoring, difficulty, or gameplay tuning.
- Moving bot implementation files to `@optcg/bot`; that belongs to the package
  authority plan.
- Changing `PlayerView` visibility policy.
- Making decklists public. If an open-decklist format is desired, specify it as
  a separate public format capability available to both players.

## Target Types

Use names consistent with the final local implementation, but preserve these
responsibilities:

```ts
interface InternalDevMatchSnapshot {
  // Trusted server/test aggregate. Never serialized and never passed to bots.
  readonly players: Readonly<Record<PlayerId, DevPlayerSnapshot>>;
  // Other internal orchestration fields as needed.
}

interface DevPlayerMatchSnapshot {
  // Keep current wire keys where compatibility requires them.
  readonly turn: PublicTurnState;
  readonly players: Readonly<Partial<Record<PlayerId, DevPlayerSnapshot>>>;
}

interface BotObservation {
  readonly playerId: PlayerId;
  readonly stateSeq: number;
  readonly actionSeq: number;
  readonly turn: PublicTurnState;
  readonly view: PlayerView;
  readonly actions: readonly DevVisibleAction[];
  readonly payCostInteraction?: PayCostInteraction;
  readonly publicOpponentKnowledge?: BotPublicOpponentKnowledge;
}
```

`BotPublicOpponentKnowledge` must be built from the bot's `PlayerView` and an
explicit public format policy. It must not accept setup deck card IDs by default.

---

## Task 1: Lock Current Leaks With Failing Tests

**Files:**

- Modify: `tests/hidden-info/*`
- Modify: `packages/match-server/src/dev-local-match-registry.test.ts`
- Create: `packages/match-server/src/bot-observation.test.ts`
- Modify: `packages/match-server/src/match-state-payload.test.ts` or the nearest
  existing state payload test

- [ ] Add a state-sync serialization test whose internal turn state contains
      `extraTurnPlayerIds`; assert the serialized player payload does not contain
      that key.
- [ ] Assert a player state-sync payload contains only the recipient entry in
      its `players` field and does not contain opponent private hand identities,
      deck order, face-down life identities, RNG state, effect queue data, or
      private decision candidates.
- [ ] Inject a recording `BotStrategy` into the live registry and assert its
      input has no opponent player snapshot map.
- [ ] Use different private cards in both hands so the test proves identity
      isolation rather than merely checking counts.
- [ ] Add a test proving the default bot knowledge builder cannot derive
      unopened opponent deck card IDs from match setup.
- [ ] Run focused tests and confirm they fail for the current architecture.
- [ ] Commit the failing characterization tests.

## Task 2: Split Internal And Player-Facing Snapshot Types

**Files:**

- Modify: `packages/match-server/src/dev-snapshot-types.ts`
- Modify: `packages/match-server/src/local-match.ts`
- Modify: `packages/match-server/src/match-state-payload.ts`
- Modify: `packages/match-server/src/replay-frame-reconstruction.ts`
- Modify: client protocol/controller tests only where types require it

- [ ] Introduce separate internal and player-facing snapshot interfaces.
- [ ] Make the player-facing `turn` field `PublicTurnState`, sourced from the
      filtered `PlayerView.turn`, not from `match.state.turn`.
- [ ] Keep the existing `players` wire field as a partial record during this
      compatibility-preserving migration. Do not rename or remove it without
      explicit public protocol approval.
- [ ] Change `getLocalDevSnapshot` to return only the trusted internal type.
- [ ] Change `getLocalDevSnapshotForPlayer` to return only the player-facing
      type and build all public data from recipient-filtered helpers.
- [ ] Ensure replay reconstruction uses replay-specific snapshots rather than
      weakening the live player type.
- [ ] Add compile-time assertions that the public snapshot has no direct
      `GameState` projections.
- [ ] Run match-server, client, contract, and hidden-information tests.
- [ ] Commit the snapshot type split.

## Task 3: Introduce A Single-Seat Bot Observation

**Files:**

- Create: `packages/match-server/src/bot-observation.ts`
- Create: `packages/match-server/src/bot-observation.test.ts`
- Modify: `packages/match-server/src/bot-types.ts`
- Modify: `packages/match-server/src/bot-player.ts`
- Modify: bot feature, scoring, planner, responder, profile, and probe modules

- [ ] Define `BotObservation` around one `PlayerView`, one legal-action list,
      and public match metadata.
- [ ] Add `createBotObservation(match, botPlayerId)` and build it through the
      same recipient filtering path used by state-sync.
- [ ] Change `BotStrategy.chooseAction` and all behavior-profile callbacks to
      accept `BotObservation`; remove `botPlayerId` where the observation already
      identifies the seat.
- [ ] Replace `snapshot.players[botPlayerId]` access throughout bot code with
      direct observation fields.
- [ ] Do not provide a compatibility property exposing all player views.
- [ ] Update scenario/probe builders to construct valid one-seat observations
      rather than casting partial objects through `unknown`.
- [ ] Add a package source scan preventing bot production files from importing
      `GameState`, internal snapshot types, or full match setup types.
- [ ] Run all bot and registry tests.
- [ ] Commit the bot observation migration without changing scoring behavior.

## Task 4: Make Opponent Knowledge An Explicit Public Policy

**Files:**

- Modify: `packages/match-server/src/bot-deck-knowledge.ts`
- Modify: `packages/match-server/src/dev-local-match-registry.ts`
- Modify: `packages/match-server/src/bot-types.ts`
- Modify: format/session metadata types if a public policy already exists

- [ ] Remove `opponentSetup.deckCardIds` from the default live bot path.
- [ ] Derive remaining-card estimates only from public cards, public counts, and
      generic priors that do not reveal submitted identities.
- [ ] If open decklists are a required mode, add an explicit policy owned by
      game/session format configuration and expose the same decklist to both human
      player views before giving it to bots.
- [ ] Keep training/probe-only omniscient knowledge in an explicitly named test
      or offline analysis type that cannot be passed to a live `BotStrategy`.
- [ ] Add tests for closed and, if supported, open decklist policies.
- [ ] Commit opponent-knowledge policy isolation.

## Task 5: Add Permanent Boundary Guards

**Files:**

- Modify: `tests/hidden-info/*`
- Create or modify: `packages/match-server/src/package-boundary.test.ts`
- Modify: `packages/client/src/package-boundary.test.ts`

- [ ] Scan player payload builders for `GameState[` projections and direct
      `GameState` fields.
- [ ] Scan bot package/source boundaries for internal snapshot and setup imports.
- [ ] Assert `BotStrategy` input has no `players` map and no raw decklist field.
- [ ] Assert adding a new internal `TurnState` field does not change the public
      serialized turn object.
- [ ] Add a real-state hidden-information test that exercises the registry,
      payload builder, and bot observation in the same match.
- [ ] Run `corepack pnpm test:hidden-info` and architecture tests.
- [ ] Commit the guards.

---

## Migration And Compatibility Notes

- Keep WebSocket `stateSync` keys stable. This plan changes the TypeScript owner
  and value construction, not the public shape.
- The current top-level `turn` key may remain, but it must be a copied
  `PublicTurnState`. Removing the duplicate key requires separate approval.
- Internal tests that genuinely need both player views should use the trusted
  internal snapshot type and must not reuse it for bot or transport fixtures.
- Replay artifacts are intentionally full-information after completion; do not
  reuse replay policy to justify live bot access.

## Acceptance Criteria

- A live bot cannot access opponent private hand identities through its input
  type or runtime value.
- A live bot does not receive opponent submitted deck identities in the default
  format.
- Player state-sync JSON contains no `extraTurnPlayerIds` or future internal
  `TurnState` additions.
- `getLocalDevSnapshotForPlayer` has a public-only return type.
- Existing state-sync field names remain compatible.
- Hidden-information, bot, registry, client, and contract tests pass.

## Verification

```sh
corepack pnpm exec vitest run tests/hidden-info
corepack pnpm exec vitest run packages/match-server/src/bot-observation.test.ts
corepack pnpm exec vitest run packages/match-server/src/dev-local-match-registry.test.ts
corepack pnpm exec vitest run packages/match-server/src/match-state-payload.test.ts
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm contracts
corepack pnpm coverage
corepack pnpm verify
```
