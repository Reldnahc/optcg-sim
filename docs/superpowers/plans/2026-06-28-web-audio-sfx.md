# Web Audio SFX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current reused-asset sound layer with a Web Audio first SFX system that supports gameplay, interaction, turn, and attention cues.

**Architecture:** Keep cue planning separate from playback. Add a stable cue/profile contract, route all cue intents through a Web Audio controller with HTML audio fallback, and integrate new local interaction/attention cue planners through the existing presentation-effects hook.

**Tech Stack:** TypeScript, React hooks, Vitest, Web Audio API, existing `packages/client/src/react/presentation-effects/` sound pipeline.

---

## File Structure

- Create `packages/client/src/react/presentation-effects/sound-cues.ts`
  - Owns `PresentationSoundCue`, cue domain metadata, and cue profile data.
- Modify `packages/client/src/react/presentation-effects/sound-planner.ts`
  - Imports `PresentationSoundCue` from `sound-cues.ts`; keeps movement cue planning only.
- Modify `packages/client/src/react/presentation-effects/event-presentation-intents.ts`
  - Imports cue type from `sound-cues.ts`; keeps engine-event cue planning only.
- Modify `packages/client/src/react/presentation-effects/sound-assets.ts`
  - Maps every cue to one distinct WAV asset.
- Modify `packages/client/src/react/presentation-effects/sound-controller.ts`
  - Web Audio primary path, HTML audio fallback, cue cooldowns, priority ordering, volume/pitch profiles.
- Create `packages/client/src/react/presentation-effects/attention-sound-planner.ts`
  - Pure planner for visible/focused versus hidden/unfocused local active transitions.
- Create `packages/client/src/react/presentation-effects/interaction-sound-planner.ts`
  - Pure helper for local UI interaction cues.
- Modify `packages/client/src/react/presentation-effects/use-presentation-effects.ts`
  - Merges movement, event, attention, and optional interaction cue intents.
- Add or replace WAV files under `packages/client/src/react/presentation-effects/sounds/`
  - `attach.wav`, `attention.wav`, `confirm.wav`, `counter.wav`, `damage.wav`, `draw.wav`, `empty-click.wav`, `invalid-click.wav`, `ko.wav`, `move.wav`, `play.wav`, `rest.wav`, `return.wav`, `reveal.wav`, `select.wav`, `shuffle.wav`, `trash.wav`, `trigger.wav`, `your-turn.wav`.
- Test files:
  - Modify `sound-controller.test.ts`
  - Modify `sound-planner.test.ts`
  - Modify `event-presentation-intents.test.ts`
  - Create `sound-cues.test.ts`
  - Create `attention-sound-planner.test.ts`
  - Create `interaction-sound-planner.test.ts`

---

### Task 1: Cue Contract And Profiles

**Files:**

- Create: `packages/client/src/react/presentation-effects/sound-cues.ts`
- Create: `packages/client/src/react/presentation-effects/sound-cues.test.ts`
- Modify: `packages/client/src/react/presentation-effects/sound-planner.ts`
- Modify: `packages/client/src/react/presentation-effects/event-presentation-intents.ts`

- [ ] **Step 1: Write the failing cue profile tests**

Create `packages/client/src/react/presentation-effects/sound-cues.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  allPresentationSoundCues,
  presentationSoundCueProfiles,
} from "./sound-cues.js";

describe("presentation sound cues", () => {
  test("declares a profile for every sound cue", () => {
    assert.deepEqual(
      Object.keys(presentationSoundCueProfiles).sort(),
      [...allPresentationSoundCues].sort(),
    );
  });

  test("attention cues outrank movement cues", () => {
    assert.ok(
      presentationSoundCueProfiles.attention.priority >
        presentationSoundCueProfiles.move.priority,
    );
    assert.ok(
      presentationSoundCueProfiles.yourTurn.priority >
        presentationSoundCueProfiles.move.priority,
    );
  });

  test("frequent movement cues have pitch variation and cooldowns", () => {
    for (const cue of ["move", "attach", "rest", "draw"] as const) {
      const profile = presentationSoundCueProfiles[cue];
      assert.ok(profile.playbackRateJitter > 0);
      assert.ok(profile.minimumIntervalMs > 0);
    }
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects/sound-cues.test.ts
```

Expected: FAIL because `sound-cues.js` does not exist.

- [ ] **Step 3: Add the cue contract and profiles**

