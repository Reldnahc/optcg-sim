import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const region = process.env.AWS_REGION ?? "us-east-1";
const cluster = process.env.ECS_CLUSTER ?? "poneglyph-one-cluster";
const service = process.env.ECS_SERVICE ?? "poneglyph-one-sim-dev";
const logGroup = process.env.ECS_LOG_GROUP ?? "/ecs/poneglyph-one-sim-dev";
const outputPath =
  process.argv[2] ?? "fixtures/replays/dev-latest-replay.local.json";

const runAws = (args) => {
  const result = spawnSync("aws", [...args, "--region", region], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `aws ${args[0]} failed`);
  }
  return result.stdout.trim().length === 0 ? {} : JSON.parse(result.stdout);
};

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const detailSql = `
  SELECT
    m.id AS "matchId",
    m.status,
    m.game_type AS "gameType",
    m.format_id AS "formatId",
    m.lobby_id AS "lobbyId",
    m.winner_user_id AS "winnerUserId",
    m.winner_seat_id AS "winnerSeatId",
    m.started_at::text AS "startedAt",
    m.ended_at::text AS "endedAt",
    m.turn_count AS "turnCount",
    m.action_count AS "actionCount",
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'seatId', players.seat_id,
            'userId', players.user_id,
            'displayName', players.display_name,
            'leaderCardNumber', players.leader_card_number,
            'result', players.result,
            'isWinner', players.is_winner
          )
          ORDER BY players.seat_id
        ),
        '[]'::jsonb
      )
      FROM sim_dev.match_players players
      WHERE players.match_id = m.id
    ) AS players,
    jsonb_build_object(
      'replayFormatVersion', replay.replay_format_version,
      'engineVersion', replay.engine_version,
      'rulesVersion', replay.rules_version,
      'cardDataVersion', replay.card_data_version,
      'effectDefinitionsVersion', replay.effect_definitions_version,
      'customHandlerVersion', replay.custom_handler_version,
      'banlistVersion', replay.banlist_version,
      'protocolVersion', replay.protocol_version,
      'rngAlgorithm', replay.rng_algorithm,
      'rngSeedCommitment', replay.rng_seed_commitment,
      'rngSeedRevealed', replay.rng_seed_revealed,
      'manifestHash', replay.manifest_hash,
      'manifestSnapshot', replay.manifest_snapshot,
      'initialStateHash', replay.initial_state_hash,
      'finalStateHash', replay.final_state_hash,
      'initialSnapshot', replay.initial_snapshot,
      'initialDeckOrders', replay.initial_deck_orders,
      'deterministicEntries', replay.deterministic_entries,
      'auditEntries', replay.audit_entries,
      'checkpoints', replay.checkpoints,
      'finalState', replay.final_state,
      'compressed', replay.compressed,
      'artifactStorage', replay.artifact_storage,
      'artifactKey', replay.artifact_key,
      'artifactSha256', replay.artifact_sha256,
      'artifactSizeBytes', replay.artifact_size_bytes
    ) AS replay
  FROM sim_dev.matches m
  INNER JOIN sim_dev.match_replays replay
    ON replay.match_id = m.id
  WHERE m.id = COALESCE(
    NULLIF($1, '')::uuid,
    (
      SELECT latest.id
      FROM sim_dev.matches latest
      INNER JOIN sim_dev.match_replays latest_replay
        ON latest_replay.match_id = latest.id
      ORDER BY latest.ended_at DESC
      LIMIT 1
    )
  )
`;

