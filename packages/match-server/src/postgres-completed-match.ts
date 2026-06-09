import { withTransaction as defaultWithTransaction } from "optcg-db/db/client.js";
import type {
  SimGameType,
  SimMatchPlayerResult,
  SimMatchStatus,
  SimReplayRngAlgorithm,
} from "optcg-db/db/schema.js";

import type { MatchId, PlayerId } from "@optcg/types";

import type { MatchCreationSource } from "./session-types.js";

export type JsonObject = Record<string, unknown>;

export interface CompletedMatchPlayerRecord {
  readonly seatId: PlayerId;
  readonly userId: string | null;
  readonly savedDeckId: string | null;
  readonly handoffTokenId: string | null;
  readonly displayName: string | null;
  readonly leaderCardNumber: string;
  readonly leaderVariantIndex: number | null;
  readonly deckHash: string | null;
  readonly deckSnapshot: JsonObject;
  readonly resolvedLoadoutSnapshot: JsonObject;
  readonly cosmeticSnapshot: JsonObject;
  readonly startingDeckOrderHash: string | null;
  readonly result: SimMatchPlayerResult;
  readonly resultReason: string | null;
  readonly wentFirst: boolean;
  readonly choseFirst: boolean;
  readonly isWinner: boolean;
  readonly finalLifeCount: number | null;
}

export interface CompletedMatchReplayRecord {
  readonly replayFormatVersion: string;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly effectDefinitionsVersion: string;
  readonly customHandlerVersion: string;
  readonly banlistVersion: string;
  readonly protocolVersion: string;
  readonly rngAlgorithm: SimReplayRngAlgorithm;
  readonly rngSeedCommitment: string | null;
  readonly rngSeedRevealed: string | null;
  readonly manifestHash: string;
  readonly manifestSnapshot: JsonObject;
  readonly initialStateHash: string;
  readonly finalStateHash: string | null;
  readonly initialSnapshot: JsonObject | null;
  readonly initialDeckOrders: JsonObject | null;
  readonly deterministicEntries: readonly unknown[];
  readonly auditEntries: readonly unknown[];
  readonly checkpoints: readonly unknown[];
  readonly finalState: JsonObject | null;
  readonly compressed: boolean;
  readonly artifactStorage: string | null;
  readonly artifactKey: string | null;
  readonly artifactSha256: string | null;
  readonly artifactSizeBytes: number | null;
}

export interface CompletedMatchRecord {
  readonly matchId: MatchId;
  readonly status: Exclude<SimMatchStatus, "active">;
  readonly gameType: SimGameType;
  readonly formatId: string;
  readonly ladderId: string | null;
  readonly lobbyId: string | null;
  readonly queueId: string | null;
  readonly creationSource: MatchCreationSource;
  readonly spectatorPolicy: JsonObject;
  readonly disconnectPolicy: JsonObject;
  readonly rollbackPolicy: JsonObject;
  readonly runtimeVersions: JsonObject;
  readonly cardManifestHash: string;
  readonly cardManifestSnapshot: JsonObject;
  readonly firstPlayerSeatId: PlayerId | null;
  readonly firstPlayerChooserSeatId: PlayerId | null;
  readonly winnerUserId: string | null;
  readonly winnerSeatId: PlayerId | null;
  readonly resultReason: string | null;
  readonly winType: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly turnCount: number | null;
  readonly actionCount: number;
  readonly finalStateHash: string | null;
  readonly finalStateSeq: number | null;
  readonly errorPayload: JsonObject | null;
  readonly players: readonly CompletedMatchPlayerRecord[];
  readonly replay: CompletedMatchReplayRecord;
}

export type CompletedMatchQuery = (
  sql: string,
  params?: readonly unknown[],
) => Promise<unknown>;

export type CompletedMatchTransaction = <T>(
  callback: (query: CompletedMatchQuery) => Promise<T>,
) => Promise<T>;

export interface CompletedMatchRepository {
  readonly saveCompletedMatch: (record: CompletedMatchRecord) => Promise<void>;
}

export interface CreatePostgresCompletedMatchRepositoryOptions {
  readonly transaction?: CompletedMatchTransaction;
  readonly schema?: string;
}

const jsonParam = (value: unknown): string => JSON.stringify(value);

const defaultSchema = "sim";

const assertValidSchemaName = (schema: string): string => {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) {
    throw new TypeError(`Invalid completed match schema name: ${schema}`);
  }
  return schema;
};

const configuredSchema = (): string =>
  assertValidSchemaName(
    process.env["PONEGLYPH_SIM_DB_SCHEMA"]?.trim() || defaultSchema,
  );

const qualify = (schema: string, table: string): string =>
  `${assertValidSchemaName(schema)}.${table}`;

