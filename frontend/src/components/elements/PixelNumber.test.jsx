// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PixelNumber from "@/components/elements/PixelNumber";
import { coverCells } from "@/lib/pixelCover";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (original) => ({
  ...(await original()),
  useReducedMotion: () => motionPreference.reduced,
}));

let root;
let drawn;
beforeEach(() => {
  drawn = 0;
  HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    fillRect: () => {
      drawn += 1;
    },
    fillText() {},
    measureText: () => ({}),
    getImageData: (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 80, height: 40, left: 0 });
});
afterEach(async () => {
  await act(async () => root.unmount());
  motionPreference.reduced = false;
  vi.restoreAllMocks();
});

async function show(element) {
  const container = document.createElement("div");
  container.style.fontSize = "32px";
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(element));
  return container;
}

const wait = (ms) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

describe("PixelNumber", () => {
  it("writes the number for reading and formats it", async () => {
    const container = await show(<PixelNumber value={117573} separator=" " />);
    expect(container.textContent).toBe("117 573");
  });

  it("keeps the old number until the pixels cover it, then swaps within half a second", async () => {
    const container = await show(<PixelNumber value={100} />);
    await wait(400);
    await act(async () => root.render(<PixelNumber value={250} />));
    expect(container.textContent).toBe("100");
    drawn = 0;
    await wait(450);
    expect(container.textContent).toBe("250");
    expect(drawn).toBeGreaterThan(0);
  });

  it("lands on the last value when changes come quickly", async () => {
    const container = await show(<PixelNumber value={1} />);
    await act(async () => root.render(<PixelNumber value={2} />));
    await wait(40);
    await act(async () => root.render(<PixelNumber value={3} />));
    await wait(700);
    expect(container.textContent).toBe("3");
  });

  it("reads the digits' ink in their own size, even with tabular numerals set", async () => {
    const fonts = [];
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext() {
      return new Proxy(real.call(this), { set: (target, key, value) => {
        if (key === "font") fonts.push(value);
        target[key] = value;
        return true;
      } });
    };
    await show(<PixelNumber value={1} />);
    expect(fonts.some((font) => font.startsWith("32px"))).toBe(true);
  });

  it("leaves the pixels where they are when the number's box moves", async () => {
    const container = await show(<PixelNumber value={5689} />);
    await wait(400);
    await act(async () => root.render(<PixelNumber value={21} />));
    // The box only moves at the swap, once the pixels have covered the old number.
    Element.prototype.getBoundingClientRect.mockReturnValue({ width: 80, height: 40, left: 40 });
    await wait(250);
    expect(container.textContent).toBe("21");
    // 40px at 4px a cell: the old pixels now sit 10 cells left of the box.
    expect(parseFloat(container.querySelector("canvas").style.left)).toBe(-40);
  });

  it("stops drawing once revealed", async () => {
    await show(<PixelNumber value={1} />);
    await wait(500);
    drawn = 0;
    await wait(100);
    expect(drawn).toBe(0);
  });

  it("swaps at once, with no pixels, under reduced motion", async () => {
    motionPreference.reduced = true;
    const container = await show(<PixelNumber value={42} />);
    expect(container.querySelector("canvas")).toBeNull();
    await act(async () => root.render(<PixelNumber value={43} />));
    expect(container.textContent).toBe("43");
  });

  it("swaps at once where a canvas can't draw", async () => {
    HTMLCanvasElement.prototype.getContext = () => null;
    const container = await show(<PixelNumber value={7} />);
    await act(async () => root.render(<PixelNumber value={8} />));
    expect(container.textContent).toBe("8");
  });
});

describe("coverCells", () => {
  const key = ([x, y]) => `${x},${y}`;
  const inked = [[2, 2], [3, 2]];

  it("always covers the digits and their edge, so nothing shows through", () => {
    const cells = coverCells(inked, 20, 8, () => 0.99).map(key);
    for (const [x, y] of inked) expect(cells).toContain(`${x},${y}`);
    expect(cells).toContain("1,1");
    expect(cells).toContain("4,3");
  });

  it("follows the digits' shape and not the box", () => {
    const cells = coverCells(inked, 20, 8, () => 0.99).map(key);
    expect(cells).not.toContain("15,6");
    expect(cells).not.toContain("0,0");
  });

  it("scatters loose pixels further out, past the box if need be", () => {
    const always = coverCells(inked, 20, 8, () => 0).map(key);
    expect(always).toContain("-1,-1");
    expect(always).not.toContain("7,2");
  });

  it("falls back on the whole box when the ink is unknown", () => {
    expect(coverCells([], 3, 2)).toHaveLength(6);
  });
});
