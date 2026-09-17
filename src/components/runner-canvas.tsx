"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

export const runnerTilesets: Record<string, string> = {
  lula: "/runners/lula.webp",
  flavio: "/runners/flavio.webp",
  renan: "/runners/renan.webp",
  augusto: "/runners/caiado.webp",
  caiado: "/runners/augusto.webp",
  zema: "/runners/zema.webp",
};

export const runnerAvatars: Record<string, string> = {
  lula: "/runners/lula-avatar.webp",
  flavio: "/runners/flavio-avatar.webp",
  renan: "/runners/renan-avatar.webp",
  augusto: "/runners/augusto-avatar.webp",
  caiado: "/runners/caiado-avatar.webp",
  zema: "/runners/zema-avatar.webp",
};

const initialFrames: Record<string, number> = {
  lula: 0,
  flavio: 3,
  renan: 6,
  augusto: 2,
  caiado: 5,
  zema: 7,
};

const frameAnchors: Record<string, ReadonlyArray<readonly [number, number]>> = {
  lula: [
    [186, 508],
    [204, 504],
    [191.5, 508],
    [192, 508],
    [178, 477],
    [194.5, 477],
    [178.5, 477],
    [188, 478],
  ],
  flavio: [
    [179, 505],
    [189.5, 501],
    [182.5, 506],
    [177.5, 504],
    [168.5, 478],
    [188.5, 481],
    [172.5, 479],
    [176.5, 480],
  ],
  renan: [
    [199, 501],
    [196, 499],
    [198.5, 504],
    [191, 502],
    [183.5, 468],
    [189, 468],
    [187, 468],
    [190.5, 466],
  ],
  augusto: [
    [186.5, 504],
    [198.5, 502],
    [189, 504],
    [193, 506],
    [185, 479],
    [191, 478],
    [187.5, 480],
    [193, 474],
  ],
  caiado: [
    [181.5, 506],
    [194.5, 502],
    [190, 507],
    [180.5, 504],
    [175, 470],
    [190, 472],
    [181.5, 471],
    [181, 469],
  ],
  zema: [
    [191, 505],
    [192, 505],
    [195.5, 506],
    [187.5, 505],
    [185.5, 482],
    [189, 483],
    [184, 482],
    [183.5, 484],
  ],
};

const stableAnchor = { x: 192, feet: 500 } as const;

export const RUNNER_CONFIG = {
  columns: 4,
  rows: 2,
  frameCount: 8,
  fps: 12,
  speed: 220,
  scale: 0.6,
  trim: 6,
} as const;

export function RunnerCanvas({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const source = runnerTilesets[candidateId];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const image = new window.Image();
    let animationFrame = 0;
    let stopped = false;
    const initialFrame = initialFrames[candidateId] ?? 0;
    let frameIndex = initialFrame;
    let animationStartedAt = performance.now();
    let sourceWidth = canvas.width;
    let sourceHeight = canvas.height;
    let frameWidth = canvas.width;
    let frameHeight = canvas.height;
    let renderScale: number = RUNNER_CONFIG.scale;

    const drawPose = (index: number) => {
      const anchor = frameAnchors[candidateId]?.[index];
      const offsetX = anchor
        ? (stableAnchor.x - anchor[0]) * renderScale
        : 0;
      const offsetY = anchor
        ? (stableAnchor.feet - anchor[1]) * renderScale
        : 0;
      context.drawImage(
        image,
        (index % RUNNER_CONFIG.columns) *
          (image.naturalWidth / RUNNER_CONFIG.columns) +
          RUNNER_CONFIG.trim,
        Math.floor(index / RUNNER_CONFIG.columns) *
          (image.naturalHeight / RUNNER_CONFIG.rows) +
          RUNNER_CONFIG.trim,
        sourceWidth,
        sourceHeight,
        offsetX,
        offsetY,
        frameWidth,
        frameHeight,
      );
    };

    const drawFrame = () => {
      context.clearRect(0, 0, frameWidth, frameHeight);
      drawPose(frameIndex);
      canvas.dataset.frame = String(frameIndex);
    };

    const animate = (now: number) => {
      if (stopped) return;
      const frameDuration = 1000 / RUNNER_CONFIG.fps;
      const timeline = (now - animationStartedAt) / frameDuration;
      const wholeFrames = Math.floor(timeline);
      const nextFrame =
        (initialFrame + wholeFrames) % RUNNER_CONFIG.frameCount;
      if (nextFrame !== frameIndex) {
        frameIndex = nextFrame;
        drawFrame();
      }
      animationFrame = requestAnimationFrame(animate);
    };

    const start = () => {
      if (stopped) return;
      sourceWidth =
        image.naturalWidth / RUNNER_CONFIG.columns - RUNNER_CONFIG.trim * 2;
      sourceHeight =
        image.naturalHeight / RUNNER_CONFIG.rows - RUNNER_CONFIG.trim * 2;
      renderScale = Math.min(
        1,
        RUNNER_CONFIG.scale * Math.max(1, window.devicePixelRatio || 1),
      );
      frameWidth = Math.round(sourceWidth * renderScale);
      frameHeight = Math.round(sourceHeight * renderScale);
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      animationStartedAt = performance.now();
      drawFrame();
      if (!reducedMotion) animationFrame = requestAnimationFrame(animate);
    };

    image.decoding = "async";
    image.src = source;
    if (image.complete) start();
    else image.addEventListener("load", start, { once: true });

    return () => {
      stopped = true;
      image.removeEventListener("load", start);
      cancelAnimationFrame(animationFrame);
    };
  }, [candidateId, reducedMotion, source]);

  if (!source) return null;
  return (
    <canvas
      ref={canvasRef}
      className="runner-canvas"
      width={223}
      height={300}
      role="img"
      aria-label={`Caricatura animada de ${candidateName} correndo`}
      data-columns={RUNNER_CONFIG.columns}
      data-rows={RUNNER_CONFIG.rows}
      data-frames={RUNNER_CONFIG.frameCount}
      data-fps={RUNNER_CONFIG.fps}
      data-speed={RUNNER_CONFIG.speed}
      data-scale={RUNNER_CONFIG.scale.toFixed(2)}
    />
  );
}
