// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStage } from "./stage";

const CELL = 4;
const WIDTH = 40;
const HEIGHT = 20;

function fakeCanvas() {
  const drawn = { image: null };
  const context = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: (image) => { drawn.image = image; },
  };
  return { canvas: { getContext: () => context, style: {} }, drawn };
}

describe("createStage", () => {
  let stage;
  let drawn;
  const painted = (x, y) => new Uint32Array(drawn.image.data.buffer)[y * WIDTH + x];
  const paintedCount = () => new Uint32Array(drawn.image.data.buffer).filter(Boolean).length;
  const frame = (draw) => {
    stage.begin();
    draw();
    stage.end();
  };

  beforeEach(() => {
    vi.stubGlobal("innerWidth", WIDTH * CELL);
    vi.stubGlobal("innerHeight", HEIGHT * CELL);
    document.documentElement.style.setProperty("--text", "#fff3d6");
    document.documentElement.style.setProperty("--ink", "#03071e");
    for (let i = 1; i <= 9; i += 1) document.documentElement.style.setProperty(`--ember-${i}`, `#${String(i).repeat(6)}`);
    const made = fakeCanvas();
    drawn = made.drawn;
    stage = createStage(made.canvas);
  });

  afterEach(() => {
    stage.destroy();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("sizes itself in cells of the ribbon's grid", () => {
    expect(stage.W).toBe(WIDTH);
    expect(stage.H).toBe(HEIGHT);
  });

  it("keeps off text, and paints elsewhere", () => {
    const text = document.body.appendChild(document.createElement("p"));
    text.setAttribute("data-quiet", "");
    text.getBoundingClientRect = () => ({ left: 0, right: 40, top: 0, bottom: 40, width: 40, height: 40 });
    frame(() => {
      stage.put(3, 3, stage.cream);
      stage.put(35, 15, stage.cream);
      stage.put(-1, 3, stage.cream);
      stage.put(3, 999, stage.cream);
    });
    expect(painted(3, 3)).toBe(0);
    expect(painted(35, 15)).toBe(stage.cream);
  });

  it("can still mark a quiet block, for the fuse cutting a cover", () => {
    const cover = document.body.appendChild(document.createElement("div"));
    cover.setAttribute("data-quiet", "");
    cover.getBoundingClientRect = () => ({ left: 0, right: 40, top: 0, bottom: 40, width: 40, height: 40 });
    frame(() => {
      stage.mark(3, 3, stage.cream);
      stage.mark(-1, 3, stage.cream);
    });
    expect(painted(3, 3)).toBe(stage.cream);
  });

  it("ignores a block with no size, or off screen", () => {
    const hidden = document.body.appendChild(document.createElement("p"));
    hidden.setAttribute("data-quiet", "");
    hidden.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
    frame(() => stage.put(1, 1, stage.cream));
    expect(painted(1, 1)).toBe(stage.cream);
  });

  it("draws the thread with a hot core and a dark edge", () => {
    frame(() => stage.thread({ c: () => 10, hw: () => 6, heat: 3, blaze: 1 }));
    expect(painted(20, 10)).not.toBe(0);
    expect(painted(20, 1)).toBe(0);
    expect(painted(20, 10)).not.toBe(painted(20, 5));
  });

  it("draws a thread between two columns only, and takes a blaze per column", () => {
    frame(() => stage.thread({ from: 5, to: 8, c: () => 10, hw: () => 3, heat: 1, blaze: () => 1 }));
    expect(painted(6, 10)).not.toBe(0);
    expect(painted(20, 10)).toBe(0);
  });

  it("leaves a thread of no width out", () => {
    frame(() => stage.thread({ c: () => 10, hw: () => 0, heat: 1 }));
    expect(paintedCount()).toBe(0);
  });

  it("softens a thread's edge when asked, so its core never reaches the top tones", () => {
    frame(() => stage.thread({ c: () => 10, hw: () => 6, heat: 3 }));
    const sharp = painted(20, 10);
    frame(() => stage.thread({ c: () => 10, hw: () => 6, heat: 3, soft: 3 }));
    expect(painted(20, 10)).not.toBe(sharp);
  });

  it("lets pixels fall off, and they end", () => {
    frame(() => {
      stage.crumb(20, 10, { vx: 0, vy: -60, life: 0.2, g: 0 });
      stage.crumb(20, 12);
      stage.crumbs(0.05);
    });
    expect(painted(20, 7)).not.toBe(0);
    for (let i = 0; i < 40; i += 1) frame(() => stage.crumbs(0.05));
    expect(paintedCount()).toBe(0);
  });

  it("stops taking pixels when there are too many", () => {
    frame(() => {
      for (let i = 0; i < 2000; i += 1) stage.crumb(20, 10, { vx: 0, vy: 0, life: 1, g: 0 });
      stage.crumbs(0);
    });
    expect(paintedCount()).toBe(1);
  });

  it("hides a rectangle in dither, or everything right of a column", () => {
    const rect = { left: 0, right: 40, top: 0, bottom: 40 };
    frame(() => stage.veil(rect, 0));
    expect(paintedCount()).toBe(100);
    frame(() => stage.veil(rect, 1));
    expect(paintedCount()).toBe(0);
    frame(() => stage.veil(rect, 0.5));
    expect(paintedCount()).toBeGreaterThan(0);
    expect(paintedCount()).toBeLessThan(100);
    frame(() => stage.veil(rect, 0, 4));
    expect(painted(4, 0)).toBe(0);
    expect(painted(5, 0)).toBe(stage.ink);
  });

  it("follows the window, and tells whoever laid things out", () => {
    const onResize = vi.fn();
    stage.onResize = onResize;
    vi.stubGlobal("innerWidth", 80);
    window.dispatchEvent(new Event("resize"));
    expect(stage.W).toBe(20);
    expect(onResize).toHaveBeenCalled();
  });
});
