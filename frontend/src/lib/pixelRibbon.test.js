// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CELL, chainShape, createRibbon, hexToRgb, openingRect, quietRects, rampFor, ribbonStage, sceneFor } from "./pixelRibbon";

const PALETTE = ["#000000", "#010101", "#020202", "#030303", "#040404", "#050505", "#060606", "#070707", "#080808"];

function fakeGl(overrides = {}) {
  const calls = {};
  const base = { ...overrides };
  return new Proxy(base, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === "calls") return calls;
      return (...args) => {
        (calls[name] ||= []).push(args);
        return name.startsWith("get") ? name : {};
      };
    },
  });
}

describe("sceneFor", () => {
  it("gives each page its own scene", () => {
    const scenes = ["/dashboard", "/automations/new", "/automations", "/automations/abc", "/playlists", "/playlists/abc", "/login", "/settings", "/"].map(sceneFor);
    expect(new Set(scenes).size).toBe(9);
  });

  it("keeps one scene on every screen before the site, so moving between them is still", () => {
    for (const path of ["/register", "/link-lastfm", "/auth/lastfm", "/auth/callback"]) expect(sceneFor(path)).toBe(sceneFor("/login"));
  });

  it("shows the Creator's scene while editing an automation", () => {
    expect(sceneFor("/automations/abc/edit")).toBe(sceneFor("/automations/new"));
  });

  it("gets hotter from the dashboard to the automations", () => {
    expect(sceneFor("/automations").heat).toBeGreaterThan(sceneFor("/dashboard").heat);
  });
});

describe("rampFor", () => {
  it("keeps the two dark edge tones and moves the core with the heat", () => {
    expect(rampFor(0, PALETTE).slice(0, 6)).toEqual(rampFor(2, PALETTE).slice(0, 6));
    expect(rampFor(2, PALETTE).slice(6, 9)).toEqual(hexToRgb(PALETTE[4]));
    expect(rampFor(2, PALETTE).slice(9)).toEqual(hexToRgb(PALETTE[5]));
  });

  it("reads a colour token with its surrounding whitespace", () => {
    expect(hexToRgb(" #ff0000")).toEqual([1, 0, 0]);
  });
});

describe("quietRects", () => {
  const rect = (top, height, width = 100, left = 0) => ({ top, bottom: top + height, height, width, left });

  it("converts to cells from the bottom-left corner", () => {
    const { data, count } = quietRects([rect(0, 100, 200, 40)], 800);
    expect(count).toBe(1);
    expect([...data.slice(0, 4)]).toEqual([140 / CELL, 750 / CELL, 100 / CELL, 50 / CELL]);
  });

  it("skips hidden and far off-screen elements", () => {
    const { count } = quietRects([rect(0, 100, 0), rect(-500, 100), rect(2000, 100)], 800);
    expect(count).toBe(0);
  });

  it("never passes more rectangles than the shader holds", () => {
    const { count, data } = quietRects(Array(40).fill(rect(0, 10)), 800);
    expect(count).toBe(12);
    expect(data).toHaveLength(48);
  });
});

describe("openingRect", () => {
  it("runs from one rectangle to the other", () => {
    const from = { left: 100, top: 100, width: 20, height: 10 };
    const to = { left: 0, top: 0, width: 200, height: 100 };
    expect(openingRect(from, to, 0)).toEqual({ ...from, bottom: 110 });
    expect(openingRect(from, to, 0.5)).toEqual({ left: 50, top: 50, width: 110, height: 55, bottom: 105 });
    expect(openingRect(from, to, 1)).toEqual({ ...to, bottom: 100 });
  });
});

