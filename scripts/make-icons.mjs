// Draws the app icons into public/. Plain Node, no image libraries: iOS
// needs PNGs (it ignores SVG home-screen icons), and a hand-rolled encoder
// keeps the toolchain free of native binaries. Run with `npm run icons`.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [0x12, 0x14, 0x17]
const ACCENT = [0xf2, 0xa3, 0x3a]
const TEXT = [0xe8, 0xe6, 0xe3]

const DIGITS = {
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  3: ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
}

// Colour at a point in unit coordinates, before scaling for safe zones.
function paint(x, y) {
  // The wigwam: a dome sitting on y = 0.58, with two lattice bands and an
  // arched door cut out of it.
  const cx = 0.5
  const base = 0.58
  const r = 0.31
  const inDome = y <= base && (x - cx) ** 2 + (y - base) ** 2 <= r * r
  if (inDome) {
    const band = Math.abs(y - 0.39) < 0.011 || Math.abs(y - 0.48) < 0.011
    const doorTop = 0.49
    const inDoor =
      (Math.abs(x - cx) <= 0.06 && y >= doorTop) || (x - cx) ** 2 + (y - doorTop) ** 2 <= 0.06 ** 2
    return inDoor || band ? BG : ACCENT
  }

  // "531" in a 5x7 bitmap font underneath.
  const cell = 0.03
  const gap = 0.035
  const digitW = 5 * cell
  const top = 0.665
  const left = 0.5 - (3 * digitW + 2 * gap) / 2
  if (y >= top && y < top + 7 * cell) {
    const row = Math.floor((y - top) / cell)
    for (const [i, d] of ['5', '3', '1'].entries()) {
      const x0 = left + i * (digitW + gap)
      if (x >= x0 && x < x0 + digitW) {
        const col = Math.floor((x - x0) / cell)
        if (DIGITS[d][row]?.[col] === '1') return TEXT
      }
    }
  }
  return BG
}

// Supersample 4x4 per pixel so the dome edge is antialiased.
function render(size, scale) {
  const ss = 4
  const rows = []
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3) // leading 0 = PNG filter "none"
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (px + (sx + 0.5) / ss) / size
          const v = (py + (sy + 0.5) / ss) / size
          const c = paint(0.5 + (u - 0.5) / scale, 0.5 + (v - 0.5) / scale)
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const n = ss * ss
      row[1 + px * 3] = Math.round(r / n)
      row[2 + px * 3] = Math.round(g / n)
      row[3 + px * 3] = Math.round(b / n)
    }
    rows.push(row)
  }
  return encodePng(size, size, Buffer.concat(rows))
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT, { recursive: true })
const icons = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // Android crops maskable icons to a circle; keep the art inside it.
  ['icon-maskable-512.png', 512, 0.8],
  ['apple-touch-icon.png', 180, 1],
  ['favicon.png', 64, 1],
]
for (const [name, size, scale] of icons) {
  writeFileSync(join(OUT, name), render(size, scale))
  console.log(`wrote public/${name}`)
}
