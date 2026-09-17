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
    let frameIndex = initialFrames[candidateId] ?? 0;
    let lastFrameTime = performance.now();
    let sourceWidth = canvas.width;
    let sourceHeight = canvas.height;
    let frameWidth = canvas.width;
    let frameHeight = canvas.height;

    const drawFrame = () => {
      context.clearRect(0, 0, frameWidth, frameHeight);
      context.drawImage(
        image,
        (frameIndex % RUNNER_CONFIG.columns) *
          (image.naturalWidth / RUNNER_CONFIG.columns) +
          RUNNER_CONFIG.trim,
        Math.floor(frameIndex / RUNNER_CONFIG.columns) *
          (image.naturalHeight / RUNNER_CONFIG.rows) +
          RUNNER_CONFIG.trim,
        sourceWidth,
        sourceHeight,
        0,
        0,
        frameWidth,
        frameHeight,
      );
      canvas.dataset.frame = String(frameIndex);
    };

    const animate = (now: number) => {
      if (stopped) return;
      const frameDuration = 1000 / RUNNER_CONFIG.fps;
      const elapsedFrames = Math.floor((now - lastFrameTime) / frameDuration);
      if (elapsedFrames > 0) {
        frameIndex = (frameIndex + elapsedFrames) % RUNNER_CONFIG.frameCount;
        lastFrameTime += elapsedFrames * frameDuration;
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
      frameWidth = Math.round(sourceWidth * RUNNER_CONFIG.scale);
      frameHeight = Math.round(sourceHeight * RUNNER_CONFIG.scale);
      canvas.width = frameWidth;
      canvas.height = frameHeight;
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
