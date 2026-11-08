import { Snake } from './game.js';
import { KilterBle } from './ble.js';
import { loadLayout } from './layout.js';

const $ = id => document.getElementById(id);
const layout = await loadLayout();
const game = new Snake(layout.cols, layout.rows);
const status = $('status');
const canvas = $('sim');
const ctx = canvas.getContext('2d');
const CELL = 20;
canvas.width = layout.cols * CELL;
canvas.height = layout.rows * CELL;

const logEl = $('log');
function log(msg) {
  logEl.textContent += `${new Date().toLocaleTimeString()} ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}
addEventListener('error', e => log(`Error: ${e.message}`));
addEventListener('unhandledrejection', e => log(`Error: ${e.reason?.message ?? e.reason}`));
log(layout.placeholder ? 'Using PLACEHOLDER layout (no layout.json)' : `Layout loaded: ${layout.cols}x${layout.rows}`);
if (!navigator.bluetooth) log('Web Bluetooth not available (use Chrome on Android, over https)');

const ble = new KilterBle(name => {
  status.textContent = ble.connected ? `Connected: ${name}` : 'Disconnected (simulator only)';
}, log);

// Draw cells on the simulator canvas and push them to the board.
function draw(cells) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const { x, y, color } of cells) {
    ctx.fillStyle = `rgb(${color})`;
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
  }
  const leds = cells.map(c => ({ led: layout.led(c.x, c.y), color: c.color })).filter(l => l.led !== undefined);
  ble.show(leds);
}

function render() {
  draw(game.frame());
  $('score').textContent = `Score: ${game.score}${game.alive ? '' : ' — game over'}`;
}

// Hardware check: corners in distinct colours (orientation/mapping), then a row sweep.
const sleep = ms => new Promise(r => setTimeout(r, ms));
let patternRunning = false;
async function testPattern() {
  if (patternRunning) return;
  patternRunning = true;
  clearInterval(timer);
  log('Test pattern: corners (TL white, TR green, BL blue, BR magenta)');
  const { cols, rows } = layout;
  draw([
    { x: 0, y: 0, color: [255, 255, 255] }, { x: cols - 1, y: 0, color: [0, 255, 0] },
    { x: 0, y: rows - 1, color: [0, 0, 255] }, { x: cols - 1, y: rows - 1, color: [255, 0, 255] },
  ]);
  await sleep(4000);
  log('Test pattern: row sweep, top to bottom');
  for (let y = 0; y < rows; y++) {
    draw(Array.from({ length: cols }, (_, x) => ({ x, y, color: [0, 255, 255] })));
    await sleep(250);
  }
  draw([]);
  log('Test pattern done. Press "New game" to play.');
  patternRunning = false;
}

let timer;
function start() {
  if (patternRunning) return;
  clearInterval(timer);
  game.reset();
  render();
  timer = setInterval(() => {
    game.tick();
    render();
    if (!game.alive) clearInterval(timer);
  }, 250);
}

$('connect').onclick = async () => {
  try { await ble.connect(); render(); }
  catch (e) { status.textContent = `Connect failed: ${e.message}`; log(`Connect failed: ${e.message}`); }
};
$('restart').onclick = start;
$('pattern').onclick = testPattern;
for (const b of document.querySelectorAll('#pad button'))
  b.addEventListener('pointerdown', () => game.turn(b.dataset.dir));
addEventListener('keydown', e => {
  const d = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (d) { e.preventDefault(); game.turn(d); }
});

if (layout.placeholder) status.textContent += ' — placeholder LED layout';
if (!navigator.bluetooth) $('connect').disabled = true;
start();
