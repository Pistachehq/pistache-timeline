import { type WaveformPeaks } from '@timeline/media';
import { memo, useLayoutEffect, useRef } from 'react';

interface ClipWaveformProps {
  readonly peaks: WaveformPeaks;
  readonly sourceIn: number;
  readonly sourceOut: number;
  readonly assetFrameCount: number;
  readonly width: number;
  readonly height: number;
}

function bucketRange(sourceIn: number, sourceOut: number, assetFrameCount: number, bucketCount: number) {
  if (assetFrameCount <= 0) return { start: 0, end: bucketCount };
  const start = Math.floor((sourceIn / assetFrameCount) * bucketCount);
  const end = Math.max(start + 1, Math.ceil((sourceOut / assetFrameCount) * bucketCount));
  return { start, end: Math.min(bucketCount, end) };
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  peaks: WaveformPeaks,
  channelIndex: 0 | 1,
  startBucket: number,
  endBucket: number,
  width: number,
  top: number,
  bandHeight: number,
) {
  const { bucketCount, minMax } = peaks;
  const stride = peaks.channelCount === 2 ? 4 : 2;
  const minOffset = channelIndex === 0 ? 0 : 2;
  const centerY = top + bandHeight / 2;
  const halfH = bandHeight / 2 - 1;

  ctx.beginPath();
  ctx.moveTo(0, centerY);
  for (let x = 0; x <= width; x++) {
    const t = width <= 0 ? 0 : x / width;
    const bucket = startBucket + t * (endBucket - startBucket);
    const b0 = Math.min(bucketCount - 1, Math.floor(bucket));
    const b1 = Math.min(bucketCount - 1, b0 + 1);
    const frac = bucket - b0;
    const idx0 = b0 * stride + minOffset;
    const idx1 = b1 * stride + minOffset;
    const max =
      minMax[idx0 + 1]! * (1 - frac) +
      minMax[idx1 + 1]! * frac;
    ctx.lineTo(x, centerY - max * halfH);
  }
  for (let x = width; x >= 0; x--) {
    const t = width <= 0 ? 0 : x / width;
    const bucket = startBucket + t * (endBucket - startBucket);
    const b0 = Math.min(bucketCount - 1, Math.floor(bucket));
    const b1 = Math.min(bucketCount - 1, b0 + 1);
    const frac = bucket - b0;
    const idx0 = b0 * stride + minOffset;
    const idx1 = b1 * stride + minOffset;
    const min =
      minMax[idx0]! * (1 - frac) +
      minMax[idx1]! * frac;
    ctx.lineTo(x, centerY - min * halfH);
  }
  ctx.closePath();
  ctx.fill();
}

export const ClipWaveform = memo(function ClipWaveform({
  peaks,
  sourceIn,
  sourceOut,
  assetFrameCount,
  width,
  height,
}: ClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 2 || height < 4) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';

    const { start, end } = bucketRange(sourceIn, sourceOut, assetFrameCount, peaks.bucketCount);
    if (peaks.channelCount === 2) {
      const half = height / 2;
      drawChannel(ctx, peaks, 0, start, end, width, 0, half);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      drawChannel(ctx, peaks, 1, start, end, width, half, half);
    } else {
      drawChannel(ctx, peaks, 0, start, end, width, 0, height);
    }
  }, [peaks, sourceIn, sourceOut, assetFrameCount, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
});
