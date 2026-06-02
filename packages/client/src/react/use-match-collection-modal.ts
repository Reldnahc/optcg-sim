import { useEffect, useState } from "react";
import type { CardRef, InstanceId, PlayerId } from "@optcg/types";

import {
  createCollectionDecisionSurface,
  usesCollectionCardCostSurface,
} from "../interactions/decision-surface.js";
import type {
  BoardViewModel,
  ClientCardModel,
  DecisionModalModel,
} from "../index.js";
import type { MatchClientUiState } from "./useMatchClient-support.js";
import {
  collectionModalFromWindowKey,
  collectionWindowKey,
  defaultCollectionWindowRect,
} from "./collection-window-model.js";
import type { CollectionModalHostProps } from "./CollectionModalHost.js";
import type { WindowRect } from "./FloatingWindow.js";
import { sourceZoneCards } from "./source-zone-cards.js";

interface UseMatchCollectionModalInput {
  activeDockedWindowIds: ReadonlySet<string>;
  activeFloatingWindowRects: Readonly<Record<string, WindowRect>>;
  activeOpenWindowIds: ReadonlySet<string>;
  board?: BoardViewModel | undefined;
  cardCostSelection?: MatchClientUiState["cardCostSelection"];
  cardModel: (card: CardRef) => ClientCardModel;
  completeDockableWindowDrag: (
    windowKey: string,
    rect: WindowRect,
  ) => WindowRect | undefined;
  currentPlayerId?: PlayerId | undefined;
  decisionModal?: DecisionModalModel | undefined;
  disabled: boolean;
  displayBoard?: BoardViewModel | undefined;
  onConfirmDecision: () => void;
  onPreviewCard: (card: ClientCardModel) => void;
  onToggleDecisionCard: (instanceId: InstanceId) => void;
  updateCollectionWindowOpen: (windowKey: string, open: boolean) => void;
  updateControlDockTarget: (rect: WindowRect) => void;
  updateFloatingWindowRect: (windowKey: string, rect: WindowRect) => void;
}

export interface MatchCollectionModalState {
  clearCollectionModal: () => void;
  decisionModalCoveredByCollection: boolean;
  hasCollectionDecisionSurface: boolean;
  promptCoveredByCollection: boolean;
  hostProps: CollectionModalHostProps;
  onViewCollection: (title: string, cards: readonly ClientCardModel[]) => void;
}

