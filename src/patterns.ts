import { setPixel, setAttribute } from './framebuffer';

export type TestPattern =
  | 'attributes'
  | 'colorBars'
  | 'checkerboard'
  | 'flashDemo'
  | 'brightDemo'
  | 'spectrum'
  | 'blank';

/**
 * Fill a framebuffer with a named test pattern.
 * The buffer is cleared before writing the pattern.
 */
export function fillTestPattern(buffer: Uint8Array, pattern: TestPattern): void {
  buffer.fill(0);

  switch (pattern) {
    case 'blank':
      break;
    case 'spectrum':
      fillSpectrum(buffer);
      break;
    case 'colorBars':
      fillColorBars(buffer);
      break;
    case 'attributes':
      fillAttributes(buffer);
      break;
    case 'checkerboard':
      fillCheckerboard(buffer);
      break;
    case 'flashDemo':
      fillFlashDemo(buffer);
      break;
    case 'brightDemo':
      fillBrightDemo(buffer);
      break;
  }
}

/**
 * Classic vertical color bars: black, blue, red, magenta, green, cyan, yellow, white.
 * The iconic rainbow pattern burned into everyone's memory from the loading screen.
 * Solid bars -- ink and paper set to the same color so bitmap state doesn't matter.
 */
function fillSpectrum(buffer: Uint8Array): void {
  for (let charY = 0; charY < 24; charY++) {
    for (let charX = 0; charX < 32; charX++) {
      // 8 bars, each 4 character cells wide (4 * 8px = 32px, 8 * 32px = 256px)
      const colorIndex = charX >> 2;
      setAttribute(buffer, charX, charY, colorIndex, colorIndex);
    }
  }
}

/**
 * Vertical color bars with ink on black paper.
 * All pixels set to 1 so the ink color is visible.
 */
function fillColorBars(buffer: Uint8Array): void {
  for (let charY = 0; charY < 24; charY++) {
    for (let charX = 0; charX < 32; charX++) {
      const colorIndex = charX >> 2;
      setAttribute(buffer, charX, charY, colorIndex, 0);
    }
  }
  // Fill all pixels so ink shows
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 256; x++) {
      setPixel(buffer, x, y, 1);
    }
  }
}

/**
 * All 128 non-flash attribute combinations laid out in a grid.
 * 8 ink * 8 paper * 2 bright = 128 cells.
 * Top 16 rows: normal. Bottom 8 rows (rows 16-23): bright.
 * Within each half: rows cycle paper 0-7, columns cycle ink 0-7 (repeated 4x).
 * Pixels show a half-filled pattern so both ink and paper are visible.
 */
function fillAttributes(buffer: Uint8Array): void {
  for (let charY = 0; charY < 24; charY++) {
    const bright = charY >= 16;
    const paper = bright ? (charY - 16) : (charY % 8);
    for (let charX = 0; charX < 32; charX++) {
      const ink = charX & 7;
      setAttribute(buffer, charX, charY, ink, paper, bright);
    }
  }
  // Half-filled cells: top 4 pixel rows ink, bottom 4 paper
  for (let charY = 0; charY < 24; charY++) {
    for (let charX = 0; charX < 32; charX++) {
      for (let row = 0; row < 4; row++) {
        const y = charY * 8 + row;
        for (let col = 0; col < 8; col++) {
          setPixel(buffer, charX * 8 + col, y, 1);
        }
      }
    }
  }
}

/**
 * 8x8 alternating ink/paper checkerboard.
 * Even cells filled (showing ink), odd cells empty (showing paper).
 * Uses white ink on black paper for maximum contrast.
 */
function fillCheckerboard(buffer: Uint8Array): void {
  for (let charY = 0; charY < 24; charY++) {
    for (let charX = 0; charX < 32; charX++) {
      setAttribute(buffer, charX, charY, 7, 0);
      const filled = (charX + charY) % 2 === 0;
      if (filled) {
        for (let row = 0; row < 8; row++) {
          const y = charY * 8 + row;
          for (let col = 0; col < 8; col++) {
            setPixel(buffer, charX * 8 + col, y, 1);
          }
        }
      }
    }
  }
}

/**
 * Left half: static cells. Right half: flashing cells.
 * Both halves use bright cyan ink on blue paper for a visible flash effect.
 */
function fillFlashDemo(buffer: Uint8Array): void {
  for (let charY = 0; charY < 24; charY++) {
    for (let charX = 0; charX < 32; charX++) {
      const flash = charX >= 16;
      setAttribute(buffer, charX, charY, 5, 1, true, flash);
    }
  }
  // Fill a pattern so ink is visible: horizontal stripes (every other pixel row)
  for (let y = 0; y < 192; y++) {
    if (y % 2 === 0) {
      for (let x = 0; x < 256; x++) {
        setPixel(buffer, x, y, 1);
      }
    }
  }
}

/**
 * Normal vs bright palette comparison.
 * Top half: normal palette. Bottom half: bright palette.
 * Each half shows 8 vertical color bars with white ink on colored paper.
 */
function fillBrightDemo(buffer: Uint8Array): void {
  for (let charY = 0; charY < 24; charY++) {
    const bright = charY >= 12;
    for (let charX = 0; charX < 32; charX++) {
      const colorIndex = charX >> 2;
      setAttribute(buffer, charX, charY, 7, colorIndex, bright);
    }
  }
  // Partial fill: draw a small centered square in each cell to show ink against paper
  for (let charY = 0; charY < 24; charY++) {
    for (let charX = 0; charX < 32; charX++) {
      for (let row = 2; row < 6; row++) {
        const y = charY * 8 + row;
        for (let col = 2; col < 6; col++) {
          setPixel(buffer, charX * 8 + col, y, 1);
        }
      }
    }
  }
}
