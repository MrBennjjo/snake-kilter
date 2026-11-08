import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages } from '../ble.js';

const dataOf = m => m.slice(4, -1); // between 0x02 and 0x03

test('packet framing: header, length, checksum, trailer', () => {
  const [m] = buildMessages([{ led: 0x0102, color: [255, 255, 255] }]);
  assert.equal(m[0], 0x01);
  assert.equal(m[3], 0x02);
  assert.equal(m[m.length - 1], 0x03);
  const data = dataOf(m);
  assert.equal(m[1], data.length);
  assert.equal(m[2], (~data.reduce((a, b) => a + b, 0)) & 0xff);
});

test('LED position is little-endian and colour is packed 3-3-2', () => {
  const [m] = buildMessages([{ led: 0x0102, color: [255, 255, 255] }]);
  assert.deepEqual(dataOf(m), [84, 0x02, 0x01, 0xff]);
  assert.equal(dataOf(buildMessages([{ led: 0, color: [255, 0, 0] }])[0])[3], 0xe0);
  assert.equal(dataOf(buildMessages([{ led: 0, color: [0, 255, 0] }])[0])[3], 0x1c);
  assert.equal(dataOf(buildMessages([{ led: 0, color: [0, 0, 255] }])[0])[3], 0x03);
});

test('empty frame sends a single clear packet', () => {
  const msgs = buildMessages([]);
  assert.equal(msgs.length, 1);
  assert.deepEqual(dataOf(msgs[0]), [84]);
});

test('large frames are split into FIRST / MIDDLE / LAST packets', () => {
  const leds = Array.from({ length: 170 }, (_, i) => ({ led: i, color: [0, 0, 0] }));
  const msgs = buildMessages(leds);
  assert.deepEqual(msgs.map(m => dataOf(m)[0]), [82, 81, 83]);
  assert.deepEqual(msgs.map(m => (dataOf(m).length - 1) / 3), [80, 80, 10]);
});

test('exactly one packet uses the ONLY command', () => {
  const msgs = buildMessages([{ led: 1, color: [0, 0, 0] }]);
  assert.equal(dataOf(msgs[0])[0], 84);
});

test('matches the documented worked example from a verified real-board write-up', () => {
  // Light LED position 161 in #FF00FF -> 01 04 27 02 54 a1 00 e3 03
  const [m] = buildMessages([{ led: 161, color: [255, 0, 255] }]);
  assert.deepEqual(m, [0x01, 0x04, 0x27, 0x02, 0x54, 0xa1, 0x00, 0xe3, 0x03]);
});

import { parseApiLevel } from '../ble.js';
test('parses API level from the board name suffix', () => {
  assert.equal(parseApiLevel('Kilter Board#1234@3'), 3);
  assert.equal(parseApiLevel('Kilter Board#1234@2'), 2);
  assert.equal(parseApiLevel('Kilter Board#1234'), 2); // no suffix defaults to level 2
  assert.equal(parseApiLevel(undefined), 2);
});
