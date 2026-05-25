import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DevPoneglyphFetch } from "@optcg/cards";

const fixtureFiles: Record<string, string> = {
  "OP13-079": "OP13-079.imu.json",
  "OP13-080": "OP13-080.st-ethanbaron-v-nusjuro.json",
  "OP13-082": "OP13-082.five-elders.json",
  "OP13-083": "OP13-083.st-jaygarcia-saturn.json",
  "OP13-084": "OP13-084.st-shepherd-ju-peter.json",
  "OP13-089": "OP13-089.st-topman-warcury.json",
  "OP13-091": "OP13-091.st-marcus-mars.json",
  "OP13-099": "OP13-099.the-empty-throne.json",
};

const fixturesRoot = new URL(
  "../../../fixtures/poneglyph/cards/",
  import.meta.url,
);

export const createDefaultDevFixtureFetch =
  (): DevPoneglyphFetch => async (url, init) => {
    if (!url.endsWith("/v1/cards/batch") || init?.method !== "POST") {
      return {
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      };
    }
    const body = JSON.parse(init.body ?? "{}") as {
      card_numbers?: string[];
    };
    const data: Record<string, unknown> = {};
    const missing: string[] = [];
    for (const cardId of body.card_numbers ?? []) {
      const fileName = fixtureFiles[cardId];
      if (fileName === undefined) {
        missing.push(cardId);
        continue;
      }
      const raw = await readFile(
        fileURLToPath(new URL(fileName, fixturesRoot)),
        "utf8",
      );
      data[cardId] = JSON.parse(raw) as unknown;
    }
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data, missing }),
    };
  };
