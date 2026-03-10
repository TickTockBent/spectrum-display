import { SPECTRUM_COLORS, SPECTRUM_RGB } from './colors';
import { pixelAddress } from './framebuffer';

/**
 * Render a complete ZX Spectrum frame to a 1x-scale canvas context.
 *
 * This function is pure -- no React, no DOM queries, no side effects beyond
 * writing pixels to the provided context. It can be called from the main
 * thread or a Web Worker (given an OffscreenCanvas context).
 *
 * Uses ImageData for the entire frame to avoid thousands of fillRect calls.
 * A single putImageData call is far cheaper than 768+ fillStyle changes.
 *
 * @param ctx        2D context of the hidden (1x) canvas
 * @param buffer     6912-byte ULA framebuffer
 * @param borderColor Border color index 0-7 (normal palette only)
 * @param flashTick  Flash phase counter; cells with FLASH toggle when (flashTick & 1) === 1
 * @param borderWidth Border width in Spectrum pixels (pre-scale)
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  buffer: Uint8Array,
  borderColor: number,
  flashTick: number,
  borderWidth: number,
): void {
  const totalWidth = 256 + borderWidth * 2;
  const totalHeight = 192 + borderWidth * 2;

  const imageData = ctx.createImageData(totalWidth, totalHeight);
  const data = imageData.data;

  // Fill entire image with border color (normal palette only, no bright)
  const [borderR, borderG, borderB] = SPECTRUM_RGB[0][borderColor & 7];
  for (let i = 0; i < data.length; i += 4) {
    data[i] = borderR;
    data[i + 1] = borderG;
    data[i + 2] = borderB;
    data[i + 3] = 255;
  }

  // Determine flash phase once for the whole frame
  const flashActive = (flashTick & 1) === 1;

  // Render the 32x24 attribute cell grid
  for (let charRow = 0; charRow < 24; charRow++) {
    for (let charCol = 0; charCol < 32; charCol++) {
      // Read attribute byte
      const attr = buffer[0x1800 + charRow * 32 + charCol];
      const flash = (attr >> 7) & 1;
      const bright = (attr >> 6) & 1;
      let paper = (attr >> 3) & 7;
      let ink = attr & 7;

      // Flash: swap ink and paper when flash bit is set and phase is active
      if (flash && flashActive) {
        const tmp = ink;
        ink = paper;
        paper = tmp;
      }

      const [inkR, inkG, inkB] = SPECTRUM_RGB[bright][ink];
      const [paperR, paperG, paperB] = SPECTRUM_RGB[bright][paper];

      // Render 8 pixel rows within this character cell
      for (let pixelRow = 0; pixelRow < 8; pixelRow++) {
        const screenY = charRow * 8 + pixelRow;
        const byteAddr = pixelAddress(charCol * 8, screenY);
        const pixelByte = buffer[byteAddr];

        const canvasY = borderWidth + screenY;
        const canvasXBase = borderWidth + charCol * 8;

        // Unroll 8 pixels from MSB (leftmost) to LSB (rightmost)
        for (let bit = 7; bit >= 0; bit--) {
          const isInk = (pixelByte >> bit) & 1;
          const canvasX = canvasXBase + (7 - bit);
          const offset = (canvasY * totalWidth + canvasX) * 4;

          if (isInk) {
            data[offset] = inkR;
            data[offset + 1] = inkG;
            data[offset + 2] = inkB;
          } else {
            data[offset] = paperR;
            data[offset + 1] = paperG;
            data[offset + 2] = paperB;
          }
          // Alpha already set to 255 during border fill
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
