import { useEffect, useRef, useState } from "react";

import type { PersonalizationLoadout } from "../match-personalization-store.js";

const fullHexColorPattern = /^#?[0-9a-fA-F]{6}$/u;

export const completeHexColorFromDraft = (
  draft: string,
): string | undefined => {
  const trimmed = draft.trim();
  if (!fullHexColorPattern.test(trimmed)) {
    return undefined;
  }
  return (trimmed.startsWith("#") ? trimmed : `#${trimmed}`).toLowerCase();
};

export const SegmentedControl = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly (readonly [T, string])[];
  readonly onChange: (value: T) => void;
}): React.JSX.Element => (
  <div className="settings-segmented-field">
    <span>{label}</span>
    <div className="settings-segmented-control" role="group" aria-label={label}>
      {options.map(([optionValue, optionLabel]) => (
        <button
          key={optionValue}
          type="button"
          className={value === optionValue ? "is-selected" : ""}
          aria-pressed={value === optionValue}
          onClick={() => {
            onChange(optionValue);
          }}
        >
          {optionLabel}
        </button>
      ))}
    </div>
  </div>
);

export const ColorSelector = ({
  label,
  value,
  presets,
  onChange,
  onPresetChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly presets: readonly string[];
  readonly onChange: (value: string) => void;
  readonly onPresetChange: (index: number, value: string) => void;
}): React.JSX.Element => {
  const [draftValue, setDraftValue] = useState(value);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<
    number | undefined
  >(() => {
    const matchingIndex = presets.findIndex(
      (color) => color.toLowerCase() === value.toLowerCase(),
    );
    return matchingIndex === -1 ? undefined : matchingIndex;
  });
  const pickerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftValue(value);
    setSelectedPresetIndex((currentIndex) => {
      const normalizedValue = value.toLowerCase();
      if (currentIndex !== undefined) {
        const currentPreset = presets[currentIndex];
        if (
          currentPreset !== undefined &&
          currentPreset.toLowerCase() === normalizedValue
        ) {
          return currentIndex;
        }
      }
      const matchingIndex = presets.findIndex(
        (color) => color.toLowerCase() === normalizedValue,
      );
      return matchingIndex === -1 ? undefined : matchingIndex;
    });
  }, [presets, value]);

  return (
    <div className="settings-color-field">
      <div className="settings-color-header">
        <span>{label}</span>
      </div>
      <div className="settings-color-selector">
        <div
          className="settings-color-swatches"
          aria-label={`${label} presets`}
        >
          {presets.map((color, index) => (
            <button
              key={`${label}-${String(index)}`}
              type="button"
              className={[
                "settings-color-swatch",
                selectedPresetIndex === index ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ backgroundColor: color }}
              aria-label={`${label} ${color}`}
              aria-pressed={selectedPresetIndex === index}
              onClick={() => {
                setSelectedPresetIndex(index);
                setDraftValue(color);
                onChange(color);
              }}
            />
          ))}
        </div>
        <button
          className="settings-color-picker-button"
          type="button"
          aria-label={`Open ${label} picker`}
          title={`Open ${label} picker`}
          onClick={() => {
            pickerInputRef.current?.click();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M14.7 4.3 19.7 9.3 9.8 19.2 4.5 20.5 5.8 15.2z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.9"
            />
            <path
              d="M13.4 5.6 18.4 10.6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.9"
            />
          </svg>
        </button>
        <input
          ref={pickerInputRef}
          className="settings-color-picker-input"
          type="color"
          value={value}
          aria-label={`${label} color picker`}
          onChange={(event) => {
            const nextColor = event.currentTarget.value.toLowerCase();
            setDraftValue(nextColor);
            onChange(nextColor);
            if (selectedPresetIndex !== undefined) {
              onPresetChange(selectedPresetIndex, nextColor);
            }
          }}
        />
        <input
          type="text"
          inputMode="text"
          pattern="#?[0-9a-fA-F]{6}"
          maxLength={7}
          spellCheck={false}
          autoCapitalize="off"
          value={draftValue}
          aria-label={label}
          onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            setDraftValue(nextDraft);
            const completeColor = completeHexColorFromDraft(nextDraft);
            if (completeColor !== undefined) {
              setSelectedPresetIndex(undefined);
              onChange(completeColor);
            }
          }}
          onBlur={() => {
            setDraftValue(value);
          }}
        />
      </div>
    </div>
  );
};

export const SettingsSection = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element => (
  <section className="settings-section" aria-label={title}>
    <h3>{title}</h3>
    {children}
  </section>
);

export const SettingsSubsection = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element => (
  <section className="settings-subsection" aria-label={title}>
    <h4>{title}</h4>
    {children}
  </section>
);

export const RangeField = ({
  label,
  min,
  max,
  value,
  onChange,
}: {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly onChange: (value: number) => void;
}): React.JSX.Element => {
  const roundedValue = Math.round(value);

  return (
    <label className="settings-field settings-range-field">
      <span className="settings-range-header">
        <span className="settings-label-text">{label}</span>
        <output className="settings-range-value" aria-label={`${label} value`}>
          {roundedValue}%
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.valueAsNumber);
        }}
      />
    </label>
  );
};

export const PersonalizationLoadoutManager = ({
  loadouts,
  selectedLoadoutId,
  onSelect,
  onSave,
  onCreate,
  onDelete,
}: {
  readonly loadouts: readonly PersonalizationLoadout[];
  readonly selectedLoadoutId: string;
  readonly onSelect: (id: string) => void;
  readonly onSave: () => void;
  readonly onCreate: () => void;
  readonly onDelete: () => void;
}): React.JSX.Element => (
  <div className="settings-loadout-manager">
    <select
      aria-label="Personalization style loadout"
      value={selectedLoadoutId}
      onChange={(event) => {
        onSelect(event.currentTarget.value);
      }}
    >
      <option value="">Current style</option>
      {loadouts.map((loadout) => (
        <option key={loadout.id} value={loadout.id}>
          {loadout.name}
        </option>
      ))}
    </select>
    <div className="settings-loadout-actions">
      <button type="button" onClick={onSave}>
        Save style
      </button>
      <button type="button" onClick={onCreate}>
        New style
      </button>
      <button
        type="button"
        disabled={selectedLoadoutId.length === 0}
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  </div>
);
