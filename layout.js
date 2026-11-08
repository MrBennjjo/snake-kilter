// Maps game grid cells (x, y) to physical LED positions on the board.
//
// IMPORTANT: the real mapping depends on your board's layout and must come from the
// Kilter app's database (placements -> leds.position, with hole x/y coordinates).
// Put it in layout.json as:
//   { "cols": 12, "rows": 12, "cells": [ {"x":0,"y":0,"led":123}, ... ] }
// y = 0 is the TOP row. Until that file exists we fall back to a placeholder
// (led = y*cols + x) which will light the wrong holes on a real board.

export async function loadLayout() {
  try {
    const res = await fetch('layout.json');
    if (res.ok) {
      const { cols, rows, cells } = await res.json();
      const map = new Map(cells.map(c => [`${c.x},${c.y}`, c.led]));
      return { cols, rows, led: (x, y) => map.get(`${x},${y}`), placeholder: false };
    }
  } catch { /* fall through */ }
  const cols = 12, rows = 12;
  return { cols, rows, led: (x, y) => y * cols + x, placeholder: true };
}
