import { useCallback, useState } from "react";

import type { WindowRect } from "./FloatingWindow.js";
import { resizeDockedWindowRects } from "./control-panel-layout.js";
import type { ReorderPlacement } from "./drag-reorder.js";
import {
  emptyFloatingWindowRectState,
  floatingWindowStateAfterActivation,
  floatingWindowStateAfterDockedWindowReorder,
  floatingWindowStateAfterExternalWindowSync,
  floatingWindowStateAfterFloatingGroupOpen,
  floatingWindowStateAfterCollectionOpenChange,
  floatingWindowStateAfterOpenChange,
  normalizeFloatingWindowRectsForViewport,
  type FloatingWindowRectState,
} from "./window-state-model.js";
import type { WindowLayoutStore } from "./window-state-store.js";

export interface FloatingWindowStateController {
  floatingWindowRects: FloatingWindowRectState;
  activeFloatingWindowRects: Record<string, WindowRect>;
  activeOpenWindowIds: ReadonlySet<string>;
  activeDockedWindowIds: ReadonlySet<string>;
  activeFloatingWindowZIndexes: Readonly<Record<string, number>>;
  loadFloatingWindowState: () => void;
  resetFloatingWindowState: () => void;
  activateFloatingWindow: (key: string) => void;
  updateFloatingWindowRect: (key: string, rect: WindowRect) => void;
  openFloatingWindowGroup: (input: {
    windowKey: string;
    rect: WindowRect;
    replacedWindowKeys: readonly string[];
  }) => void;
  updateFloatingWindowOpen: (key: string, open: boolean) => void;
  updateCollectionWindowOpen: (key: string, open: boolean) => void;
  syncExternalFloatingWindows: (input: {
    windowKeys: readonly string[];
    managedWindowKeyPrefix: string;
  }) => void;
  dockFloatingWindow: (key: string, rect: WindowRect) => void;
  dockFloatingWindows: (input: {
    windowKeys: readonly string[];
    rect: WindowRect;
    replacedWindowKeys?: readonly string[] | undefined;
  }) => void;
  dockFloatingWindowGroup: (input: {
    windowKey: string;
    rect: WindowRect;
    replacedWindowKeys: readonly string[];
  }) => void;
  reorderDockedWindow: (
    draggedWindowKey: string,
    targetWindowKey: string,
    placement: ReorderPlacement,
  ) => void;
  updateDockedWindowRects: (dockRect: WindowRect) => void;
}

const currentViewport = ():
  | {
      width: number;
      height: number;
    }
  | undefined =>
  typeof window === "undefined"
    ? undefined
    : { width: window.innerWidth, height: window.innerHeight };

const windowRectsEqual = (
  left: Readonly<Record<string, WindowRect>>,
  right: Readonly<Record<string, WindowRect>>,
): boolean => {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) {
    return false;
  }
  return leftEntries.every(([windowKey, leftRect]) => {
    const rightRect = right[windowKey];
    return (
      rightRect !== undefined &&
      leftRect.x === rightRect.x &&
      leftRect.y === rightRect.y &&
      leftRect.width === rightRect.width &&
      leftRect.height === rightRect.height
    );
  });
};

