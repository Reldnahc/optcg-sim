CREATE TABLE users (
  id UUID PRIMARY KEY,
  display_name VARCHAR(64) NOT NULL,
  avatar_url VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_account_id VARCHAR(191) NOT NULL,
  account_email VARCHAR(320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE player_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auto_draw_turn BOOLEAN NOT NULL DEFAULT true,
  auto_draw_don BOOLEAN NOT NULL DEFAULT true,
  confirm_attach_don BOOLEAN NOT NULL DEFAULT true,
  confirm_end_turn BOOLEAN NOT NULL DEFAULT true,
  confirm_counter BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE deck_cards (
  id UUID PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id VARCHAR(32) NOT NULL,
  variant_index INTEGER NOT NULL DEFAULT 0,
  variant_key VARCHAR(80) GENERATED ALWAYS AS (card_id || ':v' || variant_index::text) STORED,
  quantity SMALLINT NOT NULL CHECK (quantity BETWEEN 1 AND 4),
  UNIQUE(deck_id, card_id, variant_key)
);

CREATE TABLE deck_don_cards (
  id UUID PRIMARY KEY,
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id VARCHAR(32) NOT NULL,
  variant_index INTEGER NOT NULL DEFAULT 0,
  variant_key VARCHAR(80) GENERATED ALWAYS AS (card_id || ':v' || variant_index::text) STORED,
  quantity SMALLINT NOT NULL CHECK (quantity >= 1),
  UNIQUE(deck_id, card_id, variant_key)
);

CREATE TABLE loadouts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
  don_deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
  sleeve_id VARCHAR(64),
  playmat_id VARCHAR(64),
  icon_id VARCHAR(64),
  variant_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  CHECK (jsonb_typeof(deterministic_entries) = 'array'),
  CHECK (jsonb_typeof(audit_entries) = 'array'),
  CHECK (jsonb_typeof(checkpoints) = 'array'),
  CHECK (replay_display_artifact IS NULL OR jsonb_typeof(replay_display_artifact) = 'object'),
  CHECK (initial_snapshot IS NOT NULL OR (rng_seed_revealed IS NOT NULL AND initial_deck_orders IS NOT NULL))
);

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

CREATE TABLE friendships (
  id UUID PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);

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
