import type { PresentationSoundCue } from "./sound-planner.js";

export const presentationSoundAssetUrls: Partial<
  Record<PresentationSoundCue, string>
> = {
  attach: new URL("./sounds/move.wav", import.meta.url).href,
  counter: new URL("./sounds/play.wav", import.meta.url).href,
  damage: new URL("./sounds/trash.wav", import.meta.url).href,
  draw: new URL("./sounds/draw.wav", import.meta.url).href,
  ko: new URL("./sounds/trash.wav", import.meta.url).href,
  move: new URL("./sounds/move.wav", import.meta.url).href,
  play: new URL("./sounds/play.wav", import.meta.url).href,
  rest: new URL("./sounds/move.wav", import.meta.url).href,
  return: new URL("./sounds/move.wav", import.meta.url).href,
  reveal: new URL("./sounds/draw.wav", import.meta.url).href,
  shuffle: new URL("./sounds/move.wav", import.meta.url).href,
  trash: new URL("./sounds/trash.wav", import.meta.url).href,
  trigger: new URL("./sounds/play.wav", import.meta.url).href,
};
