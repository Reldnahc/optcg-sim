---
spec_version: "v6"
spec_package_name: "optcg-md-specs-v6"
doc_id: "10-database-schema"
doc_title: "Database Schema"
doc_type: "spec-section"
status: "canonical"
machine_readable: true
---

# Database Schema

<!-- SECTION_REF: 10-database-schema.s001 -->

Section Ref: `10-database-schema.s001`

## v5 database contract

<!-- SECTION_REF: 10-database-schema.s002 -->

Section Ref: `10-database-schema.s002`

The production-oriented DDL contract is [`contracts/database-schema-v6.sql`](contracts/database-schema-v6.sql). The SQL snippets below are preserved for explanatory context, but the contract file supersedes them where they differ.

Key corrections in the contract file:

- `users` is provider-neutral. Discord-specific identity moved to `auth_accounts`.
- `sessions.token_hash` is `UNIQUE`.
- `variant_index` is `NOT NULL DEFAULT 0`.
- `variant_key` is a generated column.
- deck-card uniqueness uses `UNIQUE(deck_id, card_id, variant_key)`, not nullable `variant_index`.
- `loadouts` store account-level cosmetics and variant preferences.
- `matches` store `card_manifest_hash` and `card_manifest_snapshot`.
- `match_replays` store manifest data and require either `initial_snapshot` or `rng_seed_revealed + initial_deck_orders`.
- `reports` support user, match, rules-bug, disconnect, suspicious-state, and other targets.
- matches now record `game_type`, `format_id`, optional `ladder_id`, queue/lobby provenance, and disconnect-resolution metadata.
- ratings are ladder-scoped rather than one global row per user.

## Storage split

<!-- SECTION_REF: 10-database-schema.s003 -->

Section Ref: `10-database-schema.s003`

Use PostgreSQL for durable product data and Redis for ephemeral/high-write live state.

| Data                                  | Store      |
| ------------------------------------- | ---------- |
| Users, auth references                | PostgreSQL |
| Decks and deck cards                  | PostgreSQL |
| Completed matches and replay metadata | PostgreSQL |
| Ratings                               | PostgreSQL |
| Reports/moderation                    | PostgreSQL |
| Active match state                    | Redis      |
| Matchmaking queue                     | Redis      |
| Card-data cache                       | Redis      |
| WebSocket ownership map               | Redis      |

## Poneglyph identifiers in persistence

<!-- SECTION_REF: 10-database-schema.s004 -->

Section Ref: `10-database-schema.s004`

Deck and match persistence use Poneglyph base card IDs as canonical card identifiers. Variant and alternate-art selections use non-null Poneglyph `variants[].index` from the card payload plus a generated simulator `variant_key`; they are cosmetic only.

- `leader_card_id` stores a Poneglyph base card ID.
- `deck_cards.card_id` stores a Poneglyph base card ID.
- `deck_cards.variant_index` stores Poneglyph `variants[].index`, defaulting to `0`; `variant_key` is generated as a key such as `OP01-060:v0`.
- `deck_don_cards.card_id` stores a Poneglyph DON!! card ID.
- `deck_don_cards.variant_index` stores Poneglyph DON!! `variants[].index`, defaulting to `0`; `variant_key` is generated.
- Engine state and effect definitions refer to base `cardId`; variant indexes/keys never affect rules.

## Users and sessions

<!-- SECTION_REF: 10-database-schema.s005 -->

Section Ref: `10-database-schema.s005`

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  display_name VARCHAR(64) NOT NULL,
  avatar_url VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Add `auth_accounts` from `contracts/database-schema-v6.sql` for provider-specific IDs such as Discord, Google, or future OAuth providers.

## Player settings

<!-- SECTION_REF: 10-database-schema.s006 -->

Section Ref: `10-database-schema.s006`

```sql
CREATE TABLE player_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auto_draw_turn BOOLEAN NOT NULL DEFAULT true,
  auto_draw_don BOOLEAN NOT NULL DEFAULT true,
  confirm_attach_don BOOLEAN NOT NULL DEFAULT true,
  confirm_end_turn BOOLEAN NOT NULL DEFAULT true,
  confirm_counter BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Decks

<!-- SECTION_REF: 10-database-schema.s007 -->

Section Ref: `10-database-schema.s007`

```sql
CREATE TABLE decks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  leader_card_id VARCHAR(32) NOT NULL,
  format_id VARCHAR(32) NOT NULL DEFAULT 'standard-bo1',
  is_public BOOLEAN NOT NULL DEFAULT false,
  playmat_id VARCHAR(64),
  sleeve_id VARCHAR(64),
  icon_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Main deck cards

