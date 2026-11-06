import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMachine } from "./machine";

const PLAYS = [40, 20, 9, 8, 5, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1];
const CHAIN = { plays: PLAYS, kept: PLAYS.filter((n) => n >= 3).length, size: 4 };
const FROM = { x: 50, y: 40, w: 4, h: 8 };
const TO = { x: 10, y: 5 };
const NONE = { open: 1, filter: 0, sort: 0, limit: 0, from: FROM };

function fakeStage(W = 200) {
  const e = Array.from({ length: 9 }, (_, i) => i + 1);
  return { W, H: 100, e, cream: 99, put: vi.fn(), crumb: vi.fn() };
}

describe("createMachine", () => {
  let stage;
  let machine;
  const squares = () => stage.put.mock.calls.filter(([, , color]) => color !== stage.e[7] || true).length;

  beforeEach(() => {
    stage = fakeStage();
    machine = createMachine(stage, CHAIN);
    machine.layout(50);
  });

  it("gives each track a place in the block, hotter the more it was played", () => {
    const places = new Set(machine.tracks.map((t) => `${t.gx},${t.gy}`));
    expect(places.size).toBe(PLAYS.length);
    expect(machine.tracks[0].color).toBe(stage.cream);
    expect(machine.tracks.at(-1).color).toBe(stage.e[1]);
  });

  it("uses one-cell squares on a narrow screen", () => {
    const narrow = createMachine(fakeStage(90), CHAIN);
    narrow.layout(50);
    expect(narrow.geo.size).toBe(1);
    expect(machine.geo.size).toBe(2);
  });

  it("brings the squares out of the month, then lays them out", () => {
    machine.draw({ ...NONE, open: 0 });
    const [x, y] = stage.put.mock.calls[0];
    expect(x).toBeGreaterThanOrEqual(FROM.x);
    expect(x).toBeLessThanOrEqual(FROM.x + FROM.w);
    expect(y).toBeGreaterThanOrEqual(FROM.y);
    stage.put.mockClear();
    machine.draw(NONE);
    expect(squares()).toBe(PLAYS.length * 4);
    expect(stage.put.mock.calls[0][0]).toBe(machine.tracks[0].gx);
  });

  it("drops only what doesn't pass, losing pixels on the way", () => {
    machine.draw(NONE);
    for (let filter = 0; filter < 1; filter += 0.02) machine.draw({ ...NONE, filter });
    stage.put.mockClear();
    machine.draw({ ...NONE, filter: 1 });
    expect(stage.crumb).toHaveBeenCalled();
    const landed = stage.put.mock.calls.filter(([, , color]) => color !== stage.e[7]).length;
    expect(landed).toBe(CHAIN.kept * 4);
  });

  it("lets rejected tracks fall part way through the sweep", () => {
    const rejected = machine.tracks.filter((t) => !t.keep);
    for (let filter = 0; filter < 1; filter += 0.02) machine.draw({ ...NONE, filter });
    expect(stage.put.mock.calls.some(([x, y]) => rejected.some((t) => t.gx === x && y > t.gy + 1))).toBe(true);
  });

  it("sheds nothing when the visitor scrolls back", () => {
    machine.draw({ ...NONE, filter: 0.8 });
    stage.crumb.mockClear();
    machine.draw({ ...NONE, filter: 0.2 });
    expect(stage.crumb).not.toHaveBeenCalled();
  });

  it("sorts the survivors by plays into a bar, hottest first", () => {
    machine.draw({ ...NONE, filter: 1, sort: 1 });
    const kept = machine.tracks.filter((t) => t.keep);
    const inOrder = kept.every((t, i) => i === 0 || t.sx >= kept[i - 1].sx);
    expect(inOrder).toBe(true);
    stage.put.mockClear();
    machine.draw({ ...NONE, filter: 1, sort: 1 });
    expect(stage.put.mock.calls[0][0]).toBe(kept[0].sx);
  });

  it("cuts the bar after the playlist's size and draws its blade", () => {
    machine.draw({ ...NONE, filter: 1, sort: 1 });
    stage.put.mockClear();
    machine.draw({ ...NONE, filter: 1, sort: 1, limit: 0.5 });
    expect(stage.put.mock.calls.some(([x]) => x === machine.geo.cutX)).toBe(true);
    machine.draw({ ...NONE, filter: 1, sort: 1, limit: 1 });
    stage.put.mockClear();
    machine.draw({ ...NONE, filter: 1, sort: 1, limit: 1 });
    const squaresLeft = stage.put.mock.calls.filter(([x]) => x !== machine.geo.cutX).length;
    expect(squaresLeft).toBe(Math.min(CHAIN.kept, machine.tracks.filter((t) => t.keep && (t.final || t.sx <= machine.geo.cutX)).length) * 4);
  });

  it("sends the last ones to the cover, and shows none once they're in", () => {
    const end = { ...NONE, filter: 1, sort: 1, limit: 1 };
    stage.put.mockClear();
    machine.draw({ ...end, merge: 1, to: TO });
    expect(stage.put).not.toHaveBeenCalled();
    machine.draw({ ...end, merge: 0.99, to: TO });
    const [x, y] = stage.put.mock.calls[0];
    expect(Math.abs(x - TO.x)).toBeLessThan(3);
    expect(Math.abs(y - TO.y)).toBeLessThan(3);
  });

  it("moves with the page once the pin lets go", () => {
    machine.draw({ ...NONE, shift: -30 });
    expect(stage.put.mock.calls[0][1]).toBe(machine.tracks[0].gy - 30);
  });
});