export const useFloatingWindowState = ({
  layoutScope,
  windowLayoutStore,
}: {
  layoutScope: string | undefined;
  windowLayoutStore: WindowLayoutStore | undefined;
}): FloatingWindowStateController => {
  const [floatingWindowRects, setFloatingWindowRects] =
    useState<FloatingWindowRectState>(() => emptyFloatingWindowRectState);
  const activeFloatingWindowRects =
    layoutScope !== undefined && floatingWindowRects.scope === layoutScope
      ? floatingWindowRects.rects
      : {};
  const activeOpenWindowIds =
    layoutScope !== undefined && floatingWindowRects.scope === layoutScope
      ? floatingWindowRects.openWindowIds
      : new Set<string>();
  const activeDockedWindowIds =
    layoutScope !== undefined && floatingWindowRects.scope === layoutScope
      ? floatingWindowRects.dockedWindowIds
      : new Set<string>();
  const activeFloatingWindowZIndexes =
    layoutScope !== undefined && floatingWindowRects.scope === layoutScope
      ? Object.fromEntries(
          floatingWindowRects.floatingWindowZOrder.map((windowKey, index) => [
            windowKey,
            10 + index,
          ]),
        )
      : {};

  const resetFloatingWindowState = useCallback((): void => {
    setFloatingWindowRects(emptyFloatingWindowRectState);
  }, []);

  const loadFloatingWindowState = useCallback((): void => {
    if (layoutScope === undefined || windowLayoutStore === undefined) {
      return;
    }
    const openWindowIds = windowLayoutStore.loadOpenWindowIds();
    const dockedWindowIds = windowLayoutStore.loadDockedWindowIds();
    const storedRects = windowLayoutStore.loadWindowRects();
    const viewport = currentViewport();
    const rects =
      viewport === undefined
        ? storedRects
        : normalizeFloatingWindowRectsForViewport({
            rects: storedRects,
            viewport,
          });
    if (viewport !== undefined && !windowRectsEqual(storedRects, rects)) {
      windowLayoutStore.saveWindowRects(rects);
    }
    setFloatingWindowRects({
      scope: layoutScope,
      rects,
      openWindowIds,
      dockedWindowIds,
      floatingWindowZOrder: [...openWindowIds].filter(
        (windowKey) => !dockedWindowIds.has(windowKey),
      ),
    });
  }, [layoutScope, windowLayoutStore]);

  const activateFloatingWindow = useCallback((key: string): void => {
    if (layoutScope === undefined) {
      return;
    }
    setFloatingWindowRects((current) =>
      floatingWindowStateAfterActivation({
        current,
        scope: layoutScope,
        windowKey: key,
      }),
    );
  }, [layoutScope]);

  const updateFloatingWindowRect = useCallback(
    (key: string, rect: WindowRect): void => {
      if (layoutScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const base =
          current.scope === layoutScope
            ? current
            : {
                scope: layoutScope,
                rects: {},
                openWindowIds: new Set<string>(),
                dockedWindowIds: new Set<string>(),
                floatingWindowZOrder: [],
              };
        const dockedWindowIds = new Set(base.dockedWindowIds);
        dockedWindowIds.delete(key);
        const floatingWindowZOrder = base.openWindowIds.has(key)
          ? [
              ...base.floatingWindowZOrder.filter(
                (windowKey) =>
                  windowKey !== key &&
                  base.openWindowIds.has(windowKey) &&
                  !dockedWindowIds.has(windowKey),
              ),
              key,
            ]
          : base.floatingWindowZOrder.filter(
              (windowKey) =>
                base.openWindowIds.has(windowKey) &&
                !dockedWindowIds.has(windowKey),
            );
        const next = {
          scope: layoutScope,
          rects: { ...base.rects, [key]: rect },
          openWindowIds: new Set(base.openWindowIds),
          dockedWindowIds,
          floatingWindowZOrder,
        };
        windowLayoutStore?.saveWindowRects(next.rects);
        windowLayoutStore?.saveDockedWindowIds(dockedWindowIds);
        return next;
      });
    },
    [layoutScope, windowLayoutStore],
  );

  const updateFloatingWindowOpen = useCallback(
    (key: string, open: boolean): void => {
      if (layoutScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const next = floatingWindowStateAfterOpenChange({
          current,
          scope: layoutScope,
          windowKey: key,
          open,
        });
        windowLayoutStore?.saveOpenWindowIds(next.openWindowIds);
        windowLayoutStore?.saveDockedWindowIds(next.dockedWindowIds);
        return next;
      });
    },
    [layoutScope, windowLayoutStore],
  );

  const openFloatingWindowGroup = useCallback(
    ({
      windowKey,
      rect,
      replacedWindowKeys,
    }: {
      windowKey: string;
      rect: WindowRect;
      replacedWindowKeys: readonly string[];
    }): void => {
      if (layoutScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const next = floatingWindowStateAfterFloatingGroupOpen({
          current,
          scope: layoutScope,
          windowKey,
          rect,
          replacedWindowKeys,
        });
        windowLayoutStore?.saveWindowRects(next.rects);
        windowLayoutStore?.saveOpenWindowIds(next.openWindowIds);
        windowLayoutStore?.saveDockedWindowIds(next.dockedWindowIds);
        return next;
      });
    },
    [layoutScope, windowLayoutStore],
  );

  const updateCollectionWindowOpen = useCallback(
    (key: string, open: boolean): void => {
      if (layoutScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const next = floatingWindowStateAfterCollectionOpenChange({
          current,
          scope: layoutScope,
          windowKey: key,
          open,
        });
        windowLayoutStore?.saveOpenWindowIds(next.openWindowIds);
        windowLayoutStore?.saveDockedWindowIds(next.dockedWindowIds);
        return next;
      });
    },
    [layoutScope, windowLayoutStore],
  );

  const syncExternalFloatingWindows = useCallback(
    ({
      windowKeys,
      managedWindowKeyPrefix,
    }: {
      windowKeys: readonly string[];
      managedWindowKeyPrefix: string;
    }): void => {
      if (layoutScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const next = floatingWindowStateAfterExternalWindowSync({
          current,
          scope: layoutScope,
          windowKeys,
          managedWindowKeyPrefix,
        });
        windowLayoutStore?.saveOpenWindowIds(next.openWindowIds);
        windowLayoutStore?.saveDockedWindowIds(next.dockedWindowIds);
        return next;
      });
    },
    [layoutScope, windowLayoutStore],
  );

  const dockFloatingWindow = useCallback(
    (key: string, rect: WindowRect): void => {
      if (layoutScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const base =
          current.scope === layoutScope
            ? current
            : {
                scope: layoutScope,
                rects: {},
                openWindowIds: new Set<string>(),
                dockedWindowIds: new Set<string>(),
                floatingWindowZOrder: [],
              };
        const openWindowIds = new Set(base.openWindowIds);
        const dockedWindowIds = new Set(base.dockedWindowIds);
        openWindowIds.add(key);
        dockedWindowIds.add(key);
        const next = {
          scope: layoutScope,
          rects: { ...base.rects, [key]: rect },
          openWindowIds,
          dockedWindowIds,
          floatingWindowZOrder: base.floatingWindowZOrder.filter(
            (windowKey) => windowKey !== key,
          ),
        };
        windowLayoutStore?.saveWindowRects(next.rects);
        windowLayoutStore?.saveOpenWindowIds(openWindowIds);
        windowLayoutStore?.saveDockedWindowIds(dockedWindowIds);
        return next;
      });
    },
    [layoutScope, windowLayoutStore],
  );

  const dockFloatingWindowGroup = useCallback(
    ({
      windowKey,
      rect,
      replacedWindowKeys,
    }: {
      windowKey: string;
      rect: WindowRect;
      replacedWindowKeys: readonly string[];
    }): void => {
      if (layoutScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const base =
          current.scope === layoutScope
            ? current
            : {
                scope: layoutScope,
                rects: {},
                openWindowIds: new Set<string>(),
                dockedWindowIds: new Set<string>(),
                floatingWindowZOrder: [],
              };
        const dockedWindowIds = new Set(base.dockedWindowIds);
        for (const replacedWindowKey of replacedWindowKeys) {
          dockedWindowIds.delete(replacedWindowKey);
        }
        dockedWindowIds.add(windowKey);
        const openWindowIds = new Set(base.openWindowIds);
        openWindowIds.add(windowKey);
        const next = {
          scope: layoutScope,
          rects: { ...base.rects, [windowKey]: rect },
          openWindowIds,
          dockedWindowIds,
          floatingWindowZOrder: base.floatingWindowZOrder.filter(
            (key) => key !== windowKey,
          ),
        };
        windowLayoutStore?.saveWindowRects(next.rects);
        windowLayoutStore?.saveOpenWindowIds(openWindowIds);
        windowLayoutStore?.saveDockedWindowIds(dockedWindowIds);
        return next;
      });
    },
    [layoutScope, windowLayoutStore],
  );

  const dockFloatingWindows = useCallback(
    ({
      windowKeys,
      rect,
      replacedWindowKeys = [],
    }: {
      windowKeys: readonly string[];
      rect: WindowRect;
      replacedWindowKeys?: readonly string[] | undefined;
    }): void => {
      if (layoutScope === undefined || windowKeys.length === 0) {
        return;
      }
      setFloatingWindowRects((current) => {
        const base =
          current.scope === layoutScope
            ? current
            : {
                scope: layoutScope,
                rects: {},
                openWindowIds: new Set<string>(),
                dockedWindowIds: new Set<string>(),
                floatingWindowZOrder: [],
              };
        const dockedWindowIds = new Set(base.dockedWindowIds);
        const openWindowIds = new Set(base.openWindowIds);
        for (const replacedWindowKey of replacedWindowKeys) {
          dockedWindowIds.delete(replacedWindowKey);
        }
        const rects = { ...base.rects };
        for (const windowKey of windowKeys) {
          dockedWindowIds.delete(windowKey);
          dockedWindowIds.add(windowKey);
          openWindowIds.add(windowKey);
          rects[windowKey] = rect;
        }
        const next = {
          scope: layoutScope,
          rects,
          openWindowIds,
          dockedWindowIds,
          floatingWindowZOrder: base.floatingWindowZOrder.filter(
            (key) => !windowKeys.includes(key),
          ),
        };
        windowLayoutStore?.saveWindowRects(next.rects);
        windowLayoutStore?.saveOpenWindowIds(openWindowIds);
        windowLayoutStore?.saveDockedWindowIds(dockedWindowIds);
        return next;
      });
    },
    [layoutScope, windowLayoutStore],
  );

  const updateDockedWindowRects = useCallback(
    (dockRect: WindowRect): void => {
      if (layoutScope === undefined || activeDockedWindowIds.size === 0) {
        return;
      }
      setFloatingWindowRects((current) => {
        if (current.scope !== layoutScope) {
          return current;
        }
        const next = {
          ...current,
          rects: resizeDockedWindowRects({
            rects: current.rects,
            dockedWindowIds: current.dockedWindowIds,
            dockRect,
          }),
        };
        windowLayoutStore?.saveWindowRects(next.rects);
        return next;
      });
    },
    [activeDockedWindowIds.size, layoutScope, windowLayoutStore],
  );

  const reorderDockedWindow = useCallback(
    (
      draggedWindowKey: string,
      targetWindowKey: string,
      placement: ReorderPlacement,
    ): void => {
      if (layoutScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const next = floatingWindowStateAfterDockedWindowReorder({
          current,
          scope: layoutScope,
          draggedWindowKey,
          targetWindowKey,
          placement,
        });
        windowLayoutStore?.saveDockedWindowIds(next.dockedWindowIds);
        return next;
      });
    },
    [layoutScope, windowLayoutStore],
  );

  return {
    floatingWindowRects,
    activeFloatingWindowRects,
    activeOpenWindowIds,
    activeDockedWindowIds,
    activeFloatingWindowZIndexes,
    loadFloatingWindowState,
    resetFloatingWindowState,
    activateFloatingWindow,
    updateFloatingWindowRect,
    openFloatingWindowGroup,
    updateFloatingWindowOpen,
    updateCollectionWindowOpen,
    syncExternalFloatingWindows,
    dockFloatingWindow,
    dockFloatingWindows,
    dockFloatingWindowGroup,
    reorderDockedWindow,
    updateDockedWindowRects,
  };
};