<!-- SECTION_REF: 10-database-schema.s008 -->

Section Ref: `10-database-schema.s008`

This fixes the variant issue: the same base card can appear in multiple art variants.

```sql
CREATE TABLE deck_cards (
  id UUID PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id VARCHAR(32) NOT NULL,
  variant_index INTEGER NOT NULL DEFAULT 0,
  variant_key VARCHAR(80) GENERATED ALWAYS AS (card_id || ':v' || variant_index::text) STORED,
  quantity SMALLINT NOT NULL CHECK (quantity BETWEEN 1 AND 4),
  UNIQUE(deck_id, card_id, variant_key)
);
```

Application validation enforces:

```sql
-- conceptual validation, not a CHECK constraint
SUM(quantity) WHERE deck_id = $deck_id AND card_id = $card_id <= format_card_limit
```

### DON!! deck cards

<!-- SECTION_REF: 10-database-schema.s009 -->

Section Ref: `10-database-schema.s009`

```sql
CREATE TABLE deck_don_cards (
  id UUID PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id VARCHAR(32) NOT NULL,
  variant_index INTEGER NOT NULL DEFAULT 0,
  variant_key VARCHAR(80) GENERATED ALWAYS AS (card_id || ':v' || variant_index::text) STORED,
  quantity SMALLINT NOT NULL CHECK (quantity >= 1),
  UNIQUE(deck_id, card_id, variant_key)
);
```

## Matches

<!-- SECTION_REF: 10-database-schema.s010 -->

Section Ref: `10-database-schema.s010`

```sql
CREATE TABLE matches (
  id UUID PRIMARY KEY,
  player1_id UUID NOT NULL REFERENCES users(id),
  player2_id UUID NOT NULL REFERENCES users(id),
  player1_deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
  player2_deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
  winner_id UUID REFERENCES users(id),
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  game_type VARCHAR(16) NOT NULL DEFAULT 'unranked',
  format_id VARCHAR(32) NOT NULL DEFAULT 'standard-bo1',
  ladder_id VARCHAR(64),
  queue_snapshot JSONB,
  lobby_id UUID,
  lobby_config JSONB,
  disconnect_resolution JSONB,
  runtime_versions JSONB NOT NULL,
  card_manifest_hash VARCHAR(128) NOT NULL,
  card_manifest_snapshot JSONB NOT NULL,
  spectator_policy JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  turn_count SMALLINT,
  final_state_hash VARCHAR(128),
  CHECK (game_type IN ('ranked', 'unranked', 'custom')),
  CHECK ((game_type = 'ranked' AND ladder_id IS NOT NULL) OR game_type <> 'ranked')
);
```

Recommended status values:

```text
active, completed, draw, abandoned, errored, no_contest
```

`game_type` captures queue-versus-lobby entry semantics. `format_id` captures the format profile. `ladder_id` is populated only for ranked matches.

## Replays

<!-- SECTION_REF: 10-database-schema.s011 -->

Section Ref: `10-database-schema.s011`

