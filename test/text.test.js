import test from 'node:test';
import assert from 'node:assert/strict';
import { drawText, gameOverFrame, textWidth, GLYPH_H } from '../text.js';

const COLS = 17, ROWS = 19; // the real board grid
const key = c => `${c.x},${c.y}`;
const sameColor = (a, b) => a.every((v, i) => v === b[i]);
const RED = [255, 0, 0];

test('text width counts 3 columns per glyph plus 1 gap', () => {
  assert.equal(textWidth('GAME'), 15);
  assert.equal(textWidth('7'), 3);
  assert.equal(textWidth(''), 0);
});

test('drawText renders a known glyph exactly', () => {
  const cells = drawText('7', 0, 0, RED, COLS, ROWS);
  assert.deepEqual(cells.map(key).sort(), ['0,0', '1,0', '2,0', '2,1', '2,2', '2,3', '2,4']);
});

test('drawText drops cells outside the grid and skips unknown characters', () => {
  const cells = drawText('8?8', 15, 17, RED, COLS, ROWS);
  assert.ok(cells.every(c => c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS));
});

test('every glyph is 3x5 and uses only X and .', () => {
  for (const ch of 'AEGMORV0123456789') {
    const cells = drawText(ch, 0, 0, RED, 10, 10);
    assert.ok(cells.length > 0, ch);
    assert.ok(cells.every(c => c.x < 3 && c.y < GLYPH_H), ch);
  }
});

test('game over frame fits the board and never overlaps', () => {
  for (const score of [0, 7, 42, 123, 9999]) {
    const f = gameOverFrame(score, COLS, ROWS);
    assert.ok(f.every(c => c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS), `score ${score}`);
    assert.equal(new Set(f.map(key)).size, f.length, `overlap at score ${score}`);
  }
});

test('GAME and OVER are red on separate lines, score is below and not red', () => {
  const f = gameOverFrame(42, COLS, ROWS);
  const red = f.filter(c => sameColor(c.color, RED));
  const other = f.filter(c => !sameColor(c.color, RED));
  assert.ok(red.length > 0 && other.length > 0);
  const lastRedRow = Math.max(...red.map(c => c.y));
  const firstScoreRow = Math.min(...other.map(c => c.y));
  assert.ok(firstScoreRow > lastRedRow, 'score is underneath the title');
  assert.ok(red.some(c => c.y <= 4) && red.some(c => c.y >= 6), 'two title lines');
});

test('score text is centred and shows every digit', () => {
  const f = gameOverFrame(105, COLS, ROWS);
  const score = f.filter(c => !sameColor(c.color, RED));
  const w = textWidth('105'), x0 = Math.floor((COLS - w) / 2);
  assert.equal(Math.min(...score.map(c => c.x)) >= x0, true);
  assert.equal(Math.max(...score.map(c => c.x)) < x0 + w, true);
  assert.equal(score.length, drawText('105', 0, 0, RED, 20, 20).length);
});
