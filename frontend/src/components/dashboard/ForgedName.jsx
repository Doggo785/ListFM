import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CELL, ribbonStage } from "@/lib/pixelRibbon";
import { createForge, forgeRamps, letterMask } from "@/lib/forge";
import { SWEEP_SECONDS } from "@/lib/ribbonTrack";

// Tiny5's pixels land on the 4px grid at these sizes only.
const SIZES = [320, 288, 256, 224, 192, 160, 128, 96, 64, 32];
const HEIGHT_SHARE = 0.3; // Of the viewport at most: the poster keeps its other rows in view.
const LINE_HEIGHT = 0.8;
const FLAME_ROOM = 96; // CSS pixels above the letters for the flames to rise into.
const LICK_EVERY_MS = [14000, 26000];

// The name that finished burning in this page load: the slow burn is for the first look, coming back it starts from cream.
let forgedName = null;

/** The largest size that fits, or null when even the smallest doesn't. */
function fitSize(name, family, width, viewportHeight) {
  const page = document.createElement("canvas").getContext("2d");
  if (!page) return SIZES.at(-1);
  page.font = `${SIZES.at(-1)}px ${family}`;
  if (page.measureText(name).width > width) return null;
  return SIZES.find((size) => {
    page.font = `${size}px ${family}`;
    return page.measureText(name).width <= width && size * LINE_HEIGHT <= viewportHeight * HEIGHT_SHARE;
  }) ?? SIZES.at(-1);
}

/** The artist's name as large as it fits. It catches fire from the ribbon's playhead, and flames still cross it now and then. */
export default function ForgedName({ name, reducedMotion }) {
  const box = useRef(null);
  const canvas = useRef(null);
  const [size, setSize] = useState(SIZES.at(-1));
  const [cold, setCold] = useState(!reducedMotion && forgedName !== name);
  const cut = size === null; // Too long even at the smallest size: plain, and shortened.

  useLayoutEffect(() => {
    const fit = () => {
      const family = getComputedStyle(box.current).fontFamily;
      setSize(fitSize(name, family, box.current.parentElement.clientWidth, window.innerHeight));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box.current.parentElement);
    document.fonts?.ready.then(() => box.current && fit());
    return () => observer.disconnect();
  }, [name]);

  useEffect(() => {
    if (reducedMotion || cut) return undefined;
    let frameId = 0;
    let lickTimer = 0;
    let stopped = false;
    let running = false;
    const start = () => {
      const element = canvas.current;
      const style = getComputedStyle(box.current);
      const rect = box.current.getBoundingClientRect();
      const width = Math.ceil(rect.width / CELL);
      const height = Math.ceil((rect.height + FLAME_ROOM) / CELL);
      Object.assign(element, { width, height });
      const context = element.getContext("2d");
      const measure = document.createElement("canvas").getContext("2d");
      if (!context || !measure) {
        setCold(false);
        return;
      }
      const font = `${size / CELL}px ${style.fontFamily}`;
      measure.font = font;
      const { fontBoundingBoxAscent: ascent = 0, fontBoundingBoxDescent: descent = 0 } = measure.measureText(name);
      const baseline = FLAME_ROOM / CELL + (rect.height / CELL - (ascent + descent)) / 2 + ascent;
      const mask = letterMask(name, font, width, height, baseline);
      if (!mask) {
        setCold(false);
        return;
      }
      const root = getComputedStyle(document.documentElement);
      const ember = Array.from({ length: 9 }, (_, i) => root.getPropertyValue(`--ember-${i + 1}`));
      const instance = createForge({
        context,
        width,
        height,
        mask,
        ramps: forgeRamps(ember, root.getPropertyValue("--text")),
        sweepSeconds: SWEEP_SECONDS,
        soaked: forgedName === name,
        // The ribbon's own playhead, so the letter catches as the flame passes under it.
        headX: () => ((ribbonStage.track?.head ?? 0) - box.current.getBoundingClientRect().left) / CELL,
        onSpark: (x, y) => {
          const here = element.getBoundingClientRect();
          ribbonStage.burst(here.left + x * CELL, here.top + y * CELL);
        },
        // Now, not on the next render: the canvas stops painting these letters in this very frame.
        onCream: () => {
          forgedName = name;
          flushSync(() => setCold(false));
        },
        onIdle: () => {
          element.style.visibility = "hidden";
        },
      });
      if (forgedName === name) instance.lick();
      else instance.ignite();
      let last = performance.now();
      const frame = (now) => {
        if (stopped) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        running = instance.frame(dt);
        if (running) frameId = window.requestAnimationFrame(frame);
      };
      const wake = () => {
        element.style.visibility = "visible";
        if (running) return;
        running = true;
        last = performance.now();
        frameId = window.requestAnimationFrame(frame);
      };
      wake();
      const scheduleLick = () => {
        const [low, high] = LICK_EVERY_MS;
        lickTimer = setTimeout(() => {
          const here = box.current?.getBoundingClientRect();
          if (here && !document.hidden && here.bottom > 0) {
            instance.lick();
            wake();
          }
          scheduleLick();
        }, low + Math.random() * (high - low));
      };
      scheduleLick();
    };
    if (document.fonts?.load) document.fonts.load(`${size}px Tiny5`).then(() => !stopped && start(), () => !stopped && start());
    else start();
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frameId);
      clearTimeout(lickTimer);
    };
  }, [name, size, cut, reducedMotion]);

  return (
    <h1
      ref={box}
      className={`forged-name ${cut ? "forged-name--cut" : cold ? "forged-name--cold" : ""}`}
      style={cut ? undefined : { fontSize: `${size}px`, lineHeight: `${size * LINE_HEIGHT}px` }}
    >
      {name}
      {!reducedMotion && !cut && <canvas ref={canvas} aria-hidden="true" className="forged-name__fire" style={{ top: -FLAME_ROOM }} />}
    </h1>
  );
}
