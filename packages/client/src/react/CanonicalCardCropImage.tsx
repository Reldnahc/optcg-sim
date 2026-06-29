import { useEffect, useRef, useState, type CSSProperties } from "react";

export const CARD_CROP_LEGAL_RECT = {
  x: 0.225,
  y: 0.083,
  width: 0.553,
  height: 0.526,
} as const;
const FALLBACK_FOCUS_X = 0.5;
const FALLBACK_FOCUS_Y = 0;

type CropFocus =
  | {
      x: number | null;
      y: number | null;
    }
  | null
  | undefined;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function resolveCanonicalCropCenter({
  focusX,
  focusY,
  frameAspect,
  imageAspect,
}: {
  focusX: number;
  focusY: number;
  frameAspect: number;
  imageAspect: number;
}) {
  const viewportWidthAt1x =
    frameAspect > imageAspect ? 1 : frameAspect / imageAspect;
  const viewportHeightAt1x =
    frameAspect > imageAspect ? imageAspect / frameAspect : 1;
  const effectiveZoom = Math.max(
    1,
    viewportWidthAt1x / CARD_CROP_LEGAL_RECT.width,
    viewportHeightAt1x / CARD_CROP_LEGAL_RECT.height,
  );
  const viewportWidth = viewportWidthAt1x / effectiveZoom;
  const viewportHeight = viewportHeightAt1x / effectiveZoom;
  const halfWidth = viewportWidth / 2;
  const halfHeight = viewportHeight / 2;
  const centerMinX = CARD_CROP_LEGAL_RECT.x + halfWidth;
  const centerMaxX =
    CARD_CROP_LEGAL_RECT.x + CARD_CROP_LEGAL_RECT.width - halfWidth;
  const centerMinY = CARD_CROP_LEGAL_RECT.y + halfHeight;
  const centerMaxY =
    CARD_CROP_LEGAL_RECT.y + CARD_CROP_LEGAL_RECT.height - halfHeight;

  return {
    x: clamp(focusX, centerMinX, centerMaxX),
    y: clamp(focusY, centerMinY, centerMaxY),
    zoom: effectiveZoom,
  };
}

export function CanonicalCardCropImage({
  src,
  alt,
  cropFocus,
  className = "",
  loading = "lazy",
}: {
  src: string;
  alt: string;
  cropFocus?: CropFocus;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [imageState, setImageState] = useState({
    src: "",
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setFrameSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  const imageSize =
    imageState.src === src
      ? { width: imageState.width, height: imageState.height }
      : { width: 0, height: 0 };
  const hasLayout =
    frameSize.width > 0 &&
    frameSize.height > 0 &&
    imageSize.width > 0 &&
    imageSize.height > 0;

  let style: CSSProperties | undefined;
  if (hasLayout) {
    const focusX =
      typeof cropFocus?.x === "number" ? cropFocus.x : FALLBACK_FOCUS_X;
    const focusY =
      typeof cropFocus?.y === "number" ? cropFocus.y : FALLBACK_FOCUS_Y;
    const imageAspect = imageSize.width / imageSize.height;
    const frameAspect = frameSize.width / frameSize.height;
    const crop = resolveCanonicalCropCenter({
      focusX,
      focusY,
      frameAspect,
      imageAspect,
    });
    const coverScale = Math.max(
      frameSize.width / imageSize.width,
      frameSize.height / imageSize.height,
    );
    const renderedWidth = imageSize.width * coverScale * crop.zoom;
    const renderedHeight = imageSize.height * coverScale * crop.zoom;

    style = {
      width: `${String(renderedWidth)}px`,
      height: `${String(renderedHeight)}px`,
      left: `${String(frameSize.width / 2 - crop.x * renderedWidth)}px`,
      top: `${String(frameSize.height / 2 - crop.y * renderedHeight)}px`,
    };
  } else {
    style = {
      width: "100%",
      height: "100%",
      left: "0",
      top: "0",
      objectFit: "cover",
      objectPosition: "50% 0%",
    };
  }

  const imageClassName =
    className.length > 0
      ? `canonical-card-crop-image ${className}`
      : "canonical-card-crop-image";

  return (
    <div ref={frameRef} className="canonical-card-crop-frame">
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={(event) => {
          const target = event.currentTarget;
          setImageState({
            src,
            width: target.naturalWidth,
            height: target.naturalHeight,
          });
        }}
        className={imageClassName}
        style={style}
      />
    </div>
  );
}