Create `packages/client/src/react/presentation-effects/sound-cues.ts`:

```ts
export const allPresentationSoundCues = [
  "attach",
  "attention",
  "confirm",
  "counter",
  "damage",
  "draw",
  "emptyClick",
  "invalidClick",
  "ko",
  "move",
  "play",
  "rest",
  "return",
  "reveal",
  "select",
  "shuffle",
  "trash",
  "trigger",
  "yourTurn",
] as const;

export type PresentationSoundCue = (typeof allPresentationSoundCues)[number];

export type PresentationSoundCueDomain =
  | "movement"
  | "effect"
  | "interaction"
  | "attention";

export interface PresentationSoundCueProfile {
  readonly domain: PresentationSoundCueDomain;
  readonly volume: number;
  readonly playbackRateJitter: number;
  readonly minimumIntervalMs: number;
  readonly priority: number;
  readonly burstSpacingMs: number;
}

export const presentationSoundCueProfiles: Record<
  PresentationSoundCue,
  PresentationSoundCueProfile
> = {
  attach: {
    domain: "movement",
    volume: 0.72,
    playbackRateJitter: 0.035,
    minimumIntervalMs: 32,
    priority: 2,
    burstSpacingMs: 14,
  },
  attention: {
    domain: "attention",
    volume: 1,
    playbackRateJitter: 0,
    minimumIntervalMs: 1600,
    priority: 8,
    burstSpacingMs: 0,
  },
  confirm: {
    domain: "interaction",
    volume: 0.52,
    playbackRateJitter: 0.01,
    minimumIntervalMs: 45,
    priority: 3,
    burstSpacingMs: 0,
  },
  counter: {
    domain: "effect",
    volume: 0.9,
    playbackRateJitter: 0.015,
    minimumIntervalMs: 80,
    priority: 6,
    burstSpacingMs: 0,
  },
  damage: {
    domain: "effect",
    volume: 0.92,
    playbackRateJitter: 0.015,
    minimumIntervalMs: 90,
    priority: 6,
    burstSpacingMs: 0,
  },
  draw: {
    domain: "movement",
    volume: 0.72,
    playbackRateJitter: 0.025,
    minimumIntervalMs: 26,
    priority: 3,
    burstSpacingMs: 12,
  },
  emptyClick: {
    domain: "interaction",
    volume: 0.34,
    playbackRateJitter: 0.008,
    minimumIntervalMs: 55,
    priority: 1,
    burstSpacingMs: 0,
  },
  invalidClick: {
    domain: "interaction",
    volume: 0.42,
    playbackRateJitter: 0.008,
    minimumIntervalMs: 80,
    priority: 2,
    burstSpacingMs: 0,
  },
  ko: {
    domain: "effect",
    volume: 0.92,
    playbackRateJitter: 0.012,
    minimumIntervalMs: 90,
    priority: 6,
    burstSpacingMs: 0,
  },
  move: {
    domain: "movement",
    volume: 0.58,
    playbackRateJitter: 0.03,
    minimumIntervalMs: 32,
    priority: 1,
    burstSpacingMs: 10,
  },
  play: {
    domain: "movement",
    volume: 0.82,
    playbackRateJitter: 0.018,
    minimumIntervalMs: 60,
    priority: 4,
    burstSpacingMs: 0,
  },
  rest: {
    domain: "movement",
    volume: 0.52,
    playbackRateJitter: 0.03,
    minimumIntervalMs: 35,
    priority: 2,
    burstSpacingMs: 10,
  },
  return: {
    domain: "movement",
    volume: 0.62,
    playbackRateJitter: 0.025,
    minimumIntervalMs: 45,
    priority: 2,
    burstSpacingMs: 12,
  },
  reveal: {
    domain: "movement",
    volume: 0.72,
    playbackRateJitter: 0.018,
    minimumIntervalMs: 60,
    priority: 3,
    burstSpacingMs: 0,
  },
  select: {
    domain: "interaction",
    volume: 0.42,
    playbackRateJitter: 0.01,
    minimumIntervalMs: 32,
    priority: 2,
    burstSpacingMs: 0,
  },
  shuffle: {
    domain: "movement",
    volume: 0.65,
    playbackRateJitter: 0.02,
    minimumIntervalMs: 100,
    priority: 3,
    burstSpacingMs: 0,
  },
  trash: {
    domain: "movement",
    volume: 0.78,
    playbackRateJitter: 0.02,
    minimumIntervalMs: 55,
    priority: 4,
    burstSpacingMs: 0,
  },
  trigger: {
    domain: "effect",
    volume: 0.9,
    playbackRateJitter: 0.012,
    minimumIntervalMs: 100,
    priority: 7,
    burstSpacingMs: 0,
  },
  yourTurn: {
    domain: "attention",
    volume: 0.86,
    playbackRateJitter: 0,
    minimumIntervalMs: 700,
    priority: 7,
    burstSpacingMs: 0,
  },
};
```

