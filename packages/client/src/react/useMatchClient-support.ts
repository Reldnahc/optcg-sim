import { useEffect } from "react";
import type {
  DecisionId,
  EngineEvent,
  InstanceId,
  MatchId,
  PlayerId,
} from "@optcg/types";

import { createCanonicalDonPaymentActions } from "../index.js";
import type {
  BoardViewModel,
  ClientActionModel,
  DecisionDraft,
  DecisionModalModel,
  MatchClientState,
  MatchClientSessionState,
  OptionalCardCostChoice,
  OptionalCardCostGroup,
  PendingDecisionInteractionMode,
} from "../index.js";

export interface MatchClientUiState {
  clientState?: MatchClientSessionState;
  board?: BoardViewModel;
  selectedCardInstanceId?: string;
  selectedDonInstanceIds: string[];
  decisionDraft?: DecisionDraft;
  decisionModal?: DecisionModalModel;
  cardCostSelection?: {
    title: string;
    source?: OptionalCardCostGroup["source"];
    selectableInstanceIds: string[];
    selectedInstanceIds: string[];
    canConfirm: boolean;
    confirmLabel: string;
    orderHint?: string | undefined;
  };
  pendingChoiceInstanceIds: string[];
  decisionSelectedInstanceIds: string[];
  actionInFlight: boolean;
  errors: string[];
}

export interface MatchClientUi {
  state: MatchClientUiState;
  currentPlayerId?: PlayerId | undefined;
  cardActions: (instanceId: string) => ClientActionModel[];
  globalActions: () => ClientActionModel[];
  selectCard: (instanceId: string | undefined) => void;
  submitAction: (actionIndex: number) => Promise<void>;
  toggleDecisionCard: (instanceId: InstanceId) => void;
  moveDecisionCard: (
    draggedId: InstanceId,
    targetId: InstanceId,
    placement: "before" | "after",
  ) => void;
  toggleDecisionCardBottomPlacement: (instanceId: InstanceId) => void;
  setDecisionQuantityValue: (quantity: number) => void;
  setDecisionOptionValue: (option: string) => void;
  setDecisionActionOptionValue: (actionIndex: number) => void;
  chooseDecisionTriggerValue: (triggerId: string) => void;
  confirmDecision: () => Promise<void>;
  requestRollback: (rollbackPointId: string) => Promise<void>;
  createNewMatch: () => Promise<void>;
}

export const seatIdFromUrl = (): PlayerId => {
  const value = new URL(window.location.href).searchParams.get("seat");
  return (value ?? "p1") as PlayerId;
};

export const matchIdFromUrl = (): MatchId | undefined => {
  const value = new URL(window.location.href).searchParams.get("matchId");
  return value === null ? undefined : (value as MatchId);
};

export const lobbyIdFromUrl = (): string | undefined => {
  const value = new URL(window.location.href).searchParams.get("lobbyId");
  return value === null ? undefined : value;
};

export const setMatchLocation = (
  matchId: MatchId,
  playerId: PlayerId,
): void => {
  const url = new URL(window.location.href);
  url.searchParams.delete("lobbyId");
  url.searchParams.set("matchId", String(matchId));
  url.searchParams.set("seat", String(playerId));
  window.history.replaceState({}, "", url);
};

export const setLobbyLocation = (lobbyId: string, playerId: PlayerId): void => {
  const url = new URL(window.location.href);
  url.searchParams.delete("matchId");
  url.searchParams.set("lobbyId", lobbyId);
  url.searchParams.set("seat", String(playerId));
  window.history.replaceState({}, "", url);
};

export const isMatchClientState = (
  state: MatchClientSessionState | undefined,
): state is MatchClientState =>
  state !== undefined && "matchId" in state && "snapshot" in state;

export const visibleErrors = (errors: readonly string[]): string[] => [
  ...errors,
];

export const isSelfAttachmentTarget = (
  board: BoardViewModel | undefined,
  instanceId: string,
): boolean =>
  board !== undefined &&
  (String(board.self.leader.instanceId) === instanceId ||
    board.self.characters.some(
      (card) => String(card.instanceId) === instanceId,
    ));

