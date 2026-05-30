import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";

export interface SettingsWindowProps {
  initialRect?: WindowRect | undefined;
  onClose: () => void;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
}

export const defaultSettingsWindowRect: WindowRect = {
  x: 900,
  y: 120,
  width: 300,
  height: 220,
};

export const SettingsWindow = ({
  initialRect = defaultSettingsWindowRect,
  onClose,
  onRectChange,
}: SettingsWindowProps): React.JSX.Element => (
  <FloatingWindow
    title="Settings"
    className="settings-window"
    initialRect={initialRect}
    minWidth={220}
    minHeight={120}
    onClose={onClose}
    onRectChange={onRectChange}
  />
);