- [ ] **Step 4: Move cue type imports**

In `sound-planner.ts`, replace the local `PresentationSoundCue` union with:

```ts
import type { PresentationSoundCue } from "./sound-cues.js";
```

In `event-presentation-intents.ts`, replace `PresentationEventSoundCue` with an alias:

```ts
import type { PresentationSoundCue } from "./sound-cues.js";

export type PresentationEventSoundCue = Extract<
  PresentationSoundCue,
  | "attach"
  | "counter"
  | "damage"
  | "ko"
  | "move"
  | "rest"
  | "return"
  | "reveal"
  | "shuffle"
  | "trigger"
>;
```

- [ ] **Step 5: Run cue and existing planner tests**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects/sound-cues.test.ts packages/client/src/react/presentation-effects/sound-planner.test.ts packages/client/src/react/presentation-effects/event-presentation-intents.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
git add packages/client/src/react/presentation-effects/sound-cues.ts packages/client/src/react/presentation-effects/sound-cues.test.ts packages/client/src/react/presentation-effects/sound-planner.ts packages/client/src/react/presentation-effects/event-presentation-intents.ts
git commit -m "feat: define presentation sound cue profiles"
```

---

### Task 2: Asset Map And Generated Placeholder WAVs

**Files:**

- Modify: `packages/client/src/react/presentation-effects/sound-assets.ts`
- Modify: `packages/client/src/react/presentation-effects/sound-controller.test.ts`
- Add WAVs under: `packages/client/src/react/presentation-effects/sounds/`

- [ ] **Step 1: Write asset completeness test**

Add this test to `sound-controller.test.ts` or move it to `sound-assets.test.ts`:

```ts
import {
  allPresentationSoundCues,
  type PresentationSoundCue,
} from "./sound-cues.js";
import { presentationSoundAssetUrls } from "./sound-assets.js";

test("declares one asset URL for every cue", () => {
  assert.deepEqual(
    Object.keys(presentationSoundAssetUrls).sort(),
    [...allPresentationSoundCues].sort(),
  );

  for (const cue of allPresentationSoundCues) {
    assert.match(
      presentationSoundAssetUrls[cue],
      /\.wav(?:$|\?)/u,
      `${cue} must map to a WAV asset.`,
    );
  }
});
```

- [ ] **Step 2: Run the failing asset test**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects/sound-controller.test.ts
```

Expected: FAIL because `attention`, `emptyClick`, `invalidClick`, `select`, `confirm`, and `yourTurn` do not have assets.

- [ ] **Step 3: Generate placeholder WAV files**

Run this local script from repo root. It writes only under the presentation-effects sounds directory.

```powershell
@'
const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(
  process.cwd(),
  "packages/client/src/react/presentation-effects/sounds",
);
fs.mkdirSync(outDir, { recursive: true });

const cues = {
  attach: [420, 0.07, "sine"],
  attention: [880, 0.22, "square"],
  confirm: [720, 0.08, "triangle"],
  counter: [520, 0.12, "triangle"],
  damage: [170, 0.14, "saw"],
  draw: [680, 0.08, "triangle"],
  "empty-click": [300, 0.035, "sine"],
  "invalid-click": [140, 0.07, "square"],
  ko: [120, 0.16, "saw"],
  move: [360, 0.055, "sine"],
  play: [500, 0.11, "triangle"],
  rest: [240, 0.055, "sine"],
  return: [330, 0.08, "sine"],
  reveal: [760, 0.1, "triangle"],
  select: [620, 0.045, "triangle"],
  shuffle: [260, 0.13, "sine"],
  trash: [190, 0.11, "saw"],
  trigger: [820, 0.14, "triangle"],
  "your-turn": [740, 0.16, "triangle"],
};

const sampleRate = 44100;
const wave = (shape, phase) => {
  if (shape === "square") return phase % 1 < 0.5 ? 1 : -1;
  if (shape === "saw") return 2 * (phase % 1) - 1;
  if (shape === "triangle") return 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
  return Math.sin(phase * Math.PI * 2);
};

for (const [name, [frequency, seconds, shape]] of Object.entries(cues)) {
  const frames = Math.max(1, Math.floor(sampleRate * seconds));
  const data = Buffer.alloc(frames * 2);
  for (let index = 0; index < frames; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.min(1, index / 180) * Math.max(0, 1 - index / frames);
    const sample = Math.max(-1, Math.min(1, wave(shape, t * frequency) * envelope * 0.38));
    data.writeInt16LE(Math.round(sample * 32767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(outDir, `${name}.wav`), Buffer.concat([header, data]));
}
'@ | node
```

