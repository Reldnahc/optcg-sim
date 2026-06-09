import { describe, expect, test } from "vitest";

import { resolveRedisConfig } from "./redis-config.js";

describe("redis config", () => {
  test("auto mode does not require local Redis without a configured URL", () => {
    expect(
      resolveRedisConfig({
        env: {},
      }),
    ).toEqual({ mode: "auto" });
  });

  test("auto mode uses an explicit Redis URL when present", () => {
    expect(
      resolveRedisConfig({
        env: { REDIS_URL: "redis://cache:6379" },
      }),
    ).toEqual({ mode: "auto", redisUrl: "redis://cache:6379" });
  });

  test("disabled mode ignores Redis URLs", () => {
    expect(
      resolveRedisConfig({
        env: {
          PONEGLYPH_SIM_REDIS: "off",
          REDIS_URL: "redis://cache:6379",
        },
      }),
    ).toEqual({ mode: "disabled" });
  });

  test("enabled mode can opt local Redis back in with the default URL", () => {
    expect(
      resolveRedisConfig({
        env: { PONEGLYPH_SIM_REDIS: "on" },
      }),
    ).toEqual({ mode: "enabled", redisUrl: "redis://localhost:6379" });
  });
});
