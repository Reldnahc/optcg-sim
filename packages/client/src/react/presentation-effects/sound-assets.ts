import type { PresentationSoundCue } from "./sound-planner.js";

export const presentationSoundAssetUrls: Record<PresentationSoundCue, string> =
  {
    draw: new URL("./sounds/draw.wav", import.meta.url).href,
    move: new URL("./sounds/move.wav", import.meta.url).href,
    play: new URL("./sounds/play.wav", import.meta.url).href,
    trash: new URL("./sounds/trash.wav", import.meta.url).href,
  };
