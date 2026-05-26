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

export interface LocalLobby {
  lobbyId: string;
  seats: Record<string, { playerId: PlayerId; claimed: boolean }>;
  matchId?: MatchId;
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

export interface MatchStateSyncMessage {
  type: "stateSync";
  matchId: MatchId;
  serverSeq: number;
  stateSeq: number;
  snapshot: MatchSnapshot;
  cards: MatchCardCatalog;
}

export interface MatchActionResultMessage {
  type: "actionResult";
  matchId: MatchId;
  clientActionId: string;
  accepted: boolean;
  stateSeq: number;
  actionSeq?: number;
  errors: string[];
}

export interface LiveMatchConnection {
  close: () => void;
  submitVisibleAction: (
    input: Omit<SubmitVisibleActionInput, "sessionToken">,
  ) => Promise<MatchActionResult>;
  respondToDecision: (
    input: Omit<RespondToDecisionInput, "sessionToken">,
  ) => Promise<MatchActionResult>;
}

export interface MatchLiveTransport {
  connect: (input: {
    matchId: MatchId;
    playerId: PlayerId;
    sessionToken: string;
    onStateSync: (message: MatchStateSyncMessage) => void;
    onError: (message: string) => void;
  }) => LiveMatchConnection;
}

export interface MatchTransport {
  createLobby: () => Promise<LocalLobby>;
  claimLobbySeat: (input: {
    lobbyId: string;
    playerId: PlayerId;
  }) => Promise<LocalLobby>;
  loadLobby: (lobbyId: string) => Promise<LocalLobby>;
  createMatch: () => Promise<CreatedMatch>;
  claimSeat: (input: {
    matchId: MatchId;
    playerId: PlayerId;
    sessionToken?: string;
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
