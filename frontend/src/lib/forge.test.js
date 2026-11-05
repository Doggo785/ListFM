// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createForge, drawFire, forgeRamps, letterMask, rgb, stepFire } from "./forge";

const EMBER = ["#010000", "#020000", "#030000", "#040000", "#050000", "#060000", "#070000", "#080000", "#090000"];
const CREAM = "#ffffff";
const ramps = forgeRamps(EMBER, CREAM);
const WIDTH = 20;
const HEIGHT = 40;
const fixed = () => 0.5;

// Two rows of letters at the bottom of the grid, all the way across.
const lettersAtFoot = () => {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  mask.fill(1, (HEIGHT - 2) * WIDTH);
  return mask;
};
const fakeContext = () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: vi.fn() });

function forgeWith(options = {}) {
  return createForge({
    context: fakeContext(),
    width: WIDTH,
    height: HEIGHT,
    mask: lettersAtFoot(),
    ramps,
    sweepSeconds: 0.5,
    headX: (seconds) => (seconds / 0.5) * WIDTH,
    random: fixed,
    ...options,
  });
}

const run = (forge, seconds) => {
  let alive = true;
  for (let t = 0; t < seconds && alive; t += 1 / 60) alive = forge.frame(1 / 60);
  return alive;
};

describe("rgb", () => {
  it("reads a colour token with its surrounding whitespace", () => {
    expect(rgb(" #ff0102")).toEqual([255, 1, 2]);
  });
});

describe("forgeRamps", () => {
  it("soaks from cold to cream, and a lick starts from cream", () => {
    expect(ramps.soak.at(-1)).toEqual([255, 255, 255]);
    expect(ramps.soak[0]).toEqual(rgb(EMBER[1]));
    expect(ramps.burn[0]).toEqual([255, 255, 255]);
  });
});

describe("stepFire", () => {
  it("climbs one row per tick and cools as it goes", () => {
    const heat = new Float32Array(9);
    heat.fill(1, 6);
    stepFire(heat, 3, 3, () => 0.5);
    expect(heat[3]).toBeGreaterThan(0.9);
    expect(heat[3]).toBeLessThan(1);
    expect(heat[0]).toBe(0);
    stepFire(heat, 3, 3, () => 0.5);
    expect(heat[0]).toBeGreaterThan(0.8);
  });

  it("never goes below zero", () => {
    const heat = new Float32Array(9).fill(0.001);
    stepFire(heat, 3, 3, () => 1);
    expect(Math.min(...heat)).toBe(0);
  });
});

describe("letterMask", () => {
  afterEach(() => vi.restoreAllMocks());

  it("marks the inked cells", () => {
    const data = new Uint8ClampedArray(2 * 4);
    data[3] = 255;
    data[7] = 10;
    const context = { fillText: vi.fn(), getImageData: () => ({ data }) };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    expect([...letterMask("A", "8px Tiny5", 2, 1, 1)]).toEqual([1, 0]);
    expect(context.fillText).toHaveBeenCalledWith("A", 0, 1);
  });

  it("gives up without a 2D context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(letterMask("A", "8px Tiny5", 2, 1, 1)).toBeNull();
  });
});

describe("drawFire", () => {
  const draw = (state) => {
    const pixels = new Uint8ClampedArray(4 * 2 * 2);
    drawFire(pixels, { width: 2, height: 2, ramps, ...state });
    return (x, y) => [...pixels.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4)];
  };

  it("shows a cold letter in the first tone of the soak", () => {
    const at = draw({ mask: new Uint8Array([1, 0, 0, 0]), heat: new Float32Array(4), soak: new Float32Array(4) });
    expect(at(0, 0)).toEqual([...ramps.soak[0], 255]);
    expect(at(1, 0)[3]).toBe(0);
  });

  it("paints a finished letter cream while the page's text under it is still cold", () => {
    const at = draw({ mask: new Uint8Array([1, 0, 0, 0]), heat: new Float32Array(4), soak: new Float32Array([1, 0, 0, 0]) });
    expect(at(0, 0)).toEqual([255, 255, 255, 255]);
  });

  it("leaves a settled letter clear: the page's own text shows there", () => {
    const at = draw({ mask: new Uint8Array([1, 0, 0, 0]), heat: new Float32Array(4), soak: null });
    expect(at(0, 0)[3]).toBe(0);
  });

  it("darkens a settled letter under the fire, and lets flames out around it", () => {
    const at = draw({ mask: new Uint8Array([1, 0, 0, 0]), heat: new Float32Array([1, 1, 0.1, 0]), soak: null });
    expect(at(0, 0)).toEqual([...ramps.burn.at(-1), 255]);
    expect(at(1, 0)).toEqual([...ramps.flame.at(-1), 255]);
    expect(at(0, 1)[3]).toBe(0);
  });
});

