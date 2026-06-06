import { useCallback, useState } from "react";

import type { WindowRect } from "./FloatingWindow.js";
import { resizeDockedWindowRects } from "./control-panel-layout.js";
import type { ReorderPlacement } from "./drag-reorder.js";
import {
  emptyFloatingWindowRectState,
  floatingWindowStateAfterActivation,
  floatingWindowStateAfterDockedWindowReorder,
  floatingWindowStateAfterCollectionOpenChange,
  floatingWindowStateAfterOpenChange,
  type FloatingWindowRectState,
} from "./window-state-model.js";
import type { RevealWindowStateStore } from "./window-state-store.js";

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
  updateFloatingWindowOpen: (key: string, open: boolean) => void;
  updateCollectionWindowOpen: (key: string, open: boolean) => void;
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

export const useFloatingWindowState = ({
  matchScope,
  revealWindowStateStore,
}: {
  matchScope: string | undefined;
  revealWindowStateStore: RevealWindowStateStore | undefined;
}): FloatingWindowStateController => {
  const [floatingWindowRects, setFloatingWindowRects] =
    useState<FloatingWindowRectState>(() => emptyFloatingWindowRectState);
  const activeFloatingWindowRects =
    matchScope !== undefined && floatingWindowRects.scope === matchScope
      ? floatingWindowRects.rects
      : {};
  const activeOpenWindowIds =
    matchScope !== undefined && floatingWindowRects.scope === matchScope
      ? floatingWindowRects.openWindowIds
      : new Set<string>();
  const activeDockedWindowIds =
    matchScope !== undefined && floatingWindowRects.scope === matchScope
      ? floatingWindowRects.dockedWindowIds
      : new Set<string>();
  const activeFloatingWindowZIndexes =
    matchScope !== undefined && floatingWindowRects.scope === matchScope
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
    if (matchScope === undefined || revealWindowStateStore === undefined) {
      return;
    }
    const openWindowIds = revealWindowStateStore.loadOpenWindowIds();
    const dockedWindowIds = revealWindowStateStore.loadDockedWindowIds();
    setFloatingWindowRects({
      scope: matchScope,
      rects: revealWindowStateStore.loadWindowRects(),
      openWindowIds,
      dockedWindowIds,
      floatingWindowZOrder: [...openWindowIds].filter(
        (windowKey) => !dockedWindowIds.has(windowKey),
      ),
    });
  }, [matchScope, revealWindowStateStore]);

  const activateFloatingWindow = useCallback(
    (key: string): void => {
      if (matchScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) =>
        floatingWindowStateAfterActivation({
          current,
          scope: matchScope,
          windowKey: key,
        }),
      );
    },
    [matchScope],
  );

  const updateFloatingWindowRect = useCallback(
    (key: string, rect: WindowRect): void => {
      if (matchScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const base =
          current.scope === matchScope
            ? current
            : {
                scope: matchScope,
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
          scope: matchScope,
          rects: { ...base.rects, [key]: rect },
          openWindowIds: new Set(base.openWindowIds),
          dockedWindowIds,
          floatingWindowZOrder,
        };
        revealWindowStateStore?.saveWindowRects(next.rects);
        revealWindowStateStore?.saveDockedWindowIds(dockedWindowIds);
        return next;
      });
    },
    [matchScope, revealWindowStateStore],
  );

  const updateFloatingWindowOpen = useCallback(
    (key: string, open: boolean): void => {
      if (matchScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const next = floatingWindowStateAfterOpenChange({
          current,
          scope: matchScope,
          windowKey: key,
          open,
        });
        revealWindowStateStore?.saveOpenWindowIds(next.openWindowIds);
        revealWindowStateStore?.saveDockedWindowIds(next.dockedWindowIds);
        return next;
      });
    },
    [matchScope, revealWindowStateStore],
  );

  const updateCollectionWindowOpen = useCallback(
    (key: string, open: boolean): void => {
      if (matchScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const next = floatingWindowStateAfterCollectionOpenChange({
          current,
          scope: matchScope,
          windowKey: key,
          open,
        });
        revealWindowStateStore?.saveOpenWindowIds(next.openWindowIds);
        revealWindowStateStore?.saveDockedWindowIds(next.dockedWindowIds);
        return next;
      });
    },
    [matchScope, revealWindowStateStore],
  );

  const dockFloatingWindow = useCallback(
    (key: string, rect: WindowRect): void => {
      if (matchScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const base =
          current.scope === matchScope
            ? current
            : {
                scope: matchScope,
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
          scope: matchScope,
          rects: { ...base.rects, [key]: rect },
          openWindowIds,
          dockedWindowIds,
          floatingWindowZOrder: base.floatingWindowZOrder.filter(
            (windowKey) => windowKey !== key,
          ),
        };
        revealWindowStateStore?.saveWindowRects(next.rects);
        revealWindowStateStore?.saveOpenWindowIds(openWindowIds);
        revealWindowStateStore?.saveDockedWindowIds(dockedWindowIds);
        return next;
      });
    },
    [matchScope, revealWindowStateStore],
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
      if (matchScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const base =
          current.scope === matchScope
            ? current
            : {
                scope: matchScope,
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
          scope: matchScope,
          rects: { ...base.rects, [windowKey]: rect },
          openWindowIds,
          dockedWindowIds,
          floatingWindowZOrder: base.floatingWindowZOrder.filter(
            (key) => key !== windowKey,
          ),
        };
        revealWindowStateStore?.saveWindowRects(next.rects);
        revealWindowStateStore?.saveOpenWindowIds(openWindowIds);
        revealWindowStateStore?.saveDockedWindowIds(dockedWindowIds);
        return next;
      });
    },
    [matchScope, revealWindowStateStore],
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
      if (matchScope === undefined || windowKeys.length === 0) {
        return;
      }
      setFloatingWindowRects((current) => {
        const base =
          current.scope === matchScope
            ? current
            : {
                scope: matchScope,
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
          scope: matchScope,
          rects,
          openWindowIds,
          dockedWindowIds,
          floatingWindowZOrder: base.floatingWindowZOrder.filter(
            (key) => !windowKeys.includes(key),
          ),
        };
        revealWindowStateStore?.saveWindowRects(next.rects);
        revealWindowStateStore?.saveOpenWindowIds(openWindowIds);
        revealWindowStateStore?.saveDockedWindowIds(dockedWindowIds);
        return next;
      });
    },
    [matchScope, revealWindowStateStore],
  );

  const updateDockedWindowRects = useCallback(
    (dockRect: WindowRect): void => {
      if (matchScope === undefined || activeDockedWindowIds.size === 0) {
        return;
      }
      setFloatingWindowRects((current) => {
        if (current.scope !== matchScope) {
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
        revealWindowStateStore?.saveWindowRects(next.rects);
        return next;
      });
    },
    [activeDockedWindowIds.size, matchScope, revealWindowStateStore],
  );

  const reorderDockedWindow = useCallback(
    (
      draggedWindowKey: string,
      targetWindowKey: string,
      placement: ReorderPlacement,
    ): void => {
      if (matchScope === undefined) {
        return;
      }
      setFloatingWindowRects((current) => {
        const next = floatingWindowStateAfterDockedWindowReorder({
          current,
          scope: matchScope,
          draggedWindowKey,
          targetWindowKey,
          placement,
        });
        revealWindowStateStore?.saveDockedWindowIds(next.dockedWindowIds);
        return next;
      });
    },
    [matchScope, revealWindowStateStore],
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
    updateFloatingWindowOpen,
    updateCollectionWindowOpen,
    dockFloatingWindow,
    dockFloatingWindows,
    dockFloatingWindowGroup,
    reorderDockedWindow,
    updateDockedWindowRects,
  };
};