export const useMatchCollectionModal = ({
  activeDockedWindowIds,
  activeFloatingWindowRects,
  activeOpenWindowIds,
  board,
  cardCostSelection,
  cardModel,
  completeDockableWindowDrag,
  currentPlayerId,
  decisionModal,
  disabled,
  displayBoard,
  onConfirmDecision,
  onPreviewCard,
  onToggleDecisionCard,
  updateCollectionWindowOpen,
  updateControlDockTarget,
  updateFloatingWindowRect,
}: UseMatchCollectionModalInput): MatchCollectionModalState => {
  const [collectionModal, setCollectionModal] = useState<
    { title: string; cards: readonly ClientCardModel[] } | undefined
  >();
  const [collectionMinimized, setCollectionMinimized] = useState(false);
  const collectionDecisionSurface = createCollectionDecisionSurface(
    decisionModal,
    currentPlayerId,
  );
  const decisionCollectionModal =
    collectionDecisionSurface === undefined
      ? undefined
      : {
          title: collectionDecisionSurface.title,
          cards: collectionDecisionSurface.model.cards.map((choice) =>
            cardModel(choice.card),
          ),
          selection: {
            selectedInstanceIds:
              collectionDecisionSurface.model.selectedInstanceIds.map(String),
            selectableInstanceIds: collectionDecisionSurface.model.cards
              .filter((choice) => choice.selectable)
              .map((choice) => String(choice.card.instanceId)),
            canConfirm: collectionDecisionSurface.model.canConfirm,
            confirmLabel: collectionDecisionSurface.model.confirmLabel,
          },
        };
  const cardCostCollectionModal =
    board === undefined ||
    cardCostSelection === undefined ||
    !usesCollectionCardCostSurface(cardCostSelection.source)
      ? undefined
      : {
          title: cardCostSelection.title,
          cards: sourceZoneCards(board, cardCostSelection.source),
          selection: {
            selectedInstanceIds: cardCostSelection.selectedInstanceIds,
            selectableInstanceIds: cardCostSelection.selectableInstanceIds,
            canConfirm: cardCostSelection.canConfirm,
            confirmLabel: cardCostSelection.confirmLabel,
            ...(cardCostSelection.orderHint === undefined
              ? {}
              : { orderHint: cardCostSelection.orderHint }),
          },
        };
  const persistedCollectionModal =
    displayBoard === undefined
      ? undefined
      : [...activeOpenWindowIds]
          .flatMap((key) => {
            const modal = collectionModalFromWindowKey(key, displayBoard);
            return modal === undefined ? [] : [modal];
          })
          .sort((left, right) => left.title.localeCompare(right.title))[0];
  const renderedCollectionModal =
    cardCostCollectionModal ??
    decisionCollectionModal ??
    collectionModal ??
    persistedCollectionModal;
  const renderedCollectionKey = renderedCollectionModal?.title;
  const collectionViewerKey =
    cardCostCollectionModal === undefined &&
    decisionCollectionModal === undefined
      ? renderedCollectionModal?.title
      : undefined;
  const collectionViewerWindowKey =
    collectionViewerKey === undefined
      ? undefined
      : collectionWindowKey(collectionViewerKey);
  const collectionViewerDocked =
    collectionViewerWindowKey !== undefined &&
    activeDockedWindowIds.has(collectionViewerWindowKey);
  const collectionPresentation =
    collectionViewerKey === undefined ? "modal" : "window";

  useEffect(() => {
    setCollectionMinimized(false);
  }, [renderedCollectionKey]);

  return {
    clearCollectionModal: () => {
      setCollectionModal(undefined);
    },
    decisionModalCoveredByCollection: collectionDecisionSurface !== undefined,
    hasCollectionDecisionSurface: collectionDecisionSurface !== undefined,
    promptCoveredByCollection:
      cardCostCollectionModal !== undefined ||
      decisionCollectionModal !== undefined,
    hostProps: {
      model: collectionViewerDocked ? undefined : renderedCollectionModal,
      presentation: collectionPresentation,
      disabled,
      minimized: collectionMinimized,
      initialRect:
        collectionViewerWindowKey === undefined
          ? undefined
          : (activeFloatingWindowRects[collectionViewerWindowKey] ??
            defaultCollectionWindowRect()),
      onToggleMinimized: () => {
        setCollectionMinimized((current) => !current);
      },
      onRectChange:
        collectionViewerWindowKey === undefined
          ? undefined
          : (rect) => {
              updateFloatingWindowRect(collectionViewerWindowKey, rect);
            },
      onDragMove:
        collectionViewerWindowKey === undefined
          ? undefined
          : updateControlDockTarget,
      onDragEnd:
        collectionViewerWindowKey === undefined
          ? undefined
          : (rect) =>
              completeDockableWindowDrag(collectionViewerWindowKey, rect),
      onToggleCard: (instanceId) => {
        onToggleDecisionCard(instanceId as InstanceId);
      },
      onConfirm: onConfirmDecision,
      onPreviewCard,
      onClose:
        cardCostCollectionModal === undefined &&
        decisionCollectionModal === undefined
          ? () => {
              if (collectionModal !== undefined) {
                setCollectionModal(undefined);
              }
              if (collectionViewerWindowKey !== undefined) {
                updateCollectionWindowOpen(collectionViewerWindowKey, false);
              }
            }
          : undefined,
    },
    onViewCollection: (title, cards) => {
      const key = collectionWindowKey(title);
      const nextOpen = renderedCollectionModal?.title !== title;
      setCollectionMinimized(false);
      setCollectionModal(nextOpen ? { title, cards } : undefined);
      updateCollectionWindowOpen(key, nextOpen);
    },
  };
};