const matchValues = (record: CompletedMatchRecord): readonly unknown[] => [
  record.matchId,
  record.status,
  record.gameType,
  record.formatId,
  record.ladderId,
  record.lobbyId,
  record.queueId,
  jsonParam(record.creationSource),
  jsonParam(record.spectatorPolicy),
  jsonParam(record.disconnectPolicy),
  jsonParam(record.rollbackPolicy),
  jsonParam(record.runtimeVersions),
  record.cardManifestHash,
  jsonParam(record.cardManifestSnapshot),
  record.firstPlayerSeatId,
  record.firstPlayerChooserSeatId,
  record.winnerUserId,
  record.winnerSeatId,
  record.resultReason,
  record.winType,
  record.startedAt,
  record.endedAt,
  record.turnCount,
  record.actionCount,
  record.finalStateHash,
  record.finalStateSeq,
  record.errorPayload === null ? null : jsonParam(record.errorPayload),
];

const playerValues = (
  matchId: MatchId,
  player: CompletedMatchPlayerRecord,
): readonly unknown[] => [
  matchId,
  player.seatId,
  player.userId,
  player.savedDeckId,
  player.handoffTokenId,
  player.displayName,
  player.leaderCardNumber,
  player.leaderVariantIndex,
  player.deckHash,
  jsonParam(player.deckSnapshot),
  jsonParam(player.resolvedLoadoutSnapshot),
  jsonParam(player.cosmeticSnapshot),
  player.startingDeckOrderHash,
  player.result,
  player.resultReason,
  player.wentFirst,
  player.choseFirst,
  player.isWinner,
  player.finalLifeCount,
];

const replayValues = (record: CompletedMatchRecord): readonly unknown[] => {
  const replay = record.replay;
  return [
    record.matchId,
    replay.replayFormatVersion,
    replay.engineVersion,
    replay.rulesVersion,
    replay.cardDataVersion,
    replay.effectDefinitionsVersion,
    replay.customHandlerVersion,
    replay.banlistVersion,
    replay.protocolVersion,
    replay.rngAlgorithm,
    replay.rngSeedCommitment,
    replay.rngSeedRevealed,
    replay.manifestHash,
    jsonParam(replay.manifestSnapshot),
    replay.initialStateHash,
    replay.finalStateHash,
    replay.initialSnapshot === null ? null : jsonParam(replay.initialSnapshot),
    replay.initialDeckOrders === null
      ? null
      : jsonParam(replay.initialDeckOrders),
    jsonParam(replay.deterministicEntries),
    jsonParam(replay.auditEntries),
    jsonParam(replay.checkpoints),
    replay.finalState === null ? null : jsonParam(replay.finalState),
    replay.compressed,
    replay.artifactStorage,
    replay.artifactKey,
    replay.artifactSha256,
    replay.artifactSizeBytes,
  ];
};

const createSaveMatchSql = (schema: string): string => `
  INSERT INTO ${qualify(schema, "matches")} (
    id,
    status,
    game_type,
    format_id,
    ladder_id,
    lobby_id,
    queue_id,
    creation_source,
    spectator_policy,
    disconnect_policy,
    rollback_policy,
    runtime_versions,
    card_manifest_hash,
    card_manifest_snapshot,
    first_player_seat_id,
    first_player_chooser_seat_id,
    winner_user_id,
    winner_seat_id,
    result_reason,
    win_type,
    started_at,
    ended_at,
    turn_count,
    action_count,
    final_state_hash,
    final_state_seq,
    error_payload
  )
  VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8::jsonb,
    $9::jsonb,
    $10::jsonb,
    $11::jsonb,
    $12::jsonb,
    $13,
    $14::jsonb,
    $15,
    $16,
    $17,
    $18,
    $19,
    $20,
    $21,
    $22,
    $23,
    $24,
    $25,
    $26,
    $27::jsonb
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    game_type = EXCLUDED.game_type,
    format_id = EXCLUDED.format_id,
    ladder_id = EXCLUDED.ladder_id,
    lobby_id = EXCLUDED.lobby_id,
    queue_id = EXCLUDED.queue_id,
    creation_source = EXCLUDED.creation_source,
    spectator_policy = EXCLUDED.spectator_policy,
    disconnect_policy = EXCLUDED.disconnect_policy,
    rollback_policy = EXCLUDED.rollback_policy,
    runtime_versions = EXCLUDED.runtime_versions,
    card_manifest_hash = EXCLUDED.card_manifest_hash,
    card_manifest_snapshot = EXCLUDED.card_manifest_snapshot,
    first_player_seat_id = EXCLUDED.first_player_seat_id,
    first_player_chooser_seat_id = EXCLUDED.first_player_chooser_seat_id,
    winner_user_id = EXCLUDED.winner_user_id,
    winner_seat_id = EXCLUDED.winner_seat_id,
    result_reason = EXCLUDED.result_reason,
    win_type = EXCLUDED.win_type,
    started_at = EXCLUDED.started_at,
    ended_at = EXCLUDED.ended_at,
    turn_count = EXCLUDED.turn_count,
    action_count = EXCLUDED.action_count,
    final_state_hash = EXCLUDED.final_state_hash,
    final_state_seq = EXCLUDED.final_state_seq,
    error_payload = EXCLUDED.error_payload,
    updated_at = now()
`;

