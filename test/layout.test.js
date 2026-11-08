import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = JSON.parse(readFileSync(new URL('../layout.json', import.meta.url)));

test('layout.json covers every grid cell exactly once', () => {
  assert.equal(layout.cells.length, layout.cols * layout.rows);
  const keys = new Set(layout.cells.map(c => `${c.x},${c.y}`));
  assert.equal(keys.size, layout.cells.length);
  for (let x = 0; x < layout.cols; x++)
    for (let y = 0; y < layout.rows; y++) assert.ok(keys.has(`${x},${y}`), `missing ${x},${y}`);
});

test('LED positions are unique and fit the 16-bit protocol field', () => {
  const leds = layout.cells.map(c => c.led);
  assert.equal(new Set(leds).size, leds.length);
  assert.ok(leds.every(l => Number.isInteger(l) && l >= 0 && l <= 0xffff));
});

// Regression: hole positions of a real climb ("Everbody Knows Your Name" by jwilder) that was
// checked against a screenshot of the gym's board. Grid col = (x-8)/8, row = (152-y)/8.
test('layout maps a known real climb to the expected LEDs', () => {
  const led = (col, row) => layout.cells.find(c => c.x === col && c.y === row).led;
  const holes = { // [hole x, hole y, expected led position]
    finish: [[48, 152, 171]],
    start: [[40, 56, 153], [48, 56, 188]],
    foot: [[32, 24, 143], [80, 40, 293], [72, 56, 255]],
    mid: [[64, 80, 235], [64, 88, 233], [88, 96, 314], [72, 120, 267], [72, 136, 270]],
  };
  for (const list of Object.values(holes))
    for (const [x, y, expected] of list) assert.equal(led((x - 8) / 8, (152 - y) / 8), expected, `hole ${x},${y}`);
});

test('layout is the 17x19 grid of the 12x12 board', () => {
  assert.equal(layout.cols, 17);
  assert.equal(layout.rows, 19);
});
