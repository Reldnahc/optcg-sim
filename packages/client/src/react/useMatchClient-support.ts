import { useEffect } from "react";
import type {
  CardId,
  DecisionId,
  EngineEvent,
  InstanceId,
  MatchId,
  PlayerId,
} from "@optcg/types";

import {
  createCanonicalDonPaymentActions,
  createCollapsedAttackActions,
  createCollapsedCounterActions,
  selectedDonAttachmentMenuAction,
} from "../index.js";
import type {
  BoardViewModel,
  ClientActionModel,
  LobbyClientState,
  DecisionDraft,
  DecisionModalModel,
  MatchClientState,
  MatchClientSessionState,
  OptionalCardCostChoice,
  OptionalCardCostGroup,
  PendingDecisionInteractionMode,
} from "../index.js";
import type { AccountLoadout } from "../account-client.js";

export interface MatchClientUiState {
  clientState?: MatchClientSessionState;
  board?: BoardViewModel;
  decisionPrompt?: string;
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
  accountLoadouts: readonly AccountLoadout[];
  accountLoadoutsStatus: "idle" | "loading" | "ready" | "error";
  accountLoadoutsError?: string | undefined;
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
  setDecisionPlacementDestination: (destination: "top" | "bottom") => void;
  setDecisionQuantityValue: (quantity: number) => void;
  setDecisionOptionValue: (option: string) => void;
  setDecisionActionOptionValue: (actionIndex: number) => void;
  chooseDecisionTriggerValue: (triggerId: string) => void;
  confirmDecision: () => Promise<void>;
  chooseFirstPlayer: (choice: "goFirst" | "goSecond") => Promise<void>;
  requestRematch: () => Promise<void>;
  requestRollback: (rollbackPointId: string) => Promise<void>;
  cancelRollback: () => Promise<void>;
  createNewMatch: () => Promise<void>;
  submitLobbyLoadout: (loadoutId: string) => Promise<void>;
}

export const matchIdFromUrl = (): MatchId | undefined => {
  const value = new URL(window.location.href).searchParams.get("matchId");
  return value === null ? undefined : (value as MatchId);
};

export const lobbyIdFromPath = (): string | undefined => {
  const url = new URL(window.location.href);
  const pathMatch = /^\/lobbies\/(?<lobbyId>[^/]+)$/u.exec(url.pathname);
  if (pathMatch !== null) {
    return decodeURIComponent(pathMatch.groups?.["lobbyId"] ?? "");
  }
  return undefined;
};

export const setMatchLocation = (matchId: MatchId): void => {
  const url = new URL(window.location.href);
  url.searchParams.delete("lobbyId");
  url.searchParams.set("matchId", String(matchId));
  url.searchParams.delete("seat");
  window.history.replaceState({}, "", url);
};

export const setLobbyLocation = (lobbyId: string): void => {
  const url = new URL(window.location.href);
  url.pathname = `/lobbies/${encodeURIComponent(lobbyId)}`;
  url.search = "";
  window.history.replaceState({}, "", url);
};

export const isMatchClientState = (
  state: MatchClientSessionState | undefined,
): state is MatchClientState =>
  state !== undefined && "matchId" in state && "snapshot" in state;

export const isLobbyClientState = (
  state: MatchClientSessionState | undefined,
): state is Extract<MatchClientSessionState, { lobbyId: string }> =>
  state !== undefined && "lobbyId" in state;

export const isFirstPlayerSetupClientState = (
  state: MatchClientSessionState | undefined,
): state is Extract<MatchClientSessionState, { firstPlayerChoice: unknown }> =>
  state !== undefined && "firstPlayerChoice" in state && !("snapshot" in state);