export const zoneClickVisibleInstanceIds = (
  board: BoardViewModel | undefined,
): string[] => {
  if (board === undefined) {
    return [];
  }
  return [
    ...board.self.hand,
    board.self.leader,
    ...board.self.characters,
    ...(board.self.stage === undefined ? [] : [board.self.stage]),
    ...board.self.costArea,
    board.opponent.leader,
    ...board.opponent.characters,
    ...(board.opponent.stage === undefined ? [] : [board.opponent.stage]),
    ...board.opponent.costArea,
  ].map((card) => String(card.instanceId));
};

export const decisionCandidateInstanceIds = (
  decision: NonNullable<
    MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
  >,
): string[] =>
  decision.type === "selectCards" || decision.type === "selectTargets"
    ? decision.candidates.map((candidate) => String(candidate.card.instanceId))
    : [];

export const decisionHasCandidate = (
  decision: NonNullable<
    MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
  >,
  instanceId: string,
): boolean => decisionCandidateInstanceIds(decision).includes(instanceId);

const eventDecisionId = (event: EngineEvent): string | undefined => {
  if (typeof event.payload !== "object" || event.payload === null) {
    return undefined;
  }
  const decisionId = (event.payload as Record<string, unknown>)["decisionId"];
  return typeof decisionId === "string" ? decisionId : undefined;
};

export const resolvingEffectSourceInstanceIds = ({
  pendingDecision,
  events,
}: {
  pendingDecision:
    | MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
    | undefined;
  events: readonly EngineEvent[];
}): string[] => {
  if (pendingDecision === undefined) {
    return [];
  }
  const pendingId = String(pendingDecision.id);
  const decisionEventIndex = events.findLastIndex(
    (event) =>
      event.type === "decisionCreated" && eventDecisionId(event) === pendingId,
  );
  if (decisionEventIndex < 0) {
    return [];
  }
  for (let index = decisionEventIndex - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined) {
      continue;
    }
    if (event.type === "effectResolved") {
      return [];
    }
    if (event.type === "effectQueued" && event.source !== undefined) {
      return [String(event.source.instanceId)];
    }
  }
  return [];
};

export const chooseNoDecisionLabel = (
  decision: NonNullable<
    MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
  >,
): string =>
  decision.type === "selectTargets" ? "Choose no target" : "Choose no card";

export const CONFIRM_DECISION_SELECTION_ACTION_INDEX = -2;
export const CLEAR_DECISION_SELECTION_ACTION_INDEX = -3;
export const CHOOSE_NO_DECISION_CARDS_ACTION_INDEX = -4;

export const activeCardCostGlobalActions = ({
  choice,
  group,
  explicitChoiceActive,
  selectedInstanceCount,
  selectedActionIndex,
}: {
  choice: OptionalCardCostChoice;
  group: OptionalCardCostGroup;
  explicitChoiceActive: boolean;
  selectedInstanceCount: number;
  selectedActionIndex: number | undefined;
}): ClientActionModel[] => {
  const clickDrivenReturnDon = group.operation === "returnDon";
  const actions: ClientActionModel[] = [
    {
      index: choice.declineActionIndex,
      label: "Decline cost",
      type: "respondToDecision",
    },
  ];
  if (explicitChoiceActive) {
    actions.push({
      index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
      label: "Cancel card choice",
      type: "clearDecisionSelection",
    });
  }
  if (
    !clickDrivenReturnDon &&
    group.requiredCount > 1 &&
    selectedActionIndex !== undefined
  ) {
    actions.push({
      index: CONFIRM_DECISION_SELECTION_ACTION_INDEX,
      label: "Pay cost",
      type: "confirmDecisionSelection",
    });
  }
  if (
    !clickDrivenReturnDon &&
    group.requiredCount > 1 &&
    selectedInstanceCount > 0
  ) {
    actions.push({
      index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
      label: "Clear selection",
      type: "clearDecisionSelection",
    });
  }
  return actions;
};

