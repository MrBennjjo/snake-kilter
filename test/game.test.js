import test from 'node:test';
import assert from 'node:assert/strict';
import { Snake } from '../game.js';

// Build a snake with a known body (head first), direction and food.
function make({ cols = 5, rows = 5, body, dir = 'right', food = null }) {
  const s = new Snake(cols, rows);
  s.body = body.map(c => [...c]);
  s.dir = dir;
  s.queue = [];
  s.food = food;
  return s;
}
const head = s => s.body[0];

test('moves one cell in its direction each tick', () => {
  const s = make({ body: [[2, 2], [1, 2], [0, 2]], food: [4, 4] });
  s.tick();
  assert.deepEqual(s.body, [[3, 2], [2, 2], [1, 2]]);
  assert.ok(s.alive);
});

// --- wrapping: leaving the board never kills, it comes out the other side ---
for (const [dir, start, expected] of [
  ['right', [[4, 2], [3, 2]], [0, 2]],
  ['left', [[0, 2], [1, 2]], [4, 2]],
  ['up', [[2, 0], [2, 1]], [2, 4]],
  ['down', [[2, 4], [2, 3]], [2, 0]],
]) {
  test(`wraps ${dir} across the edge`, () => {
    const s = make({ body: start, dir, food: [1, 1] });
    s.tick();
    assert.ok(s.alive, 'should survive leaving the board');
    assert.deepEqual(head(s), expected);
    assert.equal(s.body.length, 2);
  });
}

test('wraps correctly into row/column 0 (no off-by-one at zero)', () => {
  const s = make({ body: [[2, 4], [2, 3]], dir: 'down', food: [4, 4] });
  s.tick();
  assert.deepEqual(head(s), [2, 0]);
  assert.ok(s.alive);
});

test('can eat food that sits on the wrap-around cell', () => {
  const s = make({ body: [[2, 4], [2, 3]], dir: 'down', food: [2, 0] });
  s.tick();
  assert.ok(s.alive);
  assert.equal(s.score, 1);
  assert.equal(s.body.length, 3);
});

test('wrapping onto a cell the tail is vacating is safe', () => {
  // Head at bottom heading down, tail tip sitting on the top cell it wraps to.
  const s = make({ body: [[2, 4], [3, 4], [3, 0], [2, 0]], dir: 'down', food: [0, 0] });
  s.tick();
  assert.ok(s.alive);
});

test('wrapping onto the snake body kills it', () => {
  const s = make({ body: [[2, 4], [3, 4], [3, 0], [2, 0], [1, 0]], dir: 'down', food: [0, 3] });
  s.tick();
  assert.equal(s.alive, false);
});

// --- self collision ---
test('hitting its own body ends the game', () => {
  const s = make({
    body: [[1, 1], [1, 2], [2, 2], [2, 1], [2, 0]],
    dir: 'right', food: [4, 4],
  });
  s.tick(); // head -> (2,1) which is body
  assert.equal(s.alive, false);
});

test('moving into the cell the tail is leaving is allowed', () => {
  // 2x2 loop: head chases its own tail.
  const s = make({ body: [[1, 1], [1, 2], [2, 2], [2, 1]], dir: 'right', food: [4, 4] });
  s.tick();
  assert.ok(s.alive);
});

test('moving into the tail cell while eating is NOT allowed (tail does not move)', () => {
  const s = make({ body: [[1, 1], [1, 2], [2, 2], [2, 1]], dir: 'right', food: [2, 1] });
  s.tick();
  assert.equal(s.alive, false);
});

test('no movement after death', () => {
  const s = make({ body: [[1, 1], [1, 2], [2, 2], [2, 1]], dir: 'right', food: [2, 1] });
  s.tick();
  const snapshot = JSON.stringify(s.body);
  s.tick();
  assert.equal(JSON.stringify(s.body), snapshot);
});

// --- eating ---
test('eating grows the snake, scores and relocates food off the body', () => {
  const s = make({ body: [[1, 2], [0, 2]], dir: 'right', food: [2, 2] });
  s.tick();
  assert.equal(s.score, 1);
  assert.equal(s.body.length, 3);
  assert.notDeepEqual(s.food, [2, 2]);
  assert.ok(!s.body.some(([x, y]) => x === s.food[0] && y === s.food[1]));
});

test('food is always placed on a free cell', () => {
  for (let i = 0; i < 50; i++) {
    const s = new Snake(4, 4);
    assert.ok(!s.body.some(([x, y]) => x === s.food[0] && y === s.food[1]));
  }
});

