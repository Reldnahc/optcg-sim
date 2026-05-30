import { FloatingWindow } from "./FloatingWindow.js";
import type { WindowRect } from "./FloatingWindow.js";

export interface SettingsWindowProps {
  className?: string | undefined;
  initialRect?: WindowRect | undefined;
  onClose: () => void;
  onRectChange?: ((rect: WindowRect) => void) | undefined;
  onDragMove?: ((rect: WindowRect) => void) | undefined;
  onDragEnd?: ((rect: WindowRect) => void) | undefined;
}

export const defaultSettingsWindowRect: WindowRect = {
  x: 900,
  y: 120,
  width: 300,
  height: 220,
};

export const SettingsContent = (): React.JSX.Element => (
  <div className="settings-window-content" />
);

export const SettingsWindow = ({
  className,
  initialRect = defaultSettingsWindowRect,
  onClose,
  onRectChange,
  onDragMove,
  onDragEnd,
}: SettingsWindowProps): React.JSX.Element => (
  <FloatingWindow
    title="Settings"
    className={["settings-window", className ?? ""].filter(Boolean).join(" ")}
    initialRect={initialRect}
    minWidth={220}
    minHeight={120}
    onClose={onClose}
    onRectChange={onRectChange}
    onDragMove={onDragMove}
    onDragEnd={onDragEnd}
  >
    <SettingsContent />
  </FloatingWindow>
);
