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
      "backgroundImageUrl",
      "confirmAttachDon",
      "confirmEndTurn",
      "quickPayActivateMainCosts",
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
    assert.deepEqual([...groupIds].sort(), ["appearance", "gameplay"]);
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
    saveMatchVisualSetting(storage, "confirmAttachDon", false);
    saveMatchVisualSetting(storage, "confirmEndTurn", true);
    saveMatchVisualSetting(storage, "quickPayActivateMainCosts", true);
    saveMatchVisualSetting(storage, "zoneBackgroundVisibility", 37);
    saveMatchVisualSetting(storage, "zoneGuideVisibility", 82);

    assert.deepEqual(loadMatchVisualSettings(storage), {
      backgroundImageUrl: "data:image/png;base64,abc",
      confirmAttachDon: false,
      confirmEndTurn: true,
      quickPayActivateMainCosts: true,
      zoneBackgroundVisibility: 37,
      zoneGuideVisibility: 82,
    });
  });

  test("normalizes invalid persisted values consistently", () => {
    const storage = createMemoryClientStorage();

    saveMatchVisualSetting(storage, "backgroundImageUrl", "");
    storage.setItem(
      matchVisualSettingDefinitions.zoneBackgroundVisibility.storageKey,
      "999",
    );
    storage.setItem(
      matchVisualSettingDefinitions.zoneGuideVisibility.storageKey,
      "bad",
    );

    assert.deepEqual(loadMatchVisualSettings(storage), {
      ...defaultMatchVisualSettingsValues,
      zoneBackgroundVisibility: 100,
    });
  });
});
