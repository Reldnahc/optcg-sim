const CARD_ROW_GAP_PX = 5;
const MIN_VISIBLE_CARD_WIDTH_PX = 18;

export interface CardRowLayoutInput {
  availableWidth: number;
  laneExtensionWidth?: number;
  cardWidth: number;
  cardCount: number;
}

export interface CardRowLayout {
  overlap: number;
  laneExtension: number;
  edgePacked: boolean;
}

export const calculateCardRowLayout = ({
  availableWidth,
  laneExtensionWidth = 0,
  cardWidth,
  cardCount,
}: CardRowLayoutInput): CardRowLayout => {
  if (cardCount <= 1 || availableWidth <= 0 || cardWidth <= 0) {
    return { overlap: 0, laneExtension: 0, edgePacked: false };
  }

  const naturalWidth =
    cardCount * cardWidth + (cardCount - 1) * CARD_ROW_GAP_PX;
  if (naturalWidth <= availableWidth) {
    return { overlap: 0, laneExtension: 0, edgePacked: false };
  }

  const overlapNaturalWidth = cardCount * cardWidth;
  const laneExtension = Math.min(
    Math.max(0, laneExtensionWidth),
    overlapNaturalWidth - availableWidth,
  );
  const usableWidth = availableWidth + laneExtension;
  const requiredOverlap = (overlapNaturalWidth - usableWidth) / (cardCount - 1);
  const maximumOverlap = Math.max(0, cardWidth - MIN_VISIBLE_CARD_WIDTH_PX);
  const overlap = Math.min(Math.max(0, requiredOverlap), maximumOverlap);
  return { overlap, laneExtension, edgePacked: true };
};