```sql
CREATE TABLE match_replays (
  id UUID PRIMARY KEY,
  match_id UUID NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  game_type VARCHAR(16) NOT NULL,
  format_id VARCHAR(32) NOT NULL,
  ladder_id VARCHAR(64),
  replay_format_version VARCHAR(32) NOT NULL,
  engine_version VARCHAR(64) NOT NULL,
  rules_version VARCHAR(64) NOT NULL,
  card_data_version VARCHAR(64) NOT NULL,
  effect_definitions_version VARCHAR(64) NOT NULL,
  custom_handler_version VARCHAR(64) NOT NULL,
  banlist_version VARCHAR(64) NOT NULL,
  protocol_version VARCHAR(64) NOT NULL,
  rng_algorithm VARCHAR(32) NOT NULL,
  rng_seed_commitment VARCHAR(128),
  rng_seed_revealed TEXT,
  manifest_hash VARCHAR(128) NOT NULL,
  manifest_snapshot JSONB NOT NULL,
  initial_state_hash VARCHAR(128) NOT NULL,
  final_state_hash VARCHAR(128),
  initial_snapshot JSONB,
  initial_deck_orders JSONB,
  deterministic_entries JSONB NOT NULL,
  audit_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  replay_display_artifact JSONB,
  final_state JSONB,
  compressed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (game_type IN ('ranked', 'unranked', 'custom')),
  CHECK ((game_type = 'ranked' AND ladder_id IS NOT NULL) OR game_type <> 'ranked'),
  CHECK (replay_display_artifact IS NULL OR jsonb_typeof(replay_display_artifact) = 'object'),
  CHECK (initial_snapshot IS NOT NULL OR (rng_seed_revealed IS NOT NULL AND initial_deck_orders IS NOT NULL))
);
```

## Rollbacks

<!-- SECTION_REF: 10-database-schema.s012 -->

Section Ref: `10-database-schema.s012`

```sql
CREATE TABLE match_rollbacks (
  id UUID PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  mode VARCHAR(16) NOT NULL,
  rollback_class VARCHAR(32) NOT NULL,
  from_state_seq INTEGER NOT NULL,
  to_state_seq INTEGER NOT NULL,
  requested_by UUID REFERENCES users(id),
  approved_by JSONB,
  admin_id UUID REFERENCES users(id),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Ratings

<!-- SECTION_REF: 10-database-schema.s013 -->

Section Ref: `10-database-schema.s013`

```sql
CREATE TABLE ratings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ladder_id VARCHAR(64) NOT NULL,
  rating_system VARCHAR(16) NOT NULL DEFAULT 'elo',
  elo INTEGER NOT NULL DEFAULT 1200,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  disconnect_losses INTEGER NOT NULL DEFAULT 0,
  win_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_match_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, ladder_id)
);

CREATE TABLE rating_history (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  ladder_id VARCHAR(64) NOT NULL,
  elo_before INTEGER NOT NULL,
  elo_after INTEGER NOT NULL,
  elo_delta INTEGER NOT NULL,
  result VARCHAR(32) NOT NULL,
  reason VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(match_id, user_id, ladder_id)
);

CREATE TABLE disconnect_discipline_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  ladder_id VARCHAR(64),
  event_type VARCHAR(32) NOT NULL,
  strike_applied BOOLEAN NOT NULL DEFAULT true,
  lockout_expires_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The first-ranked-wave ladder is simple Elo keyed by `ladder_id = ranked:<formatId>:<seasonId>`. `unranked` and `custom` sessions never write `rating_history`.

## Social

<!-- SECTION_REF: 10-database-schema.s014 -->

Section Ref: `10-database-schema.s014`

```sql
CREATE TABLE friendships (
  id UUID PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);
```

## Reports and moderation

<!-- SECTION_REF: 10-database-schema.s015 -->

Section Ref: `10-database-schema.s015`

