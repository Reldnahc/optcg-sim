import { useEffect, useMemo, useState } from "react";
import type { DecisionId } from "@optcg/types";

import type { FirstPlayerSetupClientState } from "../controller.js";
import type { DecisionModalModel } from "../interactions/decision-modal.js";

export const useFirstPlayerChoiceModal = (
  state: FirstPlayerSetupClientState | undefined,
  chooseFirstPlayer: (choice: "goFirst" | "goSecond") => Promise<void>,
): {
  model?: DecisionModalModel | undefined;
  onOption?: ((option: string) => void) | undefined;
  onSubmitOption?: ((option: string) => void) | undefined;
  onConfirm?: (() => void) | undefined;
} => {
  const [selection, setSelection] = useState<"goFirst" | "goSecond">("goFirst");
  const chooser =
    state !== undefined &&
    state.firstPlayerChoice.chooserPlayerId === state.seat.playerId;

  useEffect(() => {
    setSelection("goFirst");
  }, [state?.matchId, state?.firstPlayerChoice.chooserPlayerId]);

  const model = useMemo<DecisionModalModel | undefined>(() => {
    if (!chooser) {
      return undefined;
    }
    return {
      title: "Choose first player",
      instruction: "Choose who takes the first turn.",
      kind: "chooseOption",
      decisionId: "first-player-choice" as DecisionId,
      prompt: "Choose first player",
      options: [
        { value: "goFirst", label: "Go first" },
        { value: "goSecond", label: "Go second" },
      ],
      selectedOption: selection,
      canConfirm: true,
      confirmLabel: "Confirm",
    };
  }, [chooser, selection]);

  if (model === undefined) {
    return {};
  }
  return {
    model,
    onOption(option) {
      if (option === "goFirst" || option === "goSecond") {
        setSelection(option);
      }
    },
    onSubmitOption(option) {
      if (option === "goFirst" || option === "goSecond") {
        void chooseFirstPlayer(option);
      }
    },
    onConfirm() {
      void chooseFirstPlayer(selection);
    },
  };
};
