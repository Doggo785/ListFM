// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PixelNumber from "@/components/elements/PixelNumber";

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
  HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, fillRect: () => { drawn += 1; } });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 80, height: 40 });
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
