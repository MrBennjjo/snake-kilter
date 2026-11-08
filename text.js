// Tiny 3x5 pixel font and the game-over screen. Pure logic, no DOM or Bluetooth.
const GLYPHS = {
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  E: ['XXX', 'X..', 'XXX', 'X..', 'XXX'],
  G: ['XXX', 'X..', 'X.X', 'X.X', 'XXX'],
  M: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'],
  O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
  V: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
  0: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  1: ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  2: ['XXX', '..X', 'XXX', 'X..', 'XXX'],
  3: ['XXX', '..X', 'XXX', '..X', 'XXX'],
  4: ['X.X', 'X.X', 'XXX', '..X', '..X'],
  5: ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  6: ['XXX', 'X..', 'XXX', 'X.X', 'XXX'],
  7: ['XXX', '..X', '..X', '..X', '..X'],
  8: ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  9: ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
};
export const GLYPH_W = 3, GLYPH_H = 5;
const RED = [255, 0, 0], WHITE = [255, 255, 255];

export const textWidth = s => s.length * GLYPH_W + Math.max(0, s.length - 1);

// Cells for `text` with its top-left at (x0, y0). Unknown characters are skipped; cells outside
// the grid are dropped.
export function drawText(text, x0, y0, color, cols, rows) {
  const cells = [];
  [...text].forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (!g) return;
    g.forEach((line, gy) => [...line].forEach((px, gx) => {
      const x = x0 + i * (GLYPH_W + 1) + gx, y = y0 + gy;
      if (px === 'X' && x >= 0 && y >= 0 && x < cols && y < rows) cells.push({ x, y, color });
    }));
  });
  return cells;
}

// "GAME" / "OVER" in red, then the score in white, centred horizontally.
export function gameOverFrame(score, cols, rows) {
  const centre = s => Math.floor((cols - textWidth(s)) / 2);
  const num = String(score);
  return [
    ...drawText('GAME', centre('GAME'), 0, RED, cols, rows),
    ...drawText('OVER', centre('OVER'), GLYPH_H + 1, RED, cols, rows),
    ...drawText(num, centre(num), 2 * (GLYPH_H + 1) + 2, WHITE, cols, rows),
  ];
}
