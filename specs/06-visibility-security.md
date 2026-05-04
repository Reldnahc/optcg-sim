---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "06-visibility-security"
doc_title: "Visibility Security"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Visibility, Security, and Anti-Cheat

<!-- SECTION_REF: 06-visibility-security.s001 -->

Section Ref: `06-visibility-security.s001`

## Security principle

<!-- SECTION_REF: 06-visibility-security.s002 -->

Section Ref: `06-visibility-security.s002`

The server holds `GameState`. Clients receive filtered views. A raw `GameState` must never leave the match server except for trusted internal debugging, persistence, or completed replay storage.

```ts
filterStateForPlayer(state, playerId) -> PlayerView
filterStateForSpectator(state, spectatorPolicy) -> SpectatorView
filterStateForReplay(state) -> ReplayView
```

If a field is not explicitly allowed in a view, it is hidden.

## Player zone visibility

<!-- SECTION_REF: 06-visibility-security.s003 -->

Section Ref: `06-visibility-security.s003`

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

## PlayerView shape

<!-- SECTION_REF: 06-visibility-security.s004 -->

Section Ref: `06-visibility-security.s004`

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

## Temporary visibility

<!-- SECTION_REF: 06-visibility-security.s005 -->

Section Ref: `06-visibility-security.s005`

Some events reveal hidden cards temporarily.

| Event                    | Who sees                                        | Duration                                       |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------- |
| Playing card from hand   | Both players                                    | Reveal through placement/resolution            |
| Counter card from hand   | Both players                                    | Reveal through trash/effect resolution         |
| Activated life trigger   | Both players                                    | Reveal through trigger resolution              |
| Declined life trigger    | Nobody except server                            | Never shown                                    |
| Search/look at deck      | Searching player only unless effect says reveal | During effect resolution                       |
| Effect reveals hand/life | As specified by effect                          | During effect resolution or specified duration |
| Trash from hidden zone   | Public once in trash                            | From arrival in trash onward                   |

```ts
interface RevealRecord {
  id: string;
  card: CardRef;
  sourceZone: Zone;
  reason:
    | "play"
    | "counter"
    | "trigger"
    | "search"
    | "lookAt"
    | "effect"
    | "trash";
  visibleTo: "both" | PlayerId[] | "replayOnly";
  expires: RevealExpiration;
}
```

The engine must remove expired `RevealRecord`s as part of effect cleanup.

## Effect event visibility

<!-- SECTION_REF: 06-visibility-security.s006 -->

Section Ref: `06-visibility-security.s006`

The game log can leak information if not filtered.

```ts
interface EffectEvent {
  id: string;
  sourceCardId: CardId;
  sourceInstanceId?: InstanceId;
  effectId: string;
  description: string;
  choices?: PublicChoiceSummary;
  visibleTo: "both" | PlayerId[] | "replayOnly";
}
```

Examples:

- Public target selection: visible to both.
- Searching deck: opponent sees "Opponent is searching deck" and maybe count, not card IDs.
- Choosing a card from hand to trash: opponent sees the resulting public trash card, not pre-choice hand options.

## Legal-action visibility

<!-- SECTION_REF: 06-visibility-security.s007 -->

Section Ref: `06-visibility-security.s007`

Legal actions can leak hidden information. The view should expose only what that recipient is entitled to know.

Examples:

- The defender should not see exactly why the server auto-passed the counter window.
- A player may see their own legal counter cards.
- The opponent sees only that the game progressed, not whether no counters existed or auto-pass was enabled.

## Spectator modes

<!-- SECTION_REF: 06-visibility-security.s008 -->

Section Ref: `06-visibility-security.s008`

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

## Anti-cheat layers

<!-- SECTION_REF: 06-visibility-security.s009 -->

Section Ref: `06-visibility-security.s009`

### Layer 1: server authority

<!-- SECTION_REF: 06-visibility-security.s010 -->

Section Ref: `06-visibility-security.s010`

Clients submit intents. The server validates against `getLegalActions()` and applies actions.

Prevents:

- Playing cards not in hand.
- Attacking with illegal attackers.
- Activating wrong-timing effects.
- Paying invalid costs.
- Changing life, DON!!, board, or hidden zones.

### Layer 2: information hiding

<!-- SECTION_REF: 06-visibility-security.s011 -->

Section Ref: `06-visibility-security.s011`

The server sends per-recipient views only. This is the highest-priority anti-cheat work.

### Layer 3: sequencing and idempotency

<!-- SECTION_REF: 06-visibility-security.s012 -->

Section Ref: `06-visibility-security.s012`

The protocol rejects stale or duplicate actions. See match-server protocol.

### Layer 4: timing/rate limiting

<!-- SECTION_REF: 06-visibility-security.s013 -->

Section Ref: `06-visibility-security.s013`

Throttle spam and automate windows that would otherwise leak hidden information.

### Layer 5: behavior analytics

<!-- SECTION_REF: 06-visibility-security.s014 -->

Section Ref: `06-visibility-security.s014`

Post-hoc detection:

- Repeated illegal action attempts.
- Disconnect/rage-quit patterns.
- Impossible win rates.
- Collusion patterns.
- Repeated rollback abuse.

### Layer 6: moderation and reports

<!-- SECTION_REF: 06-visibility-security.s015 -->

