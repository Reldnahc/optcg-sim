import type { WindowRect, WindowViewport } from "./FloatingWindow.js";
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

export interface WindowMinSize {
  minWidth: number;
  minHeight: number;
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

export const floatingWindowMinSizeForKey = (
  windowKey: string,
): WindowMinSize => {
  switch (windowKey) {
    case "card-preview":
      return { minWidth: 190, minHeight: 150 };
    case "action-log":
      return { minWidth: 210, minHeight: 150 };
    case "settings":
      return { minWidth: 190, minHeight: 110 };
    case "info-window":
      return { minWidth: 220, minHeight: 140 };
    default:
      return { minWidth: 220, minHeight: 140 };
  }
};

export const normalizeFloatingWindowRectForViewport = ({
  rect,
  viewport,
  minWidth,
  minHeight,
}: {
  rect: WindowRect;
  viewport: WindowViewport;
  minWidth: number;
  minHeight: number;
}): WindowRect => {
  const width = Math.min(Math.max(minWidth, rect.width), viewport.width);
  const height = Math.min(Math.max(minHeight, rect.height), viewport.height);
  return {
    x: Math.min(Math.max(0, rect.x), Math.max(0, viewport.width - width)),
    y: Math.min(Math.max(0, rect.y), Math.max(0, viewport.height - height)),
    width,
    height,
  };
};

export const normalizeFloatingWindowRectsForViewport = ({
  rects,
  viewport,
  minSizeForWindow = floatingWindowMinSizeForKey,
}: {
  rects: Readonly<Record<string, WindowRect>>;
  viewport: WindowViewport;
  minSizeForWindow?: ((windowKey: string) => WindowMinSize) | undefined;
}): Record<string, WindowRect> =>
  Object.fromEntries(
    Object.entries(rects).map(([windowKey, rect]) => {
      const minSize = minSizeForWindow(windowKey);
      return [
        windowKey,
        normalizeFloatingWindowRectForViewport({
          rect,
          viewport,
          minWidth: minSize.minWidth,
          minHeight: minSize.minHeight,
        }),
      ];
    }),
  );

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

export const floatingWindowStateAfterExternalWindowSync = ({
  current,
  scope,
  windowKeys,
  managedWindowKeyPrefix,
}: {
  current: FloatingWindowRectState;
  scope: string;
  windowKeys: readonly string[];
  managedWindowKeyPrefix: string;
}): FloatingWindowRectState => {
  const base = scopedFloatingWindowState({ current, scope });
  const activeManagedWindowKeys = new Set(windowKeys);
  const shouldKeepWindow = (windowKey: string): boolean =>
    !windowKey.startsWith(managedWindowKeyPrefix) ||
    activeManagedWindowKeys.has(windowKey);
  const openWindowIds = new Set(
    [...base.openWindowIds].filter(shouldKeepWindow),
  );
  for (const windowKey of windowKeys) {
    openWindowIds.add(windowKey);
  }
  const dockedWindowIds = new Set(
    [...base.dockedWindowIds].filter(shouldKeepWindow),
  );
  const floatingWindowZOrder = [
    ...base.floatingWindowZOrder.filter(
      (windowKey) =>
        shouldKeepWindow(windowKey) &&
        openWindowIds.has(windowKey) &&
        !dockedWindowIds.has(windowKey),
    ),
    ...windowKeys.filter(
      (windowKey) =>
        !base.floatingWindowZOrder.includes(windowKey) &&
        openWindowIds.has(windowKey) &&
        !dockedWindowIds.has(windowKey),
    ),
  ];

  return {
    scope,
    rects: base.rects,
    openWindowIds,
    dockedWindowIds,
    floatingWindowZOrder,
  };
};

export const floatingWindowStateAfterFloatingGroupOpen = ({
  current,
  scope,
  windowKey,
  rect,
  replacedWindowKeys,
}: {
  current: FloatingWindowRectState;
  scope: string;
  windowKey: string;
  rect: WindowRect;
  replacedWindowKeys: readonly string[];
}): FloatingWindowRectState => {
  const base = scopedFloatingWindowState({ current, scope });
  const openWindowIds = new Set(base.openWindowIds);
  openWindowIds.add(windowKey);
  const dockedWindowIds = new Set(base.dockedWindowIds);
  dockedWindowIds.delete(windowKey);
  for (const replacedWindowKey of replacedWindowKeys) {
    dockedWindowIds.delete(replacedWindowKey);
  }
  return {
    scope,
    rects: { ...base.rects, [windowKey]: rect },
    openWindowIds,
    dockedWindowIds,
    floatingWindowZOrder: [
      ...base.floatingWindowZOrder.filter(
        (key) =>
          key !== windowKey &&
          openWindowIds.has(key) &&
          !dockedWindowIds.has(key),
      ),
      windowKey,
    ],
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
