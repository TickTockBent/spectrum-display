/**
 * ZX Spectrum 48K/128K color palette.
 *
 * Indexed as SPECTRUM_COLORS[bright][colorIndex]:
 *   - bright: 0 = normal, 1 = bright
 *   - colorIndex: 0-7 (black, blue, red, magenta, green, cyan, yellow, white)
 */
export const SPECTRUM_COLORS: readonly [readonly string[], readonly string[]] = [
  // Normal
  ['#000000', '#0000C0', '#C00000', '#C000C0', '#00C000', '#00C0C0', '#C0C000', '#C0C0C0'],
  // Bright
  ['#000000', '#0000FF', '#FF0000', '#FF00FF', '#00FF00', '#00FFFF', '#FFFF00', '#FFFFFF'],
] as const;

/**
 * Pre-parsed RGB tuples for the renderer hot path.
 * Avoids hex string parsing per pixel during frame rendering.
 * Indexed identically to SPECTRUM_COLORS: [bright][colorIndex] => [r, g, b]
 */
export const SPECTRUM_RGB: readonly [
  readonly (readonly [number, number, number])[],
  readonly (readonly [number, number, number])[],
] = SPECTRUM_COLORS.map((palette) =>
  palette.map((hex) => {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff] as const;
  })
) as unknown as readonly [
  readonly (readonly [number, number, number])[],
  readonly (readonly [number, number, number])[],
];