export const buildGlobalActions = ({
  playerSnapshot,
  attackTargetChoiceActive,
  counterTargetChoiceActive,
  activeCardCostGroup,
  optionalCardCostChoice,
  explicitCardCostChoiceActive,
  selectedCardCostInstanceCount,
  selectedCardCostActionIndex,
  pendingDecisionInteractionMode,
  pendingDecision,
  activeDecisionDraft,
}: {
  playerSnapshot: MatchClientState["snapshot"]["players"][PlayerId] | undefined;
  attackTargetChoiceActive: boolean;
  counterTargetChoiceActive: boolean;
  activeCardCostGroup: OptionalCardCostGroup | undefined;
  optionalCardCostChoice: OptionalCardCostChoice | undefined;
  explicitCardCostChoiceActive: boolean;
  selectedCardCostInstanceCount: number;
  selectedCardCostActionIndex: number | undefined;
  pendingDecisionInteractionMode: PendingDecisionInteractionMode | undefined;
  pendingDecision:
    | MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
    | undefined;
  activeDecisionDraft: DecisionDraft | undefined;
}): ClientActionModel[] => {
  if (playerSnapshot === undefined) {
    return [];
  }
  if (attackTargetChoiceActive) {
    return [
      {
        index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
        label: "Cancel attack",
        type: "clearDecisionSelection",
      },
    ];
  }
  if (counterTargetChoiceActive) {
    return [
      {
        index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
        label: "Cancel counter",
        type: "clearDecisionSelection",
      },
    ];
  }
  if (
    activeCardCostGroup !== undefined &&
    optionalCardCostChoice !== undefined
  ) {
    return activeCardCostGlobalActions({
      choice: optionalCardCostChoice,
      group: activeCardCostGroup,
      explicitChoiceActive: explicitCardCostChoiceActive,
      selectedInstanceCount: selectedCardCostInstanceCount,
      selectedActionIndex: selectedCardCostActionIndex,
    });
  }
  if (
    pendingDecisionInteractionMode === "zoneClick" &&
    pendingDecision !== undefined &&
    (pendingDecision.type === "selectCards" ||
      pendingDecision.type === "selectTargets")
  ) {
    const actions: ClientActionModel[] = [];
    if (pendingDecision.min === 0) {
      actions.push({
        index: CHOOSE_NO_DECISION_CARDS_ACTION_INDEX,
        label: chooseNoDecisionLabel(pendingDecision),
        type: "chooseNoDecisionCards",
      });
    }
    if (
      pendingDecision.max > 1 &&
      activeDecisionDraft?.kind === "selectCards" &&
      activeDecisionDraft.selectedInstanceIds.length >= pendingDecision.min
    ) {
      actions.push({
        index: CONFIRM_DECISION_SELECTION_ACTION_INDEX,
        label: "Confirm selection",
        type: "confirmDecisionSelection",
      });
      if (activeDecisionDraft.selectedInstanceIds.length > 0) {
        actions.push({
          index: CLEAR_DECISION_SELECTION_ACTION_INDEX,
          label: "Clear selection",
          type: "clearDecisionSelection",
        });
      }
    }
    return actions;
  }
  const globalActions = playerSnapshot.actions
    .filter((action) => action.placement === undefined)
    .map((action) => ({
      index: action.index,
      label: action.label,
      type: action.type,
    }));
  return pendingDecision?.type === "payCost"
    ? (createCanonicalDonPaymentActions(globalActions) ?? globalActions)
    : globalActions;
};

export const toggleCardCostSelectedInstanceId = (
  selected: readonly string[],
  instanceId: string,
  max: number,
): string[] => {
  if (selected.includes(instanceId)) {
    return selected.filter((selectedId) => selectedId !== instanceId);
  }
  if (selected.length >= max) {
    return [...selected];
  }
  return [...selected, instanceId];
};

export const useCostReset = (
  decisionId: DecisionId | undefined,
  group: OptionalCardCostGroup | undefined,
  setSelectedInstanceIds: (selected: string[]) => void,
): void => {
  const key =
    group === undefined || decisionId === undefined
      ? undefined
      : `${String(decisionId)}:${String(group.chooseActionIndex)}`;
  useEffect(() => {
    setSelectedInstanceIds([]);
  }, [key, setSelectedInstanceIds]);
};
