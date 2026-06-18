import type { CardInstance, PlayerId } from "@optcg/types";

import type { DonCostPaidPayload } from "./don-payment.js";
import type { LifeVisibilityCostPaidPayload } from "./life-visibility-payment.js";

export type PayCostPaidPayload =
  | DonCostPaidPayload
  | {
      playerId: PlayerId;
      optionId: "attachDon";
      selectedDonInstanceIds: CardInstance["instanceId"][];
      selectedCardInstanceIds: CardInstance["instanceId"][];
    }
  | {
      playerId: PlayerId;
      optionId: "restSelf";
      selectedCardInstanceIds: [CardInstance["instanceId"]];
    }
  | {
      playerId: PlayerId;
      optionId: "trashSelf";
      selectedCardInstanceIds: [CardInstance["instanceId"]];
    }
  | {
      playerId: PlayerId;
      optionId:
        | "trashFromHand"
        | "trashFromField"
        | "koFromField"
        | "revealFromHand";
      selectedCardInstanceIds: CardInstance["instanceId"][];
    }
  | {
      playerId: PlayerId;
      optionId: "restFromField";
      selectedCardInstanceIds: CardInstance["instanceId"][];
    }
  | {
      playerId: PlayerId;
      optionId: "moveCards";
      selectedCardInstanceIds: CardInstance["instanceId"][];
    }
  | {
      playerId: PlayerId;
      optionId: "moveFieldToLife";
      selectedCardInstanceIds: CardInstance["instanceId"][];
    }
  | {
      playerId: PlayerId;
      optionId: "shuffleDeck";
    }
  | LifeVisibilityCostPaidPayload
  | {
      playerId: PlayerId;
      optionId: "modifyPower";
      value: number;
    };
