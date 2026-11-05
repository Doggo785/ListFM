import { useReducedMotion } from "motion/react";
import { MARGIN, coverCells } from "@/lib/pixelCover";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const COVER_MS = 160;
const REVEAL_MS = 280;
const EMBERS = [4, 5, 6, 7, 8, 9];
// Tiny5 is drawn on an 8-pixel grid: these cells land on the digits' own pixels.
const FONT_GRID = 8;

const format = (value, separator) => Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value).replace(/,/g, separator);

function shuffled(items) {
  const order = [...items];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Which grid cells the text inks, read from a hidden drawing of it at its place in the box. */
function inkedCells(text, font, width, height, cell) {
  const page = document.createElement("canvas");
  Object.assign(page, { width: Math.ceil(width), height: Math.ceil(height) });
  const ctx = page.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.font = font;
  const { fontBoundingBoxAscent: ascent = 0, fontBoundingBoxDescent: descent = 0 } = ctx.measureText(text);
  ctx.fillText(text, 0, (height - (ascent + descent)) / 2 + ascent);
  const { data } = ctx.getImageData(0, 0, page.width, page.height);
  const inked = new Set();
  for (let y = 0; y < page.height; y += 1) {
    for (let x = 0; x < page.width; x += 1) {
      if (data[(y * page.width + x) * 4 + 3] > 64) inked.add(`${Math.floor(x / cell)},${Math.floor(y / cell)}`);
    }
  }
  return [...inked].map((key) => key.split(",").map(Number));
}

/** A number whose digits are hidden by pixels popping up at random, which then leave one by one on the new value. */
export default function PixelNumber({ value, separator = "," }) {
  const text = format(value, separator);
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState(text);
  const box = useRef(null);
  const canvas = useRef(null);
  const run = useRef({ frame: 0, covering: false, filled: 0, order: [], own: [], colors: [] });
  const latest = useRef(text);

  const animate = useCallback(() => {
    const state = run.current;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return setShown(latest.current);
    window.cancelAnimationFrame(state.frame);
    const draw = () => {
      ctx.clearRect(0, 0, canvas.current.width, canvas.current.height);
      for (let i = 0; i < Math.floor(state.filled); i += 1) {
        ctx.fillStyle = state.colors[i % state.colors.length];
        ctx.fillRect(state.order[i][0] + MARGIN, state.order[i][1] + MARGIN, 1, 1);
      }
    };
    // Now, not on the next frame: resizing just emptied the canvas, and the new digits would flash.
    draw();
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.max(0, now - last);
      last = now;
      const total = state.order.length;
      state.filled += state.covering ? (dt / COVER_MS) * total : -(dt / REVEAL_MS) * total;
      state.filled = Math.max(0, Math.min(total, state.filled));
      draw();
      if (state.covering && state.filled === total) {
        state.covering = false;
        // Swapped under full cover; the layout effect then covers the new digits and reveals.
        setShown(latest.current);
      }
      if (state.covering || state.filled > 0) state.frame = window.requestAnimationFrame(frame);
    };
    state.frame = window.requestAnimationFrame(frame);
    return undefined;
  }, []);

  useLayoutEffect(() => {
    latest.current = text;
  }, [text]);

  // A new value, and the first one too, starts fully covered and reveals itself.
  useLayoutEffect(() => {
    const state = run.current;
    if (reducedMotion || !canvas.current) return undefined;
    const { width, height } = box.current.getBoundingClientRect();
    const styles = getComputedStyle(box.current);
    const cell = Math.max(2, parseFloat(styles.fontSize) / FONT_GRID);
    const cols = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    state.own = coverCells(inkedCells(shown, `${styles.fontSize} ${styles.fontFamily}`, width, height, cell), cols, rows);
    // The old number's pixels stay for the reveal too: dropping them at the swap would pop.
    const seen = new Set();
    const cells = [...state.order, ...state.own].filter(([x, y]) => {
      const key = `${x},${y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    state.order = shuffled(cells);
    state.filled = state.order.length;
    state.covering = false;
    const across = Math.max(cols, ...cells.map(([x]) => x + 1)) + 2 * MARGIN;
    const down = Math.max(rows, ...cells.map(([, y]) => y + 1)) + 2 * MARGIN;
    Object.assign(canvas.current, { width: across, height: down });
    Object.assign(canvas.current.style, { width: `${across * cell}px`, height: `${down * cell}px`, left: `${-MARGIN * cell}px`, top: `${-MARGIN * cell}px` });
    const root = getComputedStyle(document.documentElement);
    state.colors = EMBERS.map((n) => root.getPropertyValue(`--ember-${n}`));
    animate();
    return () => window.cancelAnimationFrame(state.frame);
  }, [shown, reducedMotion, animate]);

  useEffect(() => {
    if (reducedMotion || text === shown) return;
    const state = run.current;
    // From rest, cover only this number; mid-reveal, the cloud still out just fills back in.
    if (state.filled === 0) state.order = shuffled(state.own);
    state.covering = true;
    animate();
  }, [text, shown, reducedMotion, animate]);

  return (
    <span ref={box} className="relative inline-block">
      {reducedMotion ? text : shown}
      {!reducedMotion && <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute [image-rendering:pixelated]" />}
    </span>
  );
}
