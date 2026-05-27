import type {
  CardId,
  CardInstance,
  GameState,
  PlayerId,
  PlayerView,
  Zone,
} from "@optcg/types";
import type { LegalAction } from "@optcg/types";

export interface DevVisibleAction {
  index: number;
  type: LegalAction["type"] | "advanceToMainPhase";
  label: string;
  decisionPayment?:
    | { kind: "paymentDeclined" }
    | {
        kind: "cardCost";
        operation: "trash" | "returnToHand" | "moveCards";
        chooseLabel: string;
        selectedCardInstanceIds: CardInstance["instanceId"][];
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

export interface DevMatchSnapshot {
  stateSeq: number;
  actionSeq: number;
  stateHash: string;
  status: GameState["status"]["type"];
  turn: GameState["turn"];
  activePlayerId: PlayerId;
  players: Record<PlayerId, DevPlayerSnapshot>;
}

export interface DevCardCatalogEntry {
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

export interface DevPlayerCardCatalog {
  cards: Record<CardId, DevCardCatalogEntry>;
}

export interface DevVisibleCardCatalog {
  players: Record<PlayerId, DevPlayerCardCatalog>;
}
