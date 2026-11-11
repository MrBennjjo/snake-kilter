// Web Bluetooth driver for Kilter / Aurora boards (API level 2 and 3 LED packets).
// Protocol reconstructed from community reverse-engineering; verify against your board.
const ADV_SERVICE = '4488b571-7806-4df6-bcff-a2897e4953ff';
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

const BLE_CHUNK = 20;
const MAX_DATA = 241; // data bytes per packet (command + holds); fits the 1-byte length field

// Level 3: 3 bytes per hold - position low, position high, colour RRRGGGBB.
// Level 2: 2 bytes per hold - position low, then RRGGBB colour in the top 6 bits with
// position bits 8-9 in the bottom 2. Level-2 commands are the level-3 letters minus 4.
const FORMATS = {
  3: {
    cmd: { MIDDLE: 81, FIRST: 82, LAST: 83, ONLY: 84 }, // Q R S T
    encode: (led, [r, g, b]) => [led & 0xff, (led >> 8) & 0xff, ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6)],
    size: 3,
  },
  2: {
    cmd: { MIDDLE: 77, FIRST: 78, LAST: 79, ONLY: 80 }, // M N O P
    encode: (led, [r, g, b]) => [led & 0xff, ((led >> 8) & 0x03) | ((r >> 6) << 6) | ((g >> 6) << 4) | ((b >> 6) << 2)],
    size: 2,
  },
};

function buildPacket(fmt, command, leds) {
  const data = [command];
  for (const { led, color } of leds) data.push(...fmt.encode(led, color));
  const sum = data.reduce((a, b) => a + b, 0);
  return [0x01, data.length, (~sum) & 0xff, 0x02, ...data, 0x03];
}

export function buildMessages(leds, level = 3) {
  const fmt = FORMATS[level >= 3 ? 3 : 2];
  const perPacket = Math.floor((MAX_DATA - 1) / fmt.size); // 80 holds at level 3, 120 at level 2
  if (leds.length === 0) return [buildPacket(fmt, fmt.cmd.ONLY, [])];
  const groups = [];
  for (let i = 0; i < leds.length; i += perPacket) groups.push(leds.slice(i, i + perPacket));
  const { ONLY, FIRST, LAST, MIDDLE } = fmt.cmd;
  return groups.map((g, i) =>
    buildPacket(fmt, groups.length === 1 ? ONLY : i === 0 ? FIRST : i === groups.length - 1 ? LAST : MIDDLE, g));
}

// Board names look like "Kilter Board#1234@3". Per community docs: "@2" = API level 2
// (10-bit positions, 64 colours), "@3" = level 3, no suffix = level 2.
export function parseApiLevel(name = '') {
  const m = /@(\d+)$/.exec(name);
  return m ? Number(m[1]) : 2;
}

// "?api=2" or "?api=3" in the page URL overrides what the board name says.
function apiOverride() {
  const v = Number(new URLSearchParams(globalThis.location?.search ?? '').get('api'));
  return v === 2 || v === 3 ? v : null;
}

const ATTEMPTS = 4;

export class KilterBle {
  constructor(onChange, log = () => {}) {
    this.onChange = onChange; this.log = log; this.char = null; this.frames = 0;
    this.device = null; this.attaching = false; this.retryDelay = 1000;
  }

  get connected() { return !!this.char; }

  async connect() {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'Kilter' }, { services: [ADV_SERVICE] }],
      optionalServices: [UART_SERVICE, ADV_SERVICE],
    });
    const named = parseApiLevel(device.name), forced = apiOverride();
    this.level = forced ?? named;
    this.log(`Selected "${device.name}": API level ${this.level}` +
      (forced ? ` (forced by ?api=${forced}; name says ${named})` : ' (from name)'));
    if (this.device !== device) {
      this.device = device;
      device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
    }
    await this.attach();
  }

  // Android Chrome's first GATT connect often fails or drops straight away
  // (status 133 / "GATT Server is disconnected"), so retry with a growing pause.
  async attach() {
    this.attaching = true;
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          this.log(`Connecting GATT (attempt ${attempt}/${ATTEMPTS})...`);
          const server = await this.device.gatt.connect();
          const service = await server.getPrimaryService(UART_SERVICE);
          this.log('Got UART service');
          const char = await service.getCharacteristic(UART_TX);
          const p = char.properties;
          this.log(`TX characteristic: write=${p.write} writeWithoutResponse=${p.writeWithoutResponse}`);
          // Prefer acknowledged writes (as Climbdex does): un-acknowledged 20-byte chunks
          // can be dropped by the board, which garbles any message longer than one chunk.
          this.withResponse = p.write || !p.writeWithoutResponse;
          this.log(`Using ${this.withResponse ? 'acknowledged' : 'fast (unacknowledged)'} writes`);
          this.char = char;
          this.frames = 0;
          this.connectedAt = Date.now();
          this.log('Ready');
          this.onChange(this.device.name);
          return;
        } catch (e) {
          this.log(`Attempt ${attempt} failed: ${e.name}: ${e.message}`);
          try { this.device.gatt.disconnect(); } catch { /* already down */ }
          if (attempt >= ATTEMPTS) throw e;
          await new Promise(r => setTimeout(r, this.retryDelay * attempt));
        }
      }
    } finally { this.attaching = false; }
  }

  // An unexpected drop after a stable connection gets one automatic reconnect round.
  // If the board drops us within a few seconds, don't loop: that points at the board
  // rejecting us (or another phone grabbing it), so report it instead.
  async onDisconnect() {
    const wasConnected = !!this.char;
    this.char = null;
    if (this.attaching) return; // a failed attempt inside attach(); it handles retries
    const secs = wasConnected ? ((Date.now() - this.connectedAt) / 1000).toFixed(1) : 0;
    this.log(wasConnected ? `Disconnected after ${secs}s (${this.frames} frames sent)` : 'Disconnected');
    this.onChange();
    if (!wasConnected) return;
    if (secs < 5) { this.log('Dropped too quickly to retry automatically. Tap Connect board.'); return; }
    this.log('Trying to reconnect...');
    try { await this.attach(); } catch (e) { this.log(`Reconnect gave up: ${e.message}. Tap Connect board.`); }
  }

  // leds: [{led: <position>, color: [r,g,b]}]. Writes are serialised; stale frames are dropped.
  show(leds) {
    if (!this.char) return;
    this.pending = leds;
    if (this.sending) return;
    this.sending = true;
    (async () => {
      try {
        while (this.pending) {
          const frame = this.pending; this.pending = null;
          const t0 = performance.now();
          let chunks = 0;
          for (const msg of buildMessages(frame, this.level))
            for (let i = 0; i < msg.length; i += BLE_CHUNK, chunks++) {
              const chunk = new Uint8Array(msg.slice(i, i + BLE_CHUNK));
              if (this.withResponse) await this.char.writeValueWithResponse(chunk);
              else await this.char.writeValueWithoutResponse(chunk);
            }
          // Log the first few frames so the log shows what the board was actually sent.
          if (++this.frames <= 3)
            this.log(`Frame ${this.frames}: ${frame.length} LEDs in ${chunks} chunk(s), ${Math.round(performance.now() - t0)} ms`);
        }
      } catch (e) { console.error('BLE write failed', e); this.log(`BLE write failed: ${e.message}`); }
      this.sending = false;
    })();
  }
}
