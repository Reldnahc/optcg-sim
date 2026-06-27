import { useState } from "react";
import type { CSSProperties, JSX, SyntheticEvent } from "react";

import type { PlayerAvatarView } from "../transport.js";
import type { PlayerSummaryTimerModel } from "../view-model.js";

type AvatarCrop = PlayerAvatarView["crop"];

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const safeImageAspectRatio = (value: number): number =>
  Math.min(10, Math.max(0.1, finiteOr(value, 1)));

const roundCropValue = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

const clampAvatarCropForAspect = (
  crop: AvatarCrop,
  imageAspectRatio = 1,
): AvatarCrop => {
  const aspect = safeImageAspectRatio(imageAspectRatio);
  const maxSize = Math.min(1, aspect);
  const size = Math.min(maxSize, Math.max(0.1, finiteOr(crop.size, maxSize)));
  const widthSize = size / aspect;
  const maxX = Math.max(0, 1 - widthSize);
  const maxY = Math.max(0, 1 - size);
  return {
    x: roundCropValue(Math.min(maxX, Math.max(0, finiteOr(crop.x, 0)))),
    y: roundCropValue(Math.min(maxY, Math.max(0, finiteOr(crop.y, 0)))),
    size: roundCropValue(size),
  };
};

const avatarImageCropStyle = (
  crop: AvatarCrop,
  imageAspectRatio = 1,
): CSSProperties => {
  const aspect = safeImageAspectRatio(imageAspectRatio);
  const clamped = clampAvatarCropForAspect(crop, aspect);
  const imageHeight = 100 / clamped.size;
  const imageWidth = imageHeight * aspect;
  return {
    width: `${imageWidth.toFixed(3)}%`,
    height: `${imageHeight.toFixed(3)}%`,
    left: `${(-clamped.x * imageWidth).toFixed(3)}%`,
    top: `${(-clamped.y * imageHeight).toFixed(3)}%`,
  };
};

const loadedImageAspectRatio = (image: HTMLImageElement): number => {
  if (image.naturalHeight <= 0 || image.naturalWidth <= 0) {
    return 1;
  }
  return image.naturalWidth / image.naturalHeight;
};

const UserIcon = (): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    className="player-summary-avatar-icon"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

const PlayerSummaryAvatar = ({
  avatar,
  label,
}: {
  avatar?: PlayerAvatarView | undefined;
  label: string;
}): JSX.Element => {
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>): void => {
    setImageAspectRatio(loadedImageAspectRatio(event.currentTarget));
  };

  return (
    <span className="player-summary-avatar" aria-hidden={avatar === undefined}>
      {avatar === undefined ? (
        <span className="player-summary-avatar-placeholder">
          <UserIcon />
        </span>
      ) : (
        <img
          src={avatar.imageUrl}
          alt={`${label} avatar`}
          onLoad={handleImageLoad}
          style={avatarImageCropStyle(avatar.crop, imageAspectRatio)}
        />
      )}
    </span>
  );
};

export const PlayerSummaryLabel = ({
  label,
  avatar,
  status,
  timer,
}: {
  label: string;
  avatar?: PlayerAvatarView | undefined;
  status?: "connected" | "disconnected" | undefined;
  timer?: PlayerSummaryTimerModel | undefined;
}): JSX.Element => (
  <div className="player-summary-label">
    <h2>
      <PlayerSummaryAvatar label={label} avatar={avatar} />
      <span className="player-name">{label}</span>
      {status === undefined ? null : (
        <span
          className={`connection-status is-${status}`}
          aria-label={`${label} ${status}`}
          title={status === "connected" ? "Connected" : "Disconnected"}
        />
      )}
    </h2>
    {timer === undefined ? null : (
      <div className="player-timers" aria-label={`${label} timers`}>
        <span
          className={["game-timer", timer.isRunning ? "is-running" : ""]
            .filter(Boolean)
            .join(" ")}
          title="Game timer"
        >
          {timer.game}
        </span>
        {timer.disconnect === undefined ? null : (
          <span className="disconnect-timer" title="Reconnect timer">
            {timer.disconnect}
          </span>
        )}
      </div>
    )}
  </div>
);
