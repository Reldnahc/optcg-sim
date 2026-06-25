export const replayInitialCheckpointId = (): string => "replay:initial";

export const replayEntryAfterCheckpointId = (entrySeq: number): string =>
  `replay:entry:${String(entrySeq)}:after`;
