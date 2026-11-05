import { describe, expect, it } from "vitest";
import { cardCorners, cardPose, deckLayout, drumAngle, drumX, mix, monthAt, monthsEnd, monthSeries, runsSeries, SAMPLES_PER_MONTH, smoothstep, sweepAt, SWEEP_SECONDS } from "./ribbonTrack";

const month = (days) => ({ days });

describe("smoothstep and mix", () => {
  it("eases between its bounds, and works reversed", () => {
    expect(smoothstep(0, 10, -1)).toBe(0);
    expect(smoothstep(0, 10, 5)).toBe(0.5);
    expect(smoothstep(0, 10, 11)).toBe(1);
    expect(smoothstep(10, 0, 0)).toBe(1);
    expect(mix(2, 4, 0.5)).toBe(3);
  });
});

describe("monthSeries", () => {
  it("gives every month the same room, whatever its length", () => {
    const series = monthSeries([month(Array(28).fill(1)), month(Array(31).fill(1))]);
    expect(series).toHaveLength(2 * SAMPLES_PER_MONTH);
    expect(Math.max(...series)).toBe(255);
  });

  it("shows a busy month wider than a quiet one", () => {
    const series = monthSeries([month(Array(30).fill(1)), month(Array(30).fill(40))]);
    expect(series[SAMPLES_PER_MONTH + 10]).toBeGreaterThan(series[10]);
  });

  it("stays at zero without any listen", () => {
    expect(Math.max(...monthSeries([month([0, 0])]))).toBe(0);
  });
});

describe("monthsEnd", () => {
  it("cuts the current month at its last listen", () => {
    expect(monthsEnd([month([1, 1]), month([1, 0, 1, 0])])).toBe(1.75);
  });

  it("is zero without months", () => {
    expect(monthsEnd([])).toBe(0);
  });
});

describe("runsSeries", () => {
  it("follows the sizes of the playlists, and keeps a thin line for an automation that made none", () => {
    const series = runsSeries([[], [10, 500]]);
    expect(series).toHaveLength(2 * SAMPLES_PER_MONTH);
    expect(series[0]).toBeGreaterThan(0);
    expect(series[2 * SAMPLES_PER_MONTH - 1]).toBe(255);
    expect(series[SAMPLES_PER_MONTH]).toBeLessThan(255);
  });
});

describe("the drum", () => {
  const layout = deckLayout(1440, 448);

  it("finds back an angle from its screen position", () => {
    for (const theta of [-1, -0.3, 0, 0.5, 1.1]) expect(drumAngle(drumX(theta, layout), layout)).toBeCloseTo(theta);
  });

  it("faces the focused card, and tilts and lowers the others on the arc", () => {
    expect(cardPose(3, 3, layout).theta).toBe(0);
    expect(cardPose(3, 3, layout).arc).toBe(0);
    const left = cardPose(2, 3, layout);
    const right = cardPose(4, 3, layout);
    expect(left.theta).toBeCloseTo(-layout.step);
    expect(right.theta).toBeCloseTo(layout.step);
    expect(left.arc).toBeGreaterThan(0);
    expect(right.roll).toBeGreaterThan(0);
  });

  it("keeps the facing card flat, and turns and sinks its neighbours away from us", () => {
    expect(cardPose(3, 3, layout)).toMatchObject({ turn: 0, sink: 0 });
    const left = cardPose(2, 3, layout);
    const right = cardPose(4, 3, layout);
    expect(left.turn).toBeCloseTo(-layout.turn);
    expect(right.turn).toBeCloseTo(layout.turn);
    expect(right.sink).toBeCloseTo(layout.sink);
    expect(cardPose(9, 3, layout).sink).toBeCloseTo(layout.sink);
  });

  it("finds a facing card's corners where its transform puts them", () => {
    const facing = { x: 720, y: 400, depth: -layout.radius, theta: 0, roll: 0, size: 448, originX: 720, originY: 400, layout };
    expect(cardCorners(facing)).toEqual([{ x: 496, y: 176 }, { x: 944, y: 176 }, { x: 944, y: 624 }, { x: 496, y: 624 }]);
  });

  it("recedes on its far side when the card turns on itself", () => {
    const base = { x: 720, y: 400, depth: -layout.radius, roll: 0, size: 448, originX: 720, originY: 400, layout };
    const turned = cardCorners({ ...base, theta: 0, turn: 0.4 });
    const [topLeft, topRight, bottomRight, bottomLeft] = turned;
    expect(bottomLeft.y - topLeft.y).toBeGreaterThan(bottomRight.y - topRight.y);
  });

  it("draws a turned card's far edge shorter than its near one: real depth", () => {
    const turned = { x: 720, y: 400, depth: -layout.radius, theta: layout.step, roll: 0, size: 448, originX: 720, originY: 400, layout };
    const [topLeft, topRight, bottomRight, bottomLeft] = cardCorners(turned);
    const near = bottomLeft.y - topLeft.y;
    const far = bottomRight.y - topRight.y;
    expect(near / far).toBeGreaterThan(1.05);
    expect(topLeft.x).toBeGreaterThan(720);
  });

  it("lets the arc's rim stay outside the viewport", () => {
    for (const [width, card] of [[1440, 448], [1280, 256], [390, 192]]) {
      const drum = deckLayout(width, card);
      expect(drum.radius * Math.sqrt(drum.perspective / (drum.perspective + 2 * drum.radius))).toBeGreaterThan(width / 2);
    }
  });

  it("keeps cards from overlapping even on a narrow screen", () => {
    const narrow = deckLayout(390, 256);
    expect(narrow.radius * narrow.step).toBeGreaterThan(256);
  });
});

describe("monthAt", () => {
  const layout = deckLayout(1440, 448);
  const track = { x0: 0, perMonth: 120, zoom: 0, cx: 720, focus: 4, layout };

  it("reads the flat ribbon left to right", () => {
    expect(monthAt(240, track)).toBe(2);
  });

  it("reads the focused month at the middle of the drum", () => {
    expect(monthAt(720, { ...track, zoom: 1 })).toBe(4.5);
  });
});

describe("sweepAt", () => {
  it("leaves from one side and arrives at the other", () => {
    expect(sweepAt(0)).toBe(0);
    expect(sweepAt(SWEEP_SECONDS / 2)).toBe(0.5);
    expect(sweepAt(SWEEP_SECONDS)).toBe(1);
  });
});