export const lobbyDeckStatuses = (
  lobbyState: LobbyClientState | undefined,
): {
  selfDeckStatus?: "missing" | "ready" | "invalid" | undefined;
  opponentDeckStatus?: "missing" | "ready" | "invalid" | undefined;
} => {
  const ownSeat =
    lobbyState === undefined
      ? undefined
      : lobbyState.lobby.seats[String(lobbyState.seat.playerId)];
  const opponentSeat =
    lobbyState === undefined
      ? undefined
      : Object.values(lobbyState.lobby.seats).find(
          (seat) => seat.playerId !== lobbyState.seat.playerId,
        );
  return {
    selfDeckStatus: ownSeat?.deck.status,
    opponentDeckStatus: opponentSeat?.deck.status,
  };
};

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

export const cardActionsForInstance = ({
  board,
  instanceId,
  selectedCardInstanceId,
  selectedDonInstanceIds,
  legalActions,
}: {
  board: BoardViewModel | undefined;
  instanceId: string;
  selectedCardInstanceId: string | undefined;
  selectedDonInstanceIds: readonly string[];
  legalActions: MatchClientState["snapshot"]["players"][PlayerId]["actions"];
}): ClientActionModel[] => {
  const base = board?.actionsByCardInstanceId[instanceId] ?? [];
  const collapsedActions = createCollapsedCounterActions(
    createCollapsedAttackActions(base),
  );
  if (
    selectedCardInstanceId === instanceId &&
    isSelfAttachmentTarget(board, instanceId)
  ) {
    const attachAction = selectedDonAttachmentMenuAction(
      selectedDonInstanceIds,
      legalActions,
      instanceId,
    );
    return attachAction === undefined
      ? collapsedActions
      : [...collapsedActions, attachAction];
  }
  return collapsedActions;
};

export const zoneClickVisibleInstanceIds = (
  board: BoardViewModel | undefined,
): string[] => {
  if (board === undefined) {
    return [];
  }
  return [
    ...board.self.hand,
    ...board.self.lifeCards,
    board.self.leader,
    ...board.self.characters,
    ...(board.self.stage === undefined ? [] : [board.self.stage]),
    ...board.self.costArea,
    ...board.opponent.lifeCards,
    board.opponent.leader,
    ...board.opponent.characters,
    ...(board.opponent.stage === undefined ? [] : [board.opponent.stage]),
    ...board.opponent.costArea,
  ].map((card) => String(card.instanceId));
};