const replayExportProgram = String.raw`
const pg = require("/app/node_modules/.pnpm/optcg-db@0.4.40/node_modules/pg");

const detailSql = ${JSON.stringify(detailSql)};
const compactManifestForViewer = (manifest) => {
  const cards = manifest?.cards;
  if (cards === undefined || typeof cards !== "object" || cards === null) {
    return manifest;
  }
  return {
    cards: Object.fromEntries(
      Object.entries(cards).map(([cardId, card]) => {
        const firstVariant = Array.isArray(card?.variants)
          ? card.variants.find(
              (variant) => typeof variant === "object" && variant !== null,
            )
          : undefined;
        return [
          cardId,
          {
            cardId: card?.cardId,
            name: card?.name,
            category: card?.category,
            cost: card?.cost,
            power: card?.power,
            counter: card?.counter,
            attributes: card?.attributes,
            types: card?.types,
            effectText: card?.effectText,
            triggerText: card?.triggerText,
            variants:
              firstVariant === undefined
                ? []
                : [
                    {
                      stockImageFull: firstVariant.stockImageFull,
                      scanImageDisplay: firstVariant.scanImageDisplay,
                    },
                  ],
          },
        ];
      }),
    ),
  };
};
const compactReplayForViewer = (replay) => ({
  ...replay,
  replay: {
    replayFormatVersion: replay.replay?.replayFormatVersion,
    engineVersion: replay.replay?.engineVersion,
    rulesVersion: replay.replay?.rulesVersion,
    cardDataVersion: replay.replay?.cardDataVersion,
    effectDefinitionsVersion: replay.replay?.effectDefinitionsVersion,
    customHandlerVersion: replay.replay?.customHandlerVersion,
    banlistVersion: replay.replay?.banlistVersion,
    protocolVersion: replay.replay?.protocolVersion,
    manifestHash: replay.replay?.manifestHash,
    manifestSnapshot: compactManifestForViewer(replay.replay?.manifestSnapshot),
    finalStateHash: replay.replay?.finalStateHash,
    deterministicEntries: replay.replay?.deterministicEntries,
    checkpoints: replay.replay?.checkpoints,
  },
});

(async () => {
  const client = new pg.Client({
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  try {
    const result = await client.query(detailSql, [process.env.REPLAY_MATCH_ID ?? ""]);
    const replay = result.rows[0];
    if (replay === undefined) {
      throw new Error("No dev replay rows found.");
    }
    const payload = JSON.stringify({ replay: compactReplayForViewer(replay) });
    const encoded = Buffer.from(payload, "utf8").toString("base64");
    const chunkSize = 120000;
    const chunkCount = Math.ceil(encoded.length / chunkSize);
    console.log(
      "REPLAY_EXPORT_META " +
        JSON.stringify({
          matchId: replay.matchId,
          actionCount: replay.actionCount,
          deterministicEntries: replay.replay?.deterministicEntries?.length,
          chunkCount,
        }),
    );
    for (let index = 0; index < chunkCount; index += 1) {
      console.log(
        "REPLAY_EXPORT_CHUNK " +
          JSON.stringify({
            index,
            data: encoded.slice(index * chunkSize, (index + 1) * chunkSize),
          }),
      );
    }
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

const describeService = runAws([
  "ecs",
  "describe-services",
  "--cluster",
  cluster,
  "--services",
  service,
]);
const serviceDescription = describeService.services?.[0];
if (serviceDescription === undefined) {
  throw new Error(`ECS service ${service} was not found.`);
}
const awsvpcConfiguration =
  serviceDescription.networkConfiguration?.awsvpcConfiguration;
if (awsvpcConfiguration === undefined) {
  throw new Error(`ECS service ${service} has no awsvpc configuration.`);
}

const runTask = runAws([
  "ecs",
  "run-task",
  "--cluster",
  cluster,
  "--launch-type",
  "FARGATE",
  "--task-definition",
  serviceDescription.taskDefinition,
  "--network-configuration",
  JSON.stringify({
    awsvpcConfiguration: {
      subnets: awsvpcConfiguration.subnets,
      securityGroups: awsvpcConfiguration.securityGroups,
      assignPublicIp: awsvpcConfiguration.assignPublicIp,
    },
  }),
  "--overrides",
  JSON.stringify({
    containerOverrides: [
      {
        name: "sim",
        command: ["node", "-e", replayExportProgram],
      },
    ],
  }),
]);
const taskArn = runTask.tasks?.[0]?.taskArn;
if (typeof taskArn !== "string") {
  throw new Error(JSON.stringify(runTask.failures ?? runTask, null, 2));
}
const taskId = taskArn.split("/").at(-1);
if (taskId === undefined) {
  throw new Error(`Could not parse ECS task id from ${taskArn}.`);
}
process.stdout.write(`Started replay export task ${taskId}\n`);

for (let attempt = 0; attempt < 90; attempt += 1) {
  const described = runAws([
    "ecs",
    "describe-tasks",
    "--cluster",
    cluster,
    "--tasks",
    taskArn,
  ]);
  const task = described.tasks?.[0];
  if (task?.lastStatus === "STOPPED") {
    const exitCode = task.containers?.[0]?.exitCode;
    if (exitCode !== 0) {
      throw new Error(`Replay export task stopped with exit code ${exitCode}.`);
    }
    break;
  }
  await wait(2000);
}

const streamName = `ecs/sim/${taskId}`;
const logs = runAws([
  "logs",
  "filter-log-events",
  "--log-group-name",
  logGroup,
  "--log-stream-names",
  streamName,
]);
const messages = (logs.events ?? []).map((event) => event.message);
const metaLine = messages.find((message) =>
  message.startsWith("REPLAY_EXPORT_META "),
);
const chunkLines = messages.filter((message) =>
  message.startsWith("REPLAY_EXPORT_CHUNK "),
);
if (metaLine === undefined || chunkLines.length === 0) {
  throw new Error(`Replay export markers were not found in ${streamName}.`);
}
const meta = JSON.parse(metaLine.slice("REPLAY_EXPORT_META ".length));
const chunks = chunkLines
  .map((line) => JSON.parse(line.slice("REPLAY_EXPORT_CHUNK ".length)))
  .sort((left, right) => left.index - right.index);
if (chunks.length !== meta.chunkCount) {
  throw new Error(
    `Expected ${meta.chunkCount} chunks but found ${chunks.length}.`,
  );
}
const replayJson = Buffer.from(
  chunks.map((chunk) => chunk.data).join(""),
  "base64",
).toString("utf8");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${replayJson}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ ...meta, outputPath }, null, 2)}\n`);
