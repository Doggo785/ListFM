/** A playlist's cover: a dithered ember band, drawn from its id so each one stays its own. */

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export const COVER_CELLS = 16;
export const COVER_TONES = 9;

/** FNV-1a then a final mix, so ids that look alike still get unrelated covers: four stable bytes. */
function seedBytes(text) {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  hash >>>= 0;
  return [hash & 255, (hash >>> 8) & 255, (hash >>> 16) & 255, hash >>> 24];
}

/** One SVG path per ember tone, in cells. An empty string is a tone the cover doesn't use. */
export function coverPaths(seed) {
  const [a, b, c, d] = seedBytes(seed);
  const phase = a / 40;
  const slope = (b - 128) / 110;
  const spread = 3 + (c % 4);
  const tone = 2 + (d % 3);
  const paths = Array(COVER_TONES).fill("");
  for (let y = 0; y < COVER_CELLS; y++) {
    for (let x = 0; x < COVER_CELLS; x++) {
      const middle = COVER_CELLS / 2 + slope * (x - COVER_CELLS / 2) + 3 * Math.sin(x / 3 + phase);
      const depth = 1 - Math.abs(y - middle) / spread;
      if (depth <= 0 || depth * 16 < BAYER[y % 4][x % 4]) continue;
      paths[Math.min(COVER_TONES - 1, tone + Math.floor(depth * 6))] += `M${x} ${y}h1v1h-1z`;
    }
  }
  return paths;
}
