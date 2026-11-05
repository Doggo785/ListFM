import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const COVER_MS = 160;
const REVEAL_MS = 280;
const EMBERS = [4, 5, 6, 7, 8, 9];
// Tiny5 is drawn on an 8-pixel grid: these cells land on the digits' own pixels.
const FONT_GRID = 8;

const format = (value, separator) => Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value).replace(/,/g, separator);

function shuffled(count) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** A number whose digits are hidden by pixels popping up at random, which then leave one by one on the new value. */
export default function PixelNumber({ value, separator = "," }) {
  const text = format(value, separator);
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState(text);
  const box = useRef(null);
  const canvas = useRef(null);
  const run = useRef({ frame: 0, covering: false, filled: 0, order: [], cols: 0, colors: [] });
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
        ctx.fillRect(state.order[i] % state.cols, Math.floor(state.order[i] / state.cols), 1, 1);
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
        // Swapped under full cover; the layout effect then re-covers the new width and reveals.
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
    const cell = Math.max(2, parseFloat(getComputedStyle(box.current).fontSize) / FONT_GRID);
    state.cols = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    Object.assign(canvas.current, { width: state.cols, height: rows });
    Object.assign(canvas.current.style, { width: `${state.cols * cell}px`, height: `${rows * cell}px` });
    const styles = getComputedStyle(document.documentElement);
    state.colors = EMBERS.map((n) => styles.getPropertyValue(`--ember-${n}`));
    state.order = shuffled(state.cols * rows);
    state.filled = state.order.length;
    state.covering = false;
    animate();
    return () => window.cancelAnimationFrame(state.frame);
  }, [shown, reducedMotion, animate]);

  useEffect(() => {
    if (reducedMotion || text === shown) return;
    run.current.covering = true;
    animate();
  }, [text, shown, reducedMotion, animate]);

  return (
    <span ref={box} className="relative inline-block">
      {reducedMotion ? text : shown}
      {!reducedMotion && <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 [image-rendering:pixelated]" />}
    </span>
  );
}