- [ ] **Step 4: Update asset map**

Replace `sound-assets.ts` with:

```ts
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
```

- [ ] **Step 5: Run asset test**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects/sound-controller.test.ts
```

Expected: PASS for asset completeness; existing controller tests may still fail until Task 3 if they import the new cue type incorrectly.

- [ ] **Step 6: Commit Task 2**

Run:

```powershell
git add packages/client/src/react/presentation-effects/sound-assets.ts packages/client/src/react/presentation-effects/sound-controller.test.ts packages/client/src/react/presentation-effects/sounds
git commit -m "feat: add placeholder sfx assets"
```

---

### Task 3: Web Audio First Sound Controller

**Files:**

- Modify: `packages/client/src/react/presentation-effects/sound-controller.ts`
- Modify: `packages/client/src/react/presentation-effects/sound-controller.test.ts`

- [ ] **Step 1: Write Web Audio controller tests**

Replace the old `new Audio`-only expectations in `sound-controller.test.ts` with tests that can inject a fake Web Audio environment:

```ts
test("uses Web Audio buffers before HTML audio fallback", () => {
  const calls: string[] = [];
  const audioContext = fakeAudioContext(calls);

  playPresentationSoundIntents([{ id: "web-audio-draw", cue: "draw" }], {
    audioContextFactory: () => audioContext,
    bufferLoader: () => ({
      kind: "loaded",
      buffer: { cue: "draw" },
    }),
    random: () => 0.5,
  });

  assert.deepEqual(calls, [
    "resume",
    "createBufferSource",
    "createGain",
    "source.connect",
    "gain.connect",
    "source.start:0",
  ]);
});

test("falls back to HTML audio when Web Audio is unavailable", () => {
  const played: string[] = [];

  playPresentationSoundIntents([{ id: "fallback-draw", cue: "draw" }], {
    audioContextFactory: () => undefined,
    audioFactory: (url) => ({
      volume: 1,
      currentTime: 0,
      play: () => {
        played.push(url);
      },
    }),
  });

  assert.equal(played.length, 1);
});

test("applies cooldowns without suppressing a higher priority cue", () => {
  const played: string[] = [];
  const audioContext = fakeAudioContext(played);

  playPresentationSoundIntents(
    [
      { id: "move-1", cue: "move" },
      { id: "move-2", cue: "move" },
      { id: "attention-1", cue: "attention" },
    ],
    {
      audioContextFactory: () => audioContext,
      bufferLoader: () => ({ kind: "loaded", buffer: {} }),
      nowMs: () => 1000,
      random: () => 0.5,
    },
  );

  assert.equal(played.filter((entry) => entry === "source.start:0").length, 2);
});
```

Add a local fake helper in the test file:

```ts
const fakeAudioContext = (calls: string[]) =>
  ({
    currentTime: 0,
    destination: {},
    resume: () => {
      calls.push("resume");
      return Promise.resolve();
    },
    createBufferSource: () => ({
      buffer: undefined,
      playbackRate: { value: 1 },
      connect: () => {
        calls.push("source.connect");
      },
      start: (time: number) => {
        calls.push(`source.start:${String(time)}`);
      },
    }),
    createGain: () => ({
      gain: { value: 1 },
      connect: () => {
        calls.push("gain.connect");
      },
    }),
  }) as unknown as AudioContext;
```

- [ ] **Step 2: Run controller tests to verify failure**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects/sound-controller.test.ts
```

Expected: FAIL because `audioContextFactory`, `bufferLoader`, `random`, and `nowMs` options do not exist.

- [ ] **Step 3: Implement controller options and Web Audio path**

Update `sound-controller.ts` to expose injectable options:

