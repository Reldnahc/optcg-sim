import type { WindowRect } from "./FloatingWindow.js";

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
}

export const emptyRevealWindowState: RevealWindowState = {
  dismissed: new Set(),
  minimized: new Set(),
};

export const emptyFloatingWindowRectState: FloatingWindowRectState = {
  rects: {},
  openWindowIds: new Set(),
  dockedWindowIds: new Set(),
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
  };
};
