import { describe, expect, it } from "vitest";
import { COVER_CELLS, COVER_TONES, coverPaths } from "./playlistCover";

const cells = (paths) => paths.flatMap((d) => [...d.matchAll(/M(\d+) (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]));

describe("coverPaths", () => {
  it("draws the same cover for the same id, and another for another id", () => {
    expect(coverPaths("a1")).toEqual(coverPaths("a1"));
    expect(coverPaths("a1")).not.toEqual(coverPaths("a2"));
  });

  it("stays on the grid and draws something for any id", () => {
    for (const id of ["", "a", "6f1c2a70-90aa-4a0e-9c55-1f7f6a1b0c11", "Été"]) {
      const paths = coverPaths(id);
      expect(paths).toHaveLength(COVER_TONES);
      const drawn = cells(paths);
      expect(drawn.length).toBeGreaterThan(0);
      expect(drawn.every(([x, y]) => x >= 0 && x < COVER_CELLS && y >= 0 && y < COVER_CELLS)).toBe(true);
    }
  });
});
