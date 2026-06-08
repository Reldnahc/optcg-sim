export interface MatchServerEnvironment {
  readonly VITE_OPTCG_MATCH_SERVER_URL?: string;
}

export const matchServerBaseUrlFromEnvironment = (
  environment: MatchServerEnvironment,
): string => environment.VITE_OPTCG_MATCH_SERVER_URL?.trim() ?? "";
