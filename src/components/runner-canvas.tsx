"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

export const runnerTilesets: Record<string, string> = {
  lula: "/runners/lula.webp",
  flavio: "/runners/flavio.webp",
  renan: "/runners/renan.webp",
  augusto: "/runners/augusto.webp",
  caiado: "/runners/caiado.webp",
  zema: "/runners/zema.webp",
};

const initialFrames: Record<string, number> = {
  lula: 0,
  flavio: 3,
  renan: 6,
  augusto: 2,
  caiado: 5,
  zema: 7,
};

const FRAME_COUNT = 8;
const FPS = 12;

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
    let frameWidth = canvas.width;
    let frameHeight = canvas.height;

    const drawFrame = () => {
      context.clearRect(0, 0, frameWidth, frameHeight);
      context.drawImage(
        image,
        frameIndex * frameWidth,
        0,
        frameWidth,
        frameHeight,
        0,
        0,
        frameWidth,
        frameHeight,
      );
      canvas.dataset.frame = String(frameIndex);
    };

    const animate = (now: number) => {
      if (stopped) return;
      const frameDuration = 1000 / FPS;
      const elapsedFrames = Math.floor((now - lastFrameTime) / frameDuration);
      if (elapsedFrames > 0) {
        frameIndex = (frameIndex + elapsedFrames) % FRAME_COUNT;
        lastFrameTime += elapsedFrames * frameDuration;
        drawFrame();
      }
      animationFrame = requestAnimationFrame(animate);
    };

    const start = () => {
      if (stopped) return;
      frameWidth = image.naturalWidth / FRAME_COUNT;
      frameHeight = image.naturalHeight;
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
      width={298}
      height={400}
      role="img"
      aria-label={`Caricatura animada de ${candidateName} correndo`}
    />
  );
}
