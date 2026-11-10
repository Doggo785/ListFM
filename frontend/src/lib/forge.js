/**
 * The Dashboard's forged name: a small fire simulation over the letters' pixels.
 * The letters near the fire take its heat, and it climbs one row per tick from them: flames rise off their tops.
 * The first pass soaks the letters from cold iron to their cream; each later one drives them back down to red and up again.
 */

const TICK_SECONDS = 1 / 60;
const MAX_TICKS_PER_FRAME = 3;
const COOLING = 0.978;
const COOLING_NOISE = 0.03;
const SOURCE_REACH = 12; // Cells on each side of the playhead.
const CONTACT_GLOW = 0.9; // A letter being soaked glows at most this far up its ramp from heat alone: only the soak reaches cream.
const SOAK_SECONDS = 1.05;
const SOAK_CLIMB_SECONDS = 0.5; // From a letter's foot to its top.
const SOAK_JITTER_SECONDS = 0.14;
const FLAME_FROM = 0.2; // Heat under this stays inside the letters.
const FLAME_FULL = 0.6; // A flame's top tone from here on.
const BURN_FROM = 0.05;
const STILL = 0.012;
const BURST_EVERY_SECONDS = 0.035;
const LICK_SECONDS = 1.3;
const LICK_STRENGTH = 0.8;
const LICK_RED = 0.22; // How far down the soak a later flame drives a letter.
const LICK_DROP_SECONDS = 0.22;

// An 8x8 ordered dither, the same family as the ribbon's.
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map((n) => n / 64);
export const dither = (x, y) => BAYER[(y % 8) * 8 + (x % 8)];

/** The names that finished burning in this page load: the slow burn is for the first look. */
export const forgedNames = new Set();

/** Parsed from "#rrggbb" to [r, g, b]. */
export const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.trim().slice(1 + i, 3 + i), 16));

/** From cold to the letters' resting colour, then the same in reverse for a lick on a hot letter, then the free flame. */
export function forgeRamps(ember, cream) {
  const c = ember.map(rgb);
  const white = rgb(cream);
  return {
    soak: [c[1], c[2], c[3], c[4], c[6], c[7], c[8], white],
    burn: [white, c[8], c[7], c[5], c[3], c[2]],
    flame: [c[1], c[3], c[5], c[7], c[8]],
  };
}

/** One tick of fire: each cell takes from the row below it, drifting a little sideways, and cools. */
export function stepFire(heat, width, height, random = Math.random) {
  for (let y = 0; y < height - 1; y += 1) {
    const here = y * width;
    const below = here + width;
    for (let x = 0; x < width; x += 1) {
      const drift = Math.floor(random() * 3) - 1;
      const left = heat[below + Math.max(0, x - 1)];
      const under = heat[below + Math.min(width - 1, Math.max(0, x + drift))];
      const right = heat[below + Math.min(width - 1, x + 1)];
      const next = ((left + 2 * under + right) / 4) * COOLING - random() * COOLING_NOISE;
      heat[here + x] = next > 0 ? next : 0;
    }
  }
  const floor = (height - 1) * width;
  for (let x = 0; x < width; x += 1) heat[floor + x] *= COOLING;
}

/** The letters as a grid of cells, 1 where a cell is inked. */
export function letterMask(text, font, width, height, baseline) {
  const page = document.createElement("canvas");
  Object.assign(page, { width, height });
  const context = page.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.font = font;
  context.fillText(text, 0, baseline);
  const { data } = context.getImageData(0, 0, width, height);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  return mask;
}

function paint(pixels, i, color) {
  pixels[i * 4] = color[0];
  pixels[i * 4 + 1] = color[1];
  pixels[i * 4 + 2] = color[2];
  pixels[i * 4 + 3] = 255;
}

/**
 * Draws one state of the fire. `soak` is null once the letters have reached their cream.
 * Cells of a settled letter with no heat are left clear: the page's own text shows there, sharp and selectable.
 */
export function drawFire(pixels, { width, height, mask, heat, soak, ramps }) {
  pixels.fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const h = heat[i];
      const d = dither(x, y);
      if (mask[i]) {
        if (soak && soak[i] < 1) {
          const value = Math.max(soak[i], h * CONTACT_GLOW);
          paint(pixels, i, ramps.soak[Math.min(ramps.soak.length - 1, Math.floor(value * (ramps.soak.length - 1) + d))]);
        } else if (h > BURN_FROM) {
          const tone = Math.min(ramps.burn.length - 1, Math.floor(h * ramps.burn.length + d));
          paint(pixels, i, ramps.burn[tone]);
        } else if (soak) {
          paint(pixels, i, ramps.burn[0]); // Done, but the page's text under it is still cold.
        }
      } else if (h > FLAME_FROM) {
        const tone = Math.floor(((h - FLAME_FROM) / (FLAME_FULL - FLAME_FROM)) * ramps.flame.length + d - 0.3);
        if (tone >= 0) paint(pixels, i, ramps.flame[Math.min(ramps.flame.length - 1, tone)]);
      }
    }
  }
}

/**
 * The forge on a canvas sized in cells. `headX(seconds)` says where the playhead is, in cells of this
 * canvas, that many seconds after it left; `onSpark(x, y)` gets a cell a spark leaves from.
 */