```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES users(id),
  target_type VARCHAR(32) NOT NULL,
  target_user_id UUID REFERENCES users(id),
  match_id UUID REFERENCES matches(id),
  target_payload JSONB,
  reason VARCHAR(32) NOT NULL,
  description TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  reviewed_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (target_type IN ('user', 'match', 'rules-bug', 'disconnect', 'suspicious-state', 'other')),
  CHECK ((target_type = 'user' AND target_user_id IS NOT NULL) OR (target_type <> 'user'))
);

CREATE TABLE bans (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  banned_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Indexes

<!-- SECTION_REF: 10-database-schema.s016 -->

Section Ref: `10-database-schema.s016`

Avoid using `now()` in a partial index predicate for active bans. Use normal indexes and query with `now()`.

```sql
CREATE INDEX idx_auth_accounts_user_id ON auth_accounts(user_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE INDEX idx_decks_user_id ON decks(user_id);
CREATE INDEX idx_decks_format_id ON decks(format_id);
CREATE INDEX idx_deck_cards_deck_id ON deck_cards(deck_id);
CREATE INDEX idx_deck_cards_card_id ON deck_cards(card_id);
CREATE INDEX idx_deck_cards_variant_key ON deck_cards(variant_key);
CREATE INDEX idx_deck_don_cards_deck_id ON deck_don_cards(deck_id);

CREATE INDEX idx_matches_player1 ON matches(player1_id);
CREATE INDEX idx_matches_player2 ON matches(player2_id);
CREATE INDEX idx_matches_status_active ON matches(status) WHERE status = 'active';
CREATE INDEX idx_matches_started_at ON matches(started_at DESC);
CREATE INDEX idx_matches_game_type_format ON matches(game_type, format_id, started_at DESC);
CREATE INDEX idx_matches_ladder_id ON matches(ladder_id) WHERE ladder_id IS NOT NULL;

CREATE INDEX idx_match_replays_match_id ON match_replays(match_id);
CREATE INDEX idx_match_replays_context ON match_replays(game_type, format_id);
CREATE INDEX idx_match_rollbacks_match_id ON match_rollbacks(match_id, created_at DESC);

CREATE INDEX idx_rating_history_user ON rating_history(user_id, ladder_id, created_at DESC);
CREATE INDEX idx_disconnect_discipline_events_user ON disconnect_discipline_events(user_id, created_at DESC);
CREATE INDEX idx_disconnect_discipline_events_lockout ON disconnect_discipline_events(lockout_expires_at) WHERE lockout_expires_at IS NOT NULL;
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_reports_status_open ON reports(status) WHERE status = 'open';

CREATE INDEX idx_bans_user_expires_at ON bans(user_id, expires_at);
CREATE INDEX idx_bans_user_permanent ON bans(user_id) WHERE expires_at IS NULL;
```

Active ban query:

```sql
SELECT *
FROM bans
WHERE user_id = $1
  AND (expires_at IS NULL OR expires_at > now());
```

## Redis keys

<!-- SECTION_REF: 10-database-schema.s017 -->

Section Ref: `10-database-schema.s017`

```text
match:{matchId}:state          JSON snapshot
match:{matchId}:meta           JSON metadata
match:{matchId}:actions        JSON action log since snapshot
match:{matchId}:decisions      JSON decision log since snapshot
match:{matchId}:owner          instance ownership/heartbeat
queue:matchmaking:{gameType}:{formatId}  sorted set or stream
lobby:{lobbyId}:meta              lobby metadata and settings
lobby:{lobbyId}:members           lobby membership / ready state
card:{version}:{cardId}        card-data cache
session:{tokenHash}            optional session cache
ws:user:{userId}               connection/match routing
```

Use TTLs for active-match keys, but refresh them while the match is active.

## Migration notes

<!-- SECTION_REF: 10-database-schema.s018 -->

Section Ref: `10-database-schema.s018`

- Add new columns with safe defaults.
- Avoid DB constraints for game-format rules that change frequently.
- Keep deck validation in application/shared code.
- Do not model ranked rating as a single global row per user; scope it by ladder.
- Store replay versions redundantly even if also present in `runtime_versions`; replay rows need to be self-describing.

## Variant persistence rule

<!-- SECTION_REF: 10-database-schema.s019 -->

Section Ref: `10-database-schema.s019`

Do not persist an assumed external `variant_id` unless Poneglyph later adds one. The provided card examples identify prints by `variants[].index` only. Use:

```text
variant_key = `${card_id}:v${variant_index}`
```

Examples:

```text
OP01-060 variant index 0 -> OP01-060:v0
OP01-060 variant index 1 -> OP01-060:v1
OP05-091 variant index 5 -> OP05-091:v5
```

Validation must check that the selected `variant_index` exists in the current resolved card manifest. If Poneglyph changes variant indexes, existing decks should enter a degraded display state and ask the user to reselect art; gameplay remains valid because the base `card_id` is unchanged.

## Loadouts instead of local saved decks

<!-- SECTION_REF: 10-database-schema.s020 -->

Section Ref: `10-database-schema.s020`

Persist user deck choices as account-level `loadouts`. A loadout stores:

- decklist
- DON!! deck selection
- sleeves
- playmat
- icon
- variant selections when the related image asset is available

All cosmetics are globally unlocked. No inventory/ownership tables are required for cosmetics in v6.