Section Ref: `06-visibility-security.s015`

Reports attach replay, action log, rejected actions, rollback history, and state hashes.

## Client integrity reality

<!-- SECTION_REF: 06-visibility-security.s016 -->

Section Ref: `06-visibility-security.s016`

A web client can be modified. Do not depend on obfuscation for fairness. Protocol signing and build integrity checks can deter low-effort tampering, but server authority and hidden-information filtering are the real protections.

## Filter checklist

<!-- SECTION_REF: 06-visibility-security.s017 -->

Section Ref: `06-visibility-security.s017`

Before any state leaves the server:

```ts
assertNoDeckContents(view);
assertNoOpponentHandContents(view);
assertNoFaceDownLifeContents(view);
assertNoRngState(view);
assertNoEffectQueueInternals(view);
assertNoPrivateDecisionCandidates(view);
assertRevealRecordsAreRecipientFiltered(view);
assertLegalActionsDoNotLeakOpponentHiddenInfo(view);
assertSpectatorPolicyApplied(view);
```

Run these in tests for every `PlayerView` fixture.

## Hidden-information rollback policy

<!-- SECTION_REF: 06-visibility-security.s018 -->

Section Ref: `06-visibility-security.s018`

Rollback is a security concern. Once hidden information has been exposed, rewinding can give a player illegal knowledge. See `08-replay-rollback-recovery.md` for rollback classes.

## View-engine split

<!-- SECTION_REF: 06-visibility-security.s019 -->

Section Ref: `06-visibility-security.s019`

The client-safe view engine operates only on `PlayerView`.

Allowed inputs:

- Public zones.
- Player's own hand.
- Counts for hidden zones.
- Server-supplied legal actions.
- Public battle context.
- Filtered event log.

Disallowed inputs:

- Full state.
- Opponent hand contents.
- Deck/life order.
- RNG.
- Full effect queue.

This split prevents accidental hidden-data leaks through optimistic UI logic.

## Original spectator model and v2 hardening

<!-- SECTION_REF: 06-visibility-security.s020 -->

Section Ref: `06-visibility-security.s020`

The original simulator plan used a delayed spectator concept. That family is deferred from the initial implementation because it adds fairness, buffering, timer-consistency, and protocol complexity that is not required for the first spectating slice.

Supported spectator policies:

| Policy          | Relationship to original plan | Use                                                                           |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `disabled`      | No spectator stream           | Ranked queue and any match that is not explicitly spectatable                 |
| `live-filtered` | Initial supported mode        | Explicitly spectatable open/custom matches; shows board and public zones only |

Delayed spectator policies, delay buffers, and delayed full-information spectator contracts are deferred. Replay remains the full-information post-match surface.

## Original state-filtering categories preserved

<!-- SECTION_REF: 06-visibility-security.s021 -->

Section Ref: `06-visibility-security.s021`

The mechanical spec separated visibility into multiple view categories. The implementation should keep separate filters rather than one generic serializer.

| View                   | Purpose                      | Hidden-info policy                                                                 |
| ---------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `PlayerView`           | Active player UI             | Own hand visible; opponent hidden zones counted only.                              |
| `SpectatorView`        | Spectator UI                 | Initial `live-filtered` mode shows public board/zones and hidden-zone counts only. |
| `ReplayView`           | Completed replay             | Can show full state after match completion, subject to replay visibility policy.   |
| Temporary reveal view  | Resolving effects            | Shows only currently revealed cards to allowed recipients.                         |
| Battle-specific view   | Attack/block/counter windows | Shows battle context without leaking opponent counters unless revealed.            |
| Effect-resolution view | Search/look/choice prompts   | Private candidates visible only to choosing player unless effect says reveal.      |

## Anti-cheat layers from the original plan

<!-- SECTION_REF: 06-visibility-security.s022 -->

Section Ref: `06-visibility-security.s022`

The original anti-cheat model is retained and strengthened:

1. **Server authority** - the client sends action intents only. The server validates against `getLegalActions()`.
2. **Information hiding** - the server never sends hidden information to a recipient that should not have it.
3. **Action validation and rate limiting** - reject illegal, stale, out-of-window, or spammed actions.
4. **Behavioral detection** - analyze win-rate anomalies, disconnect abuse, rollback abuse, suspicious rejected actions, and collusion patterns.
5. **Reporting and moderation** - reports attach match replay, state history, rejected actions, rollback events, and timing data.

Client protocol signing or obfuscation may raise the bar against trivial modified clients, but it is not the fairness boundary. The fairness boundary is server authority plus hidden-information filtering.

## Security checklist from source spec

<!-- SECTION_REF: 06-visibility-security.s023 -->

Section Ref: `06-visibility-security.s023`

Before sending any match data to a player, spectator, or replay consumer, assert:

- Opponent hand contains only count, not card IDs.
- Decks expose count only, not order or card IDs.
- Face-down life exposes count only, not card IDs.
- Revealed life cards are visible only while legally revealed.
- Private search/look candidates are visible only to the searching player unless `reveal=true`.
- RNG seed/state is absent.
- Internal effect queue is absent.
- Pending decisions are recipient-filtered.
- Auto-pass timing does not reveal whether hidden counter options existed.
- Spectator delay/filter policy was applied.
