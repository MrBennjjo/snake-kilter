// Pure snake logic. No DOM, no Bluetooth.
// Palette: food is red; head cyan; body fades green -> blue.
const HEAD = [0, 255, 255];
const BODY_START = [0, 255, 0];
const BODY_END = [0, 64, 255];
const DIRS ={ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export class Snake {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.reset();
  }

  reset() {
    const cx = Math.floor(this.cols / 2), cy = Math.floor(this.rows / 2);
    this.body = [[cx, cy], [cx - 1, cy], [cx - 2, cy]]; // head first
    this.dir = 'right';
    this.queue = [];
    this.alive = true;
    this.score = 0;
    this.placeFood();
  }

  turn(dir) {
    // Ignore reversing into yourself; compare against the most recent pending turn
    // (or the current direction). Up to two turns can be buffered per tick so quick
    // inputs like up-then-left aren't lost or mis-evaluated.
    const ref = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    const [dx, dy] = DIRS[dir], [cx, cy] = DIRS[ref];
    if ((dx + cx === 0 && dy + cy === 0) || dir === ref || this.queue.length >= 2) return;
    this.queue.push(dir);
  }

  placeFood() {
    const free = [];
    for (let x = 0; x < this.cols; x++)
      for (let y = 0; y < this.rows; y++)
        if (!this.body.some(([bx, by]) => bx === x && by === y)) free.push([x, y]);
    this.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  tick() {
    if (!this.alive) return;
    if (this.queue.length) this.dir = this.queue.shift();
    const [dx, dy] = DIRS[this.dir];
    // Wrap around the edges (torus); only self-collision ends the game.
    const head = [
      (this.body[0][0] + dx + this.cols) % this.cols,
      (this.body[0][1] + dy + this.rows) % this.rows,
    ];
    const ate = this.food && head[0] === this.food[0] && head[1] === this.food[1];
    const tail = ate ? this.body : this.body.slice(0, -1); // tail moves away unless growing
    if (tail.some(([x, y]) => x === head[0] && y === head[1])) {
      this.alive = false;
      return;
    }
    this.body.unshift(head);
    if (ate) { this.score++; this.placeFood(); } else this.body.pop();
  }

  // Cells to draw: [{x, y, color: [r,g,b]}]
  frame() {
    const cells = [];
    if (this.food) cells.push({ x: this.food[0], y: this.food[1], color: [255, 0, 0] });
    const last = this.body.length - 1;
    this.body.forEach(([x, y], i) => {
      let color;
      if (!this.alive) color = [255, 0, 0];
      else if (i === 0) color = HEAD;
      else {
        // Fade from green (next to the head) to blue (tail tip). No reds, so food stays obvious.
        const t = last > 1 ? (i - 1) / (last - 1) : 0;
        color = BODY_START.map((c, k) => Math.round(c + (BODY_END[k] - c) * t));
      }
      cells.push({ x, y, color });
    });
    return cells;
  }
}
