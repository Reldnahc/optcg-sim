import type { MatchId } from "@optcg/types";

import type { DeckHashCodecPort } from "./deck-submission.js";
import {
  createPremadeDevMatchSetup,
  type CreatePremadeDevMatchSetupOptions,
  type createLocalDevMatch,
} from "./local-match.js";
import {
  defaultMatchTimerPolicy,
  type MatchTimerPolicy,
} from "./match-timers.js";
import {
  createPostgresCompletedMatchRepository,
  createPostgresCompletedMatchReplayRepository,
  type CompletedMatchRepository,
  type CompletedMatchReplayRepository,
} from "./postgres-completed-match.js";
import type { SimHandoffVerifier } from "./sim-handoff.js";

export interface CreateMatchHttpServerOptions extends CreatePremadeDevMatchSetupOptions {
  readonly setup?: Parameters<typeof createLocalDevMatch>[0];
  readonly createDefaultMatch?: boolean;
  readonly allowTemplateMatches?: boolean;
  readonly allowedBrowserOrigins?: readonly string[];
  readonly staticAssetsDirectory?: string;
  readonly deckHashCodec?: DeckHashCodecPort;
  readonly allowRawDeckHashSubmissions?: boolean;
  readonly simHandoffVerifier?: SimHandoffVerifier;
  readonly completedMatchRepository?: CompletedMatchRepository;
  readonly replayRepository?: CompletedMatchReplayRepository;
  readonly authBaseUrl?: string;
  readonly socketIdleTimeoutMs?: number;
  readonly rematchLobbyDisconnectGraceMs?: number;
  readonly matchTimerPolicy?: MatchTimerPolicy;
  readonly matchTimerTickMs?: number;
}

export const defaultSocketIdleTimeoutMs = 60 * 60 * 1000;
export const defaultRematchLobbyDisconnectGraceMs = 1_000;
export const defaultMatchTimerTickMs = 1_000;

export const resolveAllowRawDeckHashSubmissions = (
  options: CreateMatchHttpServerOptions,
): boolean => {
  if (options.allowRawDeckHashSubmissions !== undefined) {
    return options.allowRawDeckHashSubmissions;
  }
  const simEnv = process.env["PONEGLYPH_SIM_ENV"]?.trim().toLowerCase();
  return simEnv !== "dev" && simEnv !== "prod" && simEnv !== "production";
};

export const resolveCompletedMatchRepository = (
  options: CreateMatchHttpServerOptions,
): CompletedMatchRepository | undefined =>
  options.completedMatchRepository ??
  (process.env["PONEGLYPH_SIM_COMPLETED_MATCH_DB"] === "true"
    ? createPostgresCompletedMatchRepository()
    : undefined);

export const resolveReplayRepository = (
  options: CreateMatchHttpServerOptions,
): CompletedMatchReplayRepository | undefined =>
  options.replayRepository ??
  (process.env["PONEGLYPH_SIM_COMPLETED_MATCH_DB"] === "true"
    ? createPostgresCompletedMatchReplayRepository()
    : undefined);

export const createDefaultMatchSetupFactory =
  (options: CreateMatchHttpServerOptions) => async (matchId?: MatchId) =>
    createPremadeDevMatchSetup({
      ...(matchId === undefined ? {} : { matchId }),
      ...(options.fetchCard === undefined
        ? {}
        : { fetchCard: options.fetchCard }),
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.redisUrl === undefined ? {} : { redisUrl: options.redisUrl }),
      ...(options.redisMode === undefined
        ? {}
        : { redisMode: options.redisMode }),
    });

export const resolveMatchTimerPolicy = (
  options: CreateMatchHttpServerOptions,
): MatchTimerPolicy => options.matchTimerPolicy ?? defaultMatchTimerPolicy;