```ts
export interface LoadedPresentationAudioBuffer {
  readonly kind: "loaded";
  readonly buffer: AudioBuffer | unknown;
}

export interface MissingPresentationAudioBuffer {
  readonly kind: "missing";
}

export type PresentationAudioBufferLoadResult =
  | LoadedPresentationAudioBuffer
  | MissingPresentationAudioBuffer;

export interface PresentationSoundOptions {
  enabled?: boolean;
  volume?: number;
  assetUrls?: Partial<Record<PresentationSoundCue, string>>;
  audioFactory?: PresentationAudioFactory;
  audioContextFactory?: () => AudioContext | undefined;
  bufferLoader?: (
    cue: PresentationSoundCue,
    url: string,
    context: AudioContext,
  ) => PresentationAudioBufferLoadResult;
  random?: () => number;
  nowMs?: () => number;
}
```

Implement ordering and cooldown helpers:

```ts
const maxSoundIntentsPerBatch = 4;
const lastPlayedCueAtMs = new Map<PresentationSoundCue, number>();

const orderedIntents = (
  intents: readonly PresentationSoundIntent[],
): PresentationSoundIntent[] =>
  [...intents]
    .sort(
      (left, right) =>
        presentationSoundCueProfiles[right.cue].priority -
        presentationSoundCueProfiles[left.cue].priority,
    )
    .slice(0, maxSoundIntentsPerBatch);

const allowedByCooldown = (
  cue: PresentationSoundCue,
  nowMs: number,
): boolean => {
  const profile = presentationSoundCueProfiles[cue];
  const previous = lastPlayedCueAtMs.get(cue);
  if (previous !== undefined && nowMs - previous < profile.minimumIntervalMs) {
    return false;
  }
  lastPlayedCueAtMs.set(cue, nowMs);
  return true;
};
```

Implement Web Audio playback before `playAssetCue`:

```ts
const playbackRateForCue = (
  cue: PresentationSoundCue,
  random: () => number,
): number => {
  const jitter = presentationSoundCueProfiles[cue].playbackRateJitter;
  return 1 + (random() * 2 - 1) * jitter;
};

const playWebAudioCue = (
  cue: PresentationSoundCue,
  index: number,
  options: Required<PresentationSoundOptions>,
): boolean => {
  const url = options.assetUrls[cue];
  if (url === undefined) {
    return false;
  }
  const audio = options.audioContextFactory();
  if (audio === undefined) {
    return false;
  }
  const loaded = options.bufferLoader(cue, url, audio);
  if (loaded.kind !== "loaded") {
    return false;
  }

  void audio.resume().catch(() => undefined);
  const profile = presentationSoundCueProfiles[cue];
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = loaded.buffer as AudioBuffer;
  source.playbackRate.value = playbackRateForCue(cue, options.random);
  gain.gain.value = options.volume * profile.volume;
  source.connect(gain);
  gain.connect(audio.destination);
  source.start(audio.currentTime + (profile.burstSpacingMs * index) / 1000);
  return true;
};
```

Keep `playAssetCue` as fallback and multiply by profile volume:

```ts
audio.volume = options.volume * presentationSoundCueProfiles[cue].volume;
```

In `playPresentationSoundIntents`, use `orderedIntents`, `allowedByCooldown`, and then `playWebAudioCue` before `playAssetCue`.

- [ ] **Step 4: Run controller tests**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects/sound-controller.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add packages/client/src/react/presentation-effects/sound-controller.ts packages/client/src/react/presentation-effects/sound-controller.test.ts
git commit -m "feat: play sfx through web audio"
```

---

### Task 4: Attention And Interaction Planners

**Files:**

- Create: `packages/client/src/react/presentation-effects/attention-sound-planner.ts`
- Create: `packages/client/src/react/presentation-effects/attention-sound-planner.test.ts`
- Create: `packages/client/src/react/presentation-effects/interaction-sound-planner.ts`
- Create: `packages/client/src/react/presentation-effects/interaction-sound-planner.test.ts`

- [ ] **Step 1: Write attention planner tests**

Create `attention-sound-planner.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { planAttentionSoundIntent } from "./attention-sound-planner.js";

