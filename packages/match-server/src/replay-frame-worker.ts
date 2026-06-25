import { parentPort, workerData } from "node:worker_threads";

import type { CompletedMatchReplayDetail } from "./postgres-completed-match.js";
import {
  reconstructReplayFrames,
  type ReplayFrameReconstructionResult,
  type ReplayFrameReconstructionWindow,
} from "./replay-frame-reconstruction.js";

interface ReplayFrameWorkerInput {
  readonly detail: CompletedMatchReplayDetail;
  readonly window?: ReplayFrameReconstructionWindow | undefined;
}

const isWorkerInput = (value: unknown): value is ReplayFrameWorkerInput =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "detail" in value;

const port = parentPort;
if (port === null) {
  throw new Error("Replay frame worker started without a parent port.");
}

const result: ReplayFrameReconstructionResult = isWorkerInput(workerData)
  ? reconstructReplayFrames(workerData.detail, workerData.window)
  : { status: "failed", reason: "Replay frame worker input is invalid." };

port.postMessage(result);
