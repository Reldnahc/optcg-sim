import type { PresentationSoundCue } from "./sound-cues.js";

export const presentationSoundAssetUrls: Record<PresentationSoundCue, string> =
  {
    attach: new URL("./sounds/attach.wav", import.meta.url).href,
    attention: new URL("./sounds/attention.wav", import.meta.url).href,
    confirm: new URL("./sounds/confirm.wav", import.meta.url).href,
    counter: new URL("./sounds/counter.wav", import.meta.url).href,
    damage: new URL("./sounds/damage.wav", import.meta.url).href,
    draw: new URL("./sounds/draw.wav", import.meta.url).href,
    emptyClick: new URL("./sounds/empty-click.wav", import.meta.url).href,
    invalidClick: new URL("./sounds/invalid-click.wav", import.meta.url).href,
    ko: new URL("./sounds/ko.wav", import.meta.url).href,
    move: new URL("./sounds/move.wav", import.meta.url).href,
    play: new URL("./sounds/play.wav", import.meta.url).href,
    rest: new URL("./sounds/rest.wav", import.meta.url).href,
    return: new URL("./sounds/return.wav", import.meta.url).href,
    reveal: new URL("./sounds/reveal.wav", import.meta.url).href,
    select: new URL("./sounds/select.wav", import.meta.url).href,
    shuffle: new URL("./sounds/shuffle.wav", import.meta.url).href,
    trash: new URL("./sounds/trash.wav", import.meta.url).href,
    trigger: new URL("./sounds/trigger.wav", import.meta.url).href,
    yourTurn: new URL("./sounds/your-turn.wav", import.meta.url).href,
  };
