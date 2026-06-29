import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import {
  SettingsWindow,
  completeHexColorFromDraft,
  resetMatchVisualSettings,
} from "./SettingsWindow.js";
import { MatchVisualSettingsProvider } from "./match-visual-settings-context.js";
import {
  defaultMatchVisualSettingsValues,
  noopMatchVisualSettings,
  type MatchVisualSettings,
  type MatchVisualSettingsValues,
} from "./match-visual-settings.js";
import { InfoTabbedWindow } from "./InfoTabbedWindow.js";
import { ControlRail } from "./ControlRail.js";
import { SettingsButton } from "./SettingsButton.js";
import { ColorSelector } from "./settings-window/settings-controls.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

type CapturedSettings = {
  -readonly [K in keyof MatchVisualSettingsValues]?: MatchVisualSettingsValues[K];
};

describe("settings window", () => {
  test("renders as a real closable floating window", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsWindow, {
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /class="[^"]*floating-window/u);
    assert.match(markup, /class="[^"]*settings-window/u);
    assert.match(markup, />Settings</u);
    assert.match(markup, /aria-label="Close Settings"/u);
  });

  test("settings exposes a local background image file picker", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsWindow, {
        onClose: () => undefined,
      }),
    );

    assert.match(markup, /Background image/u);
    assert.match(markup, /Revert to defaults/u);
    assert.match(markup, /Background color/u);
    assert.doesNotMatch(markup, /Background type/u);
    assert.doesNotMatch(markup, /Image fit/u);
    assert.doesNotMatch(markup, /Crop zoom/u);
    assert.doesNotMatch(markup, /aria-label="Crop image focus"/u);
    assert.doesNotMatch(markup, /settings-crop-preview/u);
    assert.match(markup, /type="file"/u);
    assert.match(markup, /accept="image\/\*,\.gif"/u);
    assert.match(markup, /Clear background/u);
    assert.match(markup, /Zone guide visibility/u);
    assert.match(markup, /Zone background visibility/u);
    assert.match(markup, /Windows/u);
    assert.match(markup, /Window opacity/u);
    assert.match(markup, /Window color/u);
    assert.match(markup, /Playmat/u);
    assert.match(markup, /Playmat opacity/u);
    assert.match(markup, /Playmat color/u);
    assert.match(
      markup,
      /<span class="settings-label-text">Window opacity<\/span><output class="settings-range-value" aria-label="Window opacity value">86%<\/output><\/span><input[^>]*min="50"/u,
    );
    assert.match(
      markup,
      /<span class="settings-label-text">Playmat opacity<\/span><output class="settings-range-value" aria-label="Playmat opacity value">92%<\/output><\/span><input[^>]*min="50"/u,
    );
    assert.match(markup, /class="[^"]*settings-color-swatch/u);
    assert.match(markup, /pattern="#\?\[0-9a-fA-F\]\{6\}"/u);
    assert.match(markup, /maxLength="7"/u);
    assert.match(markup, /Sound volume/u);
    assert.match(markup, /Reduce deck stack rendering/u);
    assert.match(markup, /Reduced motion/u);
    assert.match(markup, /type="range"/u);
    assert.match(markup, /min="0"/u);
    assert.match(markup, /max="100"/u);
    assert.match(markup, /Quick pay Activate: Main costs/u);
    assert.match(markup, /Confirm attach DON/u);
    assert.match(markup, /Confirm end turn/u);
    assert.match(markup, /type="checkbox"/u);
  });

  test("color text fields allow partial drafts and normalize complete codes", () => {
    assert.equal(completeHexColorFromDraft("#"), undefined);
    assert.equal(completeHexColorFromDraft("#12"), undefined);
    assert.equal(completeHexColorFromDraft("#12345g"), undefined);
    assert.equal(completeHexColorFromDraft("#AABBCC"), "#aabbcc");
    assert.equal(completeHexColorFromDraft("AABBCC"), "#aabbcc");
    assert.equal(completeHexColorFromDraft("  112233  "), "#112233");
  });

  test("revert to defaults applies every default visual setting", () => {
    const captured: CapturedSettings = {};
    const settings: MatchVisualSettings = {
      ...noopMatchVisualSettings,
      setBackgroundColor: (value) => {
        captured.backgroundColor = value;
      },
      setBackgroundImageUrl: (value) => {
        captured.backgroundImageUrl = value;
      },
      setBackgroundImageFit: (value) => {
        captured.backgroundImageFit = value;
      },
      setBackgroundImageCropZoom: (value) => {
        captured.backgroundImageCropZoom = value;
      },
      setBackgroundImagePositionX: (value) => {
        captured.backgroundImagePositionX = value;
      },
      setBackgroundImagePositionY: (value) => {
        captured.backgroundImagePositionY = value;
      },
      setBackgroundMode: (value) => {
        captured.backgroundMode = value;
      },
      setConfirmAttachDon: (value) => {
        captured.confirmAttachDon = value;
      },
      setConfirmEndTurn: (value) => {
        captured.confirmEndTurn = value;
      },
      setQuickPayActivateMainCosts: (value) => {
        captured.quickPayActivateMainCosts = value;
      },
      setReduceDeckStackRendering: (value) => {
        captured.reduceDeckStackRendering = value;
      },
      setReducedMotion: (value) => {
        captured.reducedMotion = value;
      },
      setSoundVolume: (value) => {
        captured.soundVolume = value;
      },
      setWindowColor: (value) => {
        captured.windowColor = value;
      },
      setWindowOpacity: (value) => {
        captured.windowOpacity = value;
      },
      setPlaymatColor: (value) => {
        captured.playmatColor = value;
      },
      setPlaymatOpacity: (value) => {
        captured.playmatOpacity = value;
      },
      setZoneBackgroundVisibility: (value) => {
        captured.zoneBackgroundVisibility = value;
      },
      setZoneGuideVisibility: (value) => {
        captured.zoneGuideVisibility = value;
      },
    };

    resetMatchVisualSettings(settings);

    assert.deepEqual(captured, defaultMatchVisualSettingsValues);
  });

  test("background controls switch between color and image settings", () => {
    const colorMarkup = renderToStaticMarkup(
      createElement(SettingsWindow, {
        onClose: () => undefined,
      }),
    );
    const imageMarkup = renderToStaticMarkup(
      createElement(
        MatchVisualSettingsProvider,
        {
          value: {
            ...noopMatchVisualSettings,
            backgroundImageUrl: "data:image/png;base64,abc",
          },
        },
        createElement(SettingsWindow, {
          onClose: () => undefined,
        }),
      ),
    );

    assert.match(colorMarkup, /Background color/u);
    assert.doesNotMatch(colorMarkup, /Image fit/u);
    assert.doesNotMatch(colorMarkup, /settings-crop-preview/u);
    assert.match(imageMarkup, /Image fit/u);
    assert.match(imageMarkup, /Crop zoom/u);
    assert.match(imageMarkup, /settings-crop-preview/u);
    assert.doesNotMatch(imageMarkup, /Background color/u);
    assert.doesNotMatch(imageMarkup, /Background type/u);
  });

  test("settings groups controls by setting type in preferred order", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsWindow, {
        onClose: () => undefined,
      }),
    );

    assert.match(
      markup,
      /<section class="settings-section" aria-label="Gameplay"><h3>Gameplay<\/h3>.*Quick pay Activate: Main costs.*Confirm attach DON.*Confirm end turn.*<\/section>.*<section class="settings-section" aria-label="Personalization"><h3>Personalization<\/h3>.*Background image.*Windows.*Playmat.*Zone guide visibility.*Zone background visibility.*<\/section>.*<section class="settings-section" aria-label="Sound"><h3>Sound<\/h3>.*Sound volume.*<\/section>.*<section class="settings-section" aria-label="Video"><h3>Video<\/h3>.*Reduce deck stack rendering.*Reduced motion.*<\/section>/u,
    );
    assert.match(
      markup,
      /<section class="settings-section" aria-label="Personalization"><h3>Personalization<\/h3>.*Background image.*Windows.*Playmat.*Zone guide visibility.*Zone background visibility.*<\/section>/u,
    );
    assert.match(
      markup,
      /<section class="settings-section" aria-label="Sound"><h3>Sound<\/h3>.*Sound volume.*<\/section>/u,
    );
    assert.match(
      markup,
      /<section class="settings-section" aria-label="Video"><h3>Video<\/h3>.*Reduce deck stack rendering.*Reduced motion.*<\/section>/u,
    );
    assert.doesNotMatch(markup, /Customization/u);
  });

  test("settings presentation separates sections and shows range values", async () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsWindow, {
        onClose: () => undefined,
      }),
    );
    const [styles, appShellStyles] = await Promise.all([
      readFile(join(sourceDirectory, "styles", "settings-window.css"), "utf8"),
      readFile(join(sourceDirectory, "styles", "app-shell.css"), "utf8"),
    ]);

    assert.match(
      markup,
      /class="settings-subsection" aria-label="Background"/u,
    );
    assert.match(markup, /class="settings-subsection" aria-label="Windows"/u);
    assert.match(markup, /class="settings-subsection" aria-label="Playmat"/u);
    assert.match(markup, /class="settings-subsection" aria-label="Zones"/u);
    assert.match(
      markup,
      /<span class="settings-label-text">Window opacity<\/span><output class="settings-range-value" aria-label="Window opacity value">\d+%<\/output>/u,
    );
    assert.match(
      markup,
      /<span class="settings-label-text">Sound volume<\/span><output class="settings-range-value" aria-label="Sound volume value">\d+%<\/output>/u,
    );
    assert.match(
      styles,
      /\.settings-section\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.035\);/u,
    );
    assert.match(
      styles,
      /\.settings-section\s*\{[^}]*border-left-color:\s*var\(--match-accent\);/u,
    );
    assert.doesNotMatch(
      styles,
      /\.settings-section\s*\{[^}]*border:\s*var\(--floating-window-border-width\)\s+solid\s+var\(--match-border-soft\);/u,
    );
    assert.doesNotMatch(styles, /\.settings-section\s*\{[^}]*border-radius:/u);
    assert.doesNotMatch(
      styles,
      /\.settings-section\s*>\s*h3\s*\{[^}]*border-bottom:/u,
    );
    assert.doesNotMatch(styles, /\.settings-subsection\s*\{[^}]*border-top:/u);
    assert.match(
      styles,
      /\.settings-section\s*>\s*h3\s*\{[^}]*font-size:\s*var\(--floating-window-font-size\);/u,
    );
    assert.match(
      styles,
      /\.settings-field\s*\{[^}]*font-size:\s*var\(--floating-window-font-size\);/u,
    );
    assert.match(styles, /\.settings-range-header\s*\{/u);
    assert.match(
      appShellStyles,
      /--floating-window-font-size:\s*clamp\(\s*13px,\s*calc\(var\(--card-height\) \/ 13\.5\),\s*16px\s*\);/u,
    );
    assert.match(
      appShellStyles,
      /--floating-window-small-font-size:\s*clamp\(\s*12px,\s*calc\(var\(--card-height\) \/ 14\),\s*15px\s*\);/u,
    );
  });

  test("personalization exposes style loadouts and editable color preset tools", async () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsWindow, {
        onClose: () => undefined,
      }),
    );
    const [settingsWindow, settingsControls] = await Promise.all([
      readFile(join(sourceDirectory, "SettingsWindow.tsx"), "utf8"),
      readFile(
        join(sourceDirectory, "settings-window", "settings-controls.tsx"),
        "utf8",
      ),
    ]);

    assert.match(markup, /class="settings-loadout-manager"/u);
    assert.match(markup, /aria-label="Personalization style loadout"/u);
    assert.match(markup, />Save style</u);
    assert.match(markup, />New style</u);
    assert.match(markup, />Delete</u);
    assert.match(markup, /aria-label="Open Background color picker"/u);
    assert.match(markup, /aria-label="Open Window color picker"/u);
    assert.match(markup, /aria-label="Open Playmat color picker"/u);
    assert.match(
      settingsWindow,
      /loadPersonalizationLoadouts\(browserPersistentStorage\(\)\)/u,
    );
    assert.match(settingsWindow, /savePersonalizationLoadouts/u);
    assert.match(settingsWindow, /applyPersonalizationValues/u);
    assert.match(settingsWindow, /saveColorPreset/u);
    assert.doesNotMatch(settingsControls, /settings-color-picker-popover/u);
    assert.match(settingsControls, /settings-color-picker-button/u);
    assert.match(settingsControls, /settings-color-picker-input/u);
    assert.match(settingsControls, /type="color"/u);
    assert.doesNotMatch(settingsControls, /Save to preset/u);
    assert.doesNotMatch(settingsControls, />Pick</u);
    assert.match(settingsControls, /selectedPresetIndex === index/u);
  });

  test("color preset selection tracks the chosen slot instead of duplicate color equality", () => {
    const markup = renderToStaticMarkup(
      createElement(ColorSelector, {
        label: "Window color",
        value: "#112233",
        presets: ["#112233", "#112233", "#445566"],
        onChange: () => undefined,
        onPresetChange: () => undefined,
      }),
    );

    assert.equal(
      markup.match(/settings-color-swatch is-selected/gu)?.length,
      1,
    );
  });

  test("match app keeps settings as a permanent dockable info window", async () => {
    const [controlRail, matchApp, matchInfoWindows, toolbarControls] =
      await Promise.all([
        readFile(join(sourceDirectory, "ControlRail.tsx"), "utf8"),
        readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
        readFile(join(sourceDirectory, "MatchInfoWindows.tsx"), "utf8"),
        readFile(
          join(sourceDirectory, "info-window-toolbar-controls.ts"),
          "utf8",
        ),
      ]);

    assert.match(controlRail, /settingsControl/u);
    assert.doesNotMatch(matchApp, /<SettingsButton/u);
    assert.doesNotMatch(matchApp, /settingsControl=/u);
    assert.match(matchApp, /settingsWindowKey/u);
    assert.match(matchApp, /showSettingsWindow/u);
    assert.match(
      toolbarControls,
      /focusInfoWindow\(\{ tabId: "settings", windowKey: settingsWindowKey \}\)/u,
    );
    assert.match(matchInfoWindows, /<SettingsWindow/u);
    assert.match(matchInfoWindows, /dockInfoWindowTabs\(\["settings"\]\)/u);
    assert.match(
      matchInfoWindows,
      /completeInfoWindowDrag\("settings", rect\)/u,
    );
  });

  test("settings icon uses the same open highlight contract as other controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onHome: () => undefined,
        settingsControl: createElement(SettingsButton, {
          open: true,
          onActivate: () => undefined,
        }),
      }),
    );

    assert.match(markup, /class="settings-button is-open"/u);
    assert.match(markup, /aria-pressed="true"/u);
    assert.match(markup, /aria-label="Show settings"/u);
  });

  test("settings can render as a first-class tab in the shared info window", () => {
    const markup = renderToStaticMarkup(
      createElement(InfoTabbedWindow, {
        entries: [],
        logOpen: true,
        settingsOpen: true,
        tabIds: ["log", "settings"],
        activeTabId: "settings",
        minimized: false,
        onActiveTabChange: () => undefined,
        onToggleMinimized: () => undefined,
        onCloseActiveTab: () => undefined,
      }),
    );

    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-selected="true"[^>]*>Settings<\/button>/u);
    assert.match(markup, /aria-selected="false"[^>]*>Log<\/button>/u);
    assert.match(markup, /settings-window-content/u);
  });

  test("match app restores settings and tab config from persisted window state", async () => {
    const [matchApp, matchInfoWindows, floatingWindowHook, infoConfigHook] =
      await Promise.all([
        readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
        readFile(join(sourceDirectory, "MatchInfoWindows.tsx"), "utf8"),
        readFile(join(sourceDirectory, "use-floating-window-state.ts"), "utf8"),
        readFile(join(sourceDirectory, "use-info-window-config.ts"), "utf8"),
      ]);

    assert.match(floatingWindowHook, /loadOpenWindowIds\(\)/u);
    assert.match(matchApp, /activeOpenWindowIds\.has\(settingsWindowKey\)/u);
    assert.match(matchInfoWindows, /settingsWindowKey/u);
    assert.match(matchApp, /useInfoWindowConfig/u);
    assert.match(infoConfigHook, /loadInfoWindowConfig\(\)/u);
    assert.match(infoConfigHook, /saveInfoWindowConfig/u);
  });

  test("match app applies locally persisted custom background images", async () => {
    const [
      matchApp,
      settingsWindow,
      persistedSettingsHook,
      settingsStore,
      appShellStyles,
      mainSource,
      settingsControls,
    ] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "SettingsWindow.tsx"), "utf8"),
      readFile(
        join(sourceDirectory, "use-persisted-match-visual-settings.ts"),
        "utf8",
      ),
      readFile(join(sourceDirectory, "match-visual-settings-store.ts"), "utf8"),
      readFile(join(sourceDirectory, "styles/app-shell.css"), "utf8"),
      readFile(join(sourceDirectory, "main.tsx"), "utf8"),
      readFile(
        join(sourceDirectory, "settings-window", "settings-controls.tsx"),
        "utf8",
      ),
    ]);

    assert.match(matchApp, /usePersistedMatchVisualSettings/u);
    assert.match(matchApp, /<MatchVisualSettingsProvider/u);
    assert.match(matchApp, /style=\{matchAppStyle\}/u);
    assert.match(
      matchApp,
      /zoneGuideBorderAlpha\s*=\s*zoneGuideStrength \* 0\.44/u,
    );
    assert.match(matchApp, /--zone-guide-label-alpha/u);
    assert.match(matchApp, /--zone-guide-background-alpha/u);
    assert.match(settingsStore, /optcg:client:background-image-url/u);
    assert.match(settingsStore, /optcg:client:background-color/u);
    assert.match(settingsStore, /optcg:client:background-image-fit/u);
    assert.match(settingsStore, /optcg:client:background-image-crop-zoom/u);
    assert.match(settingsStore, /optcg:client:background-image-position-x/u);
    assert.match(settingsStore, /optcg:client:background-image-position-y/u);
    assert.match(settingsStore, /optcg:client:background-mode/u);
    assert.match(settingsStore, /optcg:client:zone-guide-visibility/u);
    assert.match(settingsStore, /optcg:client:zone-background-visibility/u);
    assert.match(settingsStore, /optcg:client:confirm-end-turn/u);
    assert.match(settingsStore, /optcg:client:quick-pay-activate-main-costs/u);
    assert.match(settingsStore, /optcg:client:reduce-deck-stack-rendering/u);
    assert.match(settingsStore, /optcg:client:confirm-attach-don/u);
    assert.match(settingsStore, /optcg:client:reduced-motion/u);
    assert.match(settingsStore, /optcg:client:sound-volume/u);
    assert.match(settingsStore, /optcg:client:window-color/u);
    assert.match(settingsStore, /optcg:client:window-opacity/u);
    assert.match(settingsStore, /optcg:client:playmat-color/u);
    assert.match(settingsStore, /optcg:client:playmat-opacity/u);
    assert.match(settingsStore, /groupId:\s*"appearance"/u);
    assert.match(settingsStore, /groupId:\s*"gameplay"/u);
    assert.match(settingsStore, /groupId:\s*"sound"/u);
    assert.match(settingsStore, /groupId:\s*"video"/u);
    assert.match(settingsStore, /loadMatchVisualSettings/u);
    assert.match(settingsStore, /saveMatchVisualSetting/u);
    assert.match(persistedSettingsHook, /createBrowserPersistentStorage/u);
    assert.match(persistedSettingsHook, /loadMatchVisualSettings/u);
    assert.match(persistedSettingsHook, /saveMatchVisualSetting/u);
    assert.match(settingsWindow, /new FileReader\(\)/u);
    assert.match(settingsWindow, /reader\.readAsDataURL\(file\)/u);
    assert.match(settingsWindow, /type="file"/u);
    assert.match(settingsWindow, /setBackgroundColor/u);
    assert.match(settingsWindow, /setBackgroundImageFit/u);
    assert.match(settingsWindow, /setBackgroundImageCropZoom/u);
    assert.match(settingsWindow, /setBackgroundImagePositionX/u);
    assert.match(settingsWindow, /setBackgroundImagePositionY/u);
    assert.match(settingsWindow, /setBackgroundMode/u);
    assert.match(settingsWindow, /onPointerDown/u);
    assert.match(settingsWindow, /onPointerMove/u);
    assert.match(settingsWindow, /setPointerCapture/u);
    assert.match(settingsWindow, /settings-crop-preview/u);
    assert.match(settingsWindow, /settings-crop-frame/u);
    assert.match(settingsWindow, /setZoneGuideVisibility/u);
    assert.match(settingsWindow, /setZoneBackgroundVisibility/u);
    assert.match(settingsWindow, /setWindowColor/u);
    assert.match(settingsWindow, /setWindowOpacity/u);
    assert.match(settingsWindow, /setPlaymatColor/u);
    assert.match(settingsWindow, /setPlaymatOpacity/u);
    assert.match(settingsControls, /settings-color-swatch/u);
    assert.match(settingsControls, /type="color"/u);
    assert.match(settingsWindow, /setSoundVolume/u);
    assert.match(settingsWindow, /setReduceDeckStackRendering/u);
    assert.match(settingsWindow, /setReducedMotion/u);
    assert.match(mainSource, /styles\/settings-window\.css/u);
    assert.match(appShellStyles, /background-size:\s*cover;/u);
    assert.match(appShellStyles, /background-repeat:\s*no-repeat;/u);
  });

  test("match app applies background color and image fit variables", async () => {
    const [matchApp, appShellStyles] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "styles", "app-shell.css"), "utf8"),
    ]);

    assert.doesNotMatch(matchApp, /backgroundMode\s*===/u);
    assert.match(matchApp, /backgroundImageFit/u);
    assert.match(matchApp, /backgroundImageCropZoom/u);
    assert.match(matchApp, /backgroundImagePositionX/u);
    assert.match(matchApp, /backgroundImagePositionY/u);
    assert.match(matchApp, /--match-background-color/u);
    assert.match(matchApp, /--match-background-size/u);
    assert.match(matchApp, /--match-background-repeat/u);
    assert.match(matchApp, /--match-background-position/u);
    assert.match(
      matchApp,
      /"--match-background-image":\s*backgroundImageEnabled/u,
    );
    assert.doesNotMatch(matchApp, /className="match-app-background-image"/u);
    const matchAppStyleStart = matchApp.indexOf("const matchAppStyle =");
    const matchAppClassNameStart = matchApp.indexOf(
      "  const matchAppClassName",
    );
    assert.notEqual(matchAppStyleStart, -1);
    assert.notEqual(matchAppClassNameStart, -1);
    const matchAppStyleSource = matchApp.slice(
      matchAppStyleStart,
      matchAppClassNameStart,
    );
    assert.doesNotMatch(matchAppStyleSource, /backgroundImage:/u);
    assert.match(matchAppStyleSource, /url\(/u);
    assert.match(
      appShellStyles,
      /background-color:\s*var\(--match-background-color\);/u,
    );
    assert.match(
      appShellStyles,
      /\.match-app::before\s*\{[^}]*background-image:\s*var\(--match-background-image\);/u,
    );
    assert.match(
      appShellStyles,
      /\.match-app::before\s*\{[^}]*background-position:\s*var\(--match-background-position\);/u,
    );
    assert.match(
      appShellStyles,
      /\.match-app::before\s*\{[^}]*background-repeat:\s*var\(--match-background-repeat\);/u,
    );
    assert.match(
      appShellStyles,
      /\.match-app::before\s*\{[^}]*background-size:\s*var\(--match-background-size\);/u,
    );
    assert.match(
      appShellStyles,
      /\.match-app::before\s*\{[^}]*contain:\s*paint;/u,
    );
  });

  test("background layer does not override control rail or floating window positioning", async () => {
    const [appShellStyles, controlsStyles] = await Promise.all([
      readFile(join(sourceDirectory, "styles", "app-shell.css"), "utf8"),
      readFile(join(sourceDirectory, "styles", "controls.css"), "utf8"),
    ]);

    assert.doesNotMatch(appShellStyles, /\.match-app\s*>\s*:not/u);
    assert.doesNotMatch(
      appShellStyles,
      /\.match-app\s*>\s*\*\s*\{[^}]*position:/u,
    );
    assert.match(
      appShellStyles,
      /\.match-app\s*>\s*\.board-shell\s*\{[^}]*z-index:\s*1;/u,
    );
    assert.match(controlsStyles, /\.control-rail\s*\{[^}]*z-index:\s*2;/u);
  });

  test("match app applies custom window and playmat color variables", async () => {
    const [matchApp, appShellStyles, floatingWindowStyles, playmatStyles] =
      await Promise.all([
        readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
        readFile(join(sourceDirectory, "styles", "app-shell.css"), "utf8"),
        readFile(
          join(sourceDirectory, "styles", "floating-window.css"),
          "utf8",
        ),
        readFile(join(sourceDirectory, "styles", "playmat.css"), "utf8"),
      ]);

    assert.match(matchApp, /windowSurfaceRgb/u);
    assert.match(matchApp, /playmatSurfaceRgb/u);
    assert.match(matchApp, /--match-window-color-rgb/u);
    assert.match(matchApp, /--match-window-opacity/u);
    assert.match(matchApp, /--match-playmat-color-rgb/u);
    assert.match(matchApp, /--match-playmat-opacity/u);
    assert.match(
      appShellStyles,
      /--match-surface-window:\s*rgba\(\s*var\(--match-window-color-rgb\),\s*var\(--match-window-opacity\)\s*\);/u,
    );
    assert.match(
      appShellStyles,
      /--match-surface-board:\s*rgba\(\s*var\(--match-playmat-color-rgb\),\s*var\(--match-playmat-opacity\)\s*\);/u,
    );
    assert.match(
      appShellStyles,
      /--match-surface-panel:\s*var\(--match-surface-window\);/u,
    );
    assert.match(
      appShellStyles,
      /--match-surface-panel-raised:\s*var\(--match-surface-window\);/u,
    );
    assert.match(
      floatingWindowStyles,
      /background:\s*var\(--match-surface-window\);/u,
    );
    assert.match(playmatStyles, /background:\s*var\(--match-surface-board\);/u);
  });

  test("confirm attach DON setting reaches the selected-DON click path", async () => {
    const [matchApp, matchClient, cardSelection] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "useMatchClient.ts"), "utf8"),
      readFile(
        join(sourceDirectory, "use-match-client-card-selection.ts"),
        "utf8",
      ),
    ]);

    assert.match(
      matchApp,
      /confirmAttachDon:\s*visualSettings\.confirmAttachDon/u,
    );
    assert.match(
      matchApp,
      /quickPayActivateMainCosts:\s*visualSettings\.quickPayActivateMainCosts/u,
    );
    assert.match(matchClient, /quickPayActivateMainCosts\s*=\s*false/u);
    assert.match(matchClient, /confirmAttachDon\s*=\s*true/u);
    assert.match(cardSelection, /selectedDonAttachmentClickIntent/u);
    assert.match(cardSelection, /attachSelectedDonToTarget/u);
  });

  test("reduced motion setting disables match app animations", async () => {
    const [matchApp, appShellStyles] = await Promise.all([
      readFile(join(sourceDirectory, "MatchApp.tsx"), "utf8"),
      readFile(join(sourceDirectory, "styles", "app-shell.css"), "utf8"),
    ]);

    assert.match(matchApp, /visualSettings\.reducedMotion/u);
    assert.match(matchApp, /visualSettings\.reduceDeckStackRendering/u);
    assert.match(matchApp, /is-reduced-motion/u);
    assert.match(appShellStyles, /\.match-app\.is-reduced-motion\s+\*/u);
    assert.match(appShellStyles, /animation:\s*none\s*!important;/u);
    assert.match(appShellStyles, /transition:\s*none\s*!important;/u);
  });

  test("tool strip buttons focus resurfaced info tabs", async () => {
    const toolbarControls = await readFile(
      join(sourceDirectory, "info-window-toolbar-controls.ts"),
      "utf8",
    );

    assert.match(toolbarControls, /const activateInfoWindowTab/u);
    assert.match(toolbarControls, /setInfoWindowActiveTab\(tabId\)/u);
    assert.match(toolbarControls, /setControlDockActiveTabId\(windowKey\)/u);
    assert.match(toolbarControls, /focusPreviewWindow/u);
    assert.match(toolbarControls, /focusActionLogWindow/u);
    assert.match(toolbarControls, /focusSettingsWindow/u);
  });
});