test('food is null when the board is full', () => {
  const s = new Snake(2, 1);
  s.body = [[0, 0], [1, 0]];
  s.placeFood();
  assert.equal(s.food, null);
});

// --- steering ---
test('turn changes direction on the next tick', () => {
  const s = make({ body: [[2, 2], [1, 2]], food: [4, 4] });
  s.turn('up');
  s.tick();
  assert.deepEqual(head(s), [2, 1]);
  assert.equal(s.dir, 'up');
});

test('direct reversal is ignored', () => {
  const s = make({ body: [[2, 2], [1, 2]], dir: 'right', food: [4, 4] });
  s.turn('left');
  s.tick();
  assert.ok(s.alive);
  assert.deepEqual(head(s), [3, 2]);
});

test('two quick turns in one tick are both applied in order (up then left)', () => {
  const s = make({ body: [[2, 2], [1, 2], [0, 2]], dir: 'right', food: [4, 4] });
  s.turn('up');
  s.turn('left');
  s.tick();
  assert.deepEqual(head(s), [2, 1]);
  s.tick();
  assert.deepEqual(head(s), [1, 1]);
  assert.ok(s.alive);
});

test('a quick reversal sequence cannot fold the snake onto itself', () => {
  const s = make({ body: [[2, 2], [1, 2], [0, 2]], dir: 'right', food: [4, 4] });
  s.turn('up');
  s.turn('down'); // reverses the pending 'up' -> ignored
  s.tick();
  s.tick();
  assert.ok(s.alive);
});

test('turn buffer holds at most two pending turns', () => {
  const s = make({ body: [[2, 2], [1, 2]], dir: 'right', food: [4, 4] });
  s.turn('up'); s.turn('left'); s.turn('down');
  assert.deepEqual(s.queue, ['up', 'left']);
});

// --- reset ---
test('reset restores a fresh, living, 3-long snake', () => {
  const s = make({ body: [[1, 1], [1, 2], [2, 2], [2, 1]], dir: 'right', food: [2, 1] });
  s.tick();
  s.reset();
  assert.ok(s.alive);
  assert.equal(s.score, 0);
  assert.equal(s.body.length, 3);
  assert.deepEqual(s.queue, []);
});

// --- rendering frame / colours ---
const bodyCells = s => s.frame().filter(c => !(s.food && c.x === s.food[0] && c.y === s.food[1]));

test('frame includes food in red and a cyan head', () => {
  const s = make({ body: [[2, 2], [1, 2], [0, 2]], food: [4, 4] });
  const f = s.frame();
  assert.deepEqual(f.find(c => c.x === 4 && c.y === 4).color, [255, 0, 0]);
  assert.deepEqual(f.find(c => c.x === 2 && c.y === 2).color, [0, 255, 255]);
});

test('body fades from green to blue along the tail', () => {
  const s = make({ body: [[6, 0], [5, 0], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0]], cols: 8, rows: 2, food: [7, 1] });
  const body = s.frame().filter(c => c.y === 0).sort((a, b) => b.x - a.x).slice(1); // drop head
  assert.deepEqual(body[0].color, [0, 255, 0]);
  assert.deepEqual(body[body.length - 1].color, [0, 64, 255]);
  for (let i = 1; i < body.length; i++) {
    assert.ok(body[i].color[1] < body[i - 1].color[1], 'green falls');
    assert.ok(body[i].color[2] > body[i - 1].color[2], 'blue rises');
  }
});

test('no body colour is reddish, so food stays obvious', () => {
  const s = make({ body: [[6, 0], [5, 0], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0]], cols: 8, rows: 2, food: [7, 1] });
  for (const c of bodyCells(s).filter(c => c.y === 0)) assert.equal(c.color[0], 0);
});

test('short snakes do not produce NaN colours', () => {
  for (const len of [1, 2, 3]) {
    const s = make({ body: Array.from({ length: len }, (_, i) => [3 - i, 0]), food: [4, 4] });
    for (const c of s.frame()) assert.ok(c.color.every(Number.isFinite));
  }
});

test('dead snake renders entirely red', () => {
  const s = make({ body: [[1, 1], [1, 2], [2, 2], [2, 1]], dir: 'right', food: [2, 1] });
  s.tick();
  for (const c of s.frame().filter(c => c.color)) assert.deepEqual(c.color, [255, 0, 0]);
});
