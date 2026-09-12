// Generates PWA icons (192 & 512) for the recipe app: orange rounded square,
// white plate ring + three steam strokes. Pure Node (zlib), no dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const BG = [217, 98, 43];      // #d9622b (app theme color)
const FG = [255, 255, 255];    // white

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// SDF coverage: d is the signed distance (negative = inside the shape).
function cov(d) {
  const x = d / 1.2;
  return Math.min(1, Math.max(0, 0.5 - x));
}

function render(size) {
  const s = size / 512;
  const cx = 256, cy = 312;        // plate center
  const R = 150, rin = 96;         // plate outer / inner radius
  const rr = 100;                  // rounded-corner radius
  const steam = [
    [168, 105, 195, 20],
    [256, 120, 210, 20],
    [344, 105, 195, 20],
  ];
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x / s, py = y / s;
      // rounded square mask (negative inside)
      const qx = Math.abs(px - 256) - (256 - rr);
      const qy = Math.abs(py - 256) - (256 - rr);
      const dRound = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
      if (dRound > 1.5) continue;
      let alpha = cov(dRound);
      let col = BG;
      // plate ring: white between R and rin
      const dp = Math.hypot(px - cx, py - cy);
      const inPlate = cov(dp - R) * (1 - cov(dp - rin));
      // steam strokes: three vertical capsules
      let inSteam = 0;
      for (const [sx, sy0, sy1, w] of steam) {
        const dx = Math.abs(px - sx) - w / 2;
        const dy = Math.max(sy0 - py, py - sy1, 0);
        const dCap = Math.hypot(Math.max(dx, 0), dy);
        inSteam = Math.max(inSteam, cov(dCap));
      }
      const t = Math.min(1, inPlate + inSteam);
      if (t > 0) {
        col = [
          Math.round(BG[0] + (FG[0] - BG[0]) * t),
          Math.round(BG[1] + (FG[1] - BG[1]) * t),
          Math.round(BG[2] + (FG[2] - BG[2]) * t),
        ];
      }
      const i = (y * size + x) * 4;
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePNG(size, rgba);
}

mkdirSync(OUT, { recursive: true });
for (const sz of [192, 512]) {
  writeFileSync(join(OUT, `icon-${sz}.png`), render(sz));
  console.log(`wrote icons/icon-${sz}.png`);
}
