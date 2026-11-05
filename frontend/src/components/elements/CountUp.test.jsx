// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CountUp from "@/components/elements/CountUp";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (original) => ({
  ...(await original()),
  useReducedMotion: () => motionPreference.reduced,
}));

let root;
afterEach(async () => {
  await act(async () => root.unmount());
  motionPreference.reduced = false;
});

async function show(element) {
  const container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(element));
  return container;
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 800)));

describe("CountUp", () => {
  it("reaches its value in under a second, then follows a new one", async () => {
    const container = await show(<CountUp to={117573} separator=" " />);
    await settle();
    expect(container.textContent).toBe("117 573");
    await act(async () => root.render(<CountUp to={117600} separator=" " />));
    await settle();
    expect(container.textContent).toBe("117 600");
  });

  it("shows the value at once under reduced motion", async () => {
    motionPreference.reduced = true;
    const container = await show(<CountUp to={42} />);
    expect(container.textContent).toBe("42");
  });
});
