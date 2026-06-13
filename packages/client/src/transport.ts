import type {
  CardId,
  DecisionId,
  DecisionResponse,
  EffectTextSourceMap,
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
  responseKey?: string;
  decisionPayment?:
    | { kind: "paymentDeclined" }
    | {
        kind: "cardCost";
        operation:
          | "trash"
          | "returnToHand"
          | "moveCards"
          | "returnDon"
          | "reveal";
        chooseLabel: string;
        selectedCardInstanceIds: InstanceId[];
        selectedCards?: Array<{
          instanceId: InstanceId;
          zone: Zone;
          playerId?: PlayerId | undefined;
          index?: number | undefined;
        }>;
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
  playerLabels?: Partial<
    Record<
      PlayerId,
      {
        displayName?: string;
        connectionStatus?: "connected" | "disconnected";
      }
    >
  >;
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
  counter?: number;
  life?: number;
  attributes?: string[];
  types?: string[];
  effectText?: string;
  triggerText?: string;
  effectTextSourceMap?: EffectTextSourceMap;
  triggerTextSourceMap?: EffectTextSourceMap;
  imageUrl?: string;
}

export interface MatchCardCatalog {
  players: Record<
    PlayerId,
    {
      cards: Record<CardId, MatchCardCatalogEntry>;
      instances?: Record<InstanceId, MatchCardCatalogEntry>;
    }
  >;
}

export interface CreatedMatch {
  matchId: MatchId;
  seats: Record<string, { playerId: PlayerId; claimed: boolean }>;
  snapshot?: MatchSnapshot;
  firstPlayerChoice?: FirstPlayerChoiceView;
}

export interface ClaimedSeat {
  matchId: MatchId;
  seat: {
    playerId: PlayerId;
    sessionToken: string;
  };
  firstPlayerChoice?: FirstPlayerChoiceView;
}

export type FirstPlayerChoiceValue = "goFirst" | "goSecond";

export interface FirstPlayerChoiceView {
  chooserPlayerId: PlayerId;
  choices: readonly FirstPlayerChoiceValue[];
  resolvedFirstPlayerId?: PlayerId;
}

export interface FirstPlayerChoiceResult {
  matchId: MatchId;
  firstPlayerChoice: FirstPlayerChoiceView;
  snapshot?: MatchSnapshot;
}

export interface CustomLobby {
  lobbyId: string;
  joinCode?: string;
  settings?: CustomLobbySettings;
  seats: Record<
    string,
    { playerId: PlayerId; claimed: boolean; deck: LobbyDeckStatus }
  >;
  matchId?: MatchId;
}

export interface CustomLobbySettings {
  formatId: string;
}

export interface CreateCustomLobbyInput {
  settings?: CustomLobbySettings;
}

export interface LobbyDeckStatus {
  status: "missing" | "ready" | "invalid";
}

export interface JoinedCustomLobby extends CustomLobby {
  seat: { playerId: PlayerId; sessionToken?: string };
}

export interface PendingRematch {
  rematch: { status: "pending" };
}

export interface ValidatedLobbyLoadout {
  loadoutId: string | null;
  status: "playable" | "unplayable" | "unverified";
  errors: string[];
}

export interface ValidatedLobbyLoadouts {
  data: {
    loadouts: ValidatedLobbyLoadout[];
  };
}

export interface LobbyDeckValidationInput {
  loadoutId: string;
  deckHash: string;
  donDeckCount: number;
}

export interface SubmitVisibleActionInput {
  matchId: MatchId;
  playerId: PlayerId;
  actionIndex: number;
  expectedStateSeq: number;
}

export interface RespondToDecisionInput {
  matchId: MatchId;
  playerId: PlayerId;
  decisionId: DecisionId;
  expectedStateSeq: number;
  expectedDecisionId: DecisionId;
  response: DecisionResponse;
}

export interface RequestRollbackInput {
  matchId: MatchId;
  playerId: PlayerId;
  rollbackPointId: string;
  expectedStateSeq: number;
}

export interface CancelRollbackInput {
  matchId: MatchId;
  playerId: PlayerId;
  expectedStateSeq: number;
}

export interface MatchActionResult {
  snapshot: MatchSnapshot;
  cards: MatchCardCatalog;
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

export interface MatchTimerSyncMessage {
  type: "timerSync";
  matchId: MatchId;
  serverSeq: number;
  stateSeq: number;
  timers: PlayerView["timers"];
}

export interface MatchSetupSyncMessage {
  type: "setupSync";
  matchId: MatchId;
  serverSeq: number;
  firstPlayerChoice: FirstPlayerChoiceView;
}

export interface MatchSessionTransitionMessage {
  type: "sessionTransition";
  matchId: MatchId;
  serverSeq: number;
  nextMatchId?: MatchId;
  nextLobbyId?: string;
  firstPlayerChoice?: FirstPlayerChoiceView;
}

export interface LobbyStateSyncMessage {
  type: "lobbySync";
  lobbyId: string;
  serverSeq: number;
  lobby: CustomLobby;
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
  cancelRollback: (input: CancelRollbackInput) => Promise<MatchActionResult>;
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
    onTimerSync: (message: MatchTimerSyncMessage) => void;
    onSetupSync: (message: MatchSetupSyncMessage) => void;
    onSessionTransition: (message: MatchSessionTransitionMessage) => void;
    onError: (message: string) => void;
  }) => LiveMatchConnection;
}

export interface LobbyLiveTransport {
  connect: (input: {
    lobbyId: string;
    playerId: PlayerId;
    sessionToken: string;
    onLobbySync: (message: LobbyStateSyncMessage) => void;
    onError: (message: string) => void;
  }) => LiveLobbyConnection;
}

export interface MatchTransport {
  createLobby: (input?: CreateCustomLobbyInput) => Promise<CustomLobby>;
  joinLobby: (input: {
    lobbyId: string;
    sessionToken: string;
  }) => Promise<JoinedCustomLobby>;
  joinLobbyByCode: (input: {
    joinCode: string;
    sessionToken: string;
  }) => Promise<JoinedCustomLobby>;
  submitLobbyDeck: (input: {
    lobbyId: string;
    sessionToken: string;
    deckHash: string;
    donDeckCount: number;
  }) => Promise<CustomLobby>;
  submitLobbyLoadoutHandoff: (input: {
    lobbyId: string;
    handoffToken: string;
  }) => Promise<JoinedCustomLobby>;
  validateLobbyLoadouts: (input: {
    lobbyId: string;
    handoffTokens: readonly string[];
  }) => Promise<ValidatedLobbyLoadouts>;
  validateLobbyDecks: (input: {
    lobbyId: string;
    decks: readonly LobbyDeckValidationInput[];
  }) => Promise<ValidatedLobbyLoadouts>;
  loadLobby: (lobbyId: string) => Promise<CustomLobby>;
  createMatch: () => Promise<CreatedMatch>;
  createRematch: (input: {
    matchId: MatchId;
    playerId: PlayerId;
    sessionToken: string;
  }) => Promise<CreatedMatch | JoinedCustomLobby | PendingRematch>;
  claimSeat: (input: {
    matchId: MatchId;
    playerId: PlayerId;
    sessionToken?: string;
  }) => Promise<ClaimedSeat>;
  claimSeatForAccount: (input: {
    matchId: MatchId;
    sessionToken: string;
  }) => Promise<ClaimedSeat>;
  chooseFirstPlayer: (input: {
    matchId: MatchId;
    playerId: PlayerId;
    choice: FirstPlayerChoiceValue;
  }) => Promise<FirstPlayerChoiceResult>;
}