describe("createRibbon", () => {
  let frames;
  beforeEach(() => {
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const canvasWith = (gl) => {
    const canvas = document.createElement("canvas");
    canvas.getContext = vi.fn(() => gl);
    return canvas;
  };
  const tick = (ms) => frames.shift()(performance.now() + ms);
  const lastCall = (gl, name) => gl.calls[name].at(-1);

  it("does nothing without WebGL2", () => {
    const ribbon = createRibbon(canvasWith(null), { palette: PALETTE });
    expect(() => {
      ribbon.setScene(sceneFor("/dashboard"));
      ribbon.destroy();
    }).not.toThrow();
    expect(frames).toHaveLength(0);
  });

  it("stays inert when the shader does not compile", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const gl = fakeGl({ getShaderParameter: () => false });
    const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE });
    expect(frames).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
    expect(() => ribbon.destroy()).not.toThrow();
  });

  it("sizes the canvas in cells on the pixel grid", () => {
    const canvas = canvasWith(fakeGl());
    createRibbon(canvas, { palette: PALETTE });
    expect(canvas.width).toBe(Math.ceil(window.innerWidth / CELL));
    expect(canvas.style.width).toBe(`${canvas.width * CELL}px`);
  });

  it("shows the first scene in place and glides to the next one", () => {
    const gl = fakeGl();
    const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE });
    ribbon.setScene(sceneFor("/dashboard"));
    tick(16);
    expect(lastCall(gl, "uniform1fv")[1][0]).toBeCloseTo(sceneFor("/dashboard").shape[0]);

    ribbon.setScene(sceneFor("/automations"));
    tick(32);
    const shape = lastCall(gl, "uniform1fv")[1][0];
    expect(shape).toBeLessThan(sceneFor("/dashboard").shape[0]);
    expect(shape).toBeGreaterThan(sceneFor("/automations").shape[0]);
  });

  it("keeps away from content marked as quiet", () => {
    const el = document.createElement("div");
    el.dataset.quiet = "";
    el.getBoundingClientRect = () => ({ top: 0, bottom: 10, height: 10, width: 10, left: 0 });
    document.body.append(el);
    const gl = fakeGl();
    createRibbon(canvasWith(gl), { palette: PALETTE });
    tick(16);
    expect(lastCall(gl, "uniform1i")[1]).toBe(1);
    el.remove();
  });

  it("leans harder toward what can be acted on", () => {
    const gl = fakeGl();
    createRibbon(canvasWith(gl), { palette: PALETTE });
    const button = document.createElement("button");
    button.getBoundingClientRect = () => ({ left: 10, top: 10, width: 10, height: 10 });
    document.body.append(button);
    let clock = 0;
    const settle = () => {
      for (let i = 0; i < 40; i += 1) tick((clock += 50));
      return lastPull(gl);
    };

    document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 }));
    const onNothing = settle();
    button.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 }));
    const onButton = settle();
    expect(onButton).toBeGreaterThan(onNothing);

    document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 }));
    settle();
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(settle()).toBeCloseTo(onButton);
    button.remove();
  });

  it("leans on the loader, then opens the page out of it", () => {
    const quietBox = (left, top, width, height) => {
      const el = document.createElement("div");
      el.dataset.quiet = "";
      el.getBoundingClientRect = () => ({ left, top, width, height, bottom: top + height });
      document.body.append(el);
      return el;
    };
    const loader = quietBox(100, 100, 40, 20);
    loader.dataset.loader = "";
    const gl = fakeGl();
    createRibbon(canvasWith(gl), { palette: PALETTE });
    let clock = 0;
    const run = (frameCount) => {
      for (let i = 0; i < frameCount; i += 1) tick((clock += 50));
    };
    run(40);
    const leaning = lastPull(gl);
    expect(leaning).toBeGreaterThan(0.5);

    loader.remove();
    const page = quietBox(0, 0, 800, 600);
    const halfWidth = () => lastCall(gl, "uniform4fv")[1][2];
    run(1);
    expect(halfWidth()).toBeCloseTo(20 / CELL);
    run(20);
    expect(halfWidth()).toBeCloseTo(400 / CELL);
    expect(lastPull(gl)).toBeLessThan(leaning);
    page.remove();
  });

  it("burns hotter while a page asks for it, and cools back down", () => {
    const gl = fakeGl();
    const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE, reducedMotion: true });
    ribbon.setScene(sceneFor("/automations"));
    tick(16);
    const calm = lastCall(gl, "uniform3fv")[1].at(-1);
    const page = document.body.appendChild(document.createElement("main"));
    page.setAttribute("data-ribbon-hot", "");
    tick(32);
    expect(lastCall(gl, "uniform3fv")[1].at(-1)).toBeGreaterThan(calm);
    page.remove();
    tick(48);
    expect(lastCall(gl, "uniform3fv")[1].at(-1)).toBe(calm);
  });

  it("does not diverge when a frame's timestamp goes backwards", () => {
    const gl = fakeGl();
    const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE });
    ribbon.setScene(sceneFor("/dashboard"));
    tick(16);
    ribbon.setScene(sceneFor("/automations"));
    tick(-100000);
    expect(lastCall(gl, "uniform1fv")[1][0]).toBeCloseTo(sceneFor("/dashboard").shape[0]);
  });

  it("freezes the drift and ignores the pointer under reduced motion", () => {
    const gl = fakeGl();
    const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE, reducedMotion: true });
    ribbon.setScene(sceneFor("/dashboard"));
    document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 }));
    tick(16);
    tick(32);
    expect(lastPull(gl)).toBe(0);
    // The time uniform is the first float of each frame: it must not advance.
    const times = gl.calls.uniform1f.filter((_, i) => i % 10 === 0).map(([, v]) => v);
    expect(new Set(times)).toEqual(new Set([0]));
  });

  it("draws the work's front, and lets a finished one go after its flare", () => {
    const gl = fakeGl();
    const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE, reducedMotion: true });
    ribbon.setScene(sceneFor("/automations"));
    ribbonStage.work = { kind: "tags", share: 0.4, perSecond: 0, at: 0, until: null, doneAt: null };
    tick(16);
    expect(lastCall(gl, "uniform3f").slice(1)).toEqual([0.4, 1, 0]);
    ribbonStage.work.doneAt = 20;
    tick(32);
    expect(ribbonStage.work.shown).toBe(1);
    tick(3000);
    expect(ribbonStage.work).toBeNull();
    ribbon.destroy();
  });

  it("lies straight in a chain's band, and returns to the page's scene without it", () => {
    const band = document.createElement("div");
    band.dataset.chain = "800,60,1";
    band.getBoundingClientRect = () => ({ top: window.innerHeight / 2 - 40, bottom: window.innerHeight / 2 + 40, height: 80, width: 100, left: 0 });
    document.body.append(band);
    const gl = fakeGl();
    const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE, reducedMotion: true });
    ribbon.setScene(sceneFor("/dashboard"));
    tick(16);
    const half = 40 / window.innerHeight;
    const cols = lastCall(gl, "uniform1fv")[1];
    chainShape([800, 60, 1]).forEach((w, i) => expect(cols[i]).toBeCloseTo(w * half));
    expect(lastPull(gl)).toBe(0);

    band.remove();
    tick(32);
    expect(lastCall(gl, "uniform1fv")[1][0]).toBeCloseTo(sceneFor("/dashboard").shape[0]);
  });

  describe("with a track on the stage", () => {
    const layout = { radius: 1000, perspective: 3000, step: 0.4, bow: 300, roll: 0.18 };
    const track = (more = {}) => ({
      series: new Uint8Array(32),
      count: 1,
      end: 1,
      x0: 0,
      perMonth: 800,
      y: 200,
      half: 80,
      head: 300,
      flame: 1,
      zoom: 0,
      cx: 400,
      focus: 0,
      layout,
      bandTop: 100,
      bandBottom: 300,
      holes: [],
      ...more,
    });
    afterEach(() => {
      ribbonStage.track = null;
      ribbonStage.embers = 0;
      ribbonStage.beforeDraw = null;
    });

    it("asks the page for its numbers each frame, before drawing", () => {
      const gl = fakeGl();
      const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE });
      ribbon.setScene(sceneFor("/dashboard"));
      ribbonStage.beforeDraw = vi.fn();
      tick(16);
      expect(ribbonStage.beforeDraw).toHaveBeenCalledTimes(1);
      ribbon.destroy();
    });

    it("sends each series once, and the wave's numbers on every frame", () => {
      const gl = fakeGl();
      const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE, reducedMotion: true });
      ribbon.setScene(sceneFor("/dashboard"));
      ribbonStage.track = track();
      tick(16);
      tick(32);
      expect(gl.calls.texImage2D).toHaveLength(1);
      const waves = gl.calls.uniform4f.filter((call) => call[2] === 80 / window.innerHeight);
      expect(waves.at(-1)[1]).toBeCloseTo(0.5 - 200 / window.innerHeight);
      ribbon.destroy();
    });

    it("eases out from its last track when the page leaves", () => {
      const gl = fakeGl();
      const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE });
      ribbon.setScene(sceneFor("/dashboard"));
      ribbonStage.track = track();
      tick(16);
      tick(600);
      const weightOn = gl.calls.uniform4f.filter((call) => call[3] === 300 / window.innerHeight).at(-1)[4];
      expect(weightOn).toBeGreaterThan(0);
      ribbonStage.track = null;
      tick(632);
      const weightAfter = gl.calls.uniform4f.filter((call) => call[3] === 300 / window.innerHeight).at(-1)[4];
      expect(weightAfter).toBeGreaterThan(0);
      expect(weightAfter).toBeLessThanOrEqual(weightOn);
      ribbon.destroy();
    });

    it("opens the flame around the cards it is given, at most four, and says how far each has burnt", () => {
      const gl = fakeGl();
      const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE, reducedMotion: true });
      ribbon.setScene(sceneFor("/dashboard"));
      const rect = { left: 40, top: 80, width: 80, height: 40 };
      const corners = [{ x: 40, y: 80 }, { x: 120, y: 80 }, { x: 120, y: 120 }, { x: 40, y: 120 }];
      ribbonStage.track = track({ holes: Array(5).fill({ rect, corners, strength: 1, burn: 0.25 }) });
      tick(16);
      const holes = gl.calls.uniform4fv.filter((call) => call[1].length === 16).at(-1)[1];
      expect(holes.slice(0, 4)).toEqual(new Float32Array([80 / CELL, (window.innerHeight - 100) / CELL, 40 / CELL, 20 / CELL]));
      const edges = gl.calls.uniform3fv.find((call) => call[1].length === 48)[1];
      // The top side faces up, the right side faces right.
      expect(edges[0]).toBeCloseTo(0);
      expect(edges[1]).toBeCloseTo(1);
      expect(edges[2]).toBeCloseTo((window.innerHeight - 80) / CELL);
      expect(edges[3]).toBeCloseTo(1);
      expect(edges[4]).toBeCloseTo(0);
      expect(gl.calls.uniform4f.some((call) => call[1] === 0.25 && call[4] === 0.25)).toBe(true);
      ribbon.destroy();
    });

    it("climbs in embers, and sprays where it is asked to", () => {
      const gl = fakeGl();
      const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE });
      ribbon.setScene(sceneFor("/dashboard"));
      ribbonStage.track = track({ zoom: 1 });
      ribbonStage.embers = 4;
      ribbonStage.burst(10, 10);
      tick(16);
      tick(32);
      expect(gl.calls.drawArrays.length).toBeGreaterThan(2);
      ribbon.destroy();
      expect(ribbonStage.alive).toBe(false);
      expect(() => ribbonStage.burst(1, 1)).not.toThrow();
    });
  });

  it("stops the loop and listeners on destroy", () => {
    const gl = fakeGl();
    const ribbon = createRibbon(canvasWith(gl), { palette: PALETTE });
    const remove = vi.spyOn(document, "removeEventListener");
    ribbon.destroy();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
  });
});

// uPull is the fifth float set each frame (uT, uWander, uAngle, uOff, uPull).
function lastPull(gl) {
  return gl.calls.uniform1f.at(-1)[1];
}

describe("chainShape", () => {
  const stages = (shape) => [shape[0], shape[4], shape[8]];

  it("narrows stage by stage", () => {
    const [window, kept, playlist] = stages(chainShape([8000, 600, 50]));
    expect(window).toBeGreaterThan(kept);
    expect(kept).toBeGreaterThan(playlist);
    expect(playlist).toBeGreaterThan(0);
    expect(window).toBeLessThan(1);
  });

  it("draws no ribbon after the stage where nothing is left", () => {
    expect(stages(chainShape([300, 0, 0]))).toEqual([expect.any(Number), 0, 0]);
  });

  it("stays a plain even line without counts or listens", () => {
    for (const counts of [[], [0, 0, 0]]) expect(new Set(chainShape(counts)).size).toBe(1);
  });
});

describe("the landing page's scene", () => {
  it("keeps the ribbon silent there, and nowhere else", () => {
    expect(sceneFor("/").silent).toBe(true);
    expect(sceneFor("/login").silent).toBeUndefined();
  });
});
