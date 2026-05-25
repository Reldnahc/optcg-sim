import type {
  CardId,
  DecisionId,
  DecisionResponse,
  InstanceId,
  MatchId,
  PlayerId,
  PlayerView,
} from "@optcg/types";

export interface ClientVisibleAction {
  index: number;
  type: PlayerView["legalActions"][number]["type"] | "advanceToMainPhase";
  label: string;
  placement?: {
    instanceId: InstanceId;
  };
  attachment?: {
    donInstanceId: InstanceId;
    targetInstanceId: InstanceId;
  };
}

export interface ClientPlayerSnapshot {
  view: PlayerView;
  actions: ClientVisibleAction[];
}

export interface MatchSnapshot {
  matchId?: MatchId;
  stateSeq: number;
  actionSeq?: number;
  status?: string;
  players: Record<PlayerId, ClientPlayerSnapshot>;
}

export interface MatchCardCatalogEntry {
  cardId: CardId;
  name: string;
  category: string;
  cost?: number;
  power?: number;
  life?: number;
  imageUrl?: string;
}

export interface MatchCardCatalog {
  players: Record<PlayerId, { cards: Record<CardId, MatchCardCatalogEntry> }>;
}

export interface CreatedMatch {
  matchId: MatchId;
  seats: Record<string, { playerId: PlayerId; claimed: boolean }>;
  snapshot: MatchSnapshot;
}

export interface ClaimedSeat {
  matchId: MatchId;
  seat: {
    playerId: PlayerId;
    sessionToken: string;
  };
}

export interface SubmitVisibleActionInput {
  matchId: MatchId;
  playerId: PlayerId;
  sessionToken: string;
  actionIndex: number;
  expectedStateSeq?: number;
}

export interface RespondToDecisionInput {
  matchId: MatchId;
  playerId: PlayerId;
  sessionToken: string;
  decisionId: DecisionId;
  response: DecisionResponse;
}

export interface MatchActionResult {
  snapshot: MatchSnapshot;
  errors: string[];
}

export interface MatchTransport {
  createMatch: () => Promise<CreatedMatch>;
  claimSeat: (input: {
    matchId: MatchId;
    playerId: PlayerId;
  }) => Promise<ClaimedSeat>;
  loadState: (matchId: MatchId) => Promise<MatchSnapshot>;
  loadCards: (matchId: MatchId) => Promise<MatchCardCatalog>;
  submitVisibleAction: (
    input: SubmitVisibleActionInput,
  ) => Promise<MatchActionResult>;
  respondToDecision: (
    input: RespondToDecisionInput,
  ) => Promise<MatchActionResult>;
}
