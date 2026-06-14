// Generates media/icon.png — a 128x128 dark tile with a gold "slot" mark.
// No external deps: builds the PNG from a raw pixel buffer + zlib.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const S = 128;
const buf = Buffer.alloc(S * S * 4);

const bg = [13, 17, 23, 255]; // #0d1117
const gold = [245, 197, 24, 255]; // #f5c518
const dim = [33, 38, 45, 255];

function set(x, y, c) {
  const i = (y * S + x) * 4;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
  buf[i + 3] = c[3];
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let c = bg;
    // status-bar strip near the bottom
    if (y >= 96 && y <= 112) c = dim;
    // gold "sponsored slot" block sitting on the strip
    if (y >= 98 && y <= 110 && x >= 74 && x <= 110) c = gold;
    // a small credit dot to its left
    if (y >= 100 && y <= 108 && x >= 58 && x <= 66) c = gold;
    set(x, y, c);
  }
}

// PNG encoding
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// add filter byte (0) per scanline
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const idat = zlib.deflateSync(raw);
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(__dirname, "..", "media", "icon.png");
fs.writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
