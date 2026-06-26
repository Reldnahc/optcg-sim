import { useEffect, useState } from "react";

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
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  return (
    <div className="settings-color-field">
      <div className="settings-color-header">
        <span>{label}</span>
        <button
          className="settings-color-picker-toggle"
          type="button"
          aria-label={`Open ${label} picker`}
          aria-expanded={pickerOpen}
          onClick={() => {
            setPickerOpen((open) => !open);
          }}
        >
          Pick
        </button>
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
                value.toLowerCase() === color ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ backgroundColor: color }}
              aria-label={`${label} ${color}`}
              aria-pressed={value.toLowerCase() === color}
              onClick={() => {
                setDraftValue(color);
                onChange(color);
              }}
            />
          ))}
        </div>
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
              onChange(completeColor);
            }
          }}
          onBlur={() => {
            setDraftValue(value);
          }}
        />
      </div>
      {pickerOpen ? (
        <div className="settings-color-picker-popover">
          <label className="settings-field">
            <span>Picker</span>
            <input
              type="color"
              value={value}
              aria-label={`${label} color picker`}
              onChange={(event) => {
                const nextColor = event.currentTarget.value.toLowerCase();
                setDraftValue(nextColor);
                onChange(nextColor);
              }}
            />
          </label>
          <div className="settings-color-preview-row">
            <span
              className="settings-color-preview"
              style={{ backgroundColor: value }}
              aria-label={`${label} preview`}
            />
            <span>{value}</span>
          </div>
          <div className="settings-color-preset-save">
            <span>Save to preset</span>
            <div className="settings-color-preset-save-grid">
              {presets.map((color, index) => (
                <button
                  key={`${label}-save-${String(index)}`}
                  type="button"
                  style={{ backgroundColor: color }}
                  aria-label={`Save ${label} to preset ${String(index + 1)}`}
                  onClick={() => {
                    onPresetChange(index, value);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
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
