import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import { createMemoryClientStorage } from "../session.js";
import {
  defaultColorPresets,
  loadColorPresets,
  loadPersonalizationLoadouts,
  personalizationValuesFromSettings,
  saveColorPreset,
  savePersonalizationLoadouts,
} from "./match-personalization-store.js";
import { defaultMatchVisualSettingsValues } from "./match-visual-settings.js";

describe("match personalization store", () => {
  test("loads editable color presets with invalid entries normalized to defaults", () => {
    const storage = createMemoryClientStorage();
    storage.setItem(
      "optcg:client:color-presets",
      JSON.stringify(["#AABBCC", "blue", "#112233", 7]),
    );

    assert.deepEqual(loadColorPresets(storage), [
      "#aabbcc",
      defaultColorPresets[1],
      "#112233",
      defaultColorPresets[3],
      defaultColorPresets[4],
      defaultColorPresets[5],
      defaultColorPresets[6],
    ]);
  });

  test("saves one preset slot without changing the remaining palette", () => {
    const storage = createMemoryClientStorage();

    assert.deepEqual(saveColorPreset(storage, 2, "  #ABCDEF  "), [
      defaultColorPresets[0],
      defaultColorPresets[1],
      "#abcdef",
      defaultColorPresets[3],
      defaultColorPresets[4],
      defaultColorPresets[5],
      defaultColorPresets[6],
    ]);
    assert.deepEqual(loadColorPresets(storage)[2], "#abcdef");
  });

  test("personalization loadouts round-trip only appearance settings", () => {
    const storage = createMemoryClientStorage();
    const values = personalizationValuesFromSettings({
      ...defaultMatchVisualSettingsValues,
      backgroundColor: "#111111",
      backgroundImageUrl: "data:image/png;base64,abc",
      backgroundImageFit: "tile",
      backgroundImageCropZoom: 175,
      backgroundImagePositionX: 12,
      backgroundImagePositionY: 88,
      windowColor: "#222222",
      windowOpacity: 77,
      playmatColor: "#333333",
      playmatOpacity: 66,
      zoneBackgroundVisibility: 44,
      zoneGuideVisibility: 55,
      confirmEndTurn: true,
      soundVolume: 12,
      reducedMotion: true,
    });

    savePersonalizationLoadouts(storage, [
      {
        id: "style-1",
        name: "Night",
        values,
      },
    ]);

    assert.deepEqual(loadPersonalizationLoadouts(storage), [
      {
        id: "style-1",
        name: "Night",
        values,
      },
    ]);
    assert.equal("confirmEndTurn" in values, false);
    assert.equal("soundVolume" in values, false);
    assert.equal("reducedMotion" in values, false);
  });

  test("drops malformed personalization loadouts instead of throwing", () => {
    const storage = createMemoryClientStorage();
    storage.setItem(
      "optcg:client:personalization-loadouts",
      JSON.stringify([
        {
          id: "ok",
          name: "OK",
          values: personalizationValuesFromSettings(
            defaultMatchVisualSettingsValues,
          ),
        },
        {
          id: "bad",
          name: "",
          values: { windowColor: "red" },
        },
      ]),
    );

    assert.deepEqual(
      loadPersonalizationLoadouts(storage).map(({ id }) => id),
      ["ok"],
    );
  });
});
