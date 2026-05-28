import { clearRedisKeysByPatternFromClient } from "./redis-card-cache.js";

const defaultRedisUrl = "redis://localhost:6379";
const defaultPattern = "card:*";

const optionValue = (name: string): string | undefined => {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline !== undefined) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value?.startsWith("--") === true ? undefined : value;
};

const main = async (): Promise<void> => {
  const redis = await import("redis");
  const url =
    optionValue("--url") ?? process.env["REDIS_URL"] ?? defaultRedisUrl;
  const pattern = optionValue("--pattern") ?? defaultPattern;
  const client = redis.createClient({ url });
  await client.connect();
  try {
    const deleted = await clearRedisKeysByPatternFromClient(client, pattern);
    process.stdout.write(
      `Deleted ${String(deleted)} Redis key${deleted === 1 ? "" : "s"} matching ${pattern}.\n`,
    );
  } finally {
    await client.quit();
  }
};

main().catch((error: unknown) => {
  process.stderr.write(
    error instanceof Error ? `${error.message}\n` : `${String(error)}\n`,
  );
  process.exitCode = 1;
});
