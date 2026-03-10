import { useRef, useEffect, useMemo } from 'react';
import { renderFrame } from './renderer';
import { SPECTRUM_COLORS } from './colors';

export interface SpectrumDisplayProps {
  /** Raw 6912-byte ULA framebuffer. Bytes 0-6143: pixel bitmap. Bytes 6144-6911: attributes. */
  frameBuffer: Uint8Array;

  /** Border color index 0-7 (normal palette only). Default: 7 (white). */
  borderColor?: number;

  /**
   * Display scale factor. 1 = native, 2 = doubled, 3 = tripled.
   * Default: 2.
   *
   * Note: this is the CSS/canvas scale, not the physical pixel scale.
   * On high-DPI displays (e.g. Retina with devicePixelRatio 2), a scale
   * of 2 produces 4x physical pixels. If the canvas looks soft on a
   * high-DPI screen, this is why -- the browser is upscaling the canvas
   * element to match devicePixelRatio. A future version could account
   * for this by multiplying scale * devicePixelRatio for the canvas
   * resolution while keeping the CSS size at the intended scale.
   */
  scale?: 1 | 2 | 3;

  /** Border width in Spectrum pixels (before scaling). Default: 32. */
  borderWidth?: number;

  /**
   * Flash tick counter. Increment at ~1.7Hz to drive flash state.
   * Flash phase is derived from (flashTick & 1). Default: 0.
   */
  flashTick?: number;

  /** Optional CSS class for the canvas element. */
  className?: string;

  /** Optional inline style for the canvas element. */
  style?: React.CSSProperties;
}

export function SpectrumDisplay({
  frameBuffer,
  borderColor = 7,
  scale = 2,
  borderWidth = 32,
  flashTick = 0,
  className,
  style,
}: SpectrumDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Clamp and validate props at the boundary, not in the render path
  const safeBorderColor = useMemo(() => {
    let clamped = borderColor;
    if (process.env.NODE_ENV !== 'production') {
      if (borderColor < 0 || borderColor > 7) {
        console.warn(`spectrum-display: borderColor ${borderColor} out of range 0-7, clamping`);
      }
      if (frameBuffer.length !== 6912) {
        console.warn(`spectrum-display: frameBuffer length ${frameBuffer.length}, expected 6912`);
      }
      if (borderWidth < 0) {
        console.warn(`spectrum-display: borderWidth ${borderWidth} is negative, clamping to 0`);
      }
    }
    clamped = Math.max(0, Math.min(7, clamped));
    return clamped;
  }, [borderColor, frameBuffer.length, borderWidth]);

  const safeBorderWidth = Math.max(0, borderWidth);

  const unscaledWidth = 256 + safeBorderWidth * 2;
  const unscaledHeight = 192 + safeBorderWidth * 2;
  const displayWidth = unscaledWidth * scale;
  const displayHeight = unscaledHeight * scale;

  // Create / resize hidden canvas
  useEffect(() => {
    if (!hiddenCanvasRef.current) {
      hiddenCanvasRef.current = document.createElement('canvas');
    }
    hiddenCanvasRef.current.width = unscaledWidth;
    hiddenCanvasRef.current.height = unscaledHeight;
  }, [unscaledWidth, unscaledHeight]);

  // Render frame to hidden canvas, then scale-blit to visible canvas
  useEffect(() => {
    const visibleCanvas = canvasRef.current;
    const hiddenCanvas = hiddenCanvasRef.current;
    if (!visibleCanvas || !hiddenCanvas) return;

    const hiddenCtx = hiddenCanvas.getContext('2d');
    const visibleCtx = visibleCanvas.getContext('2d');
    if (!hiddenCtx || !visibleCtx) return;

    // Render at 1x into hidden canvas
    renderFrame(hiddenCtx, frameBuffer, safeBorderColor, flashTick, safeBorderWidth);

    // Scale-blit to visible canvas with nearest-neighbor interpolation
    visibleCtx.imageSmoothingEnabled = false;
    visibleCtx.drawImage(hiddenCanvas, 0, 0, displayWidth, displayHeight);
  }, [frameBuffer, safeBorderColor, flashTick, scale, safeBorderWidth, displayWidth, displayHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={displayWidth}
      height={displayHeight}
      className={className}
      style={{
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
}
