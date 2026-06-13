import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createMemoryClientStorage } from "../session.js";
import {
  defaultMatchVisualSettingsValues,
  loadMatchVisualSettings,
  matchVisualSettingDefinitions,
  matchVisualSettingIds,
  saveMatchVisualSetting,
} from "./match-visual-settings-store.js";
import type { MatchVisualSettingId } from "./match-visual-settings.js";

describe("match visual settings store", () => {
  test("keeps every setting in one categorized registry", () => {
    assert.deepEqual(matchVisualSettingIds, [
      "backgroundColor",
      "backgroundImageUrl",
      "backgroundImageFit",
      "backgroundImagePositionX",
      "backgroundImagePositionY",
      "backgroundMode",
      "confirmAttachDon",
      "confirmEndTurn",
      "quickPayActivateMainCosts",
      "reducedMotion",
      "soundVolume",
      "windowColor",
      "windowOpacity",
      "playmatColor",
      "playmatOpacity",
      "zoneBackgroundVisibility",
      "zoneGuideVisibility",
    ] satisfies MatchVisualSettingId[]);

    const groupIds = new Set<string>();
    for (const settingId of matchVisualSettingIds) {
      const definition = matchVisualSettingDefinitions[settingId];
      assert.equal(definition.id, settingId);
      assert.match(definition.storageKey, /^optcg:client:/u);
      groupIds.add(definition.groupId);
    }
    assert.deepEqual([...groupIds].sort(), [
      "appearance",
      "gameplay",
      "sound",
      "video",
    ]);
  });

  test("loads default settings through the registry", () => {
    assert.deepEqual(
      loadMatchVisualSettings(createMemoryClientStorage()),
      defaultMatchVisualSettingsValues,
    );
  });

  test("round-trips every setting through centralized persistence", () => {
    const storage = createMemoryClientStorage();

    saveMatchVisualSetting(
      storage,
      "backgroundImageUrl",
      "  data:image/png;base64,abc  ",
    );
    saveMatchVisualSetting(storage, "backgroundColor", "  #334455  ");
    saveMatchVisualSetting(storage, "backgroundImageFit", "tile");
    saveMatchVisualSetting(storage, "backgroundImagePositionX", 26);
    saveMatchVisualSetting(storage, "backgroundImagePositionY", 74);
    saveMatchVisualSetting(storage, "backgroundMode", "image");
    saveMatchVisualSetting(storage, "confirmAttachDon", false);
    saveMatchVisualSetting(storage, "confirmEndTurn", true);
    saveMatchVisualSetting(storage, "quickPayActivateMainCosts", true);
    saveMatchVisualSetting(storage, "reducedMotion", true);
    saveMatchVisualSetting(storage, "soundVolume", 42);
    saveMatchVisualSetting(storage, "windowColor", "  #223344  ");
    saveMatchVisualSetting(storage, "windowOpacity", 49);
    saveMatchVisualSetting(storage, "playmatColor", "#445566");
    saveMatchVisualSetting(storage, "playmatOpacity", 63);
    saveMatchVisualSetting(storage, "zoneBackgroundVisibility", 37);
    saveMatchVisualSetting(storage, "zoneGuideVisibility", 82);

    assert.deepEqual(loadMatchVisualSettings(storage), {
      backgroundColor: "#334455",
      backgroundImageFit: "tile",
      backgroundImagePositionX: 26,
      backgroundImagePositionY: 74,
      backgroundImageUrl: "data:image/png;base64,abc",
      backgroundMode: "image",
      confirmAttachDon: false,
      confirmEndTurn: true,
      quickPayActivateMainCosts: true,
      reducedMotion: true,
      soundVolume: 42,
      windowColor: "#223344",
      windowOpacity: 50,
      playmatColor: "#445566",
      playmatOpacity: 63,
      zoneBackgroundVisibility: 37,
      zoneGuideVisibility: 82,
    });
  });

  test("normalizes invalid persisted values consistently", () => {
    const storage = createMemoryClientStorage();

    saveMatchVisualSetting(storage, "backgroundImageUrl", "");
    storage.setItem(
      matchVisualSettingDefinitions.backgroundColor.storageKey,
      "blue",
    );
    storage.setItem(
      matchVisualSettingDefinitions.backgroundImageFit.storageKey,
      "zoom",
    );
    storage.setItem(
      matchVisualSettingDefinitions.backgroundImagePositionX.storageKey,
      "-20",
    );
    storage.setItem(
      matchVisualSettingDefinitions.backgroundImagePositionY.storageKey,
      "150",
    );
    storage.setItem(
      matchVisualSettingDefinitions.backgroundMode.storageKey,
      "video",
    );
    storage.setItem(
      matchVisualSettingDefinitions.zoneBackgroundVisibility.storageKey,
      "999",
    );
    storage.setItem(
      matchVisualSettingDefinitions.zoneGuideVisibility.storageKey,
      "bad",
    );
    storage.setItem(matchVisualSettingDefinitions.soundVolume.storageKey, "-1");
    storage.setItem(
      matchVisualSettingDefinitions.windowColor.storageKey,
      "red",
    );
    storage.setItem(
      matchVisualSettingDefinitions.playmatColor.storageKey,
      "#12345g",
    );
    storage.setItem(
      matchVisualSettingDefinitions.windowOpacity.storageKey,
      "120",
    );
    storage.setItem(
      matchVisualSettingDefinitions.playmatOpacity.storageKey,
      "-10",
    );

    assert.deepEqual(loadMatchVisualSettings(storage), {
      ...defaultMatchVisualSettingsValues,
      backgroundImagePositionX: 0,
      backgroundImagePositionY: 100,
      playmatOpacity: 50,
      soundVolume: 0,
      windowOpacity: 100,
      zoneBackgroundVisibility: 100,
    });
  });
});