describe("createForge", () => {
  it("does not end the first burn before the letters are cream, then goes idle", () => {
    const onCream = vi.fn();
    const onIdle = vi.fn();
    const forge = forgeWith({ onCream, onIdle });
    forge.ignite();
    expect(forge.isCream).toBe(false);
    forge.frame(1 / 60);
    expect(onCream).not.toHaveBeenCalled();
    expect(run(forge, 12)).toBe(false);
    expect(forge.isCream).toBe(true);
    expect(onCream).toHaveBeenCalledTimes(1);
    expect(onIdle).toHaveBeenCalled();
  });

  it("still ends cream when the playhead never reaches the last letters", () => {
    const onCream = vi.fn();
    const forge = forgeWith({ onCream, headX: () => 2 });
    forge.ignite();
    run(forge, 12);
    expect(onCream).toHaveBeenCalledTimes(1);
  });

  it("sends sparks while the playhead crosses the name", () => {
    const onSpark = vi.fn();
    const forge = forgeWith({ onSpark });
    forge.ignite();
    run(forge, 0.3);
    expect(onSpark).toHaveBeenCalled();
    const [x, y] = onSpark.mock.calls[0];
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBe(HEIGHT - 2);
  });

  describe("a later flame", () => {
    // One row in mid-air: its heat climbs away at once, so what stays on it is the letters' own colour.
    const ROW = 20;
    const afterTheFire = (options) => {
      const mask = new Uint8Array(WIDTH * HEIGHT);
      mask.fill(1, ROW * WIDTH, (ROW + 1) * WIDTH);
      const context = fakeContext();
      const forge = forgeWith({ soaked: true, mask, context, ...options });
      forge.lick();
      run(forge, 0.85);
      const firstLetter = () => {
        forge.frame(1 / 60);
        return context.putImageData.mock.calls.at(-1)[0].data.slice(ROW * WIDTH * 4, ROW * WIDTH * 4 + 4);
      };
      return { forge, firstLetter };
    };
    const low = rgb(EMBER[5])[0];

    it("never goes cold again, and never calls the name forged twice", () => {
      const onCream = vi.fn();
      const forge = forgeWith({ soaked: true, onCream });
      expect(forge.isCream).toBe(true);
      expect(forge.frame(1 / 60)).toBe(false);
      forge.lick();
      expect(forge.isCream).toBe(false);
      expect(forge.frame(1 / 60)).toBe(true);
      expect(run(forge, 12)).toBe(false);
      expect(forge.isCream).toBe(true);
      expect(onCream).not.toHaveBeenCalled();
    });

    it("leaves the letters red once the fire has gone, then takes them back to cream", () => {
      const { forge, firstLetter } = afterTheFire();
      const [red, , , alpha] = firstLetter();
      expect(alpha).toBe(255);
      expect(red).toBeLessThanOrEqual(low);
      run(forge, 12);
      expect(forge.isCream).toBe(true);
    });

    it("does not cut a running pass short", () => {
      const { forge, firstLetter } = afterTheFire();
      forge.lick();
      expect(firstLetter()[0]).toBeLessThanOrEqual(low);
    });

    it("sends sparks like the first pass", () => {
      const onSpark = vi.fn();
      afterTheFire({ onSpark });
      expect(onSpark).toHaveBeenCalled();
    });
  });

  it("does not try to catch up after a long frame", () => {
    const forge = forgeWith({ soaked: true });
    forge.lick();
    const stepped = vi.fn(forge.frame);
    expect(stepped(5)).toBe(true);
  });
});
