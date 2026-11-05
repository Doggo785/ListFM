// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaylistCover from "./PlaylistCover";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PlaylistCover", () => {
  let host;
  let root;
  let paint;
  let answers;

  const show = async (props) => {
    await act(async () => root.render(<PlaylistCover seed="p1" {...props} />));
  };

  beforeEach(() => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    paint = { fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(paint);
    answers = [];
    // Last.fm stand-in: an address with "missing" fails.
    vi.stubGlobal(
      "Image",
      class {
        set src(url) {
          answers.push(url);
          this.naturalWidth = this.naturalHeight = 300;
          queueMicrotask(() => (url.includes("missing") ? this.onerror() : this.onload()));
        }
      },
    );
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("paints the ribbon at once, then the albums over it", async () => {
    await show({ images: ["https://img/i/u/34s/first.jpg"] });
    expect(host.querySelector("canvas").getAttribute("aria-hidden")).toBe("true");
    expect(paint.fillRect).toHaveBeenCalled();
    expect(paint.drawImage).toHaveBeenCalled();
    expect(answers[0]).toBe("https://img/i/u/300x300/first.jpg");
  });

  it("stops loading once it has two albums", async () => {
    await show({ images: ["https://img/i/u/34s/a.jpg", "https://img/i/u/34s/b.jpg", "https://img/i/u/34s/c.jpg"] });
    expect(answers.some((url) => url.includes("/c.jpg"))).toBe(false);
  });

  it("tries a smaller size, then gives up on an album without losing the cover", async () => {
    await show({ images: ["https://img/i/u/34s/missing.jpg"] });
    expect(answers.filter((url) => url.includes("missing"))).toHaveLength(3);
    expect(paint.drawImage).not.toHaveBeenCalled();
    expect(paint.fillRect).toHaveBeenCalled();
  });

  it("draws albums already loaded right away, so the page can glide", async () => {
    await show({ images: ["https://img/i/u/34s/again.jpg"] });
    await act(async () => root.unmount());
    root = createRoot(host);
    paint.drawImage.mockClear();
    answers.length = 0;
    await show({ images: ["https://img/i/u/34s/again.jpg"] });
    expect(paint.drawImage).toHaveBeenCalled();
    expect(answers).toHaveLength(0);
  });

  it("waits to be near the screen before loading", async () => {
    let observed;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback) {
          observed = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    await show({ images: ["https://img/i/u/34s/later.jpg"] });
    expect(answers).toHaveLength(0);
    await act(async () => observed([{ isIntersecting: true }]));
    expect(answers).toHaveLength(1);
  });

  it("stays quiet where a canvas can't draw", async () => {
    HTMLCanvasElement.prototype.getContext.mockReturnValue(null);
    await show({});
    expect(host.querySelector("canvas")).toBeTruthy();
  });
});
