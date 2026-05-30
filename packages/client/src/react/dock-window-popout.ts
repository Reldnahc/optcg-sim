import { defaultActionLogWindowRect } from "./ActionLogWindow.js";
import { defaultCardPreviewWindowRect } from "./CardPreviewWindow.js";
import type { WindowRect } from "./FloatingWindow.js";
import {
  actionLogWindowKey,
  cardPreviewWindowKey,
  settingsWindowKey,
} from "./info-window-model.js";
import { defaultSettingsWindowRect } from "./SettingsWindow.js";

const rectSize = (rect: WindowRect): { width: number; height: number } => ({
  width: rect.width,
  height: rect.height,
});

export const dockWindowPoppedOutSize = (
  windowKey: string,
): { width: number; height: number } => {
  if (windowKey === cardPreviewWindowKey) {
    return rectSize(defaultCardPreviewWindowRect);
  }
  if (windowKey === actionLogWindowKey) {
    return rectSize(defaultActionLogWindowRect);
  }
  if (windowKey === settingsWindowKey) {
    return rectSize(defaultSettingsWindowRect);
  }
  if (windowKey.startsWith("reveal:")) {
    return { width: 300, height: 420 };
  }
  return { width: 560, height: 460 };
};
