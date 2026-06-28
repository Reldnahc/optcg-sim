import type { ClientStorage } from "../session.js";

const preferredLobbyLoadoutIdKey = "optcg:client:preferred-lobby-loadout-id";

const normalizeLoadoutId = (
  value: string | null | undefined,
): string | undefined => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

export const loadPreferredLobbyLoadoutId = (
  storage: ClientStorage | undefined,
): string | undefined =>
  normalizeLoadoutId(storage?.getItem(preferredLobbyLoadoutIdKey));

export const savePreferredLobbyLoadoutId = (
  storage: ClientStorage | undefined,
  loadoutId: string,
): string | undefined => {
  const normalized = normalizeLoadoutId(loadoutId);
  if (normalized === undefined) {
    storage?.removeItem(preferredLobbyLoadoutIdKey);
    return undefined;
  }
  storage?.setItem(preferredLobbyLoadoutIdKey, normalized);
  return normalized;
};
