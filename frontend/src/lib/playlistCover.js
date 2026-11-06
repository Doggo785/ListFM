/** A playlist's cover: two albums cut apart by the site's ribbon, its shape drawn from the playlist's id. */

export const COVER_CELLS = 64;
const CELL_SIZE = 6; // Canvas pixels per ribbon cell: 192px and 128px on screen keep the cells whole.
export const COVER_SIZE = COVER_CELLS * CELL_SIZE;
const ALBUMS = 2;
const COLUMNS = 12;
const EDGE = 0.1; // Of the cover: how far the ribbon dissolves, as on the site.

// Parsed from text because PMD (Codacy) misreads hexadecimal literals as inaccurate.
const FNV_OFFSET = parseInt("811c9dc5", 16);
const FNV_PRIME = parseInt("01000193", 16);

/** A stable stream of numbers from 0 to 1 for an id: FNV-1a, then xorshift. */
function randomFrom(seed) {
  let hash = FNV_OFFSET;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, FNV_PRIME);
  }
  hash = hash >>> 0 || 1;
  return () => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    hash >>>= 0;
    return hash / 2 ** 32;
  };
}

// The site's dither (pixelRibbon.js), cell by cell.
const fract = (x) => x - Math.floor(x);
const b2 = (x, y) => {
  const [a, b] = [Math.floor(x), Math.floor(y)];
  return fract(a / 2 + b * b * 0.75);
};
const b4 = (x, y) => b2(0.5 * x, 0.5 * y) * 0.25 + b2(x, y);
const b8 = (x, y) => b4(0.5 * x, 0.5 * y) * 0.25 + b2(x, y);
const smooth = (t) => t * t * (3 - 2 * t);

/** Everything that differs between two covers: where the ribbon runs, how wide, how hot. */
export function coverShape(seed) {
  const random = randomFrom(seed);
  // Warm the stream up: ids that look alike must not start alike.
  for (let i = 0; i < 4; i++) random();
  const scale = 0.7 + random() * 0.65;
  const widths = Array.from({ length: COLUMNS }, () => (0.07 + random() * 0.09) * scale);
  const phases = [random() * 6.28, random() * 6.28, random() * 6.28];
  const tilt = (random() - 0.5) * 1.1;
  const height = 0.22 + random() * 0.56;
  return {
    heat: 2 + Math.floor(random() * 4),
    center: (s) =>
      height + tilt * (s - 0.5) + 0.1 * Math.sin(s * 5 + phases[0]) + 0.05 * Math.sin(s * 11 + phases[1]) + 0.025 * Math.sin(s * 23 + phases[2]),
    halfWidth: (s) => {
      const at = s * (COLUMNS - 1);
      const i = Math.min(COLUMNS - 2, Math.floor(at));
      return Math.max(0.06, widths[i] + (widths[i + 1] - widths[i]) * smooth(at - i) + 0.012 * (Math.sin(s * 9 + phases[0]) * 0.5 + Math.sin(s * 17 + phases[1]) * 0.25));
    },
  };
}

/** The ribbon's cells, each with its tone from 0 (dark edge) to 3 (hot core). The same formula as the site's ribbon. */
export function ribbonCells(shape) {
  const cells = [];
  for (let y = 0; y < COVER_CELLS; y++) {
    for (let x = 0; x < COVER_CELLS; x++) {
      const s = (x + 0.5) / COVER_CELLS;
      const depth = Math.min(1, Math.max(0, (shape.halfWidth(s) - Math.abs((y + 0.5) / COVER_CELLS - shape.center(s))) / EDGE));
      const tone = Math.floor(depth * 4 + b8(x, y));
      if (tone >= 1) cells.push({ x, y, tone: Math.min(tone, 4) - 1 });
    }
  }
  return cells;
}

/** The addresses to try for an album, best first: Last.fm doesn't have every size of every album. */
export function albumAddresses(url) {
  const sized = (size) => url.replace(/\/i\/u\/[^/]+\//, `/i/u/${size}/`);
  return [...new Set([sized("300x300"), sized("174s"), url])];
}

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous"; // Keeps the canvas exportable.
    image.referrerPolicy = "no-referrer";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

// Each album once, whichever covers show it. null = no size could load.
const pending = new Map();
const loaded = new Map();

function loadAlbum(url) {
  if (!pending.has(url)) {
    pending.set(
      url,
      (async () => {
        let image = null;
        for (const address of albumAddresses(url)) {
          image = await loadImage(address);
          if (image) break;
        }
        loaded.set(url, image);
        return image;
      })(),
    );
  }
  return pending.get(url);
}

/** The first two albums that load, without loading more than needed. */
export async function loadAlbums(urls = []) {
  const albums = [];
  for (const url of urls) {
    const album = await loadAlbum(url);
    if (album) albums.push(album);
    if (albums.length === ALBUMS) break;
  }
  return albums;
}

/** The same answer at once if those albums are already here, or null: a page opening with its cover drawn is what lets it glide. */
export function loadedAlbums(urls = []) {
  const albums = [];
  for (const url of urls) {
    if (!loaded.has(url)) return null;
    const album = loaded.get(url);
    if (album) albums.push(album);
    if (albums.length === ALBUMS) break;
  }
  return albums;
}

const SQUARE = (image) => {
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  return { side, left: (image.naturalWidth - side) / 2, top: (image.naturalHeight - side) / 2 };
};

function drawSlice(context, image, x, y, width, height) {
  const { side, left, top } = SQUARE(image);
  const ratio = side / COVER_SIZE;
  context.drawImage(image, left + x * ratio, top + y * ratio, width * ratio, height * ratio, x, y, width, height);
}

/** The tokens a canvas needs, since it can't read CSS variables itself. */
export function siteColors() {
  const styles = getComputedStyle(document.documentElement);
  const token = (name) => styles.getPropertyValue(name).trim();
  return { ground: token("--ink"), ember: Array.from({ length: 9 }, (_, i) => token(`--ember-${i + 1}`)) };
}

/** Paints a whole cover. With no album, the ribbon alone on the site's ground. */
export function drawCover(context, shape, albums, colors) {
  context.imageSmoothingQuality = "high";
  context.fillStyle = colors.ground;
  context.fillRect(0, 0, COVER_SIZE, COVER_SIZE);
  if (albums[0]) drawSlice(context, albums[0], 0, 0, COVER_SIZE, COVER_SIZE);
  if (albums[1]) {
    // Stepped with the ribbon's cells: the seam stays under the ribbon.
    for (let x = 0; x < COVER_CELLS; x++) {
      const line = Math.round(Math.min(1, Math.max(0, shape.center((x + 0.5) / COVER_CELLS))) * COVER_CELLS) * CELL_SIZE;
      drawSlice(context, albums[1], x * CELL_SIZE, line, CELL_SIZE, COVER_SIZE - line);
    }
  }
  const ramp = [colors.ember[0], colors.ember[1], colors.ember[2 + shape.heat], colors.ember[3 + shape.heat]];
  for (const { x, y, tone } of ribbonCells(shape)) {
    context.fillStyle = ramp[tone];
    context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }
}

/** A cover as a PNG file. It waits for its albums, which the one on screen may still be loading. */
export async function coverPng(seed, urls) {
  const canvas = Object.assign(document.createElement("canvas"), { width: COVER_SIZE, height: COVER_SIZE });
  drawCover(canvas.getContext("2d"), coverShape(seed), await loadAlbums(urls), siteColors());
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no cover"))), "image/png");
  });
}