describe("attention sound planner", () => {
  test("plays yourTurn when local player newly becomes active and focused", () => {
    assert.deepEqual(
      planAttentionSoundIntent({
        previousLocalActive: false,
        currentLocalActive: true,
        documentHidden: false,
        windowFocused: true,
        activationKey: "turn:3",
      }),
      [{ id: "sound:attention:turn:3", cue: "yourTurn" }],
    );
  });

  test("plays attention when local player newly becomes active while hidden", () => {
    assert.deepEqual(
      planAttentionSoundIntent({
        previousLocalActive: false,
        currentLocalActive: true,
        documentHidden: true,
        windowFocused: true,
        activationKey: "decision:abc",
      }),
      [{ id: "sound:attention:decision:abc", cue: "attention" }],
    );
  });

  test("does not replay while already active", () => {
    assert.deepEqual(
      planAttentionSoundIntent({
        previousLocalActive: true,
        currentLocalActive: true,
        documentHidden: false,
        windowFocused: true,
        activationKey: "turn:3",
      }),
      [],
    );
  });
});
```

- [ ] **Step 2: Write interaction planner tests**

Create `interaction-sound-planner.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { planInteractionSoundIntent } from "./interaction-sound-planner.js";

describe("interaction sound planner", () => {
  test("maps local interaction kinds to cue intents", () => {
    assert.deepEqual(planInteractionSoundIntent("emptyClick", "board"), [
      { id: "sound:interaction:emptyClick:board", cue: "emptyClick" },
    ]);
    assert.deepEqual(planInteractionSoundIntent("invalidClick", "hand"), [
      { id: "sound:interaction:invalidClick:hand", cue: "invalidClick" },
    ]);
    assert.deepEqual(planInteractionSoundIntent("select", "card-1"), [
      { id: "sound:interaction:select:card-1", cue: "select" },
    ]);
    assert.deepEqual(planInteractionSoundIntent("confirm", "modal"), [
      { id: "sound:interaction:confirm:modal", cue: "confirm" },
    ]);
  });
});
```

- [ ] **Step 3: Run planner tests to verify failure**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects/attention-sound-planner.test.ts packages/client/src/react/presentation-effects/interaction-sound-planner.test.ts
```

Expected: FAIL because the planner modules do not exist.

- [ ] **Step 4: Implement planners**

Create `attention-sound-planner.ts`:

```ts
import type { PresentationSoundIntent } from "./sound-planner.js";

export interface AttentionSoundPlannerInput {
  readonly previousLocalActive: boolean;
  readonly currentLocalActive: boolean;
  readonly documentHidden: boolean;
  readonly windowFocused: boolean;
  readonly activationKey: string;
}

export const planAttentionSoundIntent = ({
  previousLocalActive,
  currentLocalActive,
  documentHidden,
  windowFocused,
  activationKey,
}: AttentionSoundPlannerInput): PresentationSoundIntent[] => {
  if (previousLocalActive || !currentLocalActive) {
    return [];
  }
  return [
    {
      id: `sound:attention:${activationKey}`,
      cue: documentHidden || !windowFocused ? "attention" : "yourTurn",
    },
  ];
};
```

Create `interaction-sound-planner.ts`:

```ts
import type { PresentationSoundCue } from "./sound-cues.js";
import type { PresentationSoundIntent } from "./sound-planner.js";

export type PresentationInteractionSoundCue = Extract<
  PresentationSoundCue,
  "emptyClick" | "invalidClick" | "select" | "confirm"
>;

export const planInteractionSoundIntent = (
  cue: PresentationInteractionSoundCue,
  sourceKey: string,
): PresentationSoundIntent[] => [
  {
    id: `sound:interaction:${cue}:${sourceKey}`,
    cue,
  },
];
```

- [ ] **Step 5: Run planner tests**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects/attention-sound-planner.test.ts packages/client/src/react/presentation-effects/interaction-sound-planner.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git add packages/client/src/react/presentation-effects/attention-sound-planner.ts packages/client/src/react/presentation-effects/attention-sound-planner.test.ts packages/client/src/react/presentation-effects/interaction-sound-planner.ts packages/client/src/react/presentation-effects/interaction-sound-planner.test.ts
git commit -m "feat: plan interaction and attention sounds"
```

---

### Task 5: Hook Integration And Verification

**Files:**

- Modify: `packages/client/src/react/presentation-effects/use-presentation-effects.ts`
- Add or modify: focused hook/source tests in `packages/client/src/react/presentation-effects/`

- [ ] **Step 1: Add source-level integration tests**

Create `use-presentation-effects-sound-routing.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("presentation effects sound routing", () => {
  test("merges movement, event, and attention sound intents", async () => {
    const source = await readFile(
      join(sourceDirectory, "use-presentation-effects.ts"),
      "utf8",
    );

    assert.match(source, /planSoundIntents/u);
    assert.match(source, /planEventSoundIntents/u);
    assert.match(source, /planAttentionSoundIntent/u);
    assert.match(source, /\.\.\.movementSoundIntents/u);
    assert.match(source, /\.\.\.eventSoundIntents/u);
    assert.match(source, /\.\.\.attentionSoundIntents/u);
  });
});
```

- [ ] **Step 2: Run integration test to verify failure**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects/use-presentation-effects-sound-routing.test.ts
```

