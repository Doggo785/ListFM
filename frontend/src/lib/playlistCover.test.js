import { describe, expect, it, vi } from "vitest";
import { COVER_CELLS, COVER_SIZE, albumAddresses, coverPng, coverShape, drawCover, ribbonCells, siteColors } from "./playlistCover";

const ID = "6f1c2a70-90aa-4a0e-9c55-1f7f6a1b0c11";
const ids = Array.from({ length: 40 }, (_, i) => `6f1c2a70-90aa-4a0e-9c55-1f7f6a1b0c${String(i).padStart(2, "0")}`);

describe("coverShape", () => {
  it("is the same for the same playlist and differs from another", () => {
    expect(ribbonCells(coverShape(ID))).toEqual(ribbonCells(coverShape(ID)));
    expect(ribbonCells(coverShape(ids[0]))).not.toEqual(ribbonCells(coverShape(ids[1])));
  });

  it("varies in height, slope and heat, even between ids that look alike", () => {
    const shapes = ids.map(coverShape);
    const middles = shapes.map((shape) => shape.center(0.5));
    expect(Math.max(...middles) - Math.min(...middles)).toBeGreaterThan(0.3);
    const slopes = shapes.map((shape) => shape.center(1) - shape.center(0));
    expect(Math.max(...slopes) - Math.min(...slopes)).toBeGreaterThan(0.5);
    expect(new Set(shapes.map((shape) => shape.heat)).size).toBeGreaterThan(2);
    expect(shapes.every((shape) => shape.heat >= 2 && shape.heat <= 5)).toBe(true);
  });

  it("never thins out below its minimum, so a cover never shows through a gap", () => {
    for (const shape of ids.map(coverShape)) {
      for (let s = 0; s <= 1; s += 0.05) expect(shape.halfWidth(s)).toBeGreaterThanOrEqual(0.06);
    }
  });
});

describe("ribbonCells", () => {
  it("stays on the grid, with the four tones of the site's ribbon", () => {
    const cells = ribbonCells(coverShape(ID));
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every(({ x, y }) => x >= 0 && x < COVER_CELLS && y >= 0 && y < COVER_CELLS)).toBe(true);
    expect(new Set(cells.map(({ tone }) => tone))).toEqual(new Set([0, 1, 2, 3]));
  });
});

describe("albumAddresses", () => {
  it("asks for the best size first and ends on the address it was given", () => {
    const url = "https://img/i/u/34s/abc.jpg";
    expect(albumAddresses(url)).toEqual(["https://img/i/u/300x300/abc.jpg", "https://img/i/u/174s/abc.jpg", url]);
  });

  it("repeats nothing", () => {
    expect(albumAddresses("https://img/i/u/300x300/abc.jpg")).toEqual(["https://img/i/u/300x300/abc.jpg", "https://img/i/u/174s/abc.jpg"]);
  });
});

describe("drawCover", () => {
  const colors = { ground: "ink", ember: Array.from({ length: 9 }, (_, i) => `e${i}`) };
  const context = () => ({ fillRect: vi.fn(), drawImage: vi.fn() });
  const album = { naturalWidth: 300, naturalHeight: 200 };

  it("draws the ribbon alone on the ground without an album", () => {
    const paint = context();
    drawCover(paint, coverShape(ID), [], colors);
    expect(paint.drawImage).not.toHaveBeenCalled();
    expect(paint.fillRect).toHaveBeenCalledWith(0, 0, COVER_SIZE, COVER_SIZE);
  });

  it("fills the cover with one album, cropped to a square", () => {
    const paint = context();
    drawCover(paint, coverShape(ID), [album], colors);
    expect(paint.drawImage.mock.calls).toEqual([[album, 50, 0, 200, 200, 0, 0, COVER_SIZE, COVER_SIZE]]);
  });

  it("lays the second album under the ribbon, column by column", () => {
    const paint = context();
    drawCover(paint, coverShape(ID), [album, { ...album }], colors);
    expect(paint.drawImage).toHaveBeenCalledTimes(1 + COVER_CELLS);
  });
});

describe("coverPng", () => {
  const stub = (toBlob) => {
    const context = { fillRect() {}, drawImage() {} };
    vi.stubGlobal("document", {
      documentElement: {},
      createElement: () => ({ getContext: () => context, toBlob }),
    });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: (name) => `${name} ` }));
  };

  it("draws the cover in the site's colours and returns it as a PNG", async () => {
    const blob = { type: "image/png" };
    const toBlob = vi.fn((done) => done(blob));
    stub(toBlob);
    expect(siteColors().ground).toBe("--ink");
    await expect(coverPng(ID, [])).resolves.toBe(blob);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    vi.unstubAllGlobals();
  });

  it("fails when the browser gives no file", async () => {
    stub((done) => done(null));
    await expect(coverPng(ID, [])).rejects.toThrow("no cover");
    vi.unstubAllGlobals();
  });
});