const createSavePlayerSql = (schema: string): string => `
  INSERT INTO ${qualify(schema, "match_players")} (
    match_id,
    seat_id,
    user_id,
    saved_deck_id,
    handoff_token_id,
    display_name,
    leader_card_number,
    leader_variant_index,
    deck_hash,
    deck_snapshot,
    resolved_loadout_snapshot,
    cosmetic_snapshot,
    starting_deck_order_hash,
    result,
    result_reason,
    went_first,
    chose_first,
    is_winner,
    final_life_count
  )
  VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10::jsonb,
    $11::jsonb,
    $12::jsonb,
    $13,
    $14,
    $15,
    $16,
    $17,
    $18,
    $19
  )
  ON CONFLICT (match_id, seat_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    saved_deck_id = EXCLUDED.saved_deck_id,
    handoff_token_id = EXCLUDED.handoff_token_id,
    display_name = EXCLUDED.display_name,
    leader_card_number = EXCLUDED.leader_card_number,
    leader_variant_index = EXCLUDED.leader_variant_index,
    deck_hash = EXCLUDED.deck_hash,
    deck_snapshot = EXCLUDED.deck_snapshot,
    resolved_loadout_snapshot = EXCLUDED.resolved_loadout_snapshot,
    cosmetic_snapshot = EXCLUDED.cosmetic_snapshot,
    starting_deck_order_hash = EXCLUDED.starting_deck_order_hash,
    result = EXCLUDED.result,
    result_reason = EXCLUDED.result_reason,
    went_first = EXCLUDED.went_first,
    chose_first = EXCLUDED.chose_first,
    is_winner = EXCLUDED.is_winner,
    final_life_count = EXCLUDED.final_life_count
`;

const createSaveReplaySql = (schema: string): string => `
  INSERT INTO ${qualify(schema, "match_replays")} (
    match_id,
    replay_format_version,
    engine_version,
    rules_version,
    card_data_version,
    effect_definitions_version,
    custom_handler_version,
    banlist_version,
    protocol_version,
    rng_algorithm,
    rng_seed_commitment,
    rng_seed_revealed,
    manifest_hash,
    manifest_snapshot,
    initial_state_hash,
    final_state_hash,
    initial_snapshot,
    initial_deck_orders,
    deterministic_entries,
    audit_entries,
    checkpoints,
    final_state,
    compressed,
    artifact_storage,
    artifact_key,
    artifact_sha256,
    artifact_size_bytes
  )
  VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10,
    $11,
    $12,
    $13,
    $14::jsonb,
    $15,
    $16,
    $17::jsonb,
    $18::jsonb,
    $19::jsonb,
    $20::jsonb,
    $21::jsonb,
    $22::jsonb,
    $23,
    $24,
    $25,
    $26,
    $27
  )
  ON CONFLICT (match_id) DO UPDATE SET
    replay_format_version = EXCLUDED.replay_format_version,
    engine_version = EXCLUDED.engine_version,
    rules_version = EXCLUDED.rules_version,
    card_data_version = EXCLUDED.card_data_version,
    effect_definitions_version = EXCLUDED.effect_definitions_version,
    custom_handler_version = EXCLUDED.custom_handler_version,
    banlist_version = EXCLUDED.banlist_version,
    protocol_version = EXCLUDED.protocol_version,
    rng_algorithm = EXCLUDED.rng_algorithm,
    rng_seed_commitment = EXCLUDED.rng_seed_commitment,
    rng_seed_revealed = EXCLUDED.rng_seed_revealed,
    manifest_hash = EXCLUDED.manifest_hash,
    manifest_snapshot = EXCLUDED.manifest_snapshot,
    initial_state_hash = EXCLUDED.initial_state_hash,
    final_state_hash = EXCLUDED.final_state_hash,
    initial_snapshot = EXCLUDED.initial_snapshot,
    initial_deck_orders = EXCLUDED.initial_deck_orders,
    deterministic_entries = EXCLUDED.deterministic_entries,
    audit_entries = EXCLUDED.audit_entries,
    checkpoints = EXCLUDED.checkpoints,
    final_state = EXCLUDED.final_state,
    compressed = EXCLUDED.compressed,
    artifact_storage = EXCLUDED.artifact_storage,
    artifact_key = EXCLUDED.artifact_key,
    artifact_sha256 = EXCLUDED.artifact_sha256,
    artifact_size_bytes = EXCLUDED.artifact_size_bytes
`;

export const createPostgresCompletedMatchRepository = ({
  transaction = (callback) =>
    defaultWithTransaction((client) =>
      callback((sql, params) =>
        client.query(sql, params === undefined ? undefined : [...params]),
      ),
    ),
  schema = configuredSchema(),
}: CreatePostgresCompletedMatchRepositoryOptions = {}): CompletedMatchRepository => {
  const matchSchema = assertValidSchemaName(schema);
  const saveMatchSql = createSaveMatchSql(matchSchema);
  const savePlayerSql = createSavePlayerSql(matchSchema);
  const saveReplaySql = createSaveReplaySql(matchSchema);
  return {
    async saveCompletedMatch(record) {
      await transaction(async (query) => {
        await query(saveMatchSql, matchValues(record));
        for (const player of record.players) {
          await query(savePlayerSql, playerValues(record.matchId, player));
        }
        await query(saveReplaySql, replayValues(record));
      });
    },
  };
};
