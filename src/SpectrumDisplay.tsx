import { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { renderFrame } from './renderer';

/** ~1.7Hz flash toggle, matching the real ULA's frame counter cadence. */
const FLASH_INTERVAL_MS = 588;

export interface SpectrumDisplayProps {
  /** Raw 6912-byte ULA framebuffer. Bytes 0-6143: pixel bitmap. Bytes 6144-6911: attributes. */
  frameBuffer: Uint8Array;

  /** Border color index 0-7 (normal palette only). Default: 7 (white). */
  borderColor?: number;

  /**
   * Display scale factor. 1 = native, 2 = doubled, 3 = tripled.
   * Default: 2. Ignored when `fit` is set.
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
   * Override the internal flash counter. When provided, the component
   * uses this value instead of its own ~1.7Hz timer. Useful when the
   * emulator's Z80 core drives flash timing via frame counting.
   *
   * When omitted, flash is managed internally -- one less timer for the host.
   */
  flashTick?: number;

  /**
   * Freeze the display. The rAF loop stops and the canvas retains its
   * last painted frame. Flash state is preserved across pause/unpause.
   * Default: false.
   */
  paused?: boolean;

  /**
   * Responsive scaling mode. When set to "contain", the component wraps
   * the canvas in a flex container div, observes its size, and picks the
   * largest integer scale that fits. The `scale` prop is ignored.
   *
   * The container div gets `width: 100%; height: 100%` -- size it by
   * sizing whatever element you mount this inside.
   */
  fit?: 'contain';

  /**
   * Optional CSS class. Applied to the canvas element in fixed-scale mode,
   * or to the wrapper div in fit mode.
   */
  className?: string;

  /**
   * Optional inline style. Applied to the canvas element in fixed-scale mode,
   * or to the wrapper div in fit mode (canvas always gets imageRendering: pixelated).
   */
  style?: React.CSSProperties;
}

export function SpectrumDisplay({
  frameBuffer,
  borderColor = 7,
  scale = 2,
  borderWidth = 32,
  flashTick,
  paused = false,
  fit,
  className,
  style,
}: SpectrumDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fitScale, setFitScale] = useState(1);

  // Flash state persists across pause/unpause cycles
  const flashStateRef = useRef({ tick: 0, lastToggle: performance.now() });

  // Props ref so the rAF loop reads current values without restarting
  const propsRef = useRef({ frameBuffer, borderColor, borderWidth, flashTick });
  propsRef.current = { frameBuffer, borderColor, borderWidth, flashTick };

  const safeBorderWidth = Math.max(0, borderWidth);
  const unscaledWidth = 256 + safeBorderWidth * 2;
  const unscaledHeight = 192 + safeBorderWidth * 2;
  const effectiveScale = fit ? fitScale : scale;
  const displayWidth = unscaledWidth * effectiveScale;
  const displayHeight = unscaledHeight * effectiveScale;

  // Dev-mode validation — fires only when relevant props change
  useEffect(() => {
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
  }, [borderColor, frameBuffer, borderWidth]);

  // Responsive scaling: observe container and compute best integer scale.
  // useLayoutEffect so the correct scale is applied before the first paint,
  // avoiding a visible flash at the wrong size.
  useLayoutEffect(() => {
    if (!fit || !containerRef.current) return;

    const computeScale = (width: number, height: number) => {
      const maxScaleX = Math.floor(width / unscaledWidth);
      const maxScaleY = Math.floor(height / unscaledHeight);
      return Math.max(1, Math.min(maxScaleX, maxScaleY));
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setFitScale(computeScale(width, height));
      }
    });

    observer.observe(containerRef.current);

    // Compute immediately so first render is at the right scale
    const rect = containerRef.current.getBoundingClientRect();
    setFitScale(computeScale(rect.width, rect.height));

    return () => observer.disconnect();
  }, [fit, unscaledWidth, unscaledHeight]);

  // rAF render loop — continuously paints the framebuffer like a CRT scanning VRAM.
  // Only restarts when paused changes. All other props are read from propsRef
  // on each frame, so writing new bytes to the buffer is instantly visible
  // without any React reconciliation.
  useEffect(() => {
    if (paused) return;

    if (!hiddenCanvasRef.current) {
      hiddenCanvasRef.current = document.createElement('canvas');
    }
    const hiddenCanvas = hiddenCanvasRef.current;
    const visibleCanvas = canvasRef.current;
    if (!visibleCanvas) return;

    const hiddenCtx = hiddenCanvas.getContext('2d');
    const visibleCtx = visibleCanvas.getContext('2d');
    if (!hiddenCtx || !visibleCtx) return;

    let rafId: number;

    const loop = () => {
      const { frameBuffer, borderColor, borderWidth, flashTick } = propsRef.current;
      const safeBorderColor = Math.max(0, Math.min(7, borderColor));
      const safeBorderWidth = Math.max(0, borderWidth);

      // Ensure hidden canvas matches current border dimensions
      const hiddenWidth = 256 + safeBorderWidth * 2;
      const hiddenHeight = 192 + safeBorderWidth * 2;
      if (hiddenCanvas.width !== hiddenWidth || hiddenCanvas.height !== hiddenHeight) {
        hiddenCanvas.width = hiddenWidth;
        hiddenCanvas.height = hiddenHeight;
      }

      // Auto flash: the ULA toggles flash, not the CPU
      const now = performance.now();
      const flashState = flashStateRef.current;
      if (now - flashState.lastToggle >= FLASH_INTERVAL_MS) {
        flashState.tick++;
        flashState.lastToggle = now;
      }

      const effectiveFlashTick = flashTick ?? flashState.tick;

      // Render at 1x into hidden canvas
      renderFrame(hiddenCtx, frameBuffer, safeBorderColor, effectiveFlashTick, safeBorderWidth);

      // Scale-blit to visible canvas with nearest-neighbor interpolation
      const canvas = canvasRef.current;
      if (canvas) {
        visibleCtx.imageSmoothingEnabled = false;
        visibleCtx.drawImage(hiddenCanvas, 0, 0, canvas.width, canvas.height);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [paused]);

  // In fit mode, wrap canvas in a sized container for ResizeObserver
  if (fit) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          ...style,
        }}
      >
        <canvas
          ref={canvasRef}
          width={displayWidth}
          height={displayHeight}
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
    );
  }

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
