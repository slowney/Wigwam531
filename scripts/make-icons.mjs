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

// The mark, in unit coordinates. Shared shapes with src/ui/Mark.tsx: keep
// the two in step when either changes.
const DOME = { cx: 0.5, base: 0.6, r: 0.31 }
const BANDS = [0.41, 0.5]
const DOOR = { half: 0.06, top: 0.51 }
const BAR = { y0: 0.645, y1: 0.675, x0: 0.175, x1: 0.825 }
// Plates: [x0, x1, y0, y1] for the left side; the right mirrors them.
const PLATES = [
  [0.115, 0.175, 0.51, 0.81],
  [0.19, 0.235, 0.555, 0.765],
]
const GAP = 0.018
const LIFT = 0.035

const inRect = (x, y, [x0, x1, y0, y1], pad = 0) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad
const mirror = ([x0, x1, y0, y1]) => [1 - x1, 1 - x0, y0, y1]

// Colour at a point in unit coordinates, before scaling for safe zones.
function paint(x, rawY) {
  // The drawing sits a touch low in its box; lift it to the optical centre.
  const y = rawY + LIFT
  // A loaded barbell across the front of the wigwam. Plates get a thin gap
  // of background around them, so they stand clear of the dome.
  const plates = PLATES.flatMap((p) => [p, mirror(p)])
  if (plates.some((p) => inRect(x, y, p))) return TEXT
  if (plates.some((p) => inRect(x, y, p, GAP))) return BG
  if (y >= BAR.y0 && y <= BAR.y1 && x >= BAR.x0 && x <= BAR.x1) return TEXT

  // The wigwam: a dome on its base line, two lattice bands, an arched door.
  const { cx, base, r } = DOME
  const inDome = y <= base && (x - cx) ** 2 + (y - base) ** 2 <= r * r
  if (inDome) {
    const band = BANDS.some((b) => Math.abs(y - b) < 0.011)
    const inDoor =
      (Math.abs(x - cx) <= DOOR.half && y >= DOOR.top) || (x - cx) ** 2 + (y - DOOR.top) ** 2 <= DOOR.half ** 2
    return inDoor || band ? BG : ACCENT
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