Expected: FAIL because `use-presentation-effects.ts` does not import or call `planAttentionSoundIntent`.

- [ ] **Step 3: Integrate attention sounds**

In `use-presentation-effects.ts`, import the planner:

```ts
import { planAttentionSoundIntent } from "./attention-sound-planner.js";
```

Add refs near the existing refs:

```ts
const previousLocalActiveRef = useRef<boolean>(false);
```

Inside the layout effect, after movement/event sound planning:

```ts
const currentLocalActive =
  input.board.selfIsTurnPlayer ||
  (input.board.activeCardInstanceIds !== undefined &&
    input.board.activeCardInstanceIds.length > 0);
const activationKey =
  input.board.statusBanner === undefined
    ? `active:${String(currentLocalActive)}`
    : `turn:${String(input.board.statusBanner.turnNumber)}:${input.board.statusBanner.tone}`;
const attentionSoundIntents = planAttentionSoundIntent({
  previousLocalActive: previousLocalActiveRef.current,
  currentLocalActive,
  documentHidden: typeof document !== "undefined" ? document.hidden : false,
  windowFocused:
    typeof document !== "undefined" && typeof document.hasFocus === "function"
      ? document.hasFocus()
      : true,
  activationKey,
});
previousLocalActiveRef.current = currentLocalActive;
const soundIntents = [
  ...movementSoundIntents,
  ...eventSoundIntents,
  ...attentionSoundIntents,
];
```

Replace the previous `const soundIntents = [...movementSoundIntents, ...eventSoundIntents];`.

If TypeScript requests parentheses for the boolean expression, use:

```ts
const currentLocalActive =
  input.board.selfIsTurnPlayer ||
  (input.board.activeCardInstanceIds !== undefined &&
    input.board.activeCardInstanceIds.length > 0);
```

- [ ] **Step 4: Run focused presentation-effects tests**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects
```

Expected: PASS.

- [ ] **Step 5: Run client typecheck and lint on touched files**

Run:

```powershell
corepack pnpm exec eslint packages/client/src/react/presentation-effects
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```powershell
git add packages/client/src/react/presentation-effects
git commit -m "feat: route turn attention sounds"
```

---

## Final Verification

- [ ] **Step 1: Run focused sound tests**

Run:

```powershell
corepack pnpm exec vitest run packages/client/src/react/presentation-effects
```

Expected: PASS.

- [ ] **Step 2: Run client typecheck**

Run:

```powershell
corepack pnpm exec tsc -p packages/client/tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run touched-file formatting check**

Run:

```powershell
corepack pnpm exec prettier --check packages/client/src/react/presentation-effects
```

Expected: PASS.

- [ ] **Step 4: Run full repo verification if baseline allows it**

Run:

```powershell
corepack pnpm verify
```

Expected: PASS if baseline is clean. If it fails before sound checks because of unrelated known match-server/client baseline failures, record the exact failing files and also report the focused sound/client checks from Steps 1-3.

---

## Self-Review Notes

- Spec coverage:
  - Web Audio first path: Task 3.
  - Placeholder assets for every cue: Task 2.
  - Cue profiles: Task 1.
  - Movement and event cue preservation: Tasks 1, 3, and existing planner tests.
  - Interaction cue planner: Task 4.
  - Turn/attention cue planner and hook integration: Tasks 4 and 5.
  - Sound failure isolation/fallback: Task 3.
  - Focused tests: every task includes red/green tests.
- Scope:
  - Does not add final polished sounds.
  - Does not add per-cue settings.
  - Does not change server, rules, replay, or persistence behavior.
- Baseline warning:
  - At plan creation time, the worktree contained unrelated match-server stat changes. Implementers must not stage or modify those unless explicitly asked.
