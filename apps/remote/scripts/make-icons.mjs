// Generates the PWA icons (PNG) with built-in modules only: a TV remote control (light rounded body, red power button, D-pad with OK button, two rows of small keys) on the dark brand background.
// Run: npm run icons -w apps/remote
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [0x0b, 0x0b, 0x10];
const ACCENT = [0xe5, 0x09, 0x14];
const WHITE = [0xf2, 0xf2, 0xf5];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
/** Anti-aliased coverage by 4x4 supersampling. */
const coverage = (inside, u, v, px) => {
  let n = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (inside(u + ((i + 0.5) / 4 - 0.5) * px, v + ((j + 0.5) / 4 - 0.5) * px)) n++;
  return n / 16;
};

/** `scale` shrinks the mark so the maskable icon keeps it inside the safe zone (center 80%). */
function icon(size, { scale, rounded }) {
  const px = 1 / size;
  // TV remote: light rounded body, red power button, dark D-pad ring with a light OK button, 2x3 dark buttons.
  const circle = (cx, cy, r) => (u, v) => (u - 0.5 - cx * scale) ** 2 + (v - 0.5 - cy * scale) ** 2 <= (r * scale) ** 2;
  const body = (u, v) => {
    const hw = 0.18 * scale;
    const hh = 0.36 * scale;
    const r = 0.1 * scale;
    const dx = Math.max(Math.abs(u - 0.5) - (hw - r), 0);
    const dy = Math.max(Math.abs(v - 0.5) - (hh - r), 0);
    return dx * dx + dy * dy <= r * r;
  };
  const power = circle(0, -0.265, 0.05);
  const dpad = circle(0, -0.07, 0.125);
  const ok = circle(0, -0.07, 0.055);
  const keys = [];
  for (const cy of [0.145, 0.255]) for (const cx of [-0.098, 0, 0.098]) keys.push(circle(cx, cy, 0.036));
  const corner = (u, v) => {
    if (!rounded) return true;
    const r = 0.22;
    const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
    const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
    return dx * dx + dy * dy <= r * r;
  };
  return png(size, (u, v) => {
    const bgCover = coverage(corner, u, v, px);
    let c = BG;
    c = mix(c, WHITE, coverage(body, u, v, px));
    c = mix(c, ACCENT, coverage(power, u, v, px));
    c = mix(c, BG, coverage(dpad, u, v, px));
    c = mix(c, WHITE, coverage(ok, u, v, px));
    for (const k of keys) c = mix(c, BG, coverage(k, u, v, px));
    // Outside the rounded corners keep the background (PNG has no alpha here); fine for a dark icon.
    return bgCover < 1 ? mix(BG, c, bgCover) : c;
  });
}

const out = new URL('../public/', import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name, buf) => writeFileSync(new URL(name, out), buf);
write('icon-192.png', icon(192, { scale: 1, rounded: false }));
write('icon-512.png', icon(512, { scale: 1, rounded: false }));
write('icon-maskable-512.png', icon(512, { scale: 0.8, rounded: false }));
write('apple-touch-icon.png', icon(180, { scale: 1, rounded: false }));
console.log('Icons written to apps/remote/public');
