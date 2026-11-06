import { describe, expect, it } from "vitest";
import { chainPhases, clamp, ease, hash, heartbeat, listensUpTo, STORY_SCREENS, storyAt, timelineShare, timelineTicks } from "./story";

describe("storyAt", () => {
  it("walks the five scenes in order and ends on the last one", () => {
    const seen = [];
    for (let p = 0; p <= 1; p += 0.01) {
      const { scene } = storyAt(p);
      if (seen.at(-1) !== scene) seen.push(scene);
    }
    expect(seen).toEqual(["listens", "chain", "delivered", "keeps", "obeys"]);
    expect(storyAt(1)).toEqual({ scene: "obeys", k: 1 });
    expect(STORY_SCREENS).toBeGreaterThan(10);
  });

  it("says how far through a scene the visitor is", () => {
    expect(storyAt(0)).toEqual({ scene: "listens", k: 0 });
    const { k } = storyAt(0.1);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
  });
});

describe("chainPhases", () => {
  it("runs the stages one after the other", () => {
    expect(chainPhases(0)).toMatchObject({ scan: 0, window: 0, open: 0, filter: 0, sort: 0, limit: 0, stage: 0 });
    expect(chainPhases(0.35)).toMatchObject({ window: 1, filter: 0, stage: 1 });
    expect(chainPhases(0.7)).toMatchObject({ filter: 1, limit: 0, stage: 2 });
    expect(chainPhases(0.9)).toMatchObject({ sort: 1, stage: 3 });
    expect(chainPhases(1)).toMatchObject({ limit: 1, stage: 4 });
  });
});

describe("the listens", () => {
  const weeks = [5, 5, 0, 0, 0, 0, 10, 0, 20, 20];

  it("counts what lies before a point of the timeline", () => {
    expect(listensUpTo(weeks, 0)).toBe(0);
    expect(listensUpTo(weeks, 0.1)).toBe(5);
    expect(listensUpTo(weeks, 0.15)).toBe(8);
    expect(listensUpTo(weeks, 1)).toBe(60);
    expect(listensUpTo(weeks, 2)).toBe(60);
  });

  it("places a date on the timeline", () => {
    expect(timelineShare("2026-01-01", [1, 1], "2026-01-01")).toBe(0);
    expect(timelineShare("2026-01-01", [1, 1], "2026-01-08")).toBe(0.5);
  });
});

describe("timelineTicks", () => {
  it("labels every six months inside the timeline", () => {
    const weeks = Array(122).fill(1); // A little over two years and four months.
    expect(timelineTicks("2024-07-01", weeks).map((t) => t.label)).toEqual(["Jul 2024", "Jan 2025", "Jul 2025", "Jan 2026", "Jul 2026"]);
    expect(timelineTicks("2024-07-01", weeks)[0].share).toBe(0);
  });

  it("starts from the next January or July when the timeline starts between them", () => {
    expect(timelineTicks("2024-08-15", Array(30).fill(1)).map((t) => t.label)).toEqual(["Jan 2025"]);
    expect(timelineTicks("2024-03-10", Array(20).fill(1)).map((t) => t.label)).toEqual(["Jul 2024"]);
  });
});

describe("the small maths", () => {
  it("beats twice, then once harder", () => {
    expect(heartbeat(0.5)).toBeGreaterThan(0.9);
    expect(heartbeat(1.1)).toBeLessThan(0.05);
    expect(heartbeat(1.5)).toBeGreaterThan(heartbeat(0.5));
  });

  it("stays in its bounds", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(hash(3, 4)).toBeGreaterThanOrEqual(0);
    expect(hash(3, 4)).toBeLessThan(1);
    expect(hash(3, 4)).toBe(hash(3, 4));
  });
});
