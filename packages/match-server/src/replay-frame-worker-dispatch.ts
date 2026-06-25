import { Worker } from "node:worker_threads";

import type { CompletedMatchReplayDetail } from "./postgres-completed-match.js";
import {
  reconstructReplayFrames,
  type ReplayFrameReconstructionResult,
  type ReplayFrameReconstructionWindow,
} from "./replay-frame-reconstruction.js";

const workerUrl = new URL("./replay-frame-worker.js", import.meta.url);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isReplayFrameReconstructionResult = (
  value: unknown,
): value is ReplayFrameReconstructionResult => {
  if (!isRecord(value)) {
    return false;
  }
  if (value["status"] === "failed") {
    return typeof value["reason"] === "string";
  }
  return value["status"] === "ready" && Array.isArray(value["frames"]);
};

const canUseCompiledWorker = (): boolean => import.meta.url.endsWith(".js");

export const reconstructReplayFramesOffThread = (
  detail: CompletedMatchReplayDetail,
  window?: ReplayFrameReconstructionWindow,
): Promise<ReplayFrameReconstructionResult> => {
  if (!canUseCompiledWorker()) {
    return Promise.resolve(reconstructReplayFrames(detail, window));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      workerData: { detail, window },
    });
    worker.once("message", (message: unknown) => {
      if (isReplayFrameReconstructionResult(message)) {
        resolve(message);
        return;
      }
      reject(new Error("Replay frame worker returned an invalid result."));
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) {
        reject(
          new Error(`Replay frame worker exited with code ${String(code)}.`),
        );
      }
    });
  });
};
