const FRAMEBUFFER_SIZE = 6912;
const PIXEL_REGION_SIZE = 6144;
const ATTR_OFFSET = 0x1800;

/**
 * Convert a screen pixel coordinate to the byte offset within the pixel
 * bitmap region of the framebuffer.
 *
 * The ZX Spectrum's ULA maps scanlines in a non-linear pattern inherited
 * from the hardware design: the 192 scanlines are split into three 64-line
 * bands, and within each band the address interleaves the fine row (pixel
 * row within a character cell) and coarse row (character row within the band).
 *
 * Address bits (relative to buffer start):
 *   [12:11] = band (0-2)
 *   [10:8]  = fine row within character cell (0-7)
 *   [7:5]   = coarse row within band (0-7)
 *   [4:0]   = character column (0-31)
 */
export function pixelAddress(x: number, y: number): number {
  const col = x >> 3;
  const pixelRow = y & 0x07;
  const charRow = (y >> 3) & 0x07;
  const band = (y >> 6) & 0x03;
  return (band << 11) | (pixelRow << 8) | (charRow << 5) | col;
}

/** Create a zeroed 6912-byte framebuffer ready for use. */
export function createFrameBuffer(): Uint8Array {
  return new Uint8Array(FRAMEBUFFER_SIZE);
}

/**
 * Set or clear a single pixel in the bitmap region of the framebuffer.
 *
 * Handles the Spectrum's non-linear address mapping internally.
 * Bit 7 of each byte is the leftmost pixel, bit 0 is the rightmost.
 */
export function setPixel(
  buffer: Uint8Array,
  x: number,
  y: number,
  value: 0 | 1,
): void {
  if (process.env.NODE_ENV !== 'production') {
    if (buffer.length !== FRAMEBUFFER_SIZE) {
      console.warn(`spectrum-display: setPixel called with buffer of length ${buffer.length}, expected ${FRAMEBUFFER_SIZE}`);
    }
    if (x < 0 || x > 255 || y < 0 || y > 191) {
      console.warn(`spectrum-display: setPixel coordinate (${x}, ${y}) out of range, clamping`);
      x = Math.max(0, Math.min(255, x));
      y = Math.max(0, Math.min(191, y));
    }
  }

  const address = pixelAddress(x, y);
  const bit = 7 - (x & 7);

  if (value) {
    buffer[address] |= 1 << bit;
  } else {
    buffer[address] &= ~(1 << bit);
  }
}

/**
 * Write an attribute byte for a character cell.
 *
 * Each attribute controls the colors of an 8x8 pixel cell:
 *   - ink (0-7): foreground color
 *   - paper (0-7): background color
 *   - bright: use bright palette variant
 *   - flash: toggle ink/paper at ~1.7Hz
 */
export function setAttribute(
  buffer: Uint8Array,
  charX: number,
  charY: number,
  ink: number,
  paper: number,
  bright = false,
  flash = false,
): void {
  if (process.env.NODE_ENV !== 'production') {
    if (buffer.length !== FRAMEBUFFER_SIZE) {
      console.warn(`spectrum-display: setAttribute called with buffer of length ${buffer.length}, expected ${FRAMEBUFFER_SIZE}`);
    }
    if (charX < 0 || charX > 31 || charY < 0 || charY > 23) {
      console.warn(`spectrum-display: setAttribute cell (${charX}, ${charY}) out of range, clamping`);
      charX = Math.max(0, Math.min(31, charX));
      charY = Math.max(0, Math.min(23, charY));
    }
    if (ink < 0 || ink > 7 || paper < 0 || paper > 7) {
      console.warn(`spectrum-display: setAttribute color ink=${ink} paper=${paper} out of range, clamping`);
      ink = Math.max(0, Math.min(7, ink));
      paper = Math.max(0, Math.min(7, paper));
    }
  }

  const address = ATTR_OFFSET + charY * 32 + charX;
  buffer[address] =
    (flash ? 0x80 : 0) |
    (bright ? 0x40 : 0) |
    ((paper & 7) << 3) |
    (ink & 7);
}