const hiddenLifeChoiceCard = (
  instanceId: InstanceId,
): BoardViewModel["self"]["lifeCards"][number] => ({
  instanceId,
  cardId: "hidden" as CardId,
  name: "Hidden card",
  category: "hidden",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const overlayLifeChoiceCards = (
  cards: readonly BoardViewModel["self"]["lifeCards"][number][],
  choicesByIndex: ReadonlyMap<number, InstanceId>,
): BoardViewModel["self"]["lifeCards"] =>
  cards.map((card, index) => {
    const instanceId = choicesByIndex.get(index);
    return instanceId === undefined ? card : hiddenLifeChoiceCard(instanceId);
  });

export const applyPendingDecisionLifeChoiceCards = (
  board: BoardViewModel | undefined,
  pendingDecision:
    | MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
    | undefined,
): BoardViewModel | undefined => {
  if (
    board === undefined ||
    pendingDecision === undefined ||
    pendingDecision.type !== "selectCards"
  ) {
    return board;
  }
  const selfChoices = new Map<number, InstanceId>();
  const opponentChoices = new Map<number, InstanceId>();
  for (const candidate of pendingDecision.candidates) {
    const card = candidate.card;
    if (card.zone?.zone !== "life" || typeof card.zone.index !== "number") {
      continue;
    }
    const choices =
      card.playerId === board.playerId ? selfChoices : opponentChoices;
    choices.set(card.zone.index, card.instanceId);
  }
  if (selfChoices.size === 0 && opponentChoices.size === 0) {
    return board;
  }
  return {
    ...board,
    self: {
      ...board.self,
      lifeCards: overlayLifeChoiceCards(board.self.lifeCards, selfChoices),
    },
    opponent: {
      ...board.opponent,
      lifeCards: overlayLifeChoiceCards(
        board.opponent.lifeCards,
        opponentChoices,
      ),
    },
  };
};

export const applyActiveCardCostLifeChoiceCards = (
  board: BoardViewModel | undefined,
  activeCardCostGroup: OptionalCardCostGroup | undefined,
): BoardViewModel | undefined => {
  if (
    board === undefined ||
    activeCardCostGroup === undefined ||
    activeCardCostGroup.source?.zone !== "life"
  ) {
    return board;
  }
  const selfChoices = new Map<number, InstanceId>();
  const opponentChoices = new Map<number, InstanceId>();
  for (const action of activeCardCostGroup.cardActions) {
    for (const card of action.selectedCards ?? []) {
      if (card.zone !== "life" || card.index === undefined) {
        continue;
      }
      const choices =
        card.playerId === undefined || card.playerId === board.playerId
          ? selfChoices
          : opponentChoices;
      choices.set(card.index, card.instanceId);
    }
  }
  if (selfChoices.size === 0 && opponentChoices.size === 0) {
    return board;
  }
  return {
    ...board,
    self: {
      ...board.self,
      lifeCards: overlayLifeChoiceCards(board.self.lifeCards, selfChoices),
    },
    opponent: {
      ...board.opponent,
      lifeCards: overlayLifeChoiceCards(
        board.opponent.lifeCards,
        opponentChoices,
      ),
    },
  };
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
  if (pendingDecision.source !== undefined) {
    return [String(pendingDecision.source.instanceId)];
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

export const activeCardInstanceIdsForUi = ({
  attackSourceInstanceId,
  counterSourceInstanceId,
  playerSnapshot,
  pendingDecision,
}: {
  attackSourceInstanceId?: string | undefined;
  counterSourceInstanceId?: string | undefined;
  playerSnapshot: MatchClientState["snapshot"]["players"][PlayerId] | undefined;
  pendingDecision:
    | MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
    | undefined;
}): string[] => [
  ...(attackSourceInstanceId === undefined ? [] : [attackSourceInstanceId]),
  ...(counterSourceInstanceId === undefined ? [] : [counterSourceInstanceId]),
  ...(playerSnapshot?.view.activeEffectSources ?? []).map((source) =>
    String(source.instanceId),
  ),
  ...resolvingEffectSourceInstanceIds({
    pendingDecision,
    events: playerSnapshot?.view.events ?? [],
  }),
];

const countLabel = (count: number, singular: string, plural: string): string =>
  `${String(count)} ${count === 1 ? singular : plural}`;

export const prominentDecisionPrompt = ({
  pendingDecision,
  activeCardCostGroup,
}: {
  pendingDecision:
    | MatchClientState["snapshot"]["players"][PlayerId]["view"]["pendingDecision"]
    | undefined;
  activeCardCostGroup: OptionalCardCostGroup | undefined;
}): string | undefined => {
  if (activeCardCostGroup !== undefined) {
    const count = activeCardCostGroup.requiredCount;
    if (activeCardCostGroup.operation === "returnDon") {
      return `Return ${countLabel(count, "DON!!", "DON!!")}`;
    }
    if (activeCardCostGroup.operation === "trash") {
      return `Trash ${countLabel(count, "card", "cards")} from hand`;
    }
    if (
      activeCardCostGroup.operation === "moveCards" &&
      activeCardCostGroup.source?.zone === "trash"
    ) {
      return `Place ${countLabel(count, "card", "cards")} from trash`;
    }
    return activeCardCostGroup.chooseLabel;
  }
  if (pendingDecision === undefined) {
    return undefined;
  }
  if (pendingDecision.type === "selectCards") {
    const firstCandidate = pendingDecision.candidates[0]?.card;
    if (firstCandidate?.zone?.zone === "hand") {
      return `Choose ${countLabel(pendingDecision.max, "card", "cards")} from hand`;
    }
    if (firstCandidate?.zone?.zone === "trash") {
      return `Choose ${countLabel(pendingDecision.max, "card", "cards")} from trash`;
    }
  }
  return pendingDecision.prompt.replace(/\.$/u, "");
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
