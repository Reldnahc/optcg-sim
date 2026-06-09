export type RedisMode = "auto" | "enabled" | "disabled";

export interface RedisConfig {
  readonly mode: RedisMode;
  readonly redisUrl?: string;
}

export interface ResolveRedisConfigInput {
  readonly redisUrl?: string | undefined;
  readonly redisMode?: RedisMode | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

const defaultRedisUrl = "redis://localhost:6379";

const redisModeFromValue = (
  value: string | undefined,
): RedisMode | undefined => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }
  if (
    normalized === "off" ||
    normalized === "false" ||
    normalized === "disabled" ||
    normalized === "no" ||
    normalized === "0"
  ) {
    return "disabled";
  }
  if (
    normalized === "on" ||
    normalized === "true" ||
    normalized === "enabled" ||
    normalized === "yes" ||
    normalized === "1"
  ) {
    return "enabled";
  }
  if (normalized === "auto") {
    return "auto";
  }
  return undefined;
};

export const resolveRedisConfig = ({
  env = process.env,
  redisMode,
  redisUrl,
}: ResolveRedisConfigInput = {}): RedisConfig => {
  const mode =
    redisMode ?? redisModeFromValue(env["PONEGLYPH_SIM_REDIS"]) ?? "auto";
  if (mode === "disabled") {
    return { mode };
  }
  const configuredUrl = redisUrl ?? env["REDIS_URL"];
  if (configuredUrl !== undefined && configuredUrl.trim().length > 0) {
    return { mode, redisUrl: configuredUrl.trim() };
  }
  return mode === "enabled" ? { mode, redisUrl: defaultRedisUrl } : { mode };
};
