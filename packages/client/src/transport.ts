import type {
  CardId,
  DecisionId,
  DecisionResponse,
  InstanceId,
  MatchId,
  PlayerId,
  PlayerView,
  Zone,
} from "@optcg/types";

export interface ClientVisibleAction {
  index: number;
  type: PlayerView["legalActions"][number]["type"] | "advanceToMainPhase";
  label: string;
  decisionPayment?:
    | { kind: "paymentDeclined" }
    | {
        kind: "cardCost";
        operation: "trash" | "returnToHand" | "moveCards" | "returnDon";
        chooseLabel: string;
        selectedCardInstanceIds: InstanceId[];
        source?: { zone: Zone; playerId?: PlayerId } | undefined;
      };
  attack?: {
    attackerInstanceId: InstanceId;
    targetInstanceId: InstanceId;
  };
  counter?: {
    cardInstanceId: InstanceId;
    targetInstanceId: InstanceId;
  };
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
  rollback?: {
    enabled: boolean;
    canRequest: boolean;
    points: RollbackPointView[];
    pendingRequest?: {
      rollbackPointId: string;
      requestedBy: PlayerId;
      approvingPlayerId: PlayerId;
    };
  };
}

export interface RollbackPointView {
  rollbackPointId: string;
  eventId?: string;
  eventSeq: number;
  stateSeq: number;
  actionSeq: number;
  label: string;
}

export interface MatchCardCatalogEntry {
  cardId: CardId;
  name: string;
  category: string;
  cost?: number;
  power?: number;
  life?: number;
  effectText?: string;
  triggerText?: string;
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
  actionIndex: number;
  expectedStateSeq?: number;
}

export interface RespondToDecisionInput {
  matchId: MatchId;
  playerId: PlayerId;
  decisionId: DecisionId;
  response: DecisionResponse;
}

export interface RequestRollbackInput {
  matchId: MatchId;
  playerId: PlayerId;
  rollbackPointId: string;
  expectedStateSeq?: number;
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

export interface LobbyStateSyncMessage {
  type: "lobbySync";
  lobbyId: string;
  serverSeq: number;
  lobby: LocalLobby;
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
    input: SubmitVisibleActionInput,
  ) => Promise<MatchActionResult>;
  respondToDecision: (
    input: RespondToDecisionInput,
  ) => Promise<MatchActionResult>;
  requestRollback: (input: RequestRollbackInput) => Promise<MatchActionResult>;
}

export interface LiveLobbyConnection {
  close: () => void;
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

export interface LobbyLiveTransport {
  connect: (input: {
    lobbyId: string;
    playerId: PlayerId;
    onLobbySync: (message: LobbyStateSyncMessage) => void;
    onError: (message: string) => void;
  }) => LiveLobbyConnection;
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
}
