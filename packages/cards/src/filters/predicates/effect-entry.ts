import { supportedEntryPoints } from "../../entry-point-definitions.js";
import type { PredicateParser } from "./types.js";

const onPlayEntryPoint = () =>
  supportedEntryPoints.find((candidate) => candidate.trigger.type === "onPlay");

export const parseNoBaseEffectPredicate: PredicateParser = (text, current) => {
  const match = /^no base effect\b\s*(?<rest>.*)$/i.exec(text);
  if (match === null) {
    return undefined;
  }

  const entryPoint = onPlayEntryPoint();
  if (entryPoint === undefined) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      effectEntryPoint: {
        mode: "without",
        trigger: entryPoint.trigger,
        ...(entryPoint.condition === undefined
          ? {}
          : { condition: entryPoint.condition }),
      },
    },
    evidence: ["filter:effectEntryPoint", "filter:effectEntryPoint:without"],
    rest: match.groups?.["rest"] ?? "",
  };
};

export const parseEffectEntryPointPredicate: PredicateParser = (
  text,
  current,
) => {
  const match =
    /^(?<mode>with|without) an? (?<entry>\[[^\]]+\]) effect\b\s*(?<rest>.*)$/i.exec(
      text,
    );
  const modeText = match?.groups?.["mode"]?.toLowerCase();
  const entryText = match?.groups?.["entry"];
  if (
    (modeText !== "with" && modeText !== "without") ||
    entryText === undefined
  ) {
    return undefined;
  }

  const entryPoint = supportedEntryPoints.find(
    (candidate) => candidate.text.toLowerCase() === entryText.toLowerCase(),
  );
  if (entryPoint === undefined) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      effectEntryPoint: {
        mode: modeText,
        trigger: entryPoint.trigger,
        ...(entryPoint.condition === undefined
          ? {}
          : { condition: entryPoint.condition }),
      },
    },
    evidence: [
      "filter:effectEntryPoint",
      modeText === "with"
        ? "filter:effectEntryPoint:with"
        : "filter:effectEntryPoint:without",
    ],
    rest: match?.groups?.["rest"] ?? "",
  };
};

export const parseEffectEntryPointPresencePredicate: PredicateParser = (
  text,
  current,
) => {
  const match = /^an? (?<entry>\[[^\]]+\])\s*(?<rest>.*)$/i.exec(text);
  const entryText = match?.groups?.["entry"];
  if (entryText === undefined) {
    return undefined;
  }

  const entryPoint = supportedEntryPoints.find(
    (candidate) => candidate.text.toLowerCase() === entryText.toLowerCase(),
  );
  if (entryPoint === undefined) {
    return undefined;
  }

  return {
    filter: {
      ...current,
      effectEntryPoint: {
        mode: "with",
        trigger: entryPoint.trigger,
        ...(entryPoint.condition === undefined
          ? {}
          : { condition: entryPoint.condition }),
      },
    },
    evidence: ["filter:effectEntryPoint", "filter:effectEntryPoint:with"],
    rest: match?.groups?.["rest"] ?? "",
  };
};
