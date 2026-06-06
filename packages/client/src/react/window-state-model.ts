import type { WindowRect } from "./FloatingWindow.js";
import { moveIdNear, type ReorderPlacement } from "./drag-reorder.js";

export interface RevealWindowState {
  scope?: string | undefined;
  dismissed: Set<string>;
  minimized: Set<string>;
}

export interface FloatingWindowRectState {
  scope?: string | undefined;
  rects: Record<string, WindowRect>;
  openWindowIds: Set<string>;
  dockedWindowIds: Set<string>;
  floatingWindowZOrder: string[];
}

export const emptyRevealWindowState: RevealWindowState = {
  dismissed: new Set(),
  minimized: new Set(),
};

export const emptyFloatingWindowRectState: FloatingWindowRectState = {
  rects: {},
  openWindowIds: new Set(),
  dockedWindowIds: new Set(),
  floatingWindowZOrder: [],
};

const scopedFloatingWindowState = ({
  current,
  scope,
}: {
  current: FloatingWindowRectState;
  scope: string;
}): FloatingWindowRectState =>
  current.scope === scope
    ? current
    : {
        scope,
        rects: {},
        openWindowIds: new Set<string>(),
        dockedWindowIds: new Set<string>(),
        floatingWindowZOrder: [],
      };

const zOrderWithout = (
  zOrder: readonly string[] | undefined,
  windowKey: string,
): string[] => (zOrder ?? []).filter((id) => id !== windowKey);

const floatingZOrderAfterOpenChange = ({
  base,
  windowKey,
  open,
}: {
  base: FloatingWindowRectState;
  windowKey: string;
  open: boolean;
}): string[] => {
  const withoutWindow = zOrderWithout(base.floatingWindowZOrder, windowKey);
  return open && !base.dockedWindowIds.has(windowKey)
    ? [...withoutWindow, windowKey]
    : withoutWindow;
};

export const floatingWindowStateAfterOpenChange = ({
  current,
  scope,
  windowKey,
  open,
}: {
  current: FloatingWindowRectState;
  scope: string;
  windowKey: string;
  open: boolean;
}): FloatingWindowRectState => {
  const base = scopedFloatingWindowState({ current, scope });
  const openWindowIds = new Set(base.openWindowIds);
  if (open) {
    openWindowIds.add(windowKey);
  } else {
    openWindowIds.delete(windowKey);
  }
  return {
    scope,
    rects: base.rects,
    openWindowIds,
    dockedWindowIds: new Set(base.dockedWindowIds),
    floatingWindowZOrder: floatingZOrderAfterOpenChange({
      base,
      windowKey,
      open,
    }),
  };
};

export const floatingWindowStateAfterCollectionOpenChange = ({
  current,
  scope,
  windowKey,
  open,
}: {
  current: FloatingWindowRectState;
  scope: string;
  windowKey: string;
  open: boolean;
}): FloatingWindowRectState => {
  const base = scopedFloatingWindowState({ current, scope });
  const openWindowIds = new Set(
    [...base.openWindowIds].filter(
      (id) => !id.startsWith("collection:") || id === windowKey,
    ),
  );
  const dockedWindowIds = new Set(
    [...base.dockedWindowIds].filter(
      (id) => !id.startsWith("collection:") || id === windowKey,
    ),
  );
  const baseWithCollectionDocking = { ...base, dockedWindowIds };
  if (open) {
    openWindowIds.add(windowKey);
  } else {
    openWindowIds.delete(windowKey);
  }
  return {
    scope,
    rects: base.rects,
    openWindowIds,
    dockedWindowIds,
    floatingWindowZOrder: floatingZOrderAfterOpenChange({
      base: baseWithCollectionDocking,
      windowKey,
      open,
    }).filter((id) => !id.startsWith("collection:") || id === windowKey),
  };
};

export const floatingWindowStateAfterDockedWindowReorder = ({
  current,
  scope,
  draggedWindowKey,
  targetWindowKey,
  placement,
}: {
  current: FloatingWindowRectState;
  scope: string;
  draggedWindowKey: string;
  targetWindowKey: string;
  placement: ReorderPlacement;
}): FloatingWindowRectState => {
  const base = scopedFloatingWindowState({ current, scope });
  return {
    scope,
    rects: base.rects,
    openWindowIds: new Set(base.openWindowIds),
    dockedWindowIds: new Set(
      moveIdNear(
        [...base.dockedWindowIds],
        draggedWindowKey,
        targetWindowKey,
        placement,
      ),
    ),
    floatingWindowZOrder: base.floatingWindowZOrder.filter(
      (windowKey) => !base.dockedWindowIds.has(windowKey),
    ),
  };
};

export const floatingWindowStateAfterActivation = ({
  current,
  scope,
  windowKey,
}: {
  current: FloatingWindowRectState;
  scope: string;
  windowKey: string;
}): FloatingWindowRectState => {
  const base = scopedFloatingWindowState({ current, scope });
  if (
    !base.openWindowIds.has(windowKey) ||
    base.dockedWindowIds.has(windowKey)
  ) {
    return {
      scope,
      rects: base.rects,
      openWindowIds: new Set(base.openWindowIds),
      dockedWindowIds: new Set(base.dockedWindowIds),
      floatingWindowZOrder: base.floatingWindowZOrder.filter(
        (id) => base.openWindowIds.has(id) && !base.dockedWindowIds.has(id),
      ),
    };
  }
  return {
    scope,
    rects: base.rects,
    openWindowIds: new Set(base.openWindowIds),
    dockedWindowIds: new Set(base.dockedWindowIds),
    floatingWindowZOrder: [
      ...base.floatingWindowZOrder.filter(
        (id) =>
          id !== windowKey &&
          base.openWindowIds.has(id) &&
          !base.dockedWindowIds.has(id),
      ),
      windowKey,
    ],
  };
};
