// Web Bluetooth driver for Kilter / Aurora boards (API level 3 LED packets).
// Protocol reconstructed from community reverse-engineering; verify against your board.
const ADV_SERVICE = '4488b571-7806-4df6-bcff-a2897e4953ff';
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

const CMD = { MIDDLE: 81, FIRST: 82, LAST: 83, ONLY: 84 };
const LEDS_PER_PACKET = 80; // 1 + 3*80 = 241 data bytes, fits the 1-byte length field
const BLE_CHUNK = 20;

// 3 bits red, 3 bits green, 2 bits blue.
const packColor = ([r, g, b]) => ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);

function buildPacket(command, leds) {
  const data = [command];
  for (const { led, color } of leds) data.push(led & 0xff, (led >> 8) & 0xff, packColor(color));
  const sum = data.reduce((a, b) => a + b, 0);
  return [0x01, data.length, (~sum) & 0xff, 0x02, ...data, 0x03];
}

export function buildMessages(leds) {
  if (leds.length === 0) return [buildPacket(CMD.ONLY, [])];
  const groups = [];
  for (let i = 0; i < leds.length; i += LEDS_PER_PACKET) groups.push(leds.slice(i, i + LEDS_PER_PACKET));
  return groups.map((g, i) => {
    const cmd = groups.length === 1 ? CMD.ONLY : i === 0 ? CMD.FIRST : i === groups.length - 1 ? CMD.LAST : CMD.MIDDLE;
    return buildPacket(cmd, g);
  });
}

// Board names look like "Kilter Board#1234@3". Per community docs: "@2" = API level 2
// (10-bit positions, 64 colours), "@3" = level 3, no suffix = level 2. We only speak level 3.
export function parseApiLevel(name = '') {
  const m = /@(\d+)$/.exec(name);
  return m ? Number(m[1]) : 2;
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
    const level = parseApiLevel(device.name);
    this.log(`Selected "${device.name}" (API level ${level})`);
    if (level !== 3) this.log(`WARNING: this app only speaks API level 3; LEDs may not work on level ${level}.`);
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
          for (const msg of buildMessages(frame))
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
