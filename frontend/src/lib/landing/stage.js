/**
 * The landing page's canvas: the ribbon's grid, dither and ramps.
 * Here the thread must be able to come apart: any of its pixels can leave it and fall, which the ribbon's shader can't do.
 * Every other page keeps the shader alone.
 */
import { dither, rgb } from "@/lib/forge";
import { CELL } from "@/lib/pixelRibbon";

const QUIET_MARGIN = 5;
const MAX_CRUMBS = 1400;

const pack = ([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;

/** What a cell's depth into the thread turns into, at each heat: the edge stays dark, the core heats up. */
const rampsFrom = (e) => [0, 1, 2, 3, 4, 5].map((heat) => [e[0], e[1], e[2 + heat], e[3 + heat], e[7], e[8]]);

export function createStage(canvas) {
  const css = getComputedStyle(document.documentElement);
  const token = (name) => pack(rgb(css.getPropertyValue(name)));
  const e = Array.from({ length: 9 }, (_, i) => token(`--ember-${i + 1}`));
  const cream = token("--text");
  const ink = token("--ink");
  const ramps = rampsFrom(e);
  const crumbTones = [e[7], e[6], e[5], e[3], e[1]];
  const context = canvas.getContext("2d");
  let W = 0;
  let H = 0;
  let image;
  let px;
  let quiet;
  let crumbs = [];

  const stage = {
    e,
    cream,
    ink,
    onResize: null,
    get W() { return W; },
    get H() { return H; },
  };

  const resize = () => {
    W = Math.ceil(window.innerWidth / CELL);
    H = Math.ceil(window.innerHeight / CELL);
    Object.assign(canvas, { width: W, height: H });
    canvas.style.width = `${W * CELL}px`;
    canvas.style.height = `${H * CELL}px`;
    image = context.createImageData(W, H);
    px = new Uint32Array(image.data.buffer);
    quiet = new Uint8Array(W * H);
    stage.onResize?.();
  };
  resize();
  window.addEventListener("resize", resize);

  const clearAround = (r) => {
    if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return;
    const x0 = Math.floor(r.left / CELL);
    const x1 = Math.ceil(r.right / CELL);
    const y0 = Math.floor(r.top / CELL);
    const y1 = Math.ceil(r.bottom / CELL);
    for (let y = Math.max(0, y0 - QUIET_MARGIN); y < Math.min(H, y1 + QUIET_MARGIN); y += 1) {
      for (let x = Math.max(0, x0 - QUIET_MARGIN); x < Math.min(W, x1 + QUIET_MARGIN); x += 1) {
        const distance = Math.max(x0 - x, x - x1, y0 - y, y - y1, 0);
        const value = distance === 0 ? 255 : 255 * (1 - distance / (QUIET_MARGIN + 1));
        const i = y * W + x;
        if (value > quiet[i]) quiet[i] = value;
      }
    }
  };

  /** Free unless it lies under text; around text the thread falls apart in dither. */
  const isFree = (i, x, y) => quiet[i] === 0 || quiet[i] <= dither(x, y) * 255;

  stage.begin = () => {
    px.fill(0);
    quiet.fill(0);
    for (const element of document.querySelectorAll("[data-quiet]")) clearAround(element.getBoundingClientRect());
  };

  stage.put = (x, y, color) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
    const i = cy * W + cx;
    if (isFree(i, cx, cy)) px[i] = color;
  };

  /** For what must show even on a quiet block: the fuse cutting a cover. */
  stage.mark = (x, y, color) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx >= 0 && cy >= 0 && cx < W && cy < H) px[cy * W + cx] = color;
  };

  /**
   * The ribbon's formula, column by column. `soft` is how many cells its edge dissolves over: past its half-width the core never
   * reaches its hottest tones, which is the site's sober ribbon. `blaze` lets a stretch go hotter, as under a playhead.
   */
  stage.thread = ({ from = 0, to = W, c, hw, heat: level = 1, blaze = 0, soft = 0.82 }) => {
    const stop = Math.min(W, Math.ceil(to));
    for (let x = Math.max(0, Math.floor(from)); x < stop; x += 1) {
      const half = hw(x);
      if (half <= 0.01) continue;
      const centre = c(x);
      const edge = Math.max(half * soft, 0.8);
      const ramp = ramps[level];
      const scale = 4 + 2 * (typeof blaze === "function" ? blaze(x) : blaze);
      const bottom = Math.min(H - 1, Math.ceil(centre + half + 1));
      for (let y = Math.max(0, Math.floor(centre - half - 1)); y <= bottom; y += 1) {
        const depth = Math.min(1, (half - Math.abs(y + 0.5 - centre)) / edge);
        if (depth <= 0) continue;
        const idx = Math.floor(depth * scale + dither(x, y));
        if (idx < 1) continue;
        const i = y * W + x;
        if (isFree(i, x, y)) px[i] = ramp[Math.min(idx, 6) - 1];
      }
    }
  };

  /** A pixel leaving the thread. It falls unless told otherwise, and goes dark on the way. */
  stage.crumb = (x, y, { vx = (Math.random() - 0.5) * 16, vy = Math.random() * 10, life = 0.5 + Math.random() * 0.7, g = 45 } = {}) => {
    if (crumbs.length < MAX_CRUMBS) crumbs.push({ x, y, vx, vy, life, age: 0, g });
  };

  stage.crumbs = (dt) => {
    crumbs = crumbs.filter((crumb) => {
      crumb.age += dt;
      if (crumb.age >= crumb.life) return false;
      crumb.vy += crumb.g * dt;
      crumb.x += crumb.vx * dt;
      crumb.y += crumb.vy * dt;
      const share = crumb.age / crumb.life;
      // It skips frames toward its end, so it blinks out rather than vanishing.
      if (share <= 0.7 || Math.random() >= (share - 0.7) * 2.5) stage.put(crumb.x, crumb.y, crumbTones[Math.floor(share * crumbTones.length)]);
      return true;
    });
  };

  /** Ink over a page rectangle in dither: k = 0 hides it all, k = 1 shows it all. With `until`, it hides what lies right of that column instead. */
  stage.veil = (rect, k = 0, until = null) => {
    const stopX = Math.min(W, Math.ceil(rect.right / CELL));
    const stopY = Math.min(H, Math.ceil(rect.bottom / CELL));
    for (let y = Math.max(0, Math.floor(rect.top / CELL)); y < stopY; y += 1) {
      for (let x = Math.max(0, Math.floor(rect.left / CELL)); x < stopX; x += 1) {
        if (until === null ? dither(x, y) >= k : x > until) px[y * W + x] = ink;
      }
    }
  };

  stage.end = () => context.putImageData(image, 0, 0);
  stage.destroy = () => window.removeEventListener("resize", resize);
  return stage;
}