export function createForge({ context, width, height, mask, ramps, headX, sweepSeconds, soaked = false, onSpark, onCream, onIdle, random = Math.random }) {
  const heat = new Float32Array(width * height);
  const reached = new Float32Array(width).fill(Number.POSITIVE_INFINITY);
  const jitter = Float32Array.from({ length: width * height }, () => random() * SOAK_JITTER_SECONDS);
  const lowestRow = new Int16Array(width);
  const topRow = new Int16Array(width).fill(height);
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    lowestRow[x] = Math.max(lowestRow[x], y);
    topRow[x] = Math.min(topRow[x], y);
  }
  const image = context.createImageData(width, height);
  let soak = soaked ? null : new Float32Array(width * height);
  let seconds = 0;
  let sweep = 0; // Seconds left to feed the fire from the playhead.
  let lick = -1;
  let forged = soaked;
  let carry = 0;
  let sparkWait = 0;

  const feed = (centre, strength) => {
    for (let x = Math.max(0, centre - SOURCE_REACH); x <= Math.min(width - 1, centre + SOURCE_REACH); x += 1) {
      const share = 1 - Math.abs(x - centre) / (SOURCE_REACH + 1);
      for (let y = 0; y < height; y += 1) {
        const i = y * width + x;
        if (mask[i]) heat[i] = Math.max(heat[i], strength * share * (0.6 + random() * 0.4));
      }
    }
  };

  const licked = (since) => {
    if (since <= 0) return 1;
    if (since < LICK_DROP_SECONDS) return 1 - (1 - LICK_RED) * (since / LICK_DROP_SECONDS);
    return Math.min(1, LICK_RED + ((since - LICK_DROP_SECONDS) / SOAK_SECONDS) * (1 - LICK_RED));
  };

  const soakLetters = () => {
    let done = true;
    for (let i = 0; i < soak.length; i += 1) {
      if (!mask[i]) continue;
      const x = i % width;
      const climb = ((lowestRow[x] - Math.floor(i / width)) / Math.max(1, lowestRow[x] - topRow[x] + 1)) * SOAK_CLIMB_SECONDS;
      const since = seconds - reached[x] - climb - jitter[i];
      if (forged) soak[i] = licked(since);
      else if (since > 0) soak[i] = Math.min(1, since / SOAK_SECONDS);
      if (soak[i] < 1) done = false;
    }
    return done;
  };

  /** The fire at this cell: it heats the letters there, marks them reached, and sends sparks up. */
  const pass = (cell, strength, last) => {
    feed(cell, strength);
    for (let x = 0; x <= last; x += 1) reached[x] = Math.min(reached[x], seconds);
    sparkWait -= TICK_SECONDS;
    if (sparkWait <= 0 && cell >= 0 && cell < width) {
      sparkWait = BURST_EVERY_SECONDS;
      const x = Math.min(width - 1, Math.max(0, cell + Math.floor((random() - 0.5) * 2 * SOURCE_REACH)));
      onSpark?.(x, topRow[x] < height ? topRow[x] : height - 1);
    }
  };

  const tick = () => {
    seconds += TICK_SECONDS;
    if (sweep > 0) {
      sweep -= TICK_SECONDS;
      const cell = Math.round(headX(seconds));
      // Once the sweep is over every letter has been reached, even if the page scrolled the playhead away from them.
      pass(cell, 1, sweep <= 0 ? width - 1 : Math.min(width - 1, cell));
    }
    if (lick >= 0) {
      lick += TICK_SECONDS;
      const cell = Math.round((lick / LICK_SECONDS) * (width + 2 * SOURCE_REACH)) - SOURCE_REACH;
      pass(cell, LICK_STRENGTH, Math.min(width - 1, cell));
      if (lick >= LICK_SECONDS) lick = -1;
    }
    stepFire(heat, width, height, random);
    if (soak && soakLetters() && sweep <= 0 && lick < 0) {
      soak = null;
      if (!forged) onCream?.();
      forged = true;
    }
  };

  const isStill = () => !soak && sweep <= 0 && lick < 0 && !heat.some((h) => h > STILL);

  return {
    ignite() {
      seconds = 0;
      sweep = sweepSeconds;
    },
    /** A later flame. It waits for the letters to be back in their cream: one that crosses still-red ones would not show. */
    lick() {
      if (soak) return;
      soak = new Float32Array(width * height).fill(1);
      reached.fill(Number.POSITIVE_INFINITY);
      lick = 0;
    },
    /** Advances by this many seconds and draws. Returns false once there is nothing left to draw. */
    frame(dt) {
      carry += dt;
      let ticks = 0;
      while (carry >= TICK_SECONDS && ticks < MAX_TICKS_PER_FRAME) {
        tick();
        carry -= TICK_SECONDS;
        ticks += 1;
      }
      if (ticks === MAX_TICKS_PER_FRAME) carry = 0;
      if (isStill()) {
        image.data.fill(0);
        context.putImageData(image, 0, 0);
        onIdle?.();
        return false;
      }
      drawFire(image.data, { width, height, mask, heat, soak, ramps });
      context.putImageData(image, 0, 0);
      return true;
    },
    /** For the tests and for a page that wants to know if the letters are done. */
    get isCream() {
      return !soak;
    },
  };
}
