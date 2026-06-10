export interface PoneglyphApiEnvironment {
  readonly VITE_PONEGLYPH_API_BASE_URL?: string;
}

const defaultPoneglyphApiBaseUrl = "https://api.poneglyph.one";

export const poneglyphApiBaseUrlFromEnvironment = (
  environment: PoneglyphApiEnvironment,
): string =>
  environment.VITE_PONEGLYPH_API_BASE_URL?.trim() ?? defaultPoneglyphApiBaseUrl;
