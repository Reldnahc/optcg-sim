import type {
  CardId,
  CardInstance,
  EffectTextSourceMap,
  GameState,
  InstanceId,
  PlayerId,
  PlayerView,
  Zone,
} from "@optcg/types";
import type { LegalAction } from "@optcg/types";

export interface DevVisibleAction {
  index: number;
  type: LegalAction["type"] | "advanceToMainPhase";
  label: string;
  responseKey?: string;
  decisionPayment?:
    | { kind: "paymentDeclined" }
    | {
        kind: "cardCost";
        operation: "trash" | "returnToHand" | "moveCards" | "returnDon";
        chooseLabel: string;
        selectedCardInstanceIds: CardInstance["instanceId"][];
        selectedCards?: Array<{
          instanceId: CardInstance["instanceId"];
          zone: Zone;
          playerId?: PlayerId | undefined;
          index?: number | undefined;
        }>;
        source?: { zone: Zone; playerId?: PlayerId } | undefined;
      };
  attack?: {
    attackerInstanceId: CardInstance["instanceId"];
    targetInstanceId: CardInstance["instanceId"];
  };
  counter?: {
    cardInstanceId: CardInstance["instanceId"];
    targetInstanceId: CardInstance["instanceId"];
  };
  placement?: {
    instanceId: CardInstance["instanceId"];
  };
  attachment?: {
    donInstanceId: CardInstance["instanceId"];
    targetInstanceId: CardInstance["instanceId"];
  };
}

export interface DevPlayerSnapshot {
  view: PlayerView;
  actions: DevVisibleAction[];
}

export interface DevRollbackPointView {
  rollbackPointId: string;
  eventId?: string;
  eventSeq: number;
  stateSeq: number;
  actionSeq: number;
  label: string;
}

export interface DevRollbackView {
  enabled: boolean;
  canRequest: boolean;
  points: DevRollbackPointView[];
  pendingRequest?: {
    rollbackPointId: string;
    requestedBy: PlayerId;
    approvingPlayerId: PlayerId;
  };
}

export interface DevMatchSnapshot {
  stateSeq: number;
  actionSeq: number;
  stateHash: string;
  status: GameState["status"]["type"];
  turn: GameState["turn"];
  activePlayerId: PlayerId;
  playerLabels?: Partial<
    Record<
      PlayerId,
      {
        displayName?: string;
        connectionStatus?: "connected" | "disconnected";
      }
    >
  >;
  players: Record<PlayerId, DevPlayerSnapshot>;
  rollback?: DevRollbackView;
}

export interface DevCardCatalogEntry {
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

export interface DevPlayerCardCatalog {
  cards: Record<CardId, DevCardCatalogEntry>;
  instances?: Record<InstanceId, DevCardCatalogEntry>;
}

export interface DevVisibleCardCatalog {
  players: Record<PlayerId, DevPlayerCardCatalog>;
}
