export interface ClickSelectionProgressInput {
  selectableInstanceIds: readonly string[];
  selectedInstanceIds: readonly string[];
  clickedInstanceId: string;
  completionCount: number;
  isCompleteSelection?:
    | ((instanceIds: readonly string[]) => boolean)
    | undefined;
}

export interface ClickSelectionProgressResult {
  selectedInstanceIds: string[];
  complete: boolean;
}

const uniqueStrings = (values: readonly string[]): string[] => [
  ...new Set(values.map(String)),
];

export const clickSelectionIsComplete = ({
  selectableInstanceIds,
  selectedInstanceIds,
  max,
  isCompleteSelection = () => true,
}: {
  selectableInstanceIds: readonly string[];
  selectedInstanceIds: readonly string[];
  max: number;
  isCompleteSelection?:
    | ((instanceIds: readonly string[]) => boolean)
    | undefined;
}): boolean => {
  const selectableCount = uniqueStrings(selectableInstanceIds).length;
  const completionCount = Math.min(max, selectableCount);
  return (
    completionCount > 0 &&
    selectedInstanceIds.length === completionCount &&
    isCompleteSelection(selectedInstanceIds)
  );
};

export const progressClickSelection = ({
  selectableInstanceIds,
  selectedInstanceIds,
  clickedInstanceId,
  completionCount,
  isCompleteSelection = () => true,
}: ClickSelectionProgressInput): ClickSelectionProgressResult | undefined => {
  const selectable = new Set(uniqueStrings(selectableInstanceIds));
  if (!selectable.has(clickedInstanceId)) {
    return undefined;
  }
  if (selectedInstanceIds.includes(clickedInstanceId)) {
    return {
      selectedInstanceIds: selectedInstanceIds.filter(
        (instanceId) => instanceId !== clickedInstanceId,
      ),
      complete: false,
    };
  }
  if (selectedInstanceIds.length >= completionCount) {
    return { selectedInstanceIds: [...selectedInstanceIds], complete: false };
  }
  const nextSelection = [...selectedInstanceIds, clickedInstanceId];
  if (nextSelection.length < completionCount) {
    return { selectedInstanceIds: nextSelection, complete: false };
  }
  if (!isCompleteSelection(nextSelection)) {
    return { selectedInstanceIds: [...selectedInstanceIds], complete: false };
  }
  return { selectedInstanceIds: nextSelection, complete: true };
};
