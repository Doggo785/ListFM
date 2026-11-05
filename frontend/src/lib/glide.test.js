// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { glide, glideArrived } from "./glide";

describe("glide", () => {
  afterEach(() => {
    delete document.startViewTransition;
    vi.unstubAllGlobals();
  });
  const motion = (reduced) => vi.stubGlobal("matchMedia", () => ({ matches: reduced }));

  it("changes page at once without the browser's support", () => {
    motion(false);
    const go = vi.fn();
    glide(go);
    expect(go).toHaveBeenCalledOnce();
  });

  it("changes page at once when motion is reduced", () => {
    motion(true);
    document.startViewTransition = vi.fn();
    const go = vi.fn();
    glide(go);
    expect(go).toHaveBeenCalledOnce();
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });

  it("holds the browser's picture until the new page says it arrived", async () => {
    motion(false);
    let settled = false;
    document.startViewTransition = (update) => update().then(() => (settled = true));
    const go = vi.fn();
    glide(go);
    expect(go).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(settled).toBe(false);
    glideArrived();
    await vi.waitFor(() => expect(settled).toBe(true));
  });
});
